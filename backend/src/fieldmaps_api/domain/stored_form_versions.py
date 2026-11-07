"""Stored definitions are read in the one canonical format, and nothing else is served."""

from typing import Final

from pydantic import JsonValue, ValidationError

from fieldmaps_api.domain.forms import StoredCanonicalDefinition
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.form_schema_version import require_current_schema

NEW_QUESTION_PROPERTIES: Final = frozenset({"numberMode", "valueSource", "dateTime", "role"})
UNREADABLE: Final = (
    "This form is not stored in the current format, so DECA Mark cannot use it. "
    "Ask the project coordinator to publish it again."
)


def historical_definition(raw: JsonValue, schema_version: int) -> StoredCanonicalDefinition:
    """Parse a stored definition as canonical, or refuse it with a typed 422 (never a 500)."""
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
    try:
        return StoredCanonicalDefinition.model_validate(raw)
    except ValidationError as error:
        raise ValidationFailedError(UNREADABLE, field="definition") from error
