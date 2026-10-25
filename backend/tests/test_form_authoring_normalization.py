"""Draft writes establish explicit ID provenance without changing historical instruments."""

from copy import deepcopy
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.domain.observation_export_plan import answer_cells, plan
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.form_schema_preflight import PreflightRow, preflight
from fieldmaps_api.services.forms import checked_definition
from tests.test_observation_analysis_domain import canonical, question, snapshot


def historical_definition() -> dict[str, JsonValue]:
    branch: dict[str, JsonValue] = {
        **question("branch", "Legacy_Parent"),
        "kind": "one",
        "options": [{"code": "a", "label": "A"}, {"code": "b", "label": "B"}],
    }
    detail: dict[str, JsonValue] = {
        **question("detail", "Legacy_Detail"),
        "kind": "one",
        "dynamicFrom": {
            "question": "branch",
            "sets": {
                "a": {
                    "code": "OldA",
                    "label": "A detail",
                    "exportColumn": "Old_A",
                    "options": [{"code": "x", "label": "X"}],
                },
                "b": {
                    "code": "OldB",
                    "label": "B detail",
                    "exportColumn": "Old_B",
                    "options": [{"code": "y", "label": "Y"}],
                },
            },
        },
    }
    observer: dict[str, JsonValue] = {
        **question("observer", "Old_Observer"),
        "valueSource": "observerCode",
    }
    return canonical([branch, detail, observer])


def test_draft_write_normalizes_historical_and_all_dynamic_columns() -> None:
    # Given a historical instrument with independently named dynamic export groups.
    original = historical_definition()
    before = deepcopy(original)
    # When the production service write boundary prepares a new draft.
    draft = checked_definition(original, "copy-v2", "draft")
    parsed = FormDefinition.model_validate(draft)
    # Then every ordinary/dynamic column uses its question ID and the source stays exact.
    assert draft["columnNaming"] == "questionId"
    assert all(item.export_column == item.id for item in parsed.questions)
    dynamic = parsed.questions[1].dynamic_from
    assert dynamic is not None
    assert {item.export_column for item in dynamic.sets.values()} == {"detail"}
    assert original == before


def test_publication_check_keeps_existing_historical_json_exact() -> None:
    # Given a historical published form with no provenance marker.
    original = historical_definition()
    # When publication eligibility is checked, then no draft normalization can rewrite it.
    checked = checked_definition(original, str(original["version"]), "published")
    assert checked == original
    assert "columnNaming" not in checked


def test_authored_observer_column_remains_independent_from_envelope() -> None:
    # Given an automatically normalized draft whose observer matches the envelope.
    draft = checked_definition(historical_definition(), "test-v1", "draft")
    source = snapshot({"observer": "QA"}, draft)
    # When exporting, then explicit ID provenance retains the answer's separate column.
    planned = plan(source.items, source.forms, source.form_schema_versions)
    assert answer_cells(planned, source.items[0]) == {"answer_observer": "QA"}


@pytest.mark.parametrize("marker", [None, "unknown", True])
def test_draft_normalization_does_not_hide_invalid_marker_types(marker: JsonValue) -> None:
    # Given an invalid authored marker, when normalizing, then the schema still refuses it.
    definition = historical_definition() | {"columnNaming": marker}
    with pytest.raises(ValidationFailedError):
        checked_definition(definition, "copy-v2", "draft")


def test_draft_normalization_does_not_hide_malformed_export_column() -> None:
    # Given a malformed column value, when normalized, then the schema still refuses it.
    definition = historical_definition()
    questions = definition["questions"]
    assert isinstance(questions, list)
    assert isinstance(questions[0], dict)
    questions[0]["exportColumn"] = 7
    with pytest.raises(ValidationFailedError):
        checked_definition(definition, "copy-v2", "draft")


@pytest.mark.parametrize("name", ["janet-test-v1", "janet-inventory-v1"])
def test_template_drafts_preserve_manual_observer_role(name: str) -> None:
    path = Path(__file__).resolve().parents[2] / "contracts/forms" / f"{name}.json"
    original = TypeAdapter(dict[str, JsonValue]).validate_json(path.read_bytes())
    before = deepcopy(original)
    draft = checked_definition(original, "copy-v2", "draft")
    parsed = FormDefinition.model_validate(draft)
    observer = next(item for item in parsed.questions if item.id == "observer_initials")
    assert observer.model_dump().get("role") == "observer"
    assert observer.export_column == observer.id
    assert original == before
    assert checked_definition(draft, "copy-v3", "draft")["questions"] == draft["questions"]


@pytest.mark.parametrize("role", [None, "other", True])
def test_normalization_does_not_hide_an_invalid_observer_role(role: JsonValue) -> None:
    definition = canonical([question("operator", "observer") | {"role": role}])
    with pytest.raises(ValidationFailedError):
        checked_definition(definition, "copy-v2", "draft")


def test_preflight_refuses_formerly_ignored_observer_role() -> None:
    raw = canonical([question("operator", "operator") | {"role": "observer"}])
    snapshot = PreflightRow(
        id=UUID(int=1),
        schema_version=1,
        definition_text=TypeAdapter(dict[str, JsonValue]).dump_json(raw).decode(),
    )
    with pytest.raises(ValueError, match="formerly ignored"):
        preflight([snapshot])


def test_id_named_observer_does_not_acquire_a_role_from_its_column() -> None:
    definition = canonical(
        [
            question("observer", "observer"),
            question("recorded_by", "recorded_by") | {"role": "observer"},
        ]
    ) | {"columnNaming": "questionId"}
    draft = FormDefinition.model_validate(checked_definition(definition, "copy-v2", "draft"))
    assert draft.questions[0].role is None
    assert draft.questions[1].role == "observer"
