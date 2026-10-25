"""Establish explicit question-ID export provenance only for current draft writes."""

from pydantic import JsonValue


def normalized_question(raw: JsonValue, *, infer_legacy_role: bool) -> JsonValue:
    """Leave malformed shapes intact for the production definition validator to reject."""
    if not isinstance(raw, dict):
        return raw
    question_id = raw.get("id")
    if not isinstance(question_id, str) or not isinstance(raw.get("exportColumn"), str):
        return raw
    normalized: dict[str, JsonValue] = {**raw, "exportColumn": question_id}
    if (
        infer_legacy_role
        and "role" not in raw
        and raw.get("kind") == "text"
        and raw.get("exportColumn") == "observer"
        and raw.get("valueSource", "manual") == "manual"
    ):
        normalized["role"] = "observer"
    dynamic = raw.get("dynamicFrom")
    if isinstance(dynamic, dict):
        groups = dynamic.get("sets")
        if isinstance(groups, dict):
            sets: dict[str, JsonValue] = {
                key: {**group, "exportColumn": question_id}
                if isinstance(group, dict) and isinstance(group.get("exportColumn"), str)
                else group
                for key, group in groups.items()
            }
            normalized["dynamicFrom"] = {**dynamic, "sets": sets}
    return normalized


def normalize_draft_columns(definition: dict[str, JsonValue]) -> dict[str, JsonValue]:
    """Copy historical mappings into authored provenance without mutating the source instrument."""
    normalized: dict[str, JsonValue] = {**definition}
    if "columnNaming" not in definition or definition["columnNaming"] == "questionId":
        normalized["columnNaming"] = "questionId"
    questions = definition.get("questions")
    if isinstance(questions, list):
        normalized["questions"] = [
            normalized_question(question, infer_legacy_role="columnNaming" not in definition)
            for question in questions
        ]
    return normalized
