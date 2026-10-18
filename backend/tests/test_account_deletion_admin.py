from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import anyio
import httpx2
import pytest
from pydantic import HttpUrl, SecretStr

from fieldmaps_api.config import Settings
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.observability import scrub_event
from fieldmaps_api.services.account_deletion import admin_key, delete_auth_user
from tests.signing import ISSUER


def settings() -> Settings:
    return Settings(
        issuer=HttpUrl(ISSUER),
        jwks_url=HttpUrl(f"{ISSUER}/.well-known/jwks.json"),
        auth_admin_key_file=Path("/sb_secret_synthetic-test-value"),
    )


@pytest.mark.parametrize("failure", ["timeout", "unavailable", "redirect"])
def test_admin_has_bounded_attempts_and_never_logs_credentials(failure: str) -> None:
    user = uuid4()
    attempts: list[httpx2.Request] = []

    def handle(request: httpx2.Request) -> httpx2.Response:
        attempts.append(request)
        assert request.extensions["timeout"] == {
            "connect": 5.0,
            "read": 5.0,
            "write": 5.0,
            "pool": 5.0,
        }
        if failure == "timeout":
            message = "sb_secret_synthetic-test-value sensitive timeout detail"
            raise httpx2.ReadTimeout(message, request=request)
        return httpx2.Response(
            302 if failure == "redirect" else 503,
            headers={"Location": "https://untrusted.invalid"},
            text="sb_secret_synthetic-test-value sensitive response body",
        )

    with (
        patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
            return_value=httpx2.MockTransport(handle),
        ),
        patch("fieldmaps_api.services.account_deletion.LOGGER.error") as log,
        patch("fieldmaps_api.services.account_deletion.sentry_sdk.capture_event") as capture,
    ):
        assert anyio.run(
            delete_auth_user, settings(), SecretStr("sb_secret_synthetic-test-value"), user
        ) == ("configuration" if failure == "redirect" else "provider_unavailable")
    assert len(attempts) == (1 if failure == "redirect" else 2)
    assert all(request.url.host == "fieldmaps-test.invalid" for request in attempts)
    log.assert_called_once_with(f'{{"event":"account_deletion_pending","user_id":"{user}"}}')
    capture.assert_called_once_with(
        {"message": "Account deletion pending", "level": "error", "user": {"id": str(user)}}
    )


def test_retry_recovers_without_pending_event() -> None:
    attempts: list[httpx2.Request] = []

    def handle(request: httpx2.Request) -> httpx2.Response:
        attempts.append(request)
        return httpx2.Response(500 if len(attempts) == 1 else 204)

    with (
        patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
            return_value=httpx2.MockTransport(handle),
        ),
        patch("fieldmaps_api.services.account_deletion.LOGGER.error") as log,
    ):
        assert (
            anyio.run(
                delete_auth_user, settings(), SecretStr("sb_secret_synthetic-test-value"), uuid4()
            )
            == "complete"
        )
    assert len(attempts) == 2
    log.assert_not_called()


@pytest.mark.parametrize("value", ["", "   ", "line\nbreak", "nonascii-é", "null\x00byte"])
def test_invalid_key_is_unavailable(value: str) -> None:
    with patch("anyio.Path.read_text", return_value=value), pytest.raises(StorageUnavailableError):
        anyio.run(admin_key, settings())


def test_unreadable_key_is_unavailable() -> None:
    with (
        patch("anyio.Path.read_text", side_effect=OSError("sensitive path")),
        pytest.raises(StorageUnavailableError, match="key is unavailable"),
    ):
        anyio.run(admin_key, settings())


def test_pending_sentry_event_keeps_only_user_id() -> None:
    user = str(uuid4())
    assert scrub_event(
        {
            "message": "Account deletion pending",
            "user": {"id": user, "email": "sensitive@test.invalid"},
            "extra": {"key": "sb_secret_synthetic-test-value"},
            "request": {"headers": {"apikey": "sb_secret_synthetic-test-value"}},
        },
        {},
    ) == {"message": "Account deletion pending", "level": "error", "user": {"id": user}}


@pytest.mark.parametrize(
    ("status", "body", "outcome", "attempts"),
    [
        (200, {}, "complete", 1),
        (204, {}, "complete", 1),
        (404, {"code": "user_not_found"}, "complete", 1),
        (404, {"error_code": "user_not_found"}, "complete", 1),
        (404, {"code": "unknown"}, "configuration", 1),
        (202, {}, "configuration", 1),
        (401, {}, "permission", 1),
        (403, {}, "permission", 1),
        (429, {}, "provider_unavailable", 2),
    ],
)
def test_only_confirmed_completion_clears_pending_work(
    status: int, body: dict[str, str], outcome: str, attempts: int
) -> None:
    calls: list[httpx2.Request] = []

    def handle(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        assert request.headers["X-Supabase-Api-Version"] == "2024-01-01"
        return httpx2.Response(status, json=body)

    with (
        patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
            return_value=httpx2.MockTransport(handle),
        ),
        patch("fieldmaps_api.services.account_deletion.sentry_sdk.capture_event"),
    ):
        assert (
            anyio.run(
                delete_auth_user, settings(), SecretStr("sb_secret_synthetic-test-value"), uuid4()
            )
            == outcome
        )
    assert len(calls) == attempts
