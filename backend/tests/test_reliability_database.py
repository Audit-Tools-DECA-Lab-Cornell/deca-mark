from collections.abc import Iterator
from io import BytesIO
from urllib.request import OpenerDirector, Request

import anyio
import orjson
import pytest
from fastapi.testclient import TestClient
from jwt import PyJWKClient, PyJWKClientConnectionError
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.database import database_connection
from fieldmaps_api.main import create_app
from tests.local_database import database_url, password_file
from tests.signing import ISSUER, Signer

pytestmark = pytest.mark.integration


@pytest.fixture
def fault_client(signer: Signer) -> Iterator[TestClient]:
    settings = Settings.model_validate(
        {
            "database_url": database_url(),
            "database_password_file": password_file(),
            "issuer": ISSUER,
            "jwks_url": f"{ISSUER}/.well-known/jwks.json",
        }
    )
    engine = create_async_engine(database_connection(settings).url, poolclass=NullPool)
    app = create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))

    @app.get("/fault/{kind}")
    async def fail(kind: str) -> None:
        async with engine.begin() as connection:
            match kind:
                case "sole_owner":
                    await connection.execute(
                        text("DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = 'FM002'; END $$")
                    )
                case "check":
                    await connection.execute(
                        text("CREATE TEMP TABLE failure_check(n int CHECK(n > 0)) ON COMMIT DROP")
                    )
                    await connection.execute(text("INSERT INTO failure_check VALUES (-1)"))
                case "dropped":
                    await connection.execute(text("SELECT pg_terminate_backend(pg_backend_pid())"))
                case _:
                    pytest.fail("Unknown fault case")

    @app.get("/deadlock")
    async def deadlock() -> None:
        locked = [anyio.Event(), anyio.Event()]
        failures: list[DBAPIError] = []

        async def contender(index: int) -> None:
            try:
                async with engine.begin() as connection:
                    await connection.execute(
                        text("SELECT pg_advisory_xact_lock(:key)"), {"key": 812001 + index}
                    )
                    locked[index].set()
                    await locked[1 - index].wait()
                    await connection.execute(
                        text("SELECT pg_advisory_xact_lock(:key)"), {"key": 812002 - index}
                    )
            except DBAPIError as error:
                failures.append(error)

        async with anyio.create_task_group() as group:
            group.start_soon(contender, 0)
            group.start_soon(contender, 1)
        assert len(failures) == 1
        raise failures[0]

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    anyio.run(engine.dispose)


@pytest.mark.parametrize(
    ("kind", "status", "code"),
    [
        ("sole_owner", 409, "sole_owner"),
        ("check", 422, "validation_failed"),
        ("dropped", 503, "storage_unavailable"),
    ],
)
def test_actual_database_failures(
    fault_client: TestClient, kind: str, status: int, code: str
) -> None:
    response = fault_client.get(f"/fault/{kind}")
    assert response.status_code == status
    assert f'"code":"{code}"' in response.text
    if status == 422:
        assert '"fields":[{"id":"body"' in response.text


def test_readiness_jwks_failure(fault_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def failed_fetch(_client: PyJWKClient, *, _refresh: bool = False) -> None:
        message = "private provider response"
        raise PyJWKClientConnectionError(message)

    monkeypatch.setattr(PyJWKClient, "get_jwk_set", failed_fetch)
    response = fault_client.get("/ready")
    assert response.status_code == 503
    assert "private" not in response.text


def test_real_deadlock_returns_retryable_error(fault_client: TestClient) -> None:
    response = fault_client.get("/deadlock")
    assert response.status_code == 503
    assert '"code":"storage_unavailable"' in response.text


def test_readiness_uses_cached_signing_keys(
    fault_client: TestClient, signer: Signer, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.signing import base64_integer  # noqa: PLC0415

    requests: list[bool] = []
    numbers = signer.private_key.public_key().public_numbers()

    def fetch(_opener: OpenerDirector, _request: Request, timeout: float) -> BytesIO:
        requests.append(True)
        keys = {
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "test",
                    "alg": "RS256",
                    "n": base64_integer(numbers.n),
                    "e": base64_integer(numbers.e),
                }
            ]
        }
        assert timeout == 5
        return BytesIO(orjson.dumps(keys))

    monkeypatch.setattr("urllib.request.OpenerDirector.open", fetch)
    assert fault_client.get("/ready").status_code == 200
    assert fault_client.get("/ready").status_code == 200
    assert len(requests) == 1


def test_readiness_rejects_invalid_signing_keys(
    fault_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def empty_keys(_client: PyJWKClient) -> dict[str, list[str]]:
        return {"keys": []}

    monkeypatch.setattr(PyJWKClient, "fetch_data", empty_keys)
    assert fault_client.get("/ready").status_code == 503
