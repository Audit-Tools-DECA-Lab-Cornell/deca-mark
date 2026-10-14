import logging
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient
from sentry_sdk.utils import BadDsn
from sqlalchemy.exc import DBAPIError, InterfaceError, SQLAlchemyError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.ext.asyncio import AsyncEngine

from fieldmaps_api.database_errors import database_error
from fieldmaps_api.main import create_app
from fieldmaps_api.observability import (
    CAUSE_DEPTH,
    SafeServerFormatter,
    exception_types,
    scrub_event,
)
from fieldmaps_api.readiness import DatabaseRole, require_restricted_role

if TYPE_CHECKING:
    from sentry_sdk.types import Event


class DriverFailureError(Exception):
    def __init__(self, sqlstate: str) -> None:
        self.sqlstate: str = sqlstate
        super().__init__("secret SQL value")


@pytest.mark.parametrize(
    ("state", "status", "code"),
    [
        ("FM001", 403, "limit_reached"),
        ("FM002", 409, "sole_owner"),
        ("FM003", 404, "invitation_invalid"),
        ("FM004", 410, "invitation_expired"),
        ("FM005", 403, "account_deleted"),
        ("FM006", 403, "role_required"),
        ("FM007", 404, "not_found"),
        ("FM008", 409, "conflict"),
        ("23505", 409, "conflict"),
        ("23514", 422, "validation_failed"),
        ("23502", 422, "validation_failed"),
        ("23503", 422, "validation_failed"),
        ("22001", 422, "validation_failed"),
        ("42501", 403, "role_required"),
        ("08006", 503, "storage_unavailable"),
        ("57P01", 503, "storage_unavailable"),
        ("40001", 503, "storage_unavailable"),
        ("40P01", 503, "storage_unavailable"),
        ("55P03", 503, "storage_unavailable"),
        ("57014", 503, "storage_unavailable"),
        ("53300", 503, "storage_unavailable"),
        ("XX000", 500, "internal"),
    ],
)
def test_database_sqlstates(state: str, status: int, code: str) -> None:
    failure = database_error(DBAPIError("private query", {}, DriverFailureError(state)))
    assert (failure.status, failure.code) == (status, code)
    assert "secret" not in failure.message


@pytest.mark.parametrize(
    "error",
    [
        PoolTimeoutError(),
        InterfaceError(None, None, RuntimeError()),
        DBAPIError(None, None, RuntimeError(), connection_invalidated=True),
    ],
)
def test_connection_failures_are_retryable(error: SQLAlchemyError) -> None:
    assert database_error(error).status == 503


@pytest.mark.parametrize(("bypass", "superuser"), [(True, False), (False, True), (True, True)])
def test_unsafe_role_refused(*, bypass: bool, superuser: bool) -> None:
    with pytest.raises(RuntimeError, match="must not be superuser"):
        require_restricted_role(DatabaseRole(rolbypassrls=bypass, rolsuper=superuser))


def test_startup_refuses_unsafe_role(monkeypatch: pytest.MonkeyPatch) -> None:
    async def unsafe(_engine: AsyncEngine) -> None:
        require_restricted_role(DatabaseRole(rolbypassrls=True, rolsuper=False))

    monkeypatch.setattr("fieldmaps_api.readiness.assert_safe_role", unsafe)
    with pytest.raises(RuntimeError, match="must not be superuser"), TestClient(create_app()):
        pytest.fail("Startup accepted an unsafe database role")


def chained(depth: int) -> BaseException:
    """Build an exception raised from `depth - 1` others, each carrying secret text."""
    error: BaseException = KeyError("secret 0")
    for level in range(1, depth):
        outer = RuntimeError(f"secret {level}") if level % 2 else ValueError(f"secret {level}")
        outer.__cause__ = error
        error = outer
    return error


def test_exception_types_follow_causes_outermost_first() -> None:
    assert exception_types(chained(3)) == [
        "builtins.ValueError",
        "builtins.RuntimeError",
        "builtins.KeyError",
    ]
    implicit = ValueError("secret")
    implicit.__context__ = OSError("secret")
    assert exception_types(implicit) == ["builtins.ValueError", "builtins.OSError"]


def test_exception_types_stop_at_a_cycle_and_at_the_depth_limit() -> None:
    first, second = ValueError("secret"), OSError("secret")
    first.__cause__, second.__cause__ = second, first
    assert exception_types(first) == ["builtins.ValueError", "builtins.OSError"]
    assert len(exception_types(chained(CAUSE_DEPTH + 4))) == CAUSE_DEPTH


