from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import uuid4

import pytest

from fieldmaps_api.observation_analysis_schemas import HistoricalObservationDetail
from fieldmaps_api.zone_observation_schemas import BoundUploadReceipt
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.test_zone_api_live import LiveApi
from tests.test_zone_form_succession import published_form, successor_body

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.bound_upload_live_fixtures",)


def test_loopback_http_historical_upload_readback_and_lost_receipt(
    live_api: LiveApi, live_bound_site: BoundSite
) -> None:
    # Given: the HTTP driver created, edited, validated and published an immutable package.
    observation = uuid4()
    url = live_bound_site.url(observation)
    payload = live_bound_site.point()
    site = live_bound_site.site
    with live_api.client() as manager:
        play = published_form(manager, site, "synthetic-live-successor")
        successor = successor_body(
            manager,
            site,
            {
                "package_id": str(live_bound_site.package),
            },
            play,
        )
        published = manager.post(f"{site.project_url}/packages", json=successor)
        assert published.status_code == 201, published.text
        retired = manager.post(f"{site.project_url}/form-versions/shell-v1/retire")
        assert retired.status_code == 200, retired.text
    with live_api.client("observer") as collector:
        # When: the original offline payload is uploaded and its lost response retried.
        response = collector.put(url, json=payload)
        replay = collector.put(url, json=payload)
        # Then: a committed bound receipt and persisted answers are observable over HTTP.
        assert response.status_code == 200, response.text
        assert replay.content == response.content, replay.text
        receipt = BoundUploadReceipt.model_validate_json(response.content)
        assert (receipt.package_id, receipt.zone_id) == (
            live_bound_site.package,
            live_bound_site.zone,
        )
        read = collector.get(url)
        assert read.status_code == 200, read.text
        stored = HistoricalObservationDetail.model_validate_json(read.content)
        assert stored.answers == payload["answers"]


def test_concurrent_loopback_retries_commit_one_observation(
    live_api: LiveApi, live_bound_site: BoundSite
) -> None:
    # Given: two signed clients carry an identical queued observation.
    observation = uuid4()
    url = live_bound_site.url(observation)
    start = Event()

    def upload() -> tuple[int, bytes]:
        with live_api.client("observer") as collector:
            assert start.wait(10)
            response = collector.put(url, json=live_bound_site.point())
            return response.status_code, response.content

    # When: both HTTP requests are dispatched together.
    with ThreadPoolExecutor(max_workers=2) as workers:
        jobs = [workers.submit(upload) for _ in range(2)]
        start.set()
        results = [job.result(timeout=30) for job in jobs]
    # Then: both callers receive the same receipt for exactly one stored row.
    assert results[0] == results[1]
    assert results[0][0] == 200
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.observations WHERE id=:'id';", f"id={observation}"
        )
        == "1"
    )
