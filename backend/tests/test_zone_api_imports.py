from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.package_fixtures import submission
from tests.zone_api_fixtures import JSON_DOCUMENT, ZoneSite, create_draft, document, publish_draft

pytestmark = pytest.mark.integration


def test_managed_import_uses_exact_mapping_and_same_publication_replay(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    current = publish_draft(api_client, zone_site)
    clone = api_client.post(
        zone_site.drafts,
        json={"request_id": str(uuid4()), "base_package_id": current["package_id"]},
    )
    assert clone.status_code == 201, clone.text
    zones = document(clone.content)["zones"]
    assert isinstance(zones, list)
    zone = zones[0]
    assert isinstance(zone, dict)
    body = JSON_DOCUMENT.validate_python(submission(site_id=str(zone_site.tenant.site)))
    layers = body["layers"]
    assert isinstance(layers, dict)
    zone_layer = layers["zones"]
    assert isinstance(zone_layer, dict)
    features = zone_layer["features"]
    assert isinstance(features, list)
    feature = features[0]
    assert isinstance(feature, dict)
    properties = feature["properties"]
    assert isinstance(properties, dict)
    properties["id"] = "qgis-source-feature"
    properties["name"] = "Imported renamed lawn"
    body.update(
        {
            "request_id": str(uuid4()),
            "expected_current_package_id": current["package_id"],
            "change_note": "Deliberate imported identity",
            "zone_identity_map": [
                {
                    "source_feature_id": "qgis-source-feature",
                    "zone_id": zone["zone_id"],
                    "zone_code": zone["zone_code"],
                }
            ],
        }
    )
    result = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert result.status_code == 201, result.text
    imported = document(result.content)
    imported_package = imported["package"]
    assert isinstance(imported_package, dict)
    package_id = imported_package["package_id"]
    assert imported["replayed"] is False
    replay = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert replay.status_code == 200, replay.text
    replayed = document(replay.content)
    replayed_package = replayed["package"]
    assert isinstance(replayed_package, dict)
    assert replayed_package["package_id"] == package_id
    assert replayed["replayed"] is True
    historical = api_client.get(f"{zone_site.url}/zones?package_id={package_id}")
    assert historical.status_code == 200, historical.text
    assert str(zone["zone_id"]) in historical.text
    assert "Imported renamed lawn" in historical.text
    body["change_note"] = "Changed request body"
    conflicting = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert conflicting.status_code == 409, conflicting.text
    assert "idempotency_conflict" in conflicting.text


def test_managed_import_with_unused_mapping_does_not_activate_package(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    current = publish_draft(api_client, zone_site)
    body = submission(
        site_id=str(zone_site.tenant.site),
        request_id=str(uuid4()),
        expected_current_package_id=current["package_id"],
        change_note="Explicit mapping",
        zone_identity_map=[
            {
                "source_feature_id": "does-not-exist",
                "zone_id": str(uuid4()),
                "zone_code": "new-code",
            }
        ],
    )
    refused = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert refused.status_code == 422, refused.text
    assert "identity_conflict" in refused.text
    current_site = api_client.get(zone_site.url)
    assert current_site.status_code == 200, current_site.text
    assert document(current_site.content)["current_package_id"] == current["package_id"]


def test_missing_current_and_unsupported_content_encoding_preserve_draft(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, initial = create_draft(api_client, zone_site)
    unsupported = api_client.put(
        url,
        headers={"If-Match": etag, "Content-Encoding": "gzip", "Content-Type": "application/json"},
        content=b"{}",
    )
    assert unsupported.status_code == 422, unsupported.text
    assert "invalid_structure" in unsupported.text
    assert document(api_client.get(url).content)["revision"] == initial["revision"]
    large = api_client.put(
        url,
        headers={"If-Match": etag, "Content-Type": "application/json"},
        content=(b" " * 65_536 for _ in range(65)),
    )
    assert large.status_code == 413, large.text
    assert document(api_client.get(url).content)["revision"] == initial["revision"]


def test_explicit_null_first_package_precondition_conflicts_after_publication(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    publish_draft(api_client, zone_site)
    body = submission(
        site_id=str(zone_site.tenant.site),
        request_id=str(uuid4()),
        expected_current_package_id=None,
        zone_identity_map=[],
        change_note="",
    )
    refused = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert refused.status_code == 409, refused.text
    assert '"code":"publication_conflict"' in refused.text


def test_missing_managed_package_precondition_is_428(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    body = submission(site_id=str(zone_site.tenant.site))
    body.pop("expected_current_package_id")
    response = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert response.status_code == 428, response.text
    assert response.json()["error"]["code"] == "precondition_required"
