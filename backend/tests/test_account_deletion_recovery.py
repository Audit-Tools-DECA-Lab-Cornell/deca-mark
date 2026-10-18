"""Real lifespan reconciliation against disposable SQL and a mocked Auth boundary."""

import time
from collections.abc import Callable, Coroutine, Generator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from threading import Event
from typing import cast
from unittest.mock import patch
from uuid import UUID, uuid4

import anyio
import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import HttpUrl, SecretStr
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.main import create_app
from fieldmaps_api.repositories import account_deletions
from fieldmaps_api.repositories.account_deletions import Claim
from tests.fields_only_fixtures import seed_history
from tests.local_database import admin_sql, database_settings, disposable_database_selected
from tests.signing import ISSUER, Signer
from tests.test_account_deletion import deletion_user
from tests.test_consolidated_audit import audit_api, live_api
from tests.test_zone_api_live import LiveApi

__all__ = ["audit_api", "deletion_user", "live_api"]
pytestmark = pytest.mark.integration
KEY = SecretStr("sb_secret_synthetic-test-value")
type Provider = (
    Callable[[httpx2.Request], httpx2.Response]
    | Callable[[httpx2.Request], Coroutine[None, None, httpx2.Response]]
)


@pytest.fixture
def user(request: pytest.FixtureRequest) -> UUID:
    assert disposable_database_selected(), "Deletion recovery requires disposable selection"
    return cast("UUID", request.getfixturevalue("deletion_user"))


def forget(user: UUID) -> None:
    admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id',:'user',true); "
        "SELECT fieldmaps_private.forget_user(); COMMIT;",
        f"user={user}",
    )


def state(user: UUID) -> str:
    return admin_sql(
        "SELECT concat(attempts,':',coalesce(last_error,''),':',"
        "(next_attempt_at>now())::text,':',(lease_token IS NOT NULL)::text) "
        "FROM fieldmaps_private.account_deletions WHERE user_id=:'user';",
        f"user={user}",
    )


def due(user: UUID) -> None:
    # Advance only synthetic SQL time; never clear a live lease or change research data.
    admin_sql(
        "UPDATE fieldmaps_private.account_deletions SET next_attempt_at=now() "
        "WHERE user_id=:'user';",
        f"user={user}",
    )


def eventually(check: Callable[[], bool]) -> None:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.01)
    assert check(), "Lifecycle worker did not reach the expected durable state"


@contextmanager
def application(
    signer: Signer,
    provider: Provider,
    *,
    configured: bool = True,
) -> Generator[TestClient]:
    settings = database_settings().model_copy(
        update={
            "issuer": HttpUrl(ISSUER),
            "jwks_url": HttpUrl(f"{ISSUER}/.well-known/jwks.json"),
            "auth_admin_key_file": Path("/synthetic-key-never-opened"),
        }
    )
    with (
        patch(
            "fieldmaps_api.account_deletion_worker.admin_key",
            return_value=KEY,
            side_effect=None if configured else StorageUnavailableError(),
        ),
        patch("fieldmaps_api.routers.identity.admin_key", return_value=KEY),
        patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
            return_value=httpx2.MockTransport(provider),
        ),
        TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client,
    ):
        yield client


def test_success_preserves_research_and_provider_cascade(audit_api: LiveApi) -> None:
    history = seed_history(audit_api)
    user = audit_api.tenant.users["observer"]
    before = history.frozen()
    calls: list[str] = []

    def provider(request: httpx2.Request) -> httpx2.Response:
        calls.append(request.url.path)
        assert request.url.path.endswith(str(user))
        assert state(user).endswith(":true")
        # Model the real Auth hard-delete transaction's FK cascade, not just its HTTP status.
        admin_sql("DELETE FROM auth.users WHERE id=:'user';", f"user={user}")
        return httpx2.Response(200, json={})

    with application(audit_api.signer, provider) as client:
        client.headers["Authorization"] = f"Bearer {audit_api.signer.issue(user)}"
        assert client.delete("/v1/me").status_code == 204
        assert client.get("/v1/me").status_code == 403
        assert client.patch("/v1/me", json={"display_name": "Restore"}).status_code == 403
    assert len(calls) == 1
    assert state(user) == ""
    assert history.frozen() == before
    with audit_api.client() as manager:
        assert (
            manager.get(f"{history.project}/observations/{history.observation}").status_code == 200
        )
        assert manager.get(f"{history.project}/observations/export").status_code == 200


