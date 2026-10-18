from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

import anyio
import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import HttpUrl

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.main import create_app
from tests.local_database import admin_sql, database_url, password_file
from tests.signing import ISSUER, Signer


@pytest.fixture
def deletion_user() -> Iterator[UUID]:
    user = uuid4()
    admin_sql(
        "INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES "
        "(:'user', '00000000-0000-0000-0000-000000000000', 'authenticated', "
        "'authenticated', :'user' || '@test.invalid');",
        f"user={user}",
    )
    try:
        yield user
    finally:
        admin_sql("DELETE FROM auth.users WHERE id = :'user';", f"user={user}")


@pytest.fixture
def deletion_client(signer: Signer, deletion_user: UUID) -> Iterator[TestClient]:
    settings = Settings(
        database_url=database_url(),
        database_password_file=password_file(),
        issuer=HttpUrl(ISSUER),
        jwks_url=HttpUrl(f"{ISSUER}/.well-known/jwks.json"),
        auth_admin_key_file=Path("/sb_secret_synthetic-test-value"),
    )

    async def idle_worker(_sessions: object, _settings: object) -> None:
        await anyio.sleep_forever()

    with (
        patch("anyio.Path.read_text", return_value="sb_secret_synthetic-test-value"),
        # These request-boundary cases control timing; lifecycle recovery is exercised
        # through real startup/shutdown in test_account_deletion_recovery.py.
        patch("fieldmaps_api.account_deletion_worker.run", side_effect=idle_worker),
        TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client,
    ):
        client.headers["Authorization"] = f"Bearer {signer.issue(deletion_user)}"
        assert client.get("/v1/me").status_code == 200
        yield client


@pytest.mark.integration
def test_failure_commits_forgetting_and_retry_finishes(
    deletion_client: TestClient, deletion_user: UUID, caplog: pytest.LogCaptureFixture
) -> None:
    attempts: list[httpx2.Request] = []

    def unavailable(request: httpx2.Request) -> httpx2.Response:
        attempts.append(request)
        assert request.headers["apikey"] == "sb_secret_synthetic-test-value"
        assert request.url.path.endswith(f"/admin/users/{deletion_user}")
        assert request.method == "DELETE"
        assert (
            admin_sql(
                "SELECT deleted_at IS NOT NULL FROM fieldmaps.profiles WHERE user_id = :'user';",
                f"user={deletion_user}",
            )
            == "t"
        )
        return httpx2.Response(500, text="sb_secret_synthetic-test-value sensitive upstream body")

    with (
        patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
            return_value=httpx2.MockTransport(unavailable),
        ),
        patch("fieldmaps_api.services.account_deletion.sentry_sdk.capture_event") as capture,
        caplog.at_level("ERROR", logger="fieldmaps.requests"),
    ):
        pending = deletion_client.delete("/v1/me")
    assert pending.status_code == 202
    assert pending.json() == {"status": "pending"}
    assert len(attempts) == 2
    capture.assert_called_once_with(
        {
            "message": "Account deletion pending",
            "level": "error",
            "user": {"id": str(deletion_user)},
        }
    )
    assert "sb_secret_synthetic-test-value" not in caplog.text + pending.text
    assert "sensitive upstream body" not in caplog.text + pending.text
    denied = deletion_client.get("/v1/me")
    assert deletion_client.patch("/v1/me", json={"display_name": "Restore"}).status_code == 403
    assert (
        deletion_client.post(
            "/v1/orgs",
            json={
                "name": "Restore",
                "slug": "restore",
                "project": {"name": "Restore", "code": "restore", "timezone": "UTC"},
            },
        ).status_code
        == 403
    )
    assert denied.status_code == 403
    assert ErrorEnvelope.model_validate_json(denied.content).error.code == "account_deleted"
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.project_memberships WHERE user_id = :'user';",
            f"user={deletion_user}",
        )
        == "0"
    )
    with patch(
        "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
        return_value=httpx2.MockTransport(lambda _request: httpx2.Response(204)),
    ) as transport:
        # Another request cannot defeat persistent backoff.
        assert deletion_client.delete("/v1/me").status_code == 202
        transport.assert_not_called()
        admin_sql(
            "UPDATE fieldmaps_private.account_deletions SET next_attempt_at=now() "
            "WHERE user_id=:'user';",
            f"user={deletion_user}",
        )
        assert deletion_client.delete("/v1/me").status_code == 204


