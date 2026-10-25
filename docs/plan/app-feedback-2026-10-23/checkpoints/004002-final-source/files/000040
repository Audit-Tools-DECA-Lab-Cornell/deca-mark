"""The historical reader keeps its old semantics; it is not an authoring format."""

from typing import Final

import pytest
from pydantic import JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.domain.forms import (
    AnswerError,
    FormDefinition,
    StoredFormDefinition,
    normalize_answers,
)
from fieldmaps_api.domain.observation_export_columns import questions
from tests.fields_only_fixtures import FIELDS_ONLY

STORED: Final = TypeAdapter[StoredFormDefinition](StoredFormDefinition)


@pytest.mark.parametrize(
    ("field", "accepted", "rejected"),
    [
        ({"type": "integer", "minimum": 0, "maximum": 999}, 0, 3.0),
        ({"type": "number", "minimum": 0, "maximum": 2}, 1.5, 3),
        ({"type": "boolean"}, False, "false"),
        ({"type": "text", "maxLength": 3}, "", "long"),
        ({"type": "choice", "options": ["a", "b"]}, "a", "c"),
        ({"type": "multi-choice", "options": ["a", "b"]}, ["a", "a"], ["c"]),
    ],
)
def test_historical_field_types_are_not_reinterpreted(
    field: dict[str, JsonValue], accepted: JsonValue, rejected: JsonValue
) -> None:
    definition = STORED.validate_python({"fields": [{"code": "answer", "required": True, **field}]})
    assert normalize_answers(definition, {"answer": accepted}).answers == {"answer": accepted}
    assert normalize_answers(definition, {"answer": accepted}).pruned == []
    with pytest.raises(AnswerError):
        normalize_answers(definition, {"answer": rejected})
    with pytest.raises(AnswerError):
        normalize_answers(definition, {})
    with pytest.raises(AnswerError):
        normalize_answers(definition, {"answer": accepted, "unknown": 1})


def test_shell_blank_text_and_historical_export_names_remain_exact() -> None:
    definition = STORED.validate_python(FIELDS_ONLY)
    assert normalize_answers(definition, {"people": 0, "notes": ""}).answers == {
        "people": 0,
        "notes": "",
    }
    assert [(q.id, q.column, q.label, q.kind) for q in questions(FIELDS_ONLY, 1)] == [
        ("people", "people", "people", "integer"),
        ("notes", "notes", "notes", "text"),
    ]
    with pytest.raises(ValidationError):
        FormDefinition.model_validate(FIELDS_ONLY)


def test_bad_canonical_definition_never_falls_back_to_legacy_fields() -> None:
    with pytest.raises(ValidationError):
        STORED.validate_python({**FIELDS_ONLY, "questions": []})
