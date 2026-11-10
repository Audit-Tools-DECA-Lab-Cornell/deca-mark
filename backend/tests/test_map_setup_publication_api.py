from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.domain.geojson import FeatureCollection
from fieldmaps_api.domain.zone_package_schemas import ZonePackageManifest
from fieldmaps_api.map_setup_schemas import MapSetup
from fieldmaps_api.schemas import PackageHistory
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.map_setup_fixtures import qgz_request
from tests.tenant_fixtures import Tenant
from tests.test_map_setup_api import import_setup

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_map_setup_api",)


def test_first_map_publishes_once_and_replays_original_receipt(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a real first-map setup with reviewed outline, one drawn zone and form.
    url, etag, setup = import_setup(api_client, setup_site)
    layer = setup.layers[0]
    item = layer.features[0]
    content = setup.content.model_dump(mode="json")
    content.update(
        {
            "assignments": [
                {"source_id": layer.source_id, "feature_key": item.feature_key, "role": "outline"}
            ],
            "outline": item.feature.geometry.model_dump(mode="json"),
            "zones": [
                {
                    "zone_id": str(uuid4()),
                    "zone_code": "A",
                    "zone_label": "Zone A",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-76.489, 42.441],
                                [-76.481, 42.441],
                                [-76.481, 42.449],
                                [-76.489, 42.449],
                                [-76.489, 42.441],
                            ]
                        ],
                    },
                }
            ],
            "form_version": "shell-v1",
        }
    )
    saved = api_client.put(url, headers={"If-Match": etag}, json=content)
    assert saved.status_code == 200, saved.text
    checked = api_client.post(f"{url}/validate", headers={"If-Match": saved.headers["etag"]})
    assert checked.status_code == 200, checked.text
    assert checked.json()["ready"] is True
    body = {"request_id": str(uuid4()), "expected_current_package_id": None}
    # When the saved revision publishes and a lost-response retry repeats its request.
    published = api_client.post(
        f"{url}/publish", headers={"If-Match": saved.headers["etag"]}, json=body
    )
    assert published.status_code == 201, published.text
    replay = api_client.post(
        f"{url}/publish", headers={"If-Match": saved.headers["etag"]}, json=body
    )
    # Then the same immutable package is returned and the site points to it once.
    assert replay.status_code == 200, replay.text
    assert replay.json()["replayed"] is True
    assert replay.json()["package"] == published.json()["package"]
    current = api_client.get(f"/v1/projects/{setup_site.project}/sites/{setup_site.site}")
    assert current.json()["current_package_id"] == published.json()["package"]["package_id"]
    restored = api_client.get(url)
    assert restored.status_code == 200, restored.text
    assert restored.json()["state"] == "published"
    assert not restored.json()["layers"]
    assert not restored.json()["sources"]


