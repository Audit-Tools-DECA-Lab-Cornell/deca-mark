import hashlib
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter

from tests.signing import Signer
from tests.tenant_fixtures import observation_payload, sign_in
from tests.test_site_packages import submission
from tests.zone_api_fixtures import (
    ZoneSite,
    create_draft,
    document,
    publish_draft,
    snapshot_history,
    zone_rows,
)

pytestmark = pytest.mark.integration


def test_archive_snapshots_and_legacy_site_selection_agree_after_adoption(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    before = snapshot_history(zone_site.tenant)
    legacy_url = f"{zone_site.project_url}/packages/{zone_site.package_id}/archive"
    legacy_bytes = api_client.get(legacy_url).content
    published = publish_draft(api_client, zone_site)
    package = str(published["package_id"])
    archive = api_client.get(f"{zone_site.project_url}/packages/{package}/archive")
    assert archive.status_code == 200, archive.text
    assert archive.headers["etag"].strip('"') == hashlib.sha256(archive.content).hexdigest()
    with ZipFile(BytesIO(archive.content)) as opened:
        manifest = document(opened.read("manifest.json"))
        zones = document(opened.read("layers/zones.json"))
        assert manifest["format"] == 2
        assert manifest["package_id"] == package
        assert manifest["forms"] is not None
        stored = TypeAdapter(list[dict[str, JsonValue]]).validate_json(zone_rows(zone_site.tenant))
        features = zones["features"]
        assert isinstance(features, list)
        assert len(features) == len(stored)
        for feature, snapshot in zip(features, stored, strict=True):
            assert isinstance(feature, dict)
            assert feature["geometry"] == snapshot["geometry"]
            props = feature["properties"]
            assert isinstance(props, dict)
            assert props["geometry_sha256"] == snapshot["digest"]
            assert props["display_anchor"] == snapshot["anchor"]
        with ZipFile(BytesIO(legacy_bytes)) as old:
            for name in ("ground", "paths", "trees"):
                assert opened.read(f"layers/{name}.json") == old.read(f"layers/{name}.json")
    assert api_client.get(legacy_url).content == legacy_bytes
    assert snapshot_history(zone_site.tenant) == before
    v1 = document(api_client.get(f"{zone_site.project_url}/sites/sample-garden").content)
    assert str(zone_site.package_id) in str(v1["package"])
    v2 = api_client.get(f"/v2/projects/{zone_site.tenant.project}/sites")
    assert v2.status_code == 200, v2.text
    assert package in v2.text
    assert '"zone_contract_version":1' in v2.text
    legacy_list = api_client.get(f"{zone_site.project_url}/packages")
    assert package not in legacy_list.text
    supported = api_client.get(
        f"{zone_site.project_url}/packages?supported_format=1&supported_format=2"
    )
    assert package in supported.text
    historical = api_client.get(f"{zone_site.url}/zones?package_id={package}")
    assert historical.status_code == 200, historical.text
    assert '"MultiPolygon"' in historical.text


def test_response_loss_replays_original_result_after_another_publication(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, _draft = create_draft(api_client, zone_site)
    body = {"request_id": str(uuid4()), "expected_current_package_id": str(zone_site.package_id)}
    first = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert first.status_code == 201, first.text
    first_package = document(first.content)["package"]
    assert isinstance(first_package, dict)
    next_create = api_client.post(
        zone_site.drafts,
        json={"request_id": str(uuid4()), "base_package_id": first_package["package_id"]},
    )
    assert next_create.status_code == 201, next_create.text
    next_draft = document(next_create.content)
    next_url = f"{zone_site.drafts}/{next_draft['draft_id']}/publish"
    second = api_client.post(
        next_url,
        headers={"If-Match": next_create.headers["etag"]},
        json={
            "request_id": str(uuid4()),
            "expected_current_package_id": first_package["package_id"],
        },
    )
    assert second.status_code == 201, second.text
    replay = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert replay.status_code == 200, replay.text
    assert replay.content == first.content
    second_package = document(second.content)["package"]
    assert isinstance(second_package, dict)
    assert (
        str(second_package["package_id"])
        in api_client.get(f"/v2/projects/{zone_site.tenant.project}/sites").text
    )
    conflict = api_client.post(
        f"{url}/publish", headers={"If-Match": etag.replace(':1"', ':2"')}, json=body
    )
    assert conflict.status_code == 409, conflict.text
    assert "idempotency_conflict" in conflict.text


def test_stale_base_keeps_unsaved_draft_and_returns_authorized_current_identity(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, original = create_draft(api_client, zone_site)
    current = publish_draft(api_client, zone_site)
    stale = api_client.post(
        f"{url}/publish",
        headers={"If-Match": etag},
        json={"request_id": str(uuid4()), "expected_current_package_id": str(zone_site.package_id)},
    )
    assert stale.status_code == 409, stale.text
    assert "publication_conflict" in stale.text
    assert str(current["package_id"]) in stale.text
    retained = document(api_client.get(url).content)
    assert retained["zones"] == original["zones"]
    assert retained["state"] == "draft"


def test_managed_site_rejects_legacy_import_without_replacing_current(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    published = publish_draft(api_client, zone_site)
    refused = api_client.post(f"{zone_site.project_url}/packages", json=submission())
    assert refused.status_code == 428, refused.text
    assert "precondition_required" in refused.text
    assert (
        str(published["package_id"])
        in api_client.get(f"/v2/projects/{zone_site.tenant.project}/sites").text
    )


def test_never_uploaded_legacy_observation_remains_valid_after_adoption(
    api_client: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    publish_draft(api_client, zone_site)
    sign_in(api_client, signer, zone_site.tenant.users["observer"])
    url = f"{zone_site.project_url}/observations/{uuid4()}"
    body = observation_payload()
    first = api_client.put(url, json=body)
    assert first.status_code == 200, first.text
    assert api_client.put(url, json=body).content == first.content
    historical = api_client.get(url)
    assert historical.status_code == 200
    assert '"people":3' in historical.text


@pytest.mark.parametrize("body", [{"request_id": str(uuid4())}, {}])
def test_publication_missing_current_precondition_is_428(
    api_client: TestClient, zone_site: ZoneSite, body: dict[str, str]
) -> None:
    url, etag, _draft = create_draft(api_client, zone_site)
    result = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert result.status_code == 428, result.text


def test_legacy_lost_response_replays_same_receipt_after_adoption(
    api_client: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    sign_in(api_client, signer, zone_site.tenant.users["observer"])
    url = f"{zone_site.project_url}/observations/{uuid4()}"
    payload = observation_payload()
    first = api_client.put(url, json=payload)
    assert first.status_code == 200, first.text
    sign_in(api_client, signer, zone_site.tenant.users["manager"])
    publish_draft(api_client, zone_site)
    sign_in(api_client, signer, zone_site.tenant.users["observer"])
    replay = api_client.put(url, json=payload)
    assert replay.status_code == 200, replay.text
    assert replay.content == first.content


def test_publication_replay_rechecks_current_manager_authorization(
    api_client: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    url, etag, _draft = create_draft(api_client, zone_site)
    body = {"request_id": str(uuid4()), "expected_current_package_id": str(zone_site.package_id)}
    published = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert published.status_code == 201, published.text
    sign_in(api_client, signer, zone_site.tenant.users["observer"])
    replay = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert replay.status_code == 403, replay.text
