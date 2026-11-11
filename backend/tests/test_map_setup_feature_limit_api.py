from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.map_setup_schemas import MapSetup
from tests.map_setup_fixtures import point_sources
from tests.tenant_fixtures import Tenant
from tests.test_map_setup_api import setup_url

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_map_setup_api",)


def test_excessive_initial_import_creates_no_unsaveable_setup(
    api_client: TestClient, setup_site: Tenant
) -> None:
    response = api_client.post(
        f"{setup_url(setup_site)}/import",
        json={
            "request_id": str(uuid4()),
            "expected_current_package_id": None,
            "mode": "geojson",
            "files": [file.model_dump(mode="json") for file in point_sources((10_001, 10_001))],
        },
    )
    assert response.status_code == 422, response.text
    assert "20,000 features in total" in response.json()["error"]["message"]
    assert api_client.get(setup_url(setup_site)).json() == []


@pytest.mark.parametrize("preview", [True, False])
def test_excessive_source_update_keeps_the_acknowledged_setup(
    api_client: TestClient, setup_site: Tenant, *, preview: bool
) -> None:
    created = api_client.post(
        f"{setup_url(setup_site)}/import",
        json={
            "request_id": str(uuid4()),
            "expected_current_package_id": None,
            "mode": "geojson",
            "files": [file.model_dump(mode="json") for file in point_sources((1,))],
        },
    )
    assert created.status_code == 201, created.text
    setup = MapSetup.model_validate_json(created.content)
    url = f"{setup_url(setup_site)}/{setup.setup_id}"
    response = api_client.post(
        f"{url}/sources",
        headers={"If-Match": created.headers["etag"]},
        json={
            "request_id": str(uuid4()),
            "preview": preview,
            "candidate_hash": "0" * 64,
            "files": [file.model_dump(mode="json") for file in point_sources((10_000, 10_001))],
        },
    )
    assert response.status_code == 422, response.text
    assert "20,000 features in total" in response.json()["error"]["message"]
    restored = api_client.get(url)
    assert restored.headers["etag"] == created.headers["etag"]
    assert MapSetup.model_validate_json(restored.content) == setup
