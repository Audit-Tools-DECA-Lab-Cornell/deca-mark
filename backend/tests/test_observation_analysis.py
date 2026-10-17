from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.observation_analysis_schemas import (
    HistoricalObservationDetail,
    ObservationPage,
    ObservationSummary,
)
from tests.observation_analysis_fixtures import AnalysisSite, read_page, seed_copies
from tests.signing import Signer
from tests.tenant_fixtures import sign_in

pytest_plugins = ("tests.observation_analysis_fixtures",)


pytestmark = pytest.mark.integration


def test_complete_cursor_pages_when_601_timestamps_tie(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given 601 matching records with identical observed timestamps.
    seed_copies(analysis_site, 600)
    filters = {
        "site_id": str(analysis_site.bound.site.tenant.site),
        "package_id": str(analysis_site.bound.package),
    }
    # When all matching pages are traversed and page size changes.
    first = read_page(api_client, analysis_site.url, **filters, limit=500)
    assert first.next_cursor is not None
    second = read_page(api_client, analysis_site.url, **filters, cursor=first.next_cursor, limit=50)
    assert second.next_cursor is not None
    third = read_page(
        api_client, analysis_site.url, **filters, cursor=second.next_cursor, limit=500
    )
    identifiers = [row.observation_id for row in (*first.items, *second.items, *third.items)]
    # Then no tied ID is lost or duplicated and every response count is exact.
    assert len(identifiers) == len(set(identifiers)) == 601
    assert identifiers == sorted(identifiers)
    assert first.total_matching == second.total_matching == third.total_matching == 601
    assert third.next_cursor is None


@pytest.mark.parametrize("suffix", ["", "/summary", "/export"])
def test_zero_scope_when_observer_has_no_records(
    api_client: TestClient, analysis_site: AnalysisSite, suffix: str
) -> None:
    # Given an authorized scope with no matches.
    # When an empty page, summary or complete bundle is requested.
    response = api_client.get(analysis_site.url + suffix, params={"observer": "nobody"})
    # Then empty success is valid on every static route.
    assert response.status_code == 200, response.text
    if not suffix:
        assert ObservationPage.model_validate_json(response.content).total_matching == 0
    elif suffix == "/summary":
        assert ObservationSummary.model_validate_json(response.content).groups == []
    else:
        assert response.headers["content-type"] == "application/zip"


def test_detail_when_capture_is_bound(api_client: TestClient, analysis_site: AnalysisSite) -> None:
    # Given a captured point in an immutable package.
    # When its historical detail is fetched.
    response = api_client.get(f"{analysis_site.url}/{analysis_site.point}")
    # Then the historical binding and recorded form survive.
    assert response.status_code == 200, response.text
    detail = HistoricalObservationDetail.model_validate_json(response.content)
    assert detail.package_id == analysis_site.bound.package
    assert detail.zone_id == analysis_site.bound.zone
    assert detail.geometry is not None
    assert detail.display_anchor is None
    assert detail.form_version == "shell-v1"


def test_cursor_mismatch_when_filter_changes(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given a cursor for the unfiltered project.
    seed_copies(analysis_site, 1)
    page = read_page(api_client, analysis_site.url, limit=1)
    assert page.next_cursor is not None
    # When an observer filter is added.
    response = api_client.get(
        analysis_site.url, params={"cursor": page.next_cursor, "observer": "QA"}
    )
    # Then the cursor cannot carry a different scope.
    assert response.status_code == 422
    assert ErrorEnvelope.model_validate_json(response.content).error.details["issues"] == [
        {"code": "invalid_cursor", "zone_ids": [], "path": "", "message": "Invalid query"}
    ]


@pytest.mark.parametrize("suffix", ["", "/summary", "/export"])
def test_foreign_scope_when_authenticated_outsider(
    api_client: TestClient, analysis_site: AnalysisSite, signer: Signer, suffix: str
) -> None:
    # Given a signed account outside this project's organization.
    sign_in(api_client, signer, uuid4())
    # When the account requests the project's historical scope.
    response = api_client.get(analysis_site.url + suffix)
    # Then no data or project identity is returned.
    assert response.status_code in {403, 404}
