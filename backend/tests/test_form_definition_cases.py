from pathlib import Path

import pytest
from pydantic import BaseModel, Field, JsonValue, ValidationError

from fieldmaps_api.domain.forms import FormDefinition


class DefinitionCase(BaseModel):
    id: str
    patch: dict[str, JsonValue]
    valid: bool
    # A schema version is served beside a definition. BE-24 enforces it; today it only has to be
    # the sole reason a case is refused, so these cases are told apart by the key being present.
    schema_version: JsonValue = Field(default=None, alias="schemaVersion")


class DefinitionCases(BaseModel):
    current_schema_version: int = Field(alias="currentSchemaVersion")
    definition: dict[str, JsonValue]
    question: dict[str, JsonValue]
    cases: list[DefinitionCase]


SUITE = DefinitionCases.model_validate_json(
    (Path(__file__).resolve().parents[2] / "contracts/forms/definition.cases.json").read_bytes()
)


SHAPE_CASES = [case for case in SUITE.cases if "schema_version" not in case.model_fields_set]
VERSION_CASES = [case for case in SUITE.cases if "schema_version" in case.model_fields_set]


@pytest.mark.parametrize("case", SHAPE_CASES, ids=[case.id for case in SHAPE_CASES])
def test_shared_definition_case(case: DefinitionCase) -> None:
    # Given a synthetic question with an explicitly authored validity expectation.
    raw = SUITE.definition | {"questions": [SUITE.question | case.patch]}
    # When the same production parser used for drafts, uploads and exports reads it.
    # Then the canonical boundary agrees with TypeScript.
    if case.valid:
        assert len(FormDefinition.model_validate(raw).questions) == 1
    else:
        with pytest.raises(ValidationError):
            FormDefinition.model_validate(raw)


@pytest.mark.parametrize("case", VERSION_CASES, ids=[case.id for case in VERSION_CASES])
def test_schema_version_case_holds_a_valid_definition(case: DefinitionCase) -> None:
    # Given a case about the schema version alone, the definition itself must be valid, so that
    # BE-24's refusal of an unknown version cannot be mistaken for a malformed definition.
    raw = SUITE.definition | {"questions": [SUITE.question | case.patch]}
    assert len(FormDefinition.model_validate(raw).questions) == 1
    version = case.schema_version
    current = type(version) is int and version == SUITE.current_schema_version
    assert current is case.valid


@pytest.mark.parametrize("bound", ["min", "max"])
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_non_finite_bounds_remain_invalid(bound: str, value: float) -> None:
    raw = SUITE.definition | {"questions": [SUITE.question | {bound: value}]}
    with pytest.raises(ValidationError):
        FormDefinition.model_validate(raw)
