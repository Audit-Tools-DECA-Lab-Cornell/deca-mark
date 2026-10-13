from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.main import create_app
from tests.local_database import database_url, password_file
from tests.signing import ISSUER, Signer, make_signer

pytest_plugins = ("tests.zone_api_fixtures", "tests.bound_upload_fixtures")


@pytest.fixture
def signer() -> Signer:
    return make_signer()


@pytest.fixture
def api_client(signer: Signer) -> Iterator[TestClient]:
    settings = Settings(
        database_url=database_url(),
        database_password_file=password_file(),
    )
    with TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client:
        client.headers["Authorization"] = f"Bearer {signer.issue()}"
        yield client


@pytest.fixture(autouse=True)
def isolated_startup(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Pure HTTP tests replace only the database startup probe; integration tests do not."""
    if "integration" not in request.keywords and "api_client" not in request.fixturenames:

        async def safe_role(_engine: AsyncEngine) -> None:
            return

        monkeypatch.setattr("fieldmaps_api.readiness.assert_safe_role", safe_role)
