from pathlib import Path

import pytest
from pydantic import BaseModel, JsonValue, ValidationError

from fieldmaps_api.domain.forms import FormDefinition


class DefinitionCase(BaseModel):
    id: str
    patch: dict[str, JsonValue]
    valid: bool


class DefinitionCases(BaseModel):
    definition: dict[str, JsonValue]
    question: dict[str, JsonValue]
    cases: list[DefinitionCase]


SUITE = DefinitionCases.model_validate_json(
    (Path(__file__).resolve().parents[2] / "contracts/forms/definition.cases.json").read_bytes()
)


@pytest.mark.parametrize("case", SUITE.cases, ids=[case.id for case in SUITE.cases])
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


@pytest.mark.parametrize("bound", ["min", "max"])
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_non_finite_bounds_remain_invalid(bound: str, value: float) -> None:
    raw = SUITE.definition | {"questions": [SUITE.question | {bound: value}]}
    with pytest.raises(ValidationError):
        FormDefinition.model_validate(raw)
