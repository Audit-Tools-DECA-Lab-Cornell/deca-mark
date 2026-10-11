import csv
from copy import deepcopy
from io import StringIO
from uuid import uuid4

import pytest
from tests.conftest import signer
from tests.test_zone_api_live import live_api
from tests.bound_upload_live_fixtures import live_bound_site
from tests.test_site_packages import submission
from tests.test_observation_analysis_exports import files
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration


def test_raw_polygon_roundtrip_over_signed_http(live_api):
    project = f"/v1/projects/{live_api.tenant.project}"
    drafts = f"{project}/sites/{live_api.tenant.site}/zone-drafts"
    with live_api.client() as client:
        package = client.post(f"{project}/packages", json=submission())
        assert package.status_code == 201, package.text
        created = client.post(
            drafts,
            json={
                "request_id": str(uuid4()),
                "base_package_id": document(package.content)["package_id"],
            },
        )
        assert created.status_code == 201, created.text
        draft = document(created.content)
        url = f"{drafts}/{draft['draft_id']}"
        # Deliberately closed ring, rotated starting vertex, and duplicate adjacent position.
        raw = {
            "type": "Polygon",
            "coordinates": [
                [
                    [-76.4854, 42.4484],
                    [-76.4857, 42.4484],
                    [-76.4857, 42.4484],
                    [-76.4857, 42.4481],
                    [-76.4854, 42.4481],
                    [-76.4854, 42.4484],
                ]
            ],
        }
        zones = deepcopy(draft["zones"])
        zones[0]["geometry"] = deepcopy(raw)
        saved = client.put(
            url,
            headers={"If-Match": created.headers["etag"]},
            json={"zones": zones, "change_note": "Synthetic raw draft round trip"},
        )
        assert saved.status_code == 200, saved.text
        assert document(saved.content)["zones"][0]["geometry"] == raw
        fetched = client.get(url)
        assert fetched.status_code == 200, fetched.text
        received = document(fetched.content)
        assert received["zones"][0]["geometry"] == raw
        replay = client.put(
            url,
            headers={"If-Match": fetched.headers["etag"]},
            json={
                "zones": received["zones"],
                "change_note": "Unchanged raw geometry from GET",
            },
        )
        assert replay.status_code == 200, replay.text
        assert document(replay.content)["zones"][0]["geometry"] == raw
        fetched_again = client.get(url)
        assert fetched_again.status_code == 200, fetched_again.text
        assert document(fetched_again.content)["zones"][0]["geometry"] == raw


def test_late_old_package_upload_read_export_after_successor(live_api, live_bound_site):
    bound = live_bound_site
    site = bound.site
    drafts = site.url + "/zone-drafts"
    with live_api.client() as manager:
        old_history = manager.get(
            site.url + "/zones", params={"package_id": str(bound.package)}
        )
        assert old_history.status_code == 200, old_history.text
        old_zone = document(old_history.content)["zones"][0]
        created = manager.post(
            drafts,
            json={"request_id": str(uuid4()), "base_package_id": str(bound.package)},
        )
        assert created.status_code == 201, created.text
        draft = document(created.content)
        url = f"{drafts}/{draft['draft_id']}"
        draft["zones"][0]["zone_label"] = "Synthetic successor label"
        changed = manager.put(
            url,
            headers={"If-Match": created.headers["etag"]},
            json={
                "zones": draft["zones"],
                "change_note": "Successor before offline delivery",
            },
        )
        assert changed.status_code == 200, changed.text
        published = manager.post(
            url + "/publish",
            headers={"If-Match": changed.headers["etag"]},
            json={
                "request_id": str(uuid4()),
                "expected_current_package_id": str(bound.package),
            },
        )
        assert published.status_code == 201, published.text
        assert document(published.content)["package"]["package_id"] != str(
            bound.package
        )
    observation = uuid4()
    with live_api.client("observer") as collector:
        uploaded = collector.put(bound.url(observation), json=bound.point())
        assert uploaded.status_code == 200, uploaded.text
    with live_api.client("viewer") as reader:
        detail = reader.get(bound.url(observation))
        assert detail.status_code == 200, detail.text
        recorded = document(detail.content)
        assert recorded["package_id"] == str(bound.package)
        assert recorded["zone_label"] == old_zone["zone_label"]
        exported = reader.get(
            f"/v2/projects/{site.tenant.project}/observations/export",
            params={"package_id": str(bound.package)},
        )
        assert exported.status_code == 200, exported.text
        assets = files(exported.content)
        rows = list(
            csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig")))
        )
        assert len(rows) == 1
        assert rows[0]["package_id"] == str(bound.package)
        assert rows[0]["zone_label_at_capture"] == old_zone["zone_label"]
        historical = document(assets["historical-zones.geojson"])["features"]
        assert len(historical) == 1
        assert historical[0]["geometry"] == old_zone["geometry"]
