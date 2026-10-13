from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue

from tests.local_database import admin_sql
from tests.package_fixtures import submission
from tests.zone_api_fixtures import JSON_DOCUMENT, ZoneSite, document, publish_draft

pytestmark = pytest.mark.integration


def import_body(current: dict[str, JsonValue], site_id: str) -> dict[str, JsonValue]:
    body = JSON_DOCUMENT.validate_python(
        submission(
            site_id=site_id,
            request_id=str(uuid4()),
            expected_current_package_id=current["package_id"],
            change_note="Exact source identity regression",
            zone_identity_map=[
                {
                    "source_feature_id": "123",
                    "zone_id": str(uuid4()),
                    "zone_code": "exact-source",
                }
            ],
        )
    )
    properties(body)["id"] = "123"
    properties(body)["name"] = "Exact source identity"
    return body


def features(body: dict[str, JsonValue]) -> list[JsonValue]:
    layers = body["layers"]
    assert isinstance(layers, dict)
    zones = layers["zones"]
    assert isinstance(zones, dict)
    result = zones["features"]
    assert isinstance(result, list)
    return result


def properties(body: dict[str, JsonValue]) -> dict[str, JsonValue]:
    feature = features(body)[0]
    assert isinstance(feature, dict)
    result = feature["properties"]
    assert isinstance(result, dict)
    return result


def mappings(body: dict[str, JsonValue]) -> list[JsonValue]:
    result = body["zone_identity_map"]
    assert isinstance(result, list)
    return result


def snapshot(site: ZoneSite) -> str:
    return admin_sql(
        "SELECT jsonb_build_object("
        "'packages',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM fieldmaps.site_packages p "
        "WHERE project_id=:'project'),"
        "'state',(SELECT jsonb_agg(to_jsonb(s) ORDER BY site_id) FROM fieldmaps.site_zone_state s "
        "WHERE project_id=:'project'),"
        "'identities',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM fieldmaps.zone_identities i "
        "WHERE project_id=:'project'),"
        "'zones',(SELECT jsonb_agg(to_jsonb(z) ORDER BY package_id,zone_id) "
        "FROM fieldmaps.package_zones z WHERE project_id=:'project'),"
        "'publications',(SELECT jsonb_agg(to_jsonb(e) ORDER BY request_id) "
        "FROM fieldmaps.zone_publications e WHERE project_id=:'project'));",
        *site.tenant.variables(),
    )


INVALID_IDS: tuple[JsonValue, ...] = (None, 123, True, {}, [], "", "x" * 201)


@pytest.mark.parametrize("invalid_id", INVALID_IDS)
@pytest.mark.parametrize("target", ["feature", "mapping"])
def test_managed_import_requires_string_id_without_activation(
    api_client: TestClient, zone_site: ZoneSite, invalid_id: JsonValue, target: str
) -> None:
    current = publish_draft(api_client, zone_site)
    body = import_body(current, str(zone_site.tenant.site))
    if target == "feature":
        properties(body)["id"] = invalid_id
    else:
        mapping = mappings(body)[0]
        assert isinstance(mapping, dict)
        mapping["source_feature_id"] = invalid_id
    before = snapshot(zone_site)
    response = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert response.status_code == 422, response.text
    if target == "feature":
        assert "identity_conflict" in response.text
    assert snapshot(zone_site) == before


@pytest.mark.parametrize("target", ["feature", "mapping"])
def test_managed_import_requires_present_identity_without_activation(
    api_client: TestClient, zone_site: ZoneSite, target: str
) -> None:
    current = publish_draft(api_client, zone_site)
    body = import_body(current, str(zone_site.tenant.site))
    if target == "feature":
        del properties(body)["id"]
    else:
        mapping = mappings(body)[0]
        assert isinstance(mapping, dict)
        del mapping["source_feature_id"]
    before = snapshot(zone_site)
    response = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert response.status_code == 422, response.text
    assert snapshot(zone_site) == before


@pytest.mark.parametrize("target", ["feature", "mapping"])
def test_managed_import_rejects_duplicate_identities_without_activation(
    api_client: TestClient, zone_site: ZoneSite, target: str
) -> None:
    current = publish_draft(api_client, zone_site)
    body = import_body(current, str(zone_site.tenant.site))
    other_feature = deepcopy(features(body)[0])
    other_mapping = deepcopy(mappings(body)[0])
    assert isinstance(other_feature, dict)
    other_properties = other_feature["properties"]
    assert isinstance(other_properties, dict)
    assert isinstance(other_mapping, dict)
    if target == "feature":
        other_mapping["source_feature_id"] = "other"
    else:
        other_properties["id"] = "other"
    other_mapping["zone_id"] = str(uuid4())
    other_mapping["zone_code"] = "other-source"
    features(body).append(other_feature)
    mappings(body).append(other_mapping)
    before = snapshot(zone_site)
    response = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert response.status_code == 422, response.text
    assert "identity_conflict" in response.text
    assert snapshot(zone_site) == before


def test_managed_import_rejects_unmatched_string_identity_without_activation(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    current = publish_draft(api_client, zone_site)
    body = import_body(current, str(zone_site.tenant.site))
    properties(body)["id"] = "0123"
    before = snapshot(zone_site)
    response = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert response.status_code == 422, response.text
    assert "identity_conflict" in response.text
    assert snapshot(zone_site) == before


@pytest.mark.parametrize("source_id", ["123", "x" * 200])
def test_managed_import_accepts_exact_string_identity_and_replays(
    api_client: TestClient, zone_site: ZoneSite, source_id: str
) -> None:
    current = publish_draft(api_client, zone_site)
    body = import_body(current, str(zone_site.tenant.site))
    properties(body)["id"] = source_id
    mapping = mappings(body)[0]
    assert isinstance(mapping, dict)
    mapping["source_feature_id"] = source_id
    response = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert response.status_code == 201, response.text
    published = document(response.content)
    package = published["package"]
    assert isinstance(package, dict)
    assert published["replayed"] is False
    after = snapshot(zone_site)
    replay = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert replay.status_code == 200, replay.text
    replayed = document(replay.content)
    replay_package = replayed["package"]
    assert isinstance(replay_package, dict)
    assert replay_package["package_id"] == package["package_id"]
    assert replayed["replayed"] is True
    assert snapshot(zone_site) == after
