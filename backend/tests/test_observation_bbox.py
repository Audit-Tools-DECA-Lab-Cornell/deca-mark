from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.observation_analysis_schemas import ObservationPage, ObservationSummary
from fieldmaps_api.zone_response_schemas import Publication
from tests.observation_analysis_fixtures import AnalysisSite, read_page, seed_copies
from tests.test_zone_form_succession import published_form, successor_body

pytest_plugins = ("tests.observation_analysis_fixtures",)


def test_bbox_excludes_records_outside_viewport(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given a captured point outside this viewport.
    # When the map requests its viewport.
    response = api_client.get(analysis_site.url, params={"bbox": "0,0,1,1"})
    # Then the total and rows are both empty.
    assert response.status_code == 200, response.text
    page = ObservationPage.model_validate_json(response.content)
    assert page.total_matching == 0
    assert page.items == []


@pytest.mark.parametrize("suffix", ["", "/summary", "/export"])
def test_bbox_rejects_invalid_coordinates(
    api_client: TestClient, analysis_site: AnalysisSite, suffix: str
) -> None:
    # Given a reversed longitude interval.
    # When any filtered read is requested.
    response = api_client.get(analysis_site.url + suffix, params={"bbox": "1,0,0,1"})
    # Then the query fails at the validation boundary.
    assert response.status_code == 422, response.text


def test_bbox_covers_boundary_and_keeps_inventory_separate(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given a point on the viewport boundary and a coordinate-free Inventory in its zone.
    bound = analysis_site.bound
    form = published_form(api_client, bound.site, "synthetic-inventory")
    package_body = successor_body(
        api_client, bound.site, {"package_id": str(bound.package)}, "shell-v1"
    )
    package_body["inventory_form_version"] = form
    published = api_client.post(f"{bound.site.project_url}/packages", json=package_body)
    assert published.status_code == 201, published.text
    package = Publication.model_validate_json(published.content).package.package_id
    body = bound.point(
        package_id=str(package),
        form_version=form,
        round_type="inventory",
        placement="zone",
        answers={"notes": "Synthetic inventory"},
    )
    del body["coordinates"], body["first_round"]
    uploaded = api_client.put(analysis_site.bound.url(uuid4()), json=body)
    assert uploaded.status_code == 200, uploaded.text
    # When the viewport includes the point exactly on its west/south edge.
    filters = {"bbox": "-76.4857,42.4482,-76.48,42.45"}
    page = read_page(api_client, analysis_site.url, **filters)
    summary = api_client.get(analysis_site.url + "/summary", params=filters)
    # Then point geometry determines membership; Inventory anchors do not become events.
    assert [row.observation_id for row in page.items] == [analysis_site.point]
    assert ObservationSummary.model_validate_json(summary.content).total_matching == 1


def test_bbox_cursor_is_bound_to_viewport(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given a cursor generated within a viewport containing two tied records.
    seed_copies(analysis_site, 1)
    first = read_page(api_client, analysis_site.url, bbox="-77,42,-76,43", limit=1)
    assert first.next_cursor is not None
    # When the viewport changes.
    response = api_client.get(
        analysis_site.url,
        params={"bbox": "-78,42,-76,43", "cursor": first.next_cursor},
    )
    # Then a cursor cannot be reused across viewports.
    assert response.status_code == 422, response.text
