from zipfile import ZIP_STORED

import pytest

from fieldmaps_api.domain.observation_export import BYTE_LIMIT, SOURCE_BYTE_LIMIT, bundle
from fieldmaps_api.errors import DomainError
from fieldmaps_api.observation_analysis_schemas import ExportSnapshot, ObservationExportQuery
from tests.test_observation_analysis_domain import canonical, question, snapshot


@pytest.mark.parametrize("extra", [0, 1])
def test_actual_asset_ceiling_when_boundary_is_measured(
    monkeypatch: pytest.MonkeyPatch, extra: int
) -> None:
    # Given actual asset bytes at or one byte above the frozen 32 MiB ceiling.
    def boundary_assets(
        data: ExportSnapshot, filters: ObservationExportQuery, project_id: str
    ) -> dict[str, bytes]:
        assert data.total_matching == 1
        assert filters.format == "csv"
        assert project_id == "project"
        return {"synthetic.bin": b"x" * (BYTE_LIMIT + extra)}

    monkeypatch.setattr("fieldmaps_api.domain.observation_export.assets", boundary_assets)
    data = snapshot({}, canonical([question("notes", "notes")]))
    # When the complete bundle is preflighted.
    if extra:
        with pytest.raises(DomainError) as caught:
            bundle(data, ObservationExportQuery(), "project")
        # Then the one-byte excess fails before returning any success bytes.
        assert caught.value.status == 422
    else:
        output = bundle(data, ObservationExportQuery(), "project")
        # Then an asset exactly at the inclusive ceiling succeeds.
        assert len(output) < BYTE_LIMIT


@pytest.mark.parametrize("extra", [0, 1])
def test_actual_final_zip_ceiling_when_boundary_is_measured(
    monkeypatch: pytest.MonkeyPatch, extra: int
) -> None:
    # Given an uncompressed ZIP sized exactly at or one byte over the final 32 MiB ceiling.
    name = "synthetic.bin"
    overhead = 30 + 46 + 22 + 2 * len(name)

    def boundary_assets(
        data: ExportSnapshot, filters: ObservationExportQuery, project_id: str
    ) -> dict[str, bytes]:
        assert data.total_matching == 1
        assert filters.format == "csv"
        assert project_id == "project"
        return {name: b"x" * (BYTE_LIMIT - overhead + extra)}

    monkeypatch.setattr("fieldmaps_api.domain.observation_export.assets", boundary_assets)
    monkeypatch.setattr("fieldmaps_api.domain.observation_export.ZIP_DEFLATED", ZIP_STORED)
    data = snapshot({}, canonical([question("notes", "notes")]))
    # When final ZIP bytes are measured independently of asset bytes.
    if extra:
        with pytest.raises(DomainError) as caught:
            bundle(data, ObservationExportQuery(), "project")
        # Then the one-byte final-container excess fails atomically.
        assert caught.value.status == 422
    else:
        # Then an exactly 32 MiB ZIP succeeds.
        assert len(bundle(data, ObservationExportQuery(), "project")) == BYTE_LIMIT


@pytest.mark.parametrize("extra", [0, 1])
def test_source_budget_when_snapshot_reports_exact_or_excess_bytes(extra: int) -> None:
    # Given a SQL snapshot budget at or one byte beyond the frozen 64 MiB ceiling.
    data = snapshot({}, canonical([question("notes", "notes")])).model_copy(
        update={"source_bytes": SOURCE_BYTE_LIMIT + extra}
    )
    # When the source preflight executes before serialization.
    if extra:
        with pytest.raises(DomainError) as caught:
            bundle(data, ObservationExportQuery(), "project")
        # Then the excess refuses output.
        assert caught.value.status == 422
    else:
        # Then the inclusive source boundary succeeds.
        assert bundle(data, ObservationExportQuery(), "project")
