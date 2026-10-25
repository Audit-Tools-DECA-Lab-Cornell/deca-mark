"""Current draft write normalization through the real API on an isolated rehearsal DB."""

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.form_schemas import FormVersionDetail
from tests.local_database import admin_sql, disposable_database_selected
from tests.tenant_fixtures import Tenant
from tests.test_form_authoring_normalization import historical_definition
from tests.test_workspace_api import tenant

pytestmark = pytest.mark.integration
__all__ = ["tenant"]


def assert_authored(detail: FormVersionDetail) -> None:
    parsed = FormDefinition.model_validate(detail.definition)
    assert parsed.column_naming == "questionId"
    assert all(question.export_column == question.id for question in parsed.questions)
    dynamic = parsed.questions[1].dynamic_from
    assert dynamic is not None
    assert {group.export_column for group in dynamic.sets.values()} == {"detail"}


def test_copied_historical_form_publishes_without_editor_save_and_keeps_source(
    api_client: TestClient, tenant: Tenant
) -> None:
    # Given an immutable synthetic schema2 publication with historical column mappings.
    assert disposable_database_selected(), "Historical fixture is restricted to disposable DB"
    source = historical_definition() | {"version": "historical-v1"}
    source_form, source_version = uuid4(), uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.forms(id,organization_id,project_id,code,name) "
        "VALUES(:'source_form',:'org',:'project','historical','Historical fixture'); "
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,form_id,version,"
        "code,definition,state,schema_version,published_at) "
        "VALUES(:'source_version',:'org',:'project',:'source_form',1,'historical-v1',"
        ":'definition'::jsonb,'published',2,now());",
        *tenant.variables(),
        f"source_form={source_form}",
        f"source_version={source_version}",
        f"definition={json.dumps(source)}",
    )
    base = f"/v1/projects/{tenant.project}"
    before = FormVersionDetail.model_validate_json(
        api_client.get(base + "/form-versions/historical-v1").content
    )
    # When a manager copies it and publishes directly without opening/saving the editor.
    response = api_client.post(base + "/forms/historical/versions", json={})
    assert response.status_code == 201, response.text
    copied = FormVersionDetail.model_validate_json(response.content)
    assert_authored(copied)
    published = api_client.post(
        base + f"/form-versions/{copied.code}/publish", headers={"If-Match": copied.etag}
    )
    # Then stored copy provenance is complete and the original published JSON/revision are exact.
    assert published.status_code == 200, published.text
    assert_authored(FormVersionDetail.model_validate_json(published.content))
    original = api_client.get(base + "/form-versions/historical-v1")
    assert FormVersionDetail.model_validate_json(original.content) == before
    assert before.definition == source
    assert "columnNaming" not in before.definition


def test_create_and_revision_checked_update_normalize_at_write_boundary(
    api_client: TestClient, tenant: Tenant
) -> None:
    # Given a draft created from old mappings through the real current-schema API.
    base = f"/v1/projects/{tenant.project}"
    source = historical_definition()
    response = api_client.post(
        base + "/forms",
        json={
            "code": "authored",
            "name": "Authored fixture",
            "definition": source,
        },
    )
    assert response.status_code == 201, response.text
    draft = FormVersionDetail.model_validate_json(response.content)
    assert_authored(draft)
    # When an update supplies stale mappings even with an explicit provenance marker.
    url = base + f"/form-versions/{draft.code}"
    saved = api_client.put(
        url,
        headers={"If-Match": draft.etag},
        json={
            "definition": source | {"columnNaming": "questionId"},
        },
    )
    # Then normalization precedes validation/storage and ETag/revision protection remains active.
    assert saved.status_code == 200, saved.text
    current = FormVersionDetail.model_validate_json(saved.content)
    assert_authored(current)
    assert current.revision == draft.revision + 1
    stale = api_client.put(url, headers={"If-Match": draft.etag}, json={"definition": source})
    assert stale.status_code == 412, stale.text
    assert FormVersionDetail.model_validate_json(api_client.get(url).content) == current
