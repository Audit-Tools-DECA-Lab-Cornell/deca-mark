from hashlib import sha256
from pathlib import Path
from typing import ClassVar, Literal

import pytest
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

ROOT = Path(__file__).resolve().parents[2] / "contracts/zones"


class FingerprintCase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    id: str
    document: dict[str, JsonValue]
    canonical: str
    sha256: str


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
    contract_version: Literal[1]
    synthetic: Literal[True]
    scenarios: tuple[PublicationCase, ...]


@pytest.mark.parametrize(
    "filename", ["geometry.cases.json", "publication.cases.json", "upload.cases.json"]
)
def test_ids_when_contract_sections_are_loaded(filename: str) -> None:
    # Given authored case sections, when loaded, then case identities are nonempty and unique.
    data = TypeAdapter(dict[str, JsonValue]).validate_json((ROOT / filename).read_text())
    assert data["contract_version"] == 1
    assert data["synthetic"] is True
    for value in data.values():
        if isinstance(value, list) and value and isinstance(value[0], dict) and "id" in value[0]:
            cases = TypeAdapter(list[dict[str, JsonValue]]).validate_python(value)
            ids = [TypeAdapter(str).validate_python(case["id"]) for case in cases]
            assert all(ids)
            assert len(ids) == len(set(ids))


def test_fingerprint_vectors_when_canonical_bytes_are_read() -> None:
    # Given literal canonical bytes, when their hashes are checked, then the fixture is intact.
    data = TypeAdapter(dict[str, JsonValue]).validate_json((ROOT / "upload.cases.json").read_text())
    cases = TypeAdapter(tuple[FingerprintCase, ...]).validate_python(data["fingerprints"])
    assert {case.id for case in cases} == {"v2_point", "v2_jcs_numbers_and_utf16_order"}
    for case in cases:
        assert TypeAdapter(dict[str, JsonValue]).validate_json(case.canonical) == case.document
        assert sha256(case.canonical.encode()).hexdigest() == case.sha256


def test_publication_cases_when_steps_are_read() -> None:
    # Given stateful publication scenarios, when parsed, then their geometry aliases resolve.
    suite = PublicationCases.model_validate_json((ROOT / "publication.cases.json").read_text())
    geometries = TypeAdapter(dict[str, JsonValue]).validate_json(
        (ROOT / "geometry.cases.json").read_text()
    )
    names = TypeAdapter(dict[str, JsonValue]).validate_python(geometries["geometries"])
    assert len(suite.scenarios) >= 20
    for case in suite.scenarios:
        assert case.steps
        for step in case.steps:
            assert step.expected
            assert set(step.zones) <= set(names)