@pytest.mark.integration
@pytest.mark.parametrize("auth_missing", [False, True])
def test_success_and_already_deleted(
    deletion_client: TestClient, deletion_user: UUID, *, auth_missing: bool
) -> None:
    if auth_missing:
        admin_sql("DELETE FROM auth.users WHERE id = :'user';", f"user={deletion_user}")
    with patch(
        "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
        return_value=httpx2.MockTransport(
            lambda _request: httpx2.Response(
                404 if auth_missing else 200, json={"code": "user_not_found"}
            )
        ),
    ):
        response = deletion_client.delete("/v1/me")
    assert response.status_code == 204
    assert response.content == b""


@pytest.mark.integration
def test_sole_owner_rolls_back_without_admin_call(
    deletion_client: TestClient, deletion_user: UUID
) -> None:
    organization = uuid4()
    other = uuid4()
    admin_sql(
        "INSERT INTO auth.users(id) VALUES (:'other'); "
        "INSERT INTO fieldmaps.profiles(user_id) VALUES (:'other'); "
        "INSERT INTO fieldmaps.organizations(id,name,slug) VALUES (:'org','Deletion test',:'org'); "
        "INSERT INTO fieldmaps.organization_members(organization_id,user_id,role) VALUES "
        "(:'org',:'user','owner'),(:'org',:'other','member');",
        f"org={organization}",
        f"user={deletion_user}",
        f"other={other}",
    )
    try:
        with patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport"
        ) as transport:
            response = deletion_client.delete("/v1/me")
        assert response.status_code == 409, response.text
        assert ErrorEnvelope.model_validate_json(response.content).error.code == "sole_owner"
        transport.assert_not_called()
        assert deletion_client.get("/v1/me").status_code == 200
    finally:
        admin_sql(
            "DELETE FROM fieldmaps.organization_members WHERE organization_id = :'org'; "
            "DELETE FROM fieldmaps.organizations WHERE id = :'org'; "
            "DELETE FROM auth.users WHERE id = :'other';",
            f"org={organization}",
            f"other={other}",
        )


def test_missing_configuration_precedes_database(signer: Signer) -> None:
    with TestClient(create_app(verifier=JwksVerifier(ISSUER, "authenticated", signer))) as client:
        response = client.delete("/v1/me", headers={"Authorization": f"Bearer {signer.issue()}"})
        assert response.status_code == 503
        assert (
            ErrorEnvelope.model_validate_json(response.content).error.code == "storage_unavailable"
        )
        assert client.delete("/v1/me").status_code == 401


@pytest.mark.integration
@pytest.mark.parametrize(
    "value",
    [
        "sb_publishable_synthetic-public-value",
        "wrong-format",
        "sb_secret_",
        "sb_secret_line\nbreak",
        "sb_secret_nonascii-é",
        "sb_secret_null\x00byte",
    ],
)
def test_invalid_admin_key_preserves_account_without_http(
    deletion_client: TestClient, deletion_user: UUID, value: str
) -> None:
    before = deletion_client.get("/v1/me")
    with (
        patch("anyio.Path.read_text", return_value=value),
        patch("fieldmaps_api.routers.identity.forget_user") as forget,
        patch("fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport") as transport,
    ):
        response = deletion_client.delete("/v1/me")
    assert response.status_code == 503
    assert ErrorEnvelope.model_validate_json(response.content).error.code == "storage_unavailable"
    forget.assert_not_called()
    transport.assert_not_called()
    assert deletion_client.get("/v1/me").json() == before.json()
    assert (
        admin_sql(
            "SELECT deleted_at IS NULL FROM fieldmaps.profiles WHERE user_id = :'user';",
            f"user={deletion_user}",
        )
        == "t"
    )
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.project_memberships WHERE user_id = :'user';",
            f"user={deletion_user}",
        )
        == "1"
    )
