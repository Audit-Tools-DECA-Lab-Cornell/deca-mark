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
    before = document(api_client.get(zone_site.url).content)
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
    historical = api_client.get(f"{zone_site.url}/zones?package_id={zone_site.package_id}")
    assert historical.status_code == 200, historical.text
    base_zones = document(historical.content)["zones"]
    assert isinstance(base_zones, list)
    base_zone = base_zones[0]
    assert isinstance(base_zone, dict)
    draft_zones = draft["zones"]
    assert isinstance(draft_zones, list)
    draft_zone = draft_zones[0]
    assert isinstance(draft_zone, dict)
    assert draft_zone["zone_id"] == base_zone["zone_id"]
    first_save = [{**draft_zone, "zone_label": base_zone["zone_label"]}]
    saved = api_client.put(
        url,
        headers={"If-Match": etag},
        json={
            "zones": first_save,
            "change_note": "Preserve current package zone",
        },
    )
    assert saved.status_code == 200, saved.text
    assert document(saved.content)["revision"] == 2
    stale = api_client.put(
        url,
        headers={"If-Match": etag},
        json={
            "zones": [{**draft_zone, "zone_label": "Lost"}],
            "change_note": "Stale replacement",
        },
    )
    assert stale.status_code == 412, stale.text
    assert document(api_client.get(url).content) == document(saved.content)
    validated = api_client.post(f"{url}/validate", headers={"If-Match": saved.headers["etag"]})
    assert validated.status_code == 200, validated.text
    summaries = document(validated.content)["zones"]
    assert isinstance(summaries, list)
    assert len(summaries) == 1
    unchanged = summaries[0]
    assert isinstance(unchanged, dict)
    assert unchanged["change"] == "unchanged"
    assert isinstance(unchanged["geometry_sha256"], str)
    assert document(api_client.get(url).content)["revision"] == 2

    replacement_zone = dict(draft_zone)
    replacement_zone["zone_id"] = str(uuid4())
    replacement_zone["zone_code"] = f"added-{uuid4().hex[:8]}"
    replacement_zone["zone_label"] = "Replacement zone"
    changed = api_client.put(
        url,
        headers={"If-Match": saved.headers["etag"]},
        json={"zones": [replacement_zone], "change_note": "Replace zone identity"},
    )
    assert changed.status_code == 200, changed.text
    validated = api_client.post(f"{url}/validate", headers={"If-Match": changed.headers["etag"]})
    assert validated.status_code == 200, validated.text
    summaries = document(validated.content)["zones"]
    assert isinstance(summaries, list)
    changes = {summary["change"]: summary for summary in summaries if isinstance(summary, dict)}
    assert set(changes) == {"added", "removed"}
    assert all(isinstance(summary["geometry_sha256"], str) for summary in changes.values())


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
    summaries = document(validated.content)["zones"]
    assert isinstance(summaries, list)
    assert len(summaries) == 1
    invalid_summary = summaries[0]
    assert isinstance(invalid_summary, dict)
    assert invalid_summary["geometry_sha256"] is None
    assert invalid_summary["change"] is None
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
        zone_site.drafts, json={**original, "base_package_id": str(uuid4())}
    )
    assert changed.status_code == 409, changed.text
    assert "idempotency_conflict" in changed.text
    assert (
        api_client.get(f"{zone_site.drafts}/{document(created.content)['draft_id']}").status_code
        == 200
    )
