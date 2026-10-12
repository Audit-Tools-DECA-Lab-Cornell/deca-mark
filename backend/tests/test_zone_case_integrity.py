from typing import ClassVar, Literal

import pytest
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

from tests.zone_case_models import ROOT, upload_cases


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


def publication_cases() -> dict[str, dict[str, JsonValue]]:
    data = TypeAdapter(dict[str, JsonValue]).validate_json(
        (ROOT / "publication.cases.json").read_text()
    )
    cases = TypeAdapter(tuple[dict[str, JsonValue], ...]).validate_python(data["scenarios"])
    return {TypeAdapter(str).validate_python(case["id"]): case for case in cases}


def first_step(case: dict[str, JsonValue]) -> dict[str, JsonValue]:
    steps = TypeAdapter(tuple[dict[str, JsonValue], ...]).validate_python(case["steps"])
    assert steps
    return steps[0]


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


def test_upload_cases_contain_one_contract_without_old_envelopes() -> None:
    suite = upload_cases()
    assert suite.envelopes
    assert {case.id for case in suite.fingerprints} == {"point", "jcs_numbers_and_utf16_order"}
    for case in suite.envelopes:
        assert "schema_version" not in case.payload
    for case in suite.fingerprints:
        assert TypeAdapter(dict[str, JsonValue]).validate_json(case.canonical) == case.document
        assert case.document["canonicalization_version"] == "observation-jcs-1"


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


def test_first_upload_cases_require_complete_explicit_identity_and_start_at_one() -> None:
    cases = publication_cases()
    complete = first_step(cases["first_upload_explicit_identities"])
    expected = TypeAdapter(dict[str, JsonValue]).validate_python(complete["expected"])
    mappings = TypeAdapter(tuple[dict[str, JsonValue], ...]).validate_python(
        complete["zone_identity_map"]
    )
    assert complete["action"] == "upload"
    assert "expected_current" in complete
    assert complete["expected_current"] is None
    assert expected["status"] == 201
    assert expected["package_version"] == 1
    assert expected["state"] == "ready"
    assert expected["current"] == expected["package"]
    assert expected["zone_count"] == len(mappings) == 2
    for field in ("source_feature_id", "zone_id", "zone_code"):
        values = {TypeAdapter(str).validate_python(mapping[field]) for mapping in mappings}
        assert len(values) == 2
    incomplete = first_step(cases["first_upload_missing_identity"])
    rejected = TypeAdapter(dict[str, JsonValue]).validate_python(incomplete["expected"])
    assert rejected["status"] == 422
    assert rejected["issue"] == "identity_conflict"
    assert rejected["current"] is None
    assert rejected["new_versions"] == 0


def test_replay_returns_prior_success_and_live_current_without_new_version() -> None:
    case = publication_cases()["prior_success_replay_after_newer_publish"]
    given = TypeAdapter(dict[str, JsonValue]).validate_python(case["given"])
    expected = TypeAdapter(dict[str, JsonValue]).validate_python(first_step(case)["expected"])
    assert expected["status"] == 200
    assert expected["replayed"] is True
    assert expected["package"] == given["completed_result"]
    assert expected["current_package_id"] == given["current"]
    assert expected["package"] != expected["current_package_id"]
    assert expected["new_versions"] == 0


@pytest.mark.parametrize(
    "change", ["added", "removed", "geometry_changed", "label_changed", "unchanged"]
)
def test_validation_change_case_has_digest_and_recorded_identity(change: str) -> None:
    case = publication_cases()[f"validation_change_{change}"]
    given = TypeAdapter(dict[str, JsonValue]).validate_python(case["given"])
    expected = TypeAdapter(dict[str, JsonValue]).validate_python(first_step(case)["expected"])
    assert expected["status"] == 200
    assert expected["change"] == change
    assert expected["zone_id"] == given["zone_id"]
    assert expected["revision"] == given["revision"]
    assert expected["geometry_sha256_present"] is True
    if change == "added":
        assert given["current_geometry"] is None
        assert given["draft_geometry"] is not None
    elif change == "removed":
        assert given["current_geometry"] is not None
        assert given["draft_geometry"] is None
    elif change == "geometry_changed":
        assert given["current_geometry"] != given["draft_geometry"]
    elif change == "label_changed":
        assert given["current_geometry"] == given["draft_geometry"]
        assert given["current_label"] != given["draft_label"]
    else:
        assert given["current_geometry"] == given["draft_geometry"]
        assert given["current_label"] == given["draft_label"]
