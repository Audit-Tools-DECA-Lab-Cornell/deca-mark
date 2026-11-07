from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.form_schemas import FormVersionDetail
from tests.tenant_fixtures import Tenant
from tests.test_workspace_api import tenant


class DefinitionCase(BaseModel):
    id: str
    patch: dict[str, JsonValue]
    definition_patch: dict[str, JsonValue] = Field(default_factory=dict, alias="definitionPatch")
    valid: bool
    # A schema version is served beside a definition. A case that names one is about the version
    # alone and is told apart from the shape cases by the key being present.
    schema_version: JsonValue = Field(default=None, alias="schemaVersion")


class DefinitionCases(BaseModel):
    current_schema_version: int = Field(alias="currentSchemaVersion")
    definition: dict[str, JsonValue]
    question: dict[str, JsonValue]
    cases: list[DefinitionCase]


ROOT = Path(__file__).resolve().parents[2]
__all__ = ["tenant"]
SUITE = DefinitionCases.model_validate_json(
    (ROOT / "contracts/forms/definition.cases.json").read_bytes()
)


SHAPE_CASES = [case for case in SUITE.cases if "schema_version" not in case.model_fields_set]
VERSION_CASES = [case for case in SUITE.cases if "schema_version" in case.model_fields_set]


@pytest.mark.parametrize("case", SHAPE_CASES, ids=[case.id for case in SHAPE_CASES])
def test_shared_definition_case(case: DefinitionCase) -> None:
    # Given a synthetic question with an explicitly authored validity expectation.
    raw = SUITE.definition | case.definition_patch | {"questions": [SUITE.question | case.patch]}
    # When the same production parser used for drafts, uploads and exports reads it.
    # Then the canonical boundary agrees with TypeScript.
    if case.valid:
        assert len(FormDefinition.model_validate(raw).questions) == 1
    else:
        with pytest.raises(ValidationError):
            FormDefinition.model_validate(raw)


REFUSED = [case for case in VERSION_CASES if not case.valid]
CURRENT = [case for case in VERSION_CASES if case.valid]


def write_body(case: DefinitionCase) -> dict[str, JsonValue]:
    definition: dict[str, JsonValue] = {
        **SUITE.definition,
        "questions": [SUITE.question | case.patch],
    }
    return {
        "code": "versioned",
        "name": "Synthetic only",
        "schema_version": case.schema_version,
        "definition": definition,
    }


@pytest.mark.parametrize("case", VERSION_CASES, ids=[case.id for case in VERSION_CASES])
def test_schema_version_case_holds_a_valid_definition(case: DefinitionCase) -> None:
    # Given a case about the schema version alone, the definition itself must be valid, so that
    # the refusal of an unknown version cannot be mistaken for a malformed definition.
    raw = SUITE.definition | {"questions": [SUITE.question | case.patch]}
    assert len(FormDefinition.model_validate(raw).questions) == 1


@pytest.mark.integration
@pytest.mark.parametrize("case", REFUSED, ids=[case.id for case in REFUSED])
def test_api_refuses_every_non_current_schema_version_case(
    api_client: TestClient, tenant: Tenant, case: DefinitionCase
) -> None:
    # Given a valid definition written with a version that is not the current JSON number.
    body = write_body(case)
    forms = f"/v1/projects/{tenant.project}/forms"
    # When a manager creates a form, starts a draft or saves one through the real API.
    responses = [
        api_client.post(forms, json=body),
        api_client.post(
            f"{forms}/versioned/versions",
            json={"schema_version": case.schema_version, "definition": body["definition"]},
        ),
        api_client.put(
            f"/v1/projects/{tenant.project}/form-versions/versioned-v1",
            json={"schema_version": case.schema_version, "definition": body["definition"]},
            headers={"If-Match": '"form:0:1"'},
        ),
    ]
    # Then every write is refused with the typed code, whatever pydantic's lax mode would coerce.
    for response in responses:
        assert response.status_code == 422, response.text
        error = ErrorEnvelope.model_validate_json(response.content).error
        assert error.code == "unknown_schema_version"
        assert error.message == "Update DECA Mark to use this form"


@pytest.mark.integration
@pytest.mark.parametrize("case", CURRENT, ids=[case.id for case in CURRENT])
def test_api_accepts_the_current_schema_version_cases(
    api_client: TestClient, tenant: Tenant, case: DefinitionCase
) -> None:
    # Given the current version written as the shared case writes it (2 and 2.0).
    response = api_client.post(
        f"/v1/projects/{tenant.project}/forms", json=write_body(case) | {"code": case.id}
    )
    # Then the form is stored and served at the current version.
    assert response.status_code == 201, response.text
    detail = FormVersionDetail.model_validate_json(response.content)
    assert detail.schema_version == SUITE.current_schema_version


@pytest.mark.integration
def test_api_accepts_a_write_that_omits_the_schema_version(
    api_client: TestClient, tenant: Tenant
) -> None:
    # Given a write without the number, which means the current version.
    body = write_body(CURRENT[0])
    del body["schema_version"]
    response = api_client.post(f"/v1/projects/{tenant.project}/forms", json=body)
    assert response.status_code == 201, response.text
    assert FormVersionDetail.model_validate_json(response.content).schema_version == 2


def test_every_openapi_definition_is_served_beside_its_schema_version() -> None:
    # Given the generated contract, a definition without its sibling number cannot be read safely.
    document = TypeAdapter(dict[str, JsonValue]).validate_json(
        (ROOT / "contracts/openapi.json").read_bytes()
    )
    components = document["components"]
    assert isinstance(components, dict)
    schemas = components["schemas"]
    assert isinstance(schemas, dict)
    carrying: dict[str, dict[str, JsonValue]] = {}
    for name, schema in schemas.items():
        properties = schema.get("properties") if isinstance(schema, dict) else None
        if isinstance(properties, dict) and "definition" in properties:
            carrying[name] = properties
    assert carrying, "expected form payloads that carry a definition"
    for name, properties in carrying.items():
        assert "schema_version" in properties, name


@pytest.mark.parametrize("bound", ["min", "max"])
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_non_finite_bounds_remain_invalid(bound: str, value: float) -> None:
    raw = SUITE.definition | {"questions": [SUITE.question | {bound: value}]}
    with pytest.raises(ValidationError):
        FormDefinition.model_validate(raw)
