"""Historical interpretation never activates properties ignored by an older schema."""

from typing import Final

from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.forms import StoredFormDefinition
from fieldmaps_api.form_schema_version import require_current_schema

ADAPTER: Final[TypeAdapter[StoredFormDefinition]] = TypeAdapter(StoredFormDefinition)
NEW_QUESTION_PROPERTIES: Final = frozenset({"numberMode", "valueSource", "dateTime", "role"})


def historical_definition(raw: JsonValue, schema_version: int) -> StoredFormDefinition:
    if schema_version != 1:
        require_current_schema(schema_version)
    legacy_questions = raw.get("questions") if isinstance(raw, dict) else None
    if schema_version == 1 and isinstance(raw, dict) and isinstance(legacy_questions, list):
        cleaned: dict[str, JsonValue] = {
            key: value for key, value in raw.items() if key != "columnNaming"
        }
        cleaned["questions"] = [
            {key: value for key, value in question.items() if key not in NEW_QUESTION_PROPERTIES}
            if isinstance(question, dict)
            else question
            for question in legacy_questions
        ]
        raw = cleaned
    return ADAPTER.validate_python(raw)
