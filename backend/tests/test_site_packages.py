from collections.abc import Iterator
from io import BytesIO
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.domain.project_import import ProjectImportResult
from fieldmaps_api.schemas import PackageDetail, PackageHistory
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.package_fixtures import qgz, submission
from tests.signing import MANAGER, Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in
from tests.test_project_import import document, request

pytestmark = pytest.mark.integration

PROJECT = "10000000-0000-4000-8000-000000000002"
SITE = "10000000-0000-4000-8000-000000000003"


@pytest.fixture
def tenant(api_client: TestClient, signer: Signer) -> Iterator["Tenant"]:
    value = Tenant.new()
    create_tenant(value)
    sign_in(api_client, signer, value.users["manager"])
    try:
        yield value
    finally:
        cleanup_tenant(value)


def test_manager_can_preview_a_project_without_saving_a_package(
    api_client: TestClient,
    signer: Signer,
) -> None:
    client = as_manager(api_client, signer)
    base = "/v1/projects/10000000-0000-4000-8000-000000000002/packages"
    before = client.get(base).content
    response = client.post(
        f"{base}/import", json=request({"site.qgs": document()}).model_dump(mode="json")
    )
    assert response.status_code == 200, response.text
    assert len(ProjectImportResult.model_validate_json(response.content).issues) == 2
    assert client.get(base).content == before


def test_observer_cannot_convert_a_project(api_client: TestClient) -> None:
    response = api_client.post(
        "/v1/projects/10000000-0000-4000-8000-000000000002/packages/import",
        json=request({"site.qgs": document()}).model_dump(mode="json"),
    )
    assert response.status_code == 403


def as_manager(client: TestClient, signer: Signer) -> TestClient:
    client.headers["Authorization"] = f"Bearer {signer.issue(MANAGER)}"
    return client


def test_a_manager_prepares_a_package_and_a_device_can_fetch_it(
    api_client: TestClient, tenant: "Tenant"
) -> None:
    client = api_client
    project = tenant.project
    site = tenant.site
    payload = submission(site_id=str(site))
    created = client.post(f"/v1/projects/{project}/packages", json=payload)
    assert created.status_code == 201, created.text
    publication = Publication.model_validate_json(created.content)
    package_id = publication.package.package_id
    assert publication.current_package_id == package_id
    assert publication.replayed is False
    package = PackageDetail.model_validate_json(
        client.get(f"/v1/projects/{project}/packages/{package_id}").content
    )
    assert package.state == "ready"
    assert package.site_id == site
    assert package.package_id == package_id
    assert [check.step for check in package.checks] == [
        "source-project",
        "layer-sources",
        "coordinate-reference",
        "imagery-licence",
        "archive",
    ]

    listed = client.get(f"/v1/projects/{project}/packages", params={"site_id": str(site)})
    assert listed.status_code == 200
    history = PackageHistory.model_validate_json(listed.content)
    assert history.current_package_id == package_id
    assert [row.package_id for row in history.packages] == [package_id]

    archive = client.get(
        f"/v1/projects/{project}/packages/{package_id}/archive"
    )
    assert archive.status_code == 200
    assert archive.headers["content-type"] == "application/zip"
    assert archive.headers["etag"].strip('"') == package.archive_sha256
    with ZipFile(BytesIO(archive.content)) as opened:
        assert "manifest.json" in opened.namelist()


def test_lost_initial_publication_response_replays_without_duplicate_package(
    api_client: TestClient, tenant: "Tenant"
) -> None:
    client = api_client
    project = tenant.project
    site = tenant.site
    url = f"/v1/projects/{project}/packages"
    payload = submission(site_id=str(site))
    first = client.post(url, json=payload)
    replay = client.post(url, json=payload)
    assert first.status_code == 201, first.text
    assert replay.status_code == 200, replay.text
    first_publication = Publication.model_validate_json(first.content)
    replay_publication = Publication.model_validate_json(replay.content)
    assert replay_publication.package.package_id == first_publication.package.package_id
    assert replay_publication.current_package_id == first_publication.current_package_id
    assert first_publication.replayed is False
    assert replay_publication.replayed is True
    history = PackageHistory.model_validate_json(
        client.get(url, params={"site_id": str(site)}).content
    )
    assert history.current_package_id == replay_publication.package.package_id
    assert len(history.packages) == 1


def test_an_unlicensed_source_is_rejected_without_publishing(
    api_client: TestClient, tenant: "Tenant"
) -> None:
    client = api_client
    project = tenant.project
    site = tenant.site
    google = (
        '<qgis><projectlayers><maplayer type="raster"><layername>Satellite</layername>'
        "<provider>wms</provider>"
        "<datasource>type=xyz&amp;url=https://mt1.google.com/vt</datasource>"
        "</maplayer></projectlayers></qgis>"
    )
    before = client.post(
        f"/v1/projects/{project}/packages", json=submission(site_id=str(site))
    )
    assert before.status_code == 201, before.text
    before_id = Publication.model_validate_json(before.content).package.package_id
    history = client.get(
        f"/v1/projects/{project}/sites/{site}/zones", params={"package_id": str(before_id)}
    )
    assert history.status_code == 200, history.text
    first_zone = HistoricalZones.model_validate_json(history.content).zones[0]
    refused = client.post(
        f"/v1/projects/{project}/packages",
        json=submission(
            site_id=str(site),
            expected_current_package_id=str(before_id),
            zone_identity_map=[
                {
                    "source_feature_id": "A",
                    "zone_id": str(first_zone.zone_id),
                    "zone_code": first_zone.zone_code,
                }
            ],
            project_file={"file_name": "site.qgz", "content": qgz(google)},
        ),
    )
    assert refused.status_code == 422, refused.text
    history = PackageHistory.model_validate_json(
        client.get(f"/v1/projects/{project}/packages", params={"site_id": str(site)}).content
    )
    assert history.current_package_id == before_id
    assert len(history.packages) == 1


def test_an_observer_may_read_packages_but_not_prepare_one(api_client: TestClient) -> None:
    # The default client signs in as the seeded observer.
    listed = api_client.get(
        f"/v1/projects/{PROJECT}/packages", params={"site_id": SITE}
    )
    assert listed.status_code == 200
    refused = api_client.post(
        f"/v1/projects/{PROJECT}/packages", json=submission()
    )
    assert refused.status_code == 403


def test_a_submission_the_format_refuses_is_a_422(
    api_client: TestClient, tenant: "Tenant"
) -> None:
    client = api_client
    refused = client.post(
        f"/v1/projects/{tenant.project}/packages",
        json=submission(
            site_id=str(tenant.site),
            layers={"ground": {"type": "FeatureCollection", "features": []}},
        ),
    )
    assert refused.status_code == 422
