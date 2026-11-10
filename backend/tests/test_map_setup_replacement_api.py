from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.map_setup_schemas import MapSetup
from fieldmaps_api.site_schemas import Site
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.map_setup_fixtures import qgz_request
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, create_package
from tests.test_map_setup_api import setup_url

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_map_setup_api",)


def test_replacement_starts_with_current_boundary_and_zone_identities(
    api_client: TestClient, signer: Signer, setup_site: Tenant
) -> None:
    # Given an existing published map whose zone identities must remain stable.
    package = create_package(api_client, signer, setup_site)
    historical_url = (
        f"/v1/projects/{setup_site.project}/sites/{setup_site.site}/zones?package_id={package}"
    )
    historical = HistoricalZones.model_validate_json(api_client.get(historical_url).content)
    archive_url = f"/v1/projects/{setup_site.project}/packages/{package}/archive"
    immutable_archive = api_client.get(archive_url)
    assert immutable_archive.status_code == 200, immutable_archive.text
    body = {
        **qgz_request("outline-no-zones").model_dump(mode="json"),
        "request_id": str(uuid4()),
        "expected_current_package_id": str(package),
    }
    # When the manager starts a replacement from a project lacking zones.
    response = api_client.post(f"{setup_url(setup_site)}/import", json=body)
    # Then acknowledged existing boundaries are retained and the current version stays available.
    assert response.status_code == 201, response.text
    setup = MapSetup.model_validate_json(response.content)
    assert setup.content.outline is not None
    assert setup.expected_current_package_id == package
    assert [(z.zone_id, z.zone_code, z.zone_label, z.geometry) for z in setup.content.zones] == [
        (z.zone_id, z.zone_code, z.zone_label, z.geometry) for z in historical.zones
    ]
    assert setup.content.form_version == "shell-v1"
    layer = setup.layers[0]
    feature = layer.features[0]
    content = setup.content.model_dump(mode="json")
    content.update(
        {
            "assignments": [
                {
                    "source_id": layer.source_id,
                    "feature_key": feature.feature_key,
                    "role": "outline",
                    "zone_id": None,
                }
            ],
            "outline": feature.feature.geometry.model_dump(mode="json"),
            "change_note": "Publish replacement without changing zone identity",
        }
    )
    url = f"{setup_url(setup_site)}/{setup.setup_id}"
    saved = api_client.put(url, headers={"If-Match": response.headers["etag"]}, json=content)
    assert saved.status_code == 200, saved.text
    checked = api_client.post(f"{url}/validate", headers={"If-Match": saved.headers["etag"]})
    assert checked.status_code == 200, checked.text
    published = api_client.post(
        f"{url}/publish",
        headers={"If-Match": saved.headers["etag"]},
        json={
            "request_id": str(uuid4()),
            "expected_current_package_id": str(package),
        },
    )
    assert published.status_code == 201, published.text
    v2 = Publication.model_validate_json(published.content)
    assert v2.package.package_version == 2

    # The current site keeps the original zone identity/code, while v1 remains exactly readable.
    current = Site.model_validate_json(
        api_client.get(f"/v1/projects/{setup_site.project}/sites/{setup_site.site}").content
    )
    assert current.current_package_id == v2.package.package_id
    assert [(zone.zone_id, zone.zone_code) for zone in current.zones] == [
        (zone.zone_id, zone.zone_code) for zone in historical.zones
    ]
    v2_zones = HistoricalZones.model_validate_json(
        api_client.get(
            f"/v1/projects/{setup_site.project}/sites/{setup_site.site}/zones",
            params={"package_id": str(v2.package.package_id)},
        ).content
    )
    assert [(zone.zone_id, zone.zone_code) for zone in v2_zones.zones] == [
        (zone.zone_id, zone.zone_code) for zone in historical.zones
    ]
    immutable_v1 = HistoricalZones.model_validate_json(api_client.get(historical_url).content)
    assert immutable_v1 == historical
    reread_archive = api_client.get(archive_url)
    assert reread_archive.status_code == 200, reread_archive.text
    assert reread_archive.content == immutable_archive.content
