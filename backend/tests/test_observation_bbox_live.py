import csv
from io import StringIO
from uuid import uuid4

from fieldmaps_api.observation_analysis_schemas import ObservationPage, ObservationSummary
from tests.bound_upload_fixtures import BoundSite
from tests.observation_analysis_fixtures import AnalysisSite, seed_copies
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import document

pytest_plugins = ("tests.bound_upload_live_fixtures",)


def test_signed_viewport_reads_share_scope_and_preserve_viewer_isolation(
    live_api: LiveApi, live_bound_site: BoundSite
) -> None:
    # Given two matching synthetic points and an authenticated viewer on a real HTTP server.
    point = uuid4()
    site = AnalysisSite(live_bound_site, point)
    with live_api.client("observer") as collector:
        uploaded = collector.put(live_bound_site.url(point), json=live_bound_site.point())
        assert uploaded.status_code == 200, uploaded.text
        outside = collector.put(
            live_bound_site.url(uuid4()),
            json=live_bound_site.point(coordinates=[-76.4856, 42.4483]),
        )
        assert outside.status_code == 200, outside.text
    seed_copies(site, 1)
    filters = {"bbox": "-76.4858,42.4481,-76.48565,42.44825", "observer": "QA"}
    # When the viewer pages, summarizes and exports the same viewport.
    with live_api.client("viewer") as reader:
        first = reader.get(site.url, params={**filters, "limit": 1})
        assert first.status_code == 200, first.text
        page = ObservationPage.model_validate_json(first.content)
        assert page.next_cursor is not None
        second = reader.get(site.url, params={**filters, "cursor": page.next_cursor})
        summary = reader.get(site.url + "/summary", params=filters)
        exported = reader.get(site.url + "/export", params=filters)
        empty = reader.get(site.url, params={"bbox": "0,0,1,1"})
        bad = reader.get(site.url, params={"bbox": "nan,0,1,1"})
    with live_api.client("viewer") as outsider:
        outsider.headers["Authorization"] = f"Bearer {live_api.signer.issue(uuid4())}"
        denied = outsider.get(site.url, params=filters)
    # Then all matching rows agree, invalid bounds fail, and another tenant learns nothing.
    assert second.status_code == summary.status_code == exported.status_code == 200
    final = ObservationPage.model_validate_json(second.content)
    assert page.total_matching == final.total_matching == 2
    assert len({row.observation_id for row in [*page.items, *final.items]}) == 2
    assert final.next_cursor is None
    assert ObservationSummary.model_validate_json(summary.content).total_matching == 2
    assets = files(exported.content)
    rows = list(csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig"))))
    assert len(rows) == 2
    metadata = document(assets["metadata.json"])
    assert metadata["total_matching"] == 2
    scope = metadata["filters"]
    assert isinstance(scope, dict)
    assert scope["bbox"] == filters["bbox"]
    assert ObservationPage.model_validate_json(empty.content).total_matching == 0
    assert bad.status_code == 422
    assert denied.status_code in {403, 404}
