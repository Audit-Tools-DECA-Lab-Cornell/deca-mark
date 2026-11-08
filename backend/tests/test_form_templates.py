"""GET /v1/form-templates: managers read the database's templates and can start a draft from one."""

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.form_schemas import FormTemplate, FormVersionDetail
from tests.local_database import admin_sql, disposable_database_selected
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in
from tests.test_form_definition_cases import SUITE

pytestmark = pytest.mark.integration

URL = "/v1/form-templates"
TEMPLATES = TypeAdapter(list[FormTemplate])


@pytest.fixture
def tenant() -> Iterator[Tenant]:
    value = Tenant.new()
    create_tenant(value)
    try:
        yield value
    finally:
        cleanup_tenant(value)


def read_templates(client: TestClient) -> list[FormTemplate]:
    response = client.get(URL)
    assert response.status_code == 200, response.text
    return TEMPLATES.validate_json(response.content)


def test_a_manager_reads_the_seeded_templates_with_the_schema_version_beside_the_definition(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    # Given a project manager.
    sign_in(api_client, signer, tenant.users["manager"])
    # When they list the templates.
    templates = read_templates(api_client)
    # Then both seeded templates come back, each at the current version, beside its definition.
    assert {template.code for template in templates} >= {"behaviour-mapping", "zone-inventory"}
    for template in templates:
        assert template.schema_version == SUITE.current_schema_version
        assert "schema_version" not in template.definition
        assert template.title
        assert template.summary
    keys = TypeAdapter(list[dict[str, JsonValue]]).validate_json(api_client.get(URL).content)
    shape = {"code", "title", "summary", "schema_version", "definition"}
    assert all(set(row) == shape for row in keys)


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_an_organization_manager_reads_the_templates(
    api_client: TestClient, signer: Signer, tenant: Tenant, role: str
) -> None:
    sign_in(api_client, signer, tenant.users[role])
    assert len(read_templates(api_client)) >= 2


@pytest.mark.parametrize("role", ["observer", "viewer", "member"])
def test_a_caller_who_manages_nothing_is_refused(
    api_client: TestClient, signer: Signer, tenant: Tenant, role: str
) -> None:
    # Given an account that only observes, views or belongs to the organization.
    sign_in(api_client, signer, tenant.users[role])
    # When it lists the templates, then the role check refuses it before any read.
    response = api_client.get(URL)
    assert response.status_code == 403, response.text
    assert ErrorEnvelope.model_validate_json(response.content).error.code == "role_required"


def test_an_anonymous_caller_is_refused(api_client: TestClient) -> None:
    api_client.headers.pop("Authorization", None)
    assert api_client.get(URL).status_code == 401


def test_a_manager_starts_a_draft_from_a_template_through_the_create_route(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    # Given a template read from the API.
    sign_in(api_client, signer, tenant.users["manager"])
    template = next(row for row in read_templates(api_client) if row.code == "zone-inventory")
    # When its definition and schema_version start a form.
    created = api_client.post(
        f"/v1/projects/{tenant.project}/forms",
        json={
            "code": template.code,
            "name": template.title,
            "schema_version": template.schema_version,
            "definition": template.definition,
        },
    )
    # Then the create route accepts it as a draft at the same schema version.
    assert created.status_code == 201, created.text
    draft = FormVersionDetail.model_validate_json(created.content)
    assert draft.state == "draft"
    assert draft.schema_version == template.schema_version


def test_a_template_row_that_is_not_canonical_is_a_typed_422_never_a_500(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    # Given a stored template whose definition is not canonical.
    assert disposable_database_selected(), "Seeding raw templates requires a disposable database"
    old_shape: dict[str, JsonValue] = {"fields": [{"code": "people", "type": "integer"}]}
    admin_sql(
        "INSERT INTO fieldmaps.form_templates(code,title,summary,definition,schema_version) "
        "VALUES('old-shape','Old','Old shape',:'definition'::jsonb,:'schema');",
        f"definition={json.dumps(old_shape)}",
        f"schema={SUITE.current_schema_version}",
    )
    try:
        sign_in(api_client, signer, tenant.users["manager"])
        # When a manager lists the templates.
        response = api_client.get(URL)
    finally:
        admin_sql("DELETE FROM fieldmaps.form_templates WHERE code='old-shape';")
    # Then it is refused like BE-24's non-canonical form version.
    assert response.status_code == 422, response.text
    error = ErrorEnvelope.model_validate_json(response.content).error
    assert error.code == "validation_failed"
    assert "people" not in response.text
    assert error.details["fields"] == [{"id": "definition", "problem": error.message}]
