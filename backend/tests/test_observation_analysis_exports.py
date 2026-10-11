import csv
from io import BytesIO, StringIO
from time import monotonic
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.errors import ErrorEnvelope
from tests.observation_analysis_fixtures import AnalysisSite, seed_copies
from tests.zone_api_fixtures import document

pytest_plugins = ("tests.observation_analysis_fixtures",)


def files(content: bytes) -> dict[str, bytes]:

    with ZipFile(BytesIO(content)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


@pytest.mark.parametrize("format_name", ["csv", "geojson"])
def test_complete_bundle_when_matching_rows_exceed_500(
    api_client: TestClient, analysis_site: AnalysisSite, format_name: str
) -> None:
    # Given 601 bound records in one historical zone.
    seed_copies(analysis_site, 600)
    # When the complete export is requested.
    started = monotonic()
    response = api_client.get(
        analysis_site.url + "/export",
        params={"format": format_name, "package_id": str(analysis_site.bound.package)},
    )
    elapsed = monotonic() - started
    # Then all records and self-contained scope/codebook/form/polygon assets are included.
    assert response.status_code == 200, response.text
    assets = files(response.content)
    metadata = document(assets["metadata.json"])
    assert metadata["total_matching"] == 601
    assert set(assets) == {
        f"observations.{format_name}",
        "codebook.csv",
        "metadata.json",
        "forms.json",
        "historical-zones.geojson",
    }
    if format_name == "csv":
        rows = list(csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig"))))
        assert len(rows) == 601
        assert rows[0]["longitude"].startswith("-76.")
    else:
        events = document(assets["observations.geojson"])["features"]
        assert isinstance(events, list)
        assert len(events) == 601
    zones = document(assets["historical-zones.geojson"])["features"]
    assert isinstance(zones, list)
    assert len(zones) == 1
    print(  # noqa: T201 - acceptance measurement captured by the rehearsal log.
        f"BE20 measurement format={format_name} rows=601 seconds={elapsed:.3f} "
        f"zip_bytes={len(response.content)} asset_bytes={sum(map(len, assets.values()))}"
    )


def test_row_ceiling_when_scope_has_10001_records(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given 10,001 matching bound records.
    seed_copies(analysis_site, 10_000)
    # When the scope exceeds the frozen row limit.
    response = api_client.get(
        analysis_site.url + "/export", params={"package_id": str(analysis_site.bound.package)}
    )
    # Then the response fails before any partial ZIP succeeds.
    assert response.status_code == 422, response.text
    error = ErrorEnvelope.model_validate_json(response.content)
    issues = error.error.details["issues"]
    assert isinstance(issues, list)
    assert isinstance(issues[0], dict)
    assert issues[0]["code"] == "export_scope_too_large"


def test_boundary_export_when_scope_has_10000_records(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given exactly 10,000 ordinary bound records, with deduplicated forms and polygons.
    seed_copies(analysis_site, 9_999)
    # When the largest row scope is exported.
    started = monotonic()
    response = api_client.get(
        analysis_site.url + "/export", params={"package_id": str(analysis_site.bound.package)}
    )
    elapsed = monotonic() - started
    # Then the ordinary limit is usable and its measured bytes remain bounded.
    assert response.status_code == 200, response.text
    assets = files(response.content)
    rows = list(csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig"))))
    assert len(rows) == 10_000
    assert sum(map(len, assets.values())) <= 32 * 1024 * 1024
    assert elapsed < 10
    print(  # noqa: T201 - acceptance measurement captured by the rehearsal log.
        f"BE20 measurement format=csv rows=10000 seconds={elapsed:.3f} "
        f"zip_bytes={len(response.content)} asset_bytes={sum(map(len, assets.values()))}"
    )


@pytest.mark.parametrize("extra", [{"limit": "10"}, {"cursor": "abc"}])
def test_export_rejects_page_controls_when_scope_requested(
    api_client: TestClient, analysis_site: AnalysisSite, extra: dict[str, str]
) -> None:
    # Given pagination controls inappropriate for a complete export.
    # When they are included in its query.
    response = api_client.get(analysis_site.url + "/export", params=extra)
    # Then it refuses a potentially misleading scope.
    assert response.status_code == 422
