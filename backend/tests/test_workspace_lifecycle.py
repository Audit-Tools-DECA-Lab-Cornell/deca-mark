"""Access changes and package selection as the live workspace uses them."""

from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.identity_schemas import Identity
from fieldmaps_api.schemas import PackageHistory
from fieldmaps_api.site_schemas import Site
from fieldmaps_api.tenancy_schemas import Project
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.package_fixtures import error_of, online_basemap, qgis_document, qgz, submission
from tests.signing import Signer
from tests.tenant_fixtures import (
    Tenant,
    cleanup_tenant,
    create_package,
    create_tenant,
    observation_payload,
    sign_in,
)
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration


@pytest.fixture
def tenant(api_client: TestClient, signer: Signer) -> Iterator[Tenant]:
    value = Tenant.new()
    create_tenant(value)
    sign_in(api_client, signer, value.users["owner"])
    try:
        yield value
    finally:
        cleanup_tenant(value)


def test_inherited_manager_access_disappears_on_org_demotion(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    sign_in(api_client, signer, tenant.users["admin"])
    me = Identity.model_validate_json(api_client.get("/v1/me").content)
    assert (
        next(row for row in me.project_memberships if row.project_id == tenant.project).role
        == "manager"
    )
    assert api_client.get(f"{base}/members").status_code == 200
    assert api_client.patch(base, json={"description": "Saved by an org admin"}).status_code == 200
    sign_in(api_client, signer, tenant.users["owner"])
    assert (
        api_client.patch(
            f"/v1/orgs/{tenant.org}/members/{tenant.users['admin']}", json={"role": "member"}
        ).status_code
        == 204
    )
    sign_in(api_client, signer, tenant.users["admin"])
    me = Identity.model_validate_json(api_client.get("/v1/me").content)
    assert tenant.project not in {row.project_id for row in me.project_memberships}
    assert api_client.get(base).status_code == 404
    assert api_client.get(f"{base}/members").status_code == 403


def test_removal_revokes_record_and_archive_access_on_the_next_request(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    created = api_client.post(f"{base}/packages", json=submission(site_id=str(tenant.site)))
    assert created.status_code == 201, created.text
    package = Publication.model_validate_json(created.content).package
    paths = [
        base,
        f"{base}/observations",
        f"{base}/sites",
        f"{base}/forms",
        f"{base}/packages/{package.package_id}/archive",
    ]
    sign_in(api_client, signer, tenant.users["viewer"])
    for path in paths:
        assert api_client.get(path).status_code == 200
    sign_in(api_client, signer, tenant.users["owner"])
    assert api_client.delete(f"{base}/members/{tenant.users['viewer']}").status_code == 204
    sign_in(api_client, signer, tenant.users["viewer"])
    for path in paths:
        assert api_client.get(path).status_code == 404


def test_archive_is_a_status_change_and_does_not_strand_offline_uploads(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    package_id = UUID(str(create_package(api_client, signer, tenant)))
    zones = document(
        api_client.get(
            f"{base}/sites/{tenant.site}/zones", params={"package_id": str(package_id)}
        ).content
    )["zones"]
    assert isinstance(zones, list)
    assert zones
    zone = zones[0]
    assert isinstance(zone, dict)
    zone_id = UUID(str(zone["zone_id"]))
    changed = api_client.patch(base, json={"status": "archived", "timezone": "America/New_York"})
    assert changed.status_code == 200
    sign_in(api_client, signer, tenant.users["observer"])
    assert Project.model_validate_json(api_client.get(base).content).status == "archived"
    assert (
        api_client.put(
            f"{base}/observations/{uuid4()}",
            json=observation_payload(tenant.site, package_id, zone_id),
        ).status_code
        == 200
    )
    sign_in(api_client, signer, tenant.users["owner"])
    assert api_client.patch(base, json={"status": "active", "description": None}).status_code == 200
    project = Project.model_validate_json(api_client.get(base).content)
    assert (project.status, project.timezone, project.description) == (
        "active",
        "America/New_York",
        None,
    )


def test_invalid_new_source_does_not_replace_a_sites_ready_package(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    first_id = create_package(api_client, signer, tenant)
    project_file = qgz(
        qgis_document(online_basemap("Unlicensed", "https://tiles.example.invalid/xyz"))
    )
    # The successor names the first version's zone, so the request reaches the package checks.
    history = api_client.get(
        f"{base}/sites/{tenant.site}/zones", params={"package_id": str(first_id)}
    )
    first_zone = HistoricalZones.model_validate_json(history.content).zones[0]
    refused = api_client.post(
        f"{base}/packages",
        json=submission(
            site_id=str(tenant.site),
            request_id=str(uuid4()),
            expected_current_package_id=str(first_id),
            zone_identity_map=[
                {
                    "source_feature_id": "A",
                    "zone_id": str(first_zone.zone_id),
                    "zone_code": first_zone.zone_code,
                }
            ],
            project_file={"file_name": "blocked.qgz", "content": project_file},
        ),
    )
    assert refused.status_code == 422, refused.text
    error = error_of(refused.content)
    assert error.code == "online_basemap_unconfirmed"
    assert error.details == {"layers": [{"name": "Unlicensed", "host": "tiles.example.invalid"}]}
    created = api_client.post(f"{base}/sites", json={"code": "second-site", "name": "Second site"})
    assert created.status_code == 201, created.text
    second = Site.model_validate_json(created.content)
    assert (
        api_client.post(
            f"{base}/packages", json=submission(site_id=str(second.site_id))
        ).status_code
        == 201
    )
    site = Site.model_validate_json(api_client.get(f"{base}/sites/{tenant.site}").content)
    assert site.package is not None
    assert site.package.package_id == first_id
    packages = PackageHistory.model_validate_json(
        api_client.get(f"{base}/packages", params={"site_id": str(tenant.site)}).content
    )
    assert [package.package_id for package in packages.packages] == [first_id]
