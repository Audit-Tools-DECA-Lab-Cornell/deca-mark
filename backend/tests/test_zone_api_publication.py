import hashlib
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient

from tests.signing import Signer
from tests.tenant_fixtures import sign_in
from tests.zone_api_fixtures import (
    ZoneSite,
    create_draft,
    document,
    publish_draft,
)

pytestmark = pytest.mark.integration


def test_archive_snapshot_and_current_site_read_match_after_publication(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    initial = api_client.get(
        f"{zone_site.project_url}/packages/{zone_site.package_id}/archive"
    )
    assert initial.status_code == 200, initial.text
    published = publish_draft(api_client, zone_site)
    package_id = str(published["package_id"])
    archive = api_client.get(f"{zone_site.project_url}/packages/{package_id}/archive")
    assert archive.status_code == 200, archive.text
    assert archive.headers["etag"].strip('"') == hashlib.sha256(archive.content).hexdigest()
    with ZipFile(BytesIO(archive.content)) as opened, ZipFile(BytesIO(initial.content)) as old:
        manifest = document(opened.read("manifest.json"))
        zones = document(opened.read("layers/zones.json"))
        assert manifest["format"] == 1
        assert set(manifest) == {
            "format",
            "site_id",
            "site_code",
            "package_id",
            "package_version",
            "forms",
            "zones",
        }
        assert manifest["package_id"] == package_id
        features = zones["features"]
        assert isinstance(features, list)
        assert features
        for name in ("ground", "paths", "trees"):
            assert opened.read(f"layers/{name}.json") == old.read(f"layers/{name}.json")

    site = api_client.get(zone_site.url)
    assert site.status_code == 200, site.text
    assert document(site.content)["current_package_id"] == package_id
    history = api_client.get(
        f"{zone_site.project_url}/packages", params={"site_id": str(zone_site.tenant.site)}
    )
    assert history.status_code == 200, history.text
    assert package_id in history.text
    historical = api_client.get(f"{zone_site.url}/zones?package_id={package_id}")
    assert historical.status_code == 200, historical.text
    assert '"MultiPolygon"' in historical.text


def test_response_loss_replays_original_publication_without_moving_current(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, _draft = create_draft(api_client, zone_site)
    body = {"request_id": str(uuid4()), "expected_current_package_id": str(zone_site.package_id)}
    first = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert first.status_code == 201, first.text
    first_result = document(first.content)
    first_package = first_result["package"]
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
    replay_result = document(replay.content)
    assert replay_result["package"] == first_package
    assert replay_result["replayed"] is True
    second_package = document(second.content)["package"]
    assert isinstance(second_package, dict)
    assert document(replay.content)["current_package_id"] == second_package["package_id"]
    assert document(api_client.get(zone_site.url).content)["current_package_id"] == second_package[
        "package_id"
    ]


def test_stale_base_keeps_unsaved_draft_and_returns_current_identity(
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


@pytest.mark.parametrize("body", [{"request_id": str(uuid4())}, {}])
def test_publication_missing_current_precondition_is_428(
    api_client: TestClient, zone_site: ZoneSite, body: dict[str, str]
) -> None:
    url, etag, _draft = create_draft(api_client, zone_site)
    result = api_client.post(f"{url}/publish", headers={"If-Match": etag}, json=body)
    assert result.status_code == 428, result.text


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
