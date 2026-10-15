"""API → committed outbox → Brevo boundary on disposable local Postgres."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta, tzinfo
from typing import override
from uuid import uuid4

import anyio
import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.database import database_connection
from fieldmaps_api.email.brevo import Brevo
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.email.outbox import Delivery, claim
from fieldmaps_api.email.worker import deliver_one
from fieldmaps_api.invitation_schemas import InvitationCreated
from fieldmaps_api.main import create_app
from tests.local_database import admin_sql, database_url, password_file
from tests.signing import ISSUER, Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in

pytestmark = pytest.mark.integration


def mail_settings() -> EmailSettings:
    return EmailSettings(
        api_key=SecretStr("fake-api-key"), sender_email="noreply@example.test", enabled=True
    )


@pytest.fixture
def tenant() -> Iterator[Tenant]:
    value = Tenant.new()
    create_tenant(value)
    try:
        yield value
    finally:
        admin_sql(
            "DELETE FROM fieldmaps_private.email_outbox WHERE created_by = ANY("
            "SELECT (value->>'id')::uuid FROM jsonb_array_elements(:'users'::jsonb));",
            *value.variables(),
        )
        cleanup_tenant(value)


@pytest.fixture
def email_client(
    signer: Signer, tenant: Tenant, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    async def quiet_worker(
        _sessions: async_sessionmaker[AsyncSession], _settings: EmailSettings
    ) -> None:
        await anyio.sleep_forever()

    monkeypatch.setattr("fieldmaps_api.main.email_worker", quiet_worker)
    monkeypatch.delenv("EMAIL_ENABLED", raising=False)
    monkeypatch.setenv("EMAIL_SANDBOX", "false")
    monkeypatch.setenv("BREVO_API_KEY", "fake-api-key")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "noreply@example.test")
    config = Settings(database_url=database_url(), database_password_file=password_file())
    with TestClient(
        create_app(
            config, JwksVerifier(ISSUER, "authenticated", signer), EmailSettings.from_environment()
        )
    ) as client:
        sign_in(client, signer, tenant.users["owner"])
        yield client


def process(status: int = 201) -> list[httpx2.Request]:
    calls: list[httpx2.Request] = []

    async def exercise() -> None:
        connection = database_connection(
            Settings(database_url=database_url(), database_password_file=password_file())
        )
        engine = create_async_engine(connection.url)

        def handler(request: httpx2.Request) -> httpx2.Response:
            calls.append(request)
            return httpx2.Response(status, json={"messageId": "receipt-from-brevo"})

        try:
            async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
                await deliver_one(
                    async_sessionmaker(engine, expire_on_commit=False),
                    Brevo(mail_settings(), client),
                )
        finally:
            await engine.dispose()

    anyio.run(exercise)
    return calls


def request_body(tenant: Tenant) -> dict[str, str]:
    return {
        "idempotency_key": str(uuid4()),
        "recipient_user_id": str(tenant.users["observer"]),
        "kind": "notification",
        "heading": "Project update",
        "message": "Prepare your field kit.",
    }


def test_invitation_is_queued_atomically_then_delivered_and_scrubbed(
    email_client: TestClient, tenant: Tenant
) -> None:
    response = email_client.post(
        f"/v1/projects/{tenant.project}/invitations",
        json={"role": "observer", "email": "new@example.test"},
    )
    assert response.status_code == 201, response.text
    invitation = InvitationCreated.model_validate_json(response.content)
    assert invitation.email_delivery == "queued"
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps_private.email_outbox WHERE invitation_id=:'id';",
            f"id={invitation.id}",
        )
        == "1"
    )
    calls = process()
    assert len(calls) == 1
    assert invitation.code.encode() in calls[0].content
    assert invitation.token.encode() in calls[0].content
    assert (
        admin_sql(
            "SELECT status||':'||length(html)||':'||length(recipient) "
            "FROM fieldmaps_private.email_outbox WHERE invitation_id=:'id';",
            f"id={invitation.id}",
        )
        == "sent:0:0"
    )
    assert process() == []


def test_revoked_invitation_is_never_sent(email_client: TestClient, tenant: Tenant) -> None:
    base = f"/v1/projects/{tenant.project}/invitations"
    invitation = InvitationCreated.model_validate_json(
        email_client.post(base, json={"role": "observer", "email": "new@example.test"}).content
    )
    assert email_client.delete(f"{base}/{invitation.id}").status_code == 204
    assert process() == []


def test_invitation_without_email_keeps_manual_sharing(
    email_client: TestClient, tenant: Tenant
) -> None:
    response = email_client.post(
        f"/v1/projects/{tenant.project}/invitations", json={"role": "observer"}
    )
    assert response.status_code == 201, response.text
    invitation = InvitationCreated.model_validate_json(response.content)
    assert invitation.email_delivery == "not_requested"
    assert invitation.token
    assert invitation.code
    assert process() == []


def test_notification_idempotency_permissions_and_delivery(
    email_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    path = f"/v1/projects/{tenant.project}/emails"
    body = request_body(tenant)
    response = email_client.post(path, json=body)
    assert response.status_code == 202, response.text
    queued = Delivery.model_validate_json(response.content)
    assert email_client.post(path, json=body).json()["id"] == str(queued.id)
    assert email_client.post(path, json={**body, "message": "Changed"}).status_code == 409
    sign_in(email_client, signer, tenant.users["observer"])
    assert email_client.post(path, json=request_body(tenant)).status_code == 403
    assert email_client.get(path).status_code == 403
    sign_in(email_client, signer, tenant.users["owner"])
    assert len(process()) == 1
    assert email_client.get(path).json()[0]["status"] == "sent"


@pytest.mark.parametrize("role", ["observer", "viewer", "manager"])
def test_project_manager_can_send_invitations_and_project_email(
    email_client: TestClient, signer: Signer, tenant: Tenant, role: str
) -> None:
    # Manager is only an organization member, not an organization owner or admin.
    sign_in(email_client, signer, tenant.users["manager"])
    invited = email_client.post(
        f"/v1/projects/{tenant.project}/invitations",
        json={"role": role, "email": "manager-invited@example.test"},
    )
    assert invited.status_code == 201, invited.text
    invitation = InvitationCreated.model_validate_json(invited.content)
    assert invitation.email_delivery == "queued"
    calls = process()
    assert len(calls) == 1
    assert b"manager-invited@example.test" in calls[0].content
    assert f"as a {role}".encode() in calls[0].content
    assert invitation.token.encode() in calls[0].content
    assert invitation.code.encode() in calls[0].content
    scheduled = email_client.post(
        f"/v1/projects/{tenant.project}/emails", json=request_body(tenant)
    )
    assert scheduled.status_code == 202, scheduled.text
    assert Delivery.model_validate_json(scheduled.content).status == "queued"


def test_scheduled_replay_survives_expired_scheduling_window(
    email_client: TestClient, tenant: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = f"/v1/projects/{tenant.project}/emails"
    body = {
        **request_body(tenant),
        "scheduled_at": (datetime.now(UTC) + timedelta(minutes=2)).isoformat(),
    }
    original = email_client.post(path, json=body)
    assert original.status_code == 202, original.text
    identifier = Delivery.model_validate_json(original.content).id

    class Later(datetime):
        @classmethod
        @override
        def now(cls, tz: tzinfo | None = None) -> "Later":
            shifted = datetime.now(tz) + timedelta(hours=3)
            return cls.fromtimestamp(shifted.timestamp(), tz)

    monkeypatch.setattr("fieldmaps_api.routers.emails.datetime", Later)
    retry = email_client.post(path, json=body)
    assert retry.status_code == 202, retry.text
    assert Delivery.model_validate_json(retry.content).id == identifier
    assert email_client.post(path, json={**body, "heading": "Changed"}).status_code == 409
    # A brand-new request cannot bypass the time validation.
    assert (
        email_client.post(path, json={**body, "idempotency_key": str(uuid4())}).status_code
        == 422
    )


def test_reminder_scheduling_cancellation_and_member_recheck(
    email_client: TestClient, tenant: Tenant
) -> None:
    path = f"/v1/projects/{tenant.project}/emails"
    body = {
        **request_body(tenant),
        "kind": "reminder",
        "scheduled_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    response = email_client.post(path, json=body)
    assert response.status_code == 202, response.text
    queued = Delivery.model_validate_json(response.content)
    assert process() == []
    assert email_client.delete(f"{path}/{queued.id}").status_code == 204
    response = email_client.post(path, json=request_body(tenant))
    assert response.status_code == 202, response.text
    admin_sql(
        "DELETE FROM fieldmaps.project_memberships "
        "WHERE project_id=:'project' AND user_id=:'user';",
        f"project={tenant.project}",
        f"user={tenant.users['observer']}",
    )
    assert process() == []


def test_provider_rate_limit_is_retried_with_same_delivery_key(
    email_client: TestClient, tenant: Tenant
) -> None:
    response = email_client.post(f"/v1/projects/{tenant.project}/emails", json=request_body(tenant))
    queued = Delivery.model_validate_json(response.content)
    first = process(429)
    assert len(first) == 1
    assert (
        admin_sql(
            "SELECT status FROM fieldmaps_private.email_outbox WHERE id=:'id';", f"id={queued.id}"
        )
        == "queued"
    )
    admin_sql(
        "UPDATE fieldmaps_private.email_outbox SET available_at=now() WHERE id=:'id';",
        f"id={queued.id}",
    )
    second = process()
    assert len(second) == 1
    assert first[0].content == second[0].content


def test_unverified_or_nonmember_recipients_are_refused(
    email_client: TestClient, tenant: Tenant
) -> None:
    path = f"/v1/projects/{tenant.project}/emails"
    assert (
        email_client.post(
            path, json={**request_body(tenant), "recipient_user_id": str(uuid4())}
        ).status_code
        == 422
    )
    admin_sql(
        "UPDATE auth.users SET email_confirmed_at=NULL WHERE id=:'user';",
        f"user={tenant.users['observer']}",
    )
    assert email_client.post(path, json=request_body(tenant)).status_code == 422


def test_workers_skip_leased_jobs_and_recover_an_expired_lease(
    email_client: TestClient, tenant: Tenant
) -> None:
    path = f"/v1/projects/{tenant.project}/emails"
    first = Delivery.model_validate_json(email_client.post(path, json=request_body(tenant)).content)
    second = Delivery.model_validate_json(
        email_client.post(path, json=request_body(tenant)).content
    )

    async def exercise() -> None:
        connection = database_connection(
            Settings(database_url=database_url(), database_password_file=password_file())
        )
        engine = create_async_engine(connection.url)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with sessions.begin() as one, sessions.begin() as two:
                leased_one = await claim(one)
                leased_two = await claim(two)
                assert leased_one is not None
                assert leased_two is not None
                assert {leased_one.id, leased_two.id} == {first.id, second.id}
            async with sessions.begin() as three:
                assert await claim(three) is None
        finally:
            await engine.dispose()

    anyio.run(exercise)
    admin_sql(
        "UPDATE fieldmaps_private.email_outbox SET lease_until=now()-interval '1 second' "
        "WHERE id=:'id';",
        f"id={first.id}",
    )
    assert len(process()) == 1
    assert (
        admin_sql(
            "SELECT attempts FROM fieldmaps_private.email_outbox WHERE id=:'id';", f"id={first.id}"
        )
        == "2"
    )


def test_expired_and_permanently_failed_messages_are_scrubbed(
    email_client: TestClient, tenant: Tenant
) -> None:
    path = f"/v1/projects/{tenant.project}/emails"
    expired = Delivery.model_validate_json(
        email_client.post(path, json=request_body(tenant)).content
    )
    admin_sql(
        "UPDATE fieldmaps_private.email_outbox SET scheduled_at=now()-interval '2 hours', "
        "expires_at=now()-interval '1 hour' WHERE id=:'id';",
        f"id={expired.id}",
    )
    assert process() == []
    assert (
        admin_sql(
            "SELECT status||':'||length(html) FROM fieldmaps_private.email_outbox WHERE id=:'id';",
            f"id={expired.id}",
        )
        == "cancelled:0"
    )
    failed = Delivery.model_validate_json(
        email_client.post(path, json=request_body(tenant)).content
    )
    assert len(process(401)) == 1
    assert process() == []
    assert (
        admin_sql(
            "SELECT status||':'||last_error||':'||length(recipient) "
            "FROM fieldmaps_private.email_outbox WHERE id=:'id';",
            f"id={failed.id}",
        )
        == "failed:brevo_http_401:0"
    )
