from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.main import create_app
from tests.local_database import database_settings
from tests.signing import ISSUER, Signer, make_signer

pytest_plugins = ("tests.zone_api_fixtures", "tests.bound_upload_fixtures")


@pytest.fixture
def signer() -> Signer:
    return make_signer()


@pytest.fixture
def api_client(signer: Signer, request: pytest.FixtureRequest) -> Iterator[TestClient]:
    if "integration" not in request.keywords:
        pytest.fail("Database-backed api_client requires @pytest.mark.integration")
    settings = database_settings()
    with TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client:
        client.headers["Authorization"] = f"Bearer {signer.issue()}"
        yield client


@pytest.fixture
def validation_client(signer: Signer) -> Iterator[TestClient]:
    """Signed HTTP boundary checks with no database settings, password file or startup probe."""
    with TestClient(create_app(verifier=JwksVerifier(ISSUER, "authenticated", signer))) as client:
        client.headers["Authorization"] = f"Bearer {signer.issue()}"
        yield client


@pytest.fixture(autouse=True)
def isolated_startup(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Pure HTTP tests replace only the database startup probe; integration tests do not."""
    if "integration" not in request.keywords and "api_client" not in request.fixturenames:

        async def safe_role(_engine: AsyncEngine) -> None:
            return

        monkeypatch.setattr("fieldmaps_api.readiness.assert_safe_role", safe_role)
