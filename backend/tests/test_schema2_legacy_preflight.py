import json
from hashlib import sha256
from uuid import UUID

import pytest
from pydantic import JsonValue, ValidationError

from fieldmaps_api.domain.forms import FormDefinition, normalize_answers
from fieldmaps_api.domain.stored_form_versions import historical_definition
from fieldmaps_api.form_schema_bundle import prepare_sql
from fieldmaps_api.form_schema_preflight import PreflightRow, preflight
from fieldmaps_api.form_schema_upgrade import MIGRATION
from tests.fields_only_fixtures import FIELDS_ONLY
from tests.test_observation_analysis_domain import canonical, question


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
    ("field", "answer"),
    [
        ({"code": "answer", "type": "number", "required": True}, 1.5),
        ({"code": "answer", "type": "text", "required": True}, ""),
        ({"code": "answer", "type": "boolean"}, False),
        ({"code": "answer", "type": "multi-choice", "options": ["a"]}, ["a", "a"]),
    ],
)
def test_preserved_legacy_keeps_historical_semantics_and_stays_unauthorable(
    field: dict[str, JsonValue], answer: JsonValue
) -> None:
    raw: dict[str, JsonValue] = {"fields": [field]}
    preflight([stored_row(raw, 1)])
    before = normalize_answers(historical_definition(raw, 1), {"answer": answer})
    after = normalize_answers(historical_definition(raw, 2), {"answer": answer})
    assert before == after
    assert after.answers == {"answer": answer}
    with pytest.raises(ValidationError):
        FormDefinition.model_validate(raw)


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