def test_complete_import_publishes_its_reviewed_geometry_and_zone_identity(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given one complete QGIS fixture with imported outline, zone and tree geometry.
    created = api_client.post(
        f"/v1/projects/{setup_site.project}/sites/{setup_site.site}/map-setups/import",
        json={
            **qgz_request("complete").model_dump(mode="json"),
            "request_id": str(uuid4()),
            "expected_current_package_id": None,
        },
    )
    assert created.status_code == 201, created.text
    setup = MapSetup.model_validate_json(created.content)
    layers = {layer.name: layer for layer in setup.layers}
    assert set(layers) == {"ground", "zones", "trees"}
    outline_feature = layers["ground"].features[0].feature
    zone_feature = layers["zones"].features[0].feature
    tree_feature = layers["trees"].features[0].feature
    assert outline_feature.geometry.type == "Polygon"
    assert zone_feature.geometry.type == "Polygon"
    assert tree_feature.geometry.type == "Point"
    zone_id = uuid4()
    content = setup.content.model_dump(mode="json")
    content.update(
        {
            "assignments": [
                {
                    "source_id": layers["ground"].source_id,
                    "feature_key": layers["ground"].features[0].feature_key,
                    "role": "outline",
                    "zone_id": None,
                },
                {
                    "source_id": layers["zones"].source_id,
                    "feature_key": layers["zones"].features[0].feature_key,
                    "role": "zones",
                    "zone_id": str(zone_id),
                },
                {
                    "source_id": layers["trees"].source_id,
                    "feature_key": layers["trees"].features[0].feature_key,
                    "role": "trees",
                    "zone_id": None,
                },
            ],
            "outline": outline_feature.geometry.model_dump(mode="json"),
            "zones": [
                {
                    "zone_id": str(zone_id),
                    "zone_code": "A",
                    "zone_label": "Zone A",
                    "geometry": zone_feature.geometry.model_dump(mode="json"),
                }
            ],
            "form_version": "shell-v1",
        }
    )
    setup_url = (
        f"/v1/projects/{setup_site.project}/sites/{setup_site.site}/map-setups/{setup.setup_id}"
    )
    reviewed = api_client.put(
        setup_url,
        headers={"If-Match": created.headers["etag"]},
        json=content,
    )
    assert reviewed.status_code == 200, reviewed.text
    validation = api_client.post(
        f"{setup_url}/validate", headers={"If-Match": reviewed.headers["etag"]}
    )
    assert validation.status_code == 200, validation.text
    assert validation.json()["ready"] is True

    # When the manager selects the form and publishes without drawing substitute geometry.
    published = api_client.post(
        f"{setup_url}/publish",
        headers={"If-Match": reviewed.headers["etag"]},
        json={"request_id": str(uuid4()), "expected_current_package_id": None},
    )
    assert published.status_code == 201, published.text
    publication = Publication.model_validate_json(published.content)

    # Then exactly one v1 package retains the imported outline, tree and reviewed zone identity.
    history = PackageHistory.model_validate_json(
        api_client.get(
            f"/v1/projects/{setup_site.project}/packages",
            params={"site_id": str(setup_site.site)},
        ).content
    )
    assert [(item.package_id, item.package_version) for item in history.packages] == [
        (publication.package.package_id, 1)
    ]
    zones = HistoricalZones.model_validate_json(
        api_client.get(
            f"/v1/projects/{setup_site.project}/sites/{setup_site.site}/zones",
            params={"package_id": str(publication.package.package_id)},
        ).content
    )
    assert [(item.zone_id, item.zone_code, item.zone_label) for item in zones.zones] == [
        (zone_id, "A", "Zone A")
    ]
    assert zones.zones[0].geometry.model_dump(mode="json") == {
        "type": "MultiPolygon",
        "coordinates": [zone_feature.geometry.coordinates],
    }
    archive = api_client.get(
        f"/v1/projects/{setup_site.project}/packages/{publication.package.package_id}/archive"
    )
    assert archive.status_code == 200, archive.text
    with ZipFile(BytesIO(archive.content)) as package:
        manifest = ZonePackageManifest.model_validate_json(package.read("manifest.json"))
        ground = FeatureCollection.model_validate_json(package.read("layers/ground.json"))
        trees = FeatureCollection.model_validate_json(package.read("layers/trees.json"))
    assert manifest.package_version == 1
    assert manifest.forms.play.form_version == "shell-v1"
    assert ground.features[0].geometry == outline_feature.geometry
    assert trees.features[0].geometry == tree_feature.geometry


def test_publication_replay_refuses_changed_revision_identity(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a successfully published map and the original immutable request identity.
    url, etag, setup = import_setup(api_client, setup_site)
    layer = setup.layers[0]
    item = layer.features[0]
    content = setup.content.model_dump(mode="json")
    content.update(
        {
            "assignments": [
                {"source_id": layer.source_id, "feature_key": item.feature_key, "role": "outline"}
            ],
            "outline": item.feature.geometry.model_dump(mode="json"),
            "zones": [
                {
                    "zone_id": str(uuid4()),
                    "zone_code": "A",
                    "zone_label": "Zone A",
                    "geometry": item.feature.geometry.model_dump(mode="json"),
                }
            ],
            "form_version": "shell-v1",
        }
    )
    saved = api_client.put(url, headers={"If-Match": etag}, json=content)
    assert saved.status_code == 200, saved.text
    body = {"request_id": str(uuid4()), "expected_current_package_id": None}
    published = api_client.post(
        f"{url}/publish", headers={"If-Match": saved.headers["etag"]}, json=body
    )
    assert published.status_code == 201, published.text
    # When the same request ID is reused with a different revision precondition.
    changed = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    # Then it is refused rather than replaying an approval for different content.
    assert changed.status_code == 409, changed.text
    assert changed.json()["error"]["code"] == "idempotency_conflict"


def test_unfinished_zone_code_is_actionable_publication_error(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a safely saved draft zone whose name/code is not yet ready for publication.
    url, etag, setup = import_setup(api_client, setup_site)
    item = setup.layers[0].features[0]
    content = setup.content.model_dump(mode="json")
    content.update(
        {
            "outline": item.feature.geometry.model_dump(mode="json"),
            "form_version": "shell-v1",
            "assignments": [
                {
                    "source_id": setup.layers[0].source_id,
                    "feature_key": item.feature_key,
                    "role": "outline",
                }
            ],
            "zones": [
                {
                    "zone_id": str(uuid4()),
                    "zone_code": "has spaces",
                    "zone_label": "Zone A",
                    "geometry": item.feature.geometry.model_dump(mode="json"),
                }
            ],
        }
    )
    saved = api_client.put(url, headers={"If-Match": etag}, json=content)
    assert saved.status_code == 200, saved.text
    # When the manager validates publication.
    result = api_client.post(f"{url}/validate", headers={"If-Match": saved.headers["etag"]})
    # Then the incomplete code is a recoverable validation error, not a server failure.
    assert result.status_code == 422, result.text
    assert result.json()["error"]["code"] == "validation_failed"
    assert api_client.get(url).status_code == 200
