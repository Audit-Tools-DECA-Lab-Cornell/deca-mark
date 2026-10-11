from pathlib import Path
from typing import ClassVar, Literal

import pytest
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.zone_geometry_schemas import ZoneGeometry

CONTRACT = Path(__file__).resolve().parents[2] / "contracts/zones/geometry.cases.json"


class StructureCase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    id: str
    geometry: str
    draft_valid: bool
    publish_issue: str | None


class CoverageCase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    id: str
    zones: tuple[str, ...]
    point: tuple[float, float]
    covering: tuple[str, ...]
    selected: str
    accepted: bool


class GeometryCases(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    contract_version: Literal[1]
    synthetic: Literal[True]
    geometries: dict[str, JsonValue]
    structure_cases: tuple[StructureCase, ...]
    coverage_cases: tuple[CoverageCase, ...]
    relation_cases: tuple[dict[str, JsonValue], ...]
    containment_cases: tuple[dict[str, JsonValue], ...]
    normalization_cases: tuple[dict[str, JsonValue], ...]
    limit_cases: tuple[dict[str, JsonValue], ...]


SUITE = GeometryCases.model_validate_json(CONTRACT.read_text())


@pytest.mark.parametrize(
    "case", SUITE.structure_cases, ids=[case.id for case in SUITE.structure_cases]
)
def test_geometry_structure_when_shared_case_is_parsed(case: StructureCase) -> None:
    # Given the authored geometry, when parsed as a draft input, then structure matches.
    geometry = SUITE.geometries[case.geometry]
    parser = TypeAdapter[ZoneGeometry](ZoneGeometry)
    if case.draft_valid:
        assert parser.validate_python(geometry).model_dump(mode="json") == geometry
    else:
        with pytest.raises(ValidationError):
            parser.validate_python(geometry)


def test_coverage_references_when_shared_cases_are_loaded() -> None:
    # Given future client/SQL expectations, when references resolve, then no fixture is missing.
    names = set(SUITE.geometries)
    assert {case.geometry for case in SUITE.structure_cases} == names
    assert len({case.id for case in SUITE.coverage_cases}) == len(SUITE.coverage_cases)
    for case in SUITE.coverage_cases:
        assert set(case.zones) <= names
        assert set(case.covering) <= set(case.zones)
        assert case.selected in case.zones
        assert case.accepted == (case.selected in case.covering)


@pytest.mark.parametrize("coordinate", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_position_when_zone_is_parsed(coordinate: float) -> None:
    # Given a non-finite ordinate, when parsed, then the input cannot be a draft geometry.
    with pytest.raises(ValidationError):
        TypeAdapter[ZoneGeometry](ZoneGeometry).validate_python(
            {"type": "Polygon", "coordinates": [[[coordinate, 0], [1, 0], [1, 1], [coordinate, 0]]]}
        )