def test_server_log_lines_never_carry_exception_text() -> None:
    error = chained(CAUSE_DEPTH + 4)
    record = logging.LogRecord(
        "uvicorn.error",
        logging.ERROR,
        __file__,
        1,
        "secret message",
        None,
        (type(error), error, None),
    )
    line = SafeServerFormatter().format(record)
    assert "secret" not in line
    assert '"exception":["builtins.' in line


def test_startup_failure_names_its_cause(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def unreachable(_engine: AsyncEngine) -> None:
        message = 'password authentication failed for user "fieldmaps_api"'
        raise OSError(message)

    monkeypatch.setattr("fieldmaps_api.readiness.assert_safe_role", unreachable)
    with pytest.raises(OSError, match="password authentication"), TestClient(create_app()):
        pytest.fail("Startup went ahead without its database")
    captured = capsys.readouterr().err
    assert '"event":"startup_failed"' in captured
    assert '"exception":["builtins.OSError"]' in captured
    assert "password authentication failed" in captured


def test_startup_failure_names_a_malformed_sentry_dsn(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("SENTRY_DSN", "not a dsn")
    with pytest.raises(BadDsn), TestClient(create_app()):
        pytest.fail("Startup went ahead with a malformed SENTRY_DSN")
    captured = capsys.readouterr().err
    assert '"event":"startup_failed"' in captured
    assert "sentry_sdk.utils.BadDsn" in captured


@pytest.mark.parametrize("path", ["/health", "/missing", "/failure"])
def test_request_id_survives_all_responses(path: str) -> None:
    app = create_app()

    @app.get("/failure")
    async def fail() -> None:
        message = "private answer"
        raise RuntimeError(message)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(path, headers={"X-Request-Id": "test-request-42"})
        assert response.headers["X-Request-Id"] == "test-request-42"
        assert len(client.get("/health").headers["X-Request-Id"]) == 32


def test_sentry_discards_sensitive_context() -> None:
    event: Event = {
        "message": "private answer",
        "request": {"data": "secret"},
        "user": {"email": "secret@example.invalid"},
        "extra": {"answers": "secret"},
    }
    scrubbed = scrub_event(event, {})
    assert "secret" not in str(scrubbed)
    assert "private" not in str(scrubbed)


def test_readiness_database_failure() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/ready")
    assert response.status_code == 503
    assert "storage_unavailable" in response.text


def test_unhandled_failure_telemetry_keeps_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[Event] = []

    def capture(_error: Exception) -> None:
        events.append(
            scrub_event(
                {"exception": {"values": [{"type": "RuntimeError", "value": "secret"}]}}, {}
            )
        )

    monkeypatch.setattr("sentry_sdk.capture_exception", capture)
    app = create_app()

    @app.get("/failure")
    async def fail() -> None:
        message = "secret"
        raise RuntimeError(message)

    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/failure", headers={"X-Request-Id": "correlated"}).status_code == 500
    assert len(events) == 1
    assert events[0].get("tags") == {"request_id": "correlated"}
    assert "secret" not in str(events)


def test_server_logs_strip_raw_urls_and_exception_messages(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with TestClient(create_app()) as client:
        client.get("/missing/secret?token=secret", headers={"Authorization": "Bearer secret"})
        logging.getLogger("uvicorn.error").error("secret exception")
        detail = "secret detail"
        try:
            raise ValueError(detail)  # noqa: TRY301
        except ValueError:
            logging.getLogger("uvicorn.error").exception("secret message")
        logging.getLogger("uvicorn.access").info("secret URL")
    captured = capsys.readouterr().err
    assert '"event":"http_response"' in captured
    assert '"event":"server_log"' in captured
    # The kind of failure is kept; its text, which may carry request data, is not.
    assert '"exception":["builtins.ValueError"]' in captured
    assert "secret" not in captured


def test_successful_health_probes_are_quiet_but_failed_readiness_is_logged(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with TestClient(create_app()) as client:
        health = client.get("/health", headers={"X-Request-Id": "health-probe"})
        assert health.status_code == 200
        assert health.headers["X-Request-Id"] == "health-probe"
        assert '"event":"http_response"' not in capsys.readouterr().err
        assert client.get("/ready").status_code == 503
    captured = capsys.readouterr().err
    assert '"operation":"ready"' in captured
    assert '"status":503' in captured
    assert '"method":"GET"' in captured
