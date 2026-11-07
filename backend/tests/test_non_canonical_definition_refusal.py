"""A stored definition that is not canonical is refused, never served or parsed on a guess."""

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.errors import ErrorEnvelope
from tests.local_database import admin_sql, disposable_database_selected
from tests.tenant_fixtures import Tenant
from tests.test_workspace_api import tenant

pytestmark = pytest.mark.integration
__all__ = ["tenant"]

# The shape the API read before BE-24: a `fields` list instead of canonical `questions`.
OLD_SHAPE = {"fields": [{"code": "people", "type": "integer", "required": True}]}


def test_api_refuses_to_serve_or_copy_a_stored_definition_that_is_not_canonical(
    api_client: TestClient, tenant: Tenant
) -> None:
    # Given a stored published version at the current schema version whose JSON is not canonical.
    assert disposable_database_selected(), "Seeding raw definitions requires a disposable database"
    form, version = uuid4(), uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.forms(id,organization_id,project_id,code,name) "
        "VALUES(:'form',:'org',:'project','old','Old shape'); "
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,form_id,version,"
        "code,definition,state,schema_version,published_at) "
        "VALUES(:'version',:'org',:'project',:'form',1,'old-v1',:'definition'::jsonb,"
        "'published',2,now());",
        *tenant.variables(),
        f"form={form}",
        f"version={version}",
        f"definition={json.dumps(OLD_SHAPE)}",
    )
    base = f"/v1/projects/{tenant.project}"
    # When it is read or copied into a new draft.
    served = api_client.get(f"{base}/form-versions/old-v1")
    copied = api_client.post(f"{base}/forms/old/versions", json={})
    # Then both are a typed 422 about the definition, never the definition itself or a 500.
    for response in (served, copied):
        assert response.status_code == 422, response.text
        error = ErrorEnvelope.model_validate_json(response.content).error
        assert error.code == "validation_failed"
        assert "people" not in response.text
        assert error.details["fields"] == [{"id": "definition", "problem": error.message}]