def test_outage_backoff_restart_and_recovery_without_user_request(
    user: UUID, signer: Signer, caplog: pytest.LogCaptureFixture
) -> None:
    calls: list[str] = []

    def unavailable(request: httpx2.Request) -> httpx2.Response:
        calls.append(request.url.path)
        return httpx2.Response(503, text="sensitive upstream content")

    with application(signer, unavailable) as client:
        client.headers["Authorization"] = f"Bearer {signer.issue(user)}"
        assert client.get("/v1/me").status_code == 200
        response = client.delete("/v1/me")
        assert response.status_code == 202
        assert response.json() == {"status": "pending"}
        assert state(user) == "1:provider_unavailable:true:false"
        assert client.get("/v1/me").status_code == 403
        assert client.delete("/v1/me").status_code == 202
    assert len(calls) == 2
    # Restart does not defeat the persisted backoff, even without an end-user session.
    with application(signer, unavailable):
        assert state(user) == "1:provider_unavailable:true:false"
    assert len(calls) == 2
    due(user)
    with application(
        signer, lambda _request: httpx2.Response(404, json={"code": "user_not_found"})
    ):
        eventually(lambda: state(user) == "")
    with application(signer, unavailable):
        assert state(user) == ""
    assert len(calls) == 2
    assert "sensitive upstream content" not in caplog.text
    assert KEY.get_secret_value() not in caplog.text


def test_provider_success_with_lost_response_completes_by_confirmed_absence(
    user: UUID, signer: Signer
) -> None:
    forget(user)
    removed = Event()

    def lost(request: httpx2.Request) -> httpx2.Response:
        removed.set()  # Mock the external effect; deliberately lose both bounded responses.
        message = "synthetic lost acknowledgement"
        raise httpx2.ReadTimeout(message, request=request)

    with application(signer, lost):
        eventually(lambda: state(user) == "1:provider_unavailable:true:false")
    assert removed.is_set()
    due(user)
    with application(
        signer, lambda _request: httpx2.Response(404, json={"code": "user_not_found"})
    ):
        eventually(lambda: state(user) == "")
    with application(signer, lambda _request: pytest.fail("Completed work must not run again")):
        assert state(user) == ""


@pytest.mark.parametrize("failure", ["configuration", "permission", "unconfirmed404"])
def test_configuration_and_permission_errors_stay_pending_and_actionable(
    user: UUID, signer: Signer, failure: str
) -> None:
    forget(user)
    calls: list[str] = []

    def provider(request: httpx2.Request) -> httpx2.Response:
        calls.append(request.url.path)
        return httpx2.Response(403 if failure == "permission" else 404)

    with application(signer, provider, configured=failure != "configuration"):
        code = "permission" if failure == "permission" else "configuration"
        eventually(lambda: state(user) == f"1:{code}:true:false")
    assert len(calls) == (0 if failure == "configuration" else 1)
    assert (
        admin_sql(
            "SELECT deleted_at IS NOT NULL FROM fieldmaps.profiles WHERE user_id=:'user';",
            f"user={user}",
        )
        == "t"
    )
    due(user)  # After the simulated configuration repair, a normal startup finishes it.
    with application(signer, lambda _request: httpx2.Response(204)):
        eventually(lambda: state(user) == "")


async def claim(user: UUID | None = None) -> Claim | None:
    engine = create_async_engine(database_settings().database_url)
    try:
        async with async_sessionmaker(engine).begin() as session:
            return await account_deletions.claim(session, user)
    finally:
        await engine.dispose()


