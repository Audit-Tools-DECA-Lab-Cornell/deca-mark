"""Wire boundaries, not a second reference algorithm."""

from pathlib import Path

import pytest
from pydantic import BaseModel, Field, JsonValue, ValidationError

from fieldmaps_api.library_schemas import LibrarySettings, TemplateBody, Variable, VariablesCreate

ROOT = Path(__file__).resolve().parents[2]
SETTINGS = {
    "label": "Age",
    "exportColumn": "age",
    "kind": "one",
    "source": "synthetic",
    "options": [{"code": "young", "label": "Young"}],
}


def test_settings_preserve_canonical_aliases_and_reject_identity() -> None:
    parsed = LibrarySettings.model_validate(SETTINGS)
    assert parsed.model_dump(by_alias=True, exclude_unset=True) == SETTINGS
    options: list[JsonValue] = [{"code": "x", "label": "X"}] * 201
    patches: list[dict[str, JsonValue]] = [
        {"id": "a"},
        {"librarySource": {}},
        {"hint": None},
        {"kind": "other"},
        {"exportColumn": ""},
        {"options": options},
    ]
    for patch in patches:
        with pytest.raises(ValidationError):
            LibrarySettings.model_validate({**SETTINGS, **patch})


def test_entity_scope_and_etag() -> None:
    body = {
        "id": "11111111-1111-4111-8111-111111111111",
        "level": "universal",
        "organization_id": None,
        "project_id": None,
        "site_id": None,
        "code": "Age1",
        "group": "Children",
        "section": "Child",
        "settings": SETTINGS,
        "revision": 1,
        "created_at": "2026-11-14T00:00:00Z",
        "updated_at": "2026-11-14T00:00:00Z",
    }
    variable = Variable.model_validate(body)
    assert variable.etag == '"library-variable:11111111-1111-4111-8111-111111111111:1"'
    for patch in (
        {"level": "site"},
        {"revision": True},
        {"revision": 0},
        {"revision": 9007199254740992},
    ):
        with pytest.raises(ValidationError):
            Variable.model_validate({**body, **patch})


def test_whole_body_bounds() -> None:
    with pytest.raises(ValidationError):
        VariablesCreate(items=[])
    with pytest.raises(ValidationError):
        TemplateBody(name="T", description="", round="standard", variable_ids=[])


class Case(BaseModel):
    id: str
    refusal: str | None = None
    questions: list[dict[str, str]] = Field(default_factory=list)


class CaseFile(BaseModel):
    cases: list[Case]


def test_shared_cases_are_independent_and_complete() -> None:
    data = CaseFile.model_validate_json(
        (ROOT / "contracts/library/reference.cases.json").read_text()
    )
    cases = data.cases
    assert len({case.id for case in cases}) == len(cases)
    assert {case.refusal for case in cases} >= {
        "reference_scope",
        "reference_unavailable",
        "duplicate_column",
        "parent_order",
        "parent_missing",
    }
    copy = next(case for case in cases if case.id == "copy-preserves-order-and-column")
    assert copy.questions == [
        {"id": "beta", "code": "B1", "exportColumn": "beta"},
        {"id": "alpha", "code": "A1", "exportColumn": "alpha"},
    ]
