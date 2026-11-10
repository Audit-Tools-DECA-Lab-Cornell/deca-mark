from typing import Literal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.services import map_setup_imports
from fieldmaps_api.services.map_setup_imports import ImportData
from tests.local_database import admin_sql
from tests.map_setup_fixtures import qgz_request
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, sign_in
from tests.test_map_setup_api import import_setup, setup_url

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_map_setup_api",)


def revoke_manager(tenant: Tenant) -> None:
    admin_sql(
        "BEGIN; INSERT INTO fieldmaps.project_memberships(organization_id,project_id,user_id,role) "
        "VALUES(:'org',:'project',:'backup','manager'); "
        "UPDATE fieldmaps.project_memberships SET role='observer' "
        "WHERE project_id=:'project' AND user_id=:'manager'; COMMIT;",
        *tenant.variables(),
        f"backup={tenant.users['owner']}",
        f"manager={tenant.users['manager']}",
    )


def test_role_revoked_during_conversion_cannot_persist_setup(
    api_client: TestClient, signer: Signer, setup_site: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given a real importer that completes after the manager's role was revoked.
    original = map_setup_imports.convert

    async def convert_then_revoke(
        files: list[ProjectFile], mode: Literal["project", "geojson"]
    ) -> ImportData:
        result = await original(files, mode)
        revoke_manager(setup_site)
        return result

    monkeypatch.setattr(map_setup_imports, "convert", convert_then_revoke)
    body = {
        **qgz_request("outline-no-zones").model_dump(mode="json"),
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
    }
    # When conversion returns and the server attempts persistence.
    response = api_client.post(f"{setup_url(setup_site)}/import", json=body)
    # Then no setup is committed or exposed to the revoked manager.
    assert response.status_code == 403, response.text
    sign_in(api_client, signer, setup_site.users["owner"])
    assert api_client.get(setup_url(setup_site)).json() == []


def test_role_revoked_during_source_preview_cannot_expose_candidate(
    api_client: TestClient, setup_site: Tenant, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given source preview conversion that completes after role revocation.
    url, etag, _ = import_setup(api_client, setup_site)
    original = map_setup_imports.convert

    async def convert_then_revoke(
        files: list[ProjectFile], mode: Literal["project", "geojson"]
    ) -> ImportData:
        result = await original(files, mode)
        revoke_manager(setup_site)
        return result

    monkeypatch.setattr(map_setup_imports, "convert", convert_then_revoke)
    body = {
        "request_id": str(uuid4()),
        "preview": True,
        "files": qgz_request("outline-no-zones").model_dump(mode="json")["files"],
    }
    # When the revoked manager's long-running preview returns.
    response = api_client.post(f"{url}/sources", headers={"If-Match": etag}, json=body)
    # Then converted private geometry is refused rather than returned.
    assert response.status_code == 403, response.text
    assert "layers" not in response.json()
