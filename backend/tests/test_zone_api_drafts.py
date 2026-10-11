from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.signing import Signer
from tests.tenant_fixtures import sign_in
from tests.zone_api_fixtures import ZoneSite, create_draft, document, zones_body

pytestmark = pytest.mark.integration


def test_creation_replays_provisional_identity_without_adoption(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    body = {"request_id": str(uuid4()), "base_package_id": str(zone_site.package_id)}
    first = api_client.post(zone_site.drafts, json=body)
    second = api_client.post(zone_site.drafts, json=body)
    assert first.status_code == 201, first.text
    assert second.status_code == 200, second.text
    assert first.content == second.content
    assert first.headers["etag"] == second.headers["etag"]
    before = document(api_client.get(f"{zone_site.project_url}/sites/sample-garden").content)
    assert str(zone_site.package_id) in str(before["package"])
    data = document(first.content)
    assert data["revision"] == 1
    assert data["published_package_id"] is None
    assert data["forms"] is not None


@pytest.mark.parametrize("etag", [None, "*", 'W/"weak"', '"bad"', '"one","two"'])
def test_mutations_require_one_strong_draft_etag(
    api_client: TestClient, zone_site: ZoneSite, etag: str | None
) -> None:
    url, _etag, draft = create_draft(api_client, zone_site)
    headers = {"Content-Type": "application/json"}
    if etag is not None:
        headers["If-Match"] = etag
    response = api_client.put(url, headers=headers, content=zones_body(draft))
    assert response.status_code == 428, response.text
    assert document(response.content)["error"] is not None
    assert document(api_client.get(url).content)["revision"] == 1


def test_whole_draft_compare_and_swap_keeps_the_first_save(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, draft = create_draft(api_client, zone_site)
    saved = api_client.put(
        url,
        headers={"If-Match": etag, "Content-Type": "application/json"},
        content=zones_body(draft),
    )
    assert saved.status_code == 200, saved.text
    assert document(saved.content)["revision"] == 2
    stale = api_client.put(
        url,
        headers={"If-Match": etag, "Content-Type": "application/json"},
        content=zones_body(draft, label="Lost"),
    )
    assert stale.status_code == 412, stale.text
    assert document(api_client.get(url).content) == document(saved.content)
    validated = api_client.post(f"{url}/validate", headers={"If-Match": saved.headers["etag"]})
    assert validated.status_code == 200, validated.text
    assert document(api_client.get(url).content)["revision"] == 2


def test_invalid_topology_is_saved_and_reported_safely(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, draft = create_draft(api_client, zone_site)
    zones = draft["zones"]
    assert isinstance(zones, list)
    assert isinstance(zones[0], dict)
    zone = zones[0]
    zone["geometry"] = {
        "type": "Polygon",
        "coordinates": [
            [
                [-76.486, 42.448],
                [-76.485, 42.449],
                [-76.486, 42.449],
                [-76.485, 42.448],
                [-76.486, 42.448],
            ]
        ],
    }
    saved = api_client.put(
        url, headers={"If-Match": etag}, json={"zones": zones, "change_note": ""}
    )
    assert saved.status_code == 200, saved.text
    validated = api_client.post(f"{url}/validate", headers={"If-Match": saved.headers["etag"]})
    assert validated.status_code == 200, validated.text
    assert "self_intersection" in validated.text
    assert "SQL" not in validated.text
    assert "TopologyException" not in validated.text
    refused = api_client.post(
        f"{url}/publish",
        headers={"If-Match": saved.headers["etag"]},
        json={"request_id": str(uuid4()), "expected_current_package_id": str(zone_site.package_id)},
    )
    assert refused.status_code == 422, refused.text
    assert "self_intersection" in refused.text
    assert document(api_client.get(url).content)["state"] == "draft"


def test_observers_cannot_read_or_write_manager_drafts(
    api_client: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    url, _etag, _draft = create_draft(api_client, zone_site)
    sign_in(api_client, signer, zone_site.tenant.users["observer"])
    assert api_client.get(url).status_code == 403
    assert api_client.get(zone_site.drafts).status_code == 403
    assert (
        api_client.post(
            zone_site.drafts,
            json={"request_id": str(uuid4()), "base_package_id": str(zone_site.package_id)},
        ).status_code
        == 403
    )


def test_discard_is_conditional_and_repeatable_without_deleting_content(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    url, etag, draft = create_draft(api_client, zone_site)
    discarded = api_client.delete(url, headers={"If-Match": etag})
    assert discarded.status_code == 204, discarded.text
    retained = api_client.get(url)
    assert document(retained.content)["state"] == "discarded"
    assert document(retained.content)["zones"] == draft["zones"]
    replay = api_client.delete(url, headers={"If-Match": retained.headers["etag"]})
    assert replay.status_code == 204, replay.text


def test_create_request_reuse_with_changed_form_is_idempotency_conflict(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    request = str(uuid4())
    original = {"request_id": request, "base_package_id": str(zone_site.package_id)}
    created = api_client.post(zone_site.drafts, json=original)
    assert created.status_code == 201, created.text
    changed = api_client.post(
        zone_site.drafts, json={**original, "inventory_form_version": "shell-v1"}
    )
    assert changed.status_code == 409, changed.text
    assert "idempotency_conflict" in changed.text
    assert (
        api_client.get(f"{zone_site.drafts}/{document(created.content)['draft_id']}").status_code
        == 200
    )