def test_claim_expiry_fences_stale_workers_and_startup_recovers(user: UUID, signer: Signer) -> None:
    forget(user)
    old = anyio.run(claim, user)
    assert old is not None
    assert anyio.run(claim, user) is None
    admin_sql(
        "UPDATE fieldmaps_private.account_deletions SET lease_until=now()-interval '1 second' "
        "WHERE user_id=:'user';",
        f"user={user}",
    )
    new = anyio.run(claim, user)
    assert new is not None
    assert new.lease_token != old.lease_token

    async def stale() -> None:
        engine = create_async_engine(database_settings().database_url)
        try:
            async with async_sessionmaker(engine).begin() as session:
                await account_deletions.retry(session, old, "permission", 3600)
                await account_deletions.complete(session, old)
        finally:
            await engine.dispose()

    anyio.run(stale)
    assert state(user) == "2::false:true"
    admin_sql(
        "UPDATE fieldmaps_private.account_deletions SET lease_until=now()-interval '1 second' "
        "WHERE user_id=:'user';",
        f"user={user}",
    )
    with application(signer, lambda _request: httpx2.Response(204)):
        eventually(lambda: state(user) == "")


def test_concurrent_claims_cannot_own_the_same_account(user: UUID) -> None:
    forget(user)

    def take(_index: int) -> Claim | None:
        return anyio.run(claim, user)

    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(take, range(2)))
    assert sum(item is not None for item in results) == 1


def test_failed_account_does_not_starve_another_due_account(user: UUID, signer: Signer) -> None:
    other = uuid4()
    admin_sql("INSERT INTO auth.users(id) VALUES (:'user');", f"user={other}")
    try:
        forget(user)
        forget(other)
        calls: list[str] = []

        def provider(request: httpx2.Request) -> httpx2.Response:
            calls.append(request.url.path)
            return httpx2.Response(503 if request.url.path.endswith(str(user)) else 204)

        with application(signer, provider):
            eventually(
                lambda: state(user) == "1:provider_unavailable:true:false" and state(other) == ""
            )
        assert len(calls) == 3
    finally:
        admin_sql("DELETE FROM auth.users WHERE id=:'user';", f"user={other}")


def test_shutdown_during_provider_call_leaves_an_expiring_claim(user: UUID, signer: Signer) -> None:
    forget(user)
    entered = Event()

    async def stalled(_request: httpx2.Request) -> httpx2.Response:
        entered.set()
        await anyio.sleep_forever()
        pytest.fail("The synthetic provider must be cancelled at application shutdown")

    with application(signer, stalled):
        assert entered.wait(timeout=5)
    assert state(user) == "1::false:true"
    admin_sql(
        "UPDATE fieldmaps_private.account_deletions SET lease_until=now()-interval '1 second' "
        "WHERE user_id=:'user';",
        f"user={user}",
    )
    with application(signer, lambda _request: httpx2.Response(204)):
        eventually(lambda: state(user) == "")


def test_delete_uses_verified_subject_even_with_another_user_in_body(
    user: UUID, signer: Signer
) -> None:
    other = uuid4()
    admin_sql(
        "INSERT INTO auth.users(id) VALUES (:'user'); "
        "INSERT INTO fieldmaps.profiles(user_id) VALUES (:'user');",
        f"user={other}",
    )
    calls: list[str] = []

    def provider(request: httpx2.Request) -> httpx2.Response:
        calls.append(request.url.path)
        return httpx2.Response(204)

    try:
        with application(signer, provider) as client:
            client.headers["Authorization"] = f"Bearer {signer.issue(user)}"
            response = client.request("DELETE", "/v1/me", json={"user_id": str(other)})
            assert response.status_code == 204
        assert len(calls) == 1
        assert calls[0].endswith(str(user))
        assert (
            admin_sql(
                "SELECT deleted_at IS NULL FROM fieldmaps.profiles WHERE user_id=:'user';",
                f"user={other}",
            )
            == "t"
        )
        assert state(other) == ""
    finally:
        admin_sql("DELETE FROM auth.users WHERE id=:'user';", f"user={other}")
