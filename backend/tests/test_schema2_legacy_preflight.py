import json
from hashlib import sha256
from uuid import UUID

import pytest
from pydantic import JsonValue, ValidationError

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.domain.stored_form_versions import historical_definition
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.form_schema_bundle import prepare_sql
from fieldmaps_api.form_schema_preflight import PreflightRow, preflight
from fieldmaps_api.form_schema_upgrade import MIGRATION
from tests.test_observation_analysis_domain import canonical, question

# The operator preflight is the one place that still recognises fields-only rows (before OPS-19).
FIELDS_ONLY: dict[str, JsonValue] = {
    "fields": [
        {"code": "people", "type": "integer", "minimum": 0, "maximum": 999, "required": True},
        {"code": "notes", "type": "text", "required": False, "maxLength": 1000},
    ],
    "status": "practice-only",
}


def stored_row(definition: dict[str, JsonValue], identity: int) -> PreflightRow:
    return PreflightRow(
        id=UUID(int=identity), schema_version=1, definition_text=json.dumps(definition)
    )


def test_mixed_preflight_identifies_legacy_without_converting_definitions() -> None:
    rows = [stored_row(FIELDS_ONLY, 1), stored_row(canonical([question("x", "X")]), 2)]
    original = [row.model_dump_json() for row in rows]
    report = preflight(rows)
    assert report.format == "decamark-schema2-preflight-2"
    assert [row.definition_format for row in report.rows] == ["legacy_fields", "canonical"]
    assert report.rows[0].definition_sha256 == sha256(rows[0].definition_text.encode()).hexdigest()
    assert [row.model_dump_json() for row in rows] == original


def test_legacy_bundle_selects_preservation_source_without_editing_original() -> None:
    original = MIGRATION.read_bytes()
    row = stored_row(FIELDS_ONLY, 1)
    sql = prepare_sql(json.dumps([row.model_dump(mode="json")]).encode())
    assert "preserve_legacy.sql" in sql
    assert "legacy_fields" in sql
    assert "INSERT INTO supabase_migrations.schema_migrations" in sql
    assert MIGRATION.read_bytes() == original


@pytest.mark.parametrize(
    "field",
    [
        {"code": "answer", "type": "number", "required": True},
        {"code": "answer", "type": "text", "required": True},
        {"code": "answer", "type": "boolean"},
        {"code": "answer", "type": "multi-choice", "options": ["a"]},
    ],
)
def test_preflight_recognises_each_historical_field_type_that_the_api_refuses(
    field: dict[str, JsonValue],
) -> None:
    raw: dict[str, JsonValue] = {"fields": [field]}
    report = preflight([stored_row(raw, 1)])
    assert [row.definition_format for row in report.rows] == ["legacy_fields"]
    # The API's one format refuses it: authoring and every stored-definition reader.
    with pytest.raises(ValidationError):
        FormDefinition.model_validate(raw)
    with pytest.raises(ValidationFailedError):
        historical_definition(raw, 2)


@pytest.mark.parametrize(
    "raw",
    [
        {"fields": [{"code": "answer", "type": "unsupported"}]},
        {"fields": [], "questions": []},
        {"fields": [], "ignored": {"valueSource": "accountId"}},
        {"unexpected": []},
    ],
)
def test_preservation_never_bypasses_invalid_or_new_semantic_properties(
    raw: dict[str, JsonValue],
) -> None:
    with pytest.raises(ValueError, match=r"validation error|formerly ignored"):
        preflight([stored_row(raw, 1)])
