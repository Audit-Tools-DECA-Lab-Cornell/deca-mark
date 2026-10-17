from typing import ClassVar, Literal

import pytest
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

from tests.zone_case_models import ROOT


class Step(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    action: str
    expected: dict[str, JsonValue]
    zones: tuple[str, ...] = ()


class PublicationCase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    id: str
    given: dict[str, JsonValue]
    steps: tuple[Step, ...]


class PublicationCases(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    synthetic: Literal[True]
    scenarios: tuple[PublicationCase, ...]


@pytest.mark.parametrize(
    "filename", ["geometry.cases.json", "publication.cases.json", "upload.cases.json"]
)
def test_ids_when_contract_sections_are_loaded(filename: str) -> None:
    data = TypeAdapter(dict[str, JsonValue]).validate_json((ROOT / filename).read_text())
    assert "contract_version" not in data
    assert data["synthetic"] is True
    for value in data.values():
        if isinstance(value, list) and value and isinstance(value[0], dict) and "id" in value[0]:
            cases = TypeAdapter(list[dict[str, JsonValue]]).validate_python(value)
            ids = [TypeAdapter(str).validate_python(case["id"]) for case in cases]
            assert all(ids)
            assert len(ids) == len(set(ids))


def test_publication_cases_when_steps_are_read() -> None:
    suite = PublicationCases.model_validate_json((ROOT / "publication.cases.json").read_text())
    geometries = TypeAdapter(dict[str, JsonValue]).validate_json(
        (ROOT / "geometry.cases.json").read_text()
    )
    names = TypeAdapter(dict[str, JsonValue]).validate_python(geometries["geometries"])
    assert suite.scenarios
    for case in suite.scenarios:
        assert case.steps
        for step in case.steps:
            assert step.expected
            assert set(step.zones) <= set(names)
