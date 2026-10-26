import csv
import json
from io import StringIO
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.observation_analysis_schemas import HistoricalObservationDetail
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.local_database import admin_sql, disposable_database_selected
from tests.package_fixtures import submission
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, observation_payload, sign_in
from tests.test_form_definition_cases import SUITE, DefinitionCase
from tests.test_observation_analysis_exports import files
from tests.test_workspace_api import tenant
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration
__all__ = ["tenant"]

INVERTED = [case for case in SUITE.cases if case.id.startswith("inverted-")]


def definition(patch: dict[str, JsonValue]) -> dict[str, JsonValue]:
    result: dict[str, JsonValue] = {
        **SUITE.definition,
        "questions": [SUITE.question | patch],
    }
    return result


def start_form(client: TestClient, project: str) -> FormVersionDetail:
    response = client.post(
        f"{project}/forms",
        json={
            "code": "bounded",
            "name": "Synthetic only",
            "definition": definition({"min": 0, "max": 10}),
        },
    )
    assert response.status_code == 201, response.text
    return FormVersionDetail.model_validate_json(response.content)


@pytest.mark.parametrize("case", INVERTED, ids=[case.id for case in INVERTED])
def test_create_form_rejects_contradictory_bounds(
    api_client: TestClient, tenant: Tenant, case: DefinitionCase
) -> None:
    response = api_client.post(
        f"/v1/projects/{tenant.project}/forms",
        json={
            "code": "contradictory",
            "name": "Synthetic only",
            "definition": definition(case.patch),
        },
    )
    assert response.status_code == 422, response.text
    error = ErrorEnvelope.model_validate_json(response.content).error
    assert error.code == "validation_failed"
    assert '"count" has a minimum greater than its maximum.' in error.message


@pytest.mark.parametrize("case", INVERTED, ids=[case.id for case in INVERTED])
def test_subsequent_draft_rejects_contradictory_bounds(
    api_client: TestClient, tenant: Tenant, case: DefinitionCase
) -> None:
    project = f"/v1/projects/{tenant.project}"
    draft = start_form(api_client, project)
    response = api_client.post(
        f"{project}/forms/{draft.form_code}/versions",
        json={"definition": definition(case.patch)},
    )
    assert response.status_code == 422, response.text
    assert "minimum greater than its maximum" in response.text
    current = api_client.get(f"{project}/form-versions/{draft.code}")
    assert FormVersionDetail.model_validate_json(current.content) == draft
    assert api_client.get(f"{project}/form-versions/bounded-v2").status_code == 404


@pytest.mark.parametrize("case", INVERTED, ids=[case.id for case in INVERTED])
def test_revision_checked_update_rejects_bounds_without_changing_draft(
    api_client: TestClient, tenant: Tenant, case: DefinitionCase
) -> None:
    project = f"/v1/projects/{tenant.project}"
    draft = start_form(api_client, project)
    url = f"{project}/form-versions/{draft.code}"
    response = api_client.put(
        url, headers={"If-Match": draft.etag}, json={"definition": definition(case.patch)}
    )
    assert response.status_code == 422, response.text
    assert "minimum greater than its maximum" in response.text
    current = api_client.get(url)
    assert current.headers["etag"] == draft.etag
    assert FormVersionDetail.model_validate_json(current.content) == draft


def test_publication_revalidates_synthetically_stored_invalid_draft(
    api_client: TestClient, tenant: Tenant
) -> None:
    assert disposable_database_selected(), "Stored-invalid acceptance requires disposable data"
    project = f"/v1/projects/{tenant.project}"
    draft = start_form(api_client, project)
    authored = draft.definition["questions"]
    assert isinstance(authored, list)
    assert isinstance(authored[0], dict)
    invalid_question: dict[str, JsonValue] = {**authored[0], "min": 10, "max": 1}
    invalid: dict[str, JsonValue] = {**draft.definition, "questions": [invalid_question]}
    admin_sql(
        "UPDATE fieldmaps.form_versions SET definition=:'definition'::jsonb WHERE id=:'version';",
        f"definition={json.dumps(invalid)}",
        f"version={draft.version_id}",
    )
    url = f"{project}/form-versions/{draft.code}"
    current = FormVersionDetail.model_validate_json(api_client.get(url).content)
    assert current.revision == draft.revision + 1
    stale = api_client.post(url + "/publish", headers={"If-Match": draft.etag})
    assert stale.status_code == 412, stale.text
    response = api_client.post(url + "/publish", headers={"If-Match": current.etag})
    assert response.status_code == 422, response.text
    assert "minimum greater than its maximum" in response.text
    assert FormVersionDetail.model_validate_json(api_client.get(url).content) == current


@pytest.mark.parametrize(
    ("patch", "answer"),
    [
        ({"min": 10, "max": 10, "exportColumn": "Count"}, 10),
        ({"min": -5, "max": -1, "exportColumn": "Count"}, -3),
        ({"min": 0, "max": 10, "exportColumn": "Count"}, 0),
        ({"id": "round_type", "min": 0, "max": 10, "exportColumn": "Question_Round_Type"}, 3),
    ],
    ids=["equal", "negative", "zero", "round-type-namespace"],
)
def test_bounded_form_publishes_uploads_and_exports(
    api_client: TestClient,
    tenant: Tenant,
    signer: Signer,
    patch: dict[str, JsonValue],
    answer: int,
) -> None:
    project = f"/v1/projects/{tenant.project}"
    draft = start_form(api_client, project)
    url = f"{project}/form-versions/{draft.code}"
    edited = api_client.put(
        url, headers={"If-Match": draft.etag}, json={"definition": definition(patch)}
    )
    assert edited.status_code == 200, edited.text
    reviewed = FormVersionDetail.model_validate_json(edited.content)
    assert reviewed.revision == draft.revision + 1
    published = api_client.post(url + "/publish", headers={"If-Match": reviewed.etag})
    assert published.status_code == 200, published.text
    frozen = FormVersionDetail.model_validate_json(published.content)
    assert frozen.state == "published"
    assert frozen.revision == reviewed.revision
    package = api_client.post(
        f"{project}/packages", json=submission(site_id=str(tenant.site), form_version=frozen.code)
    )
    assert package.status_code == 201, package.text
    binding = Publication.model_validate_json(package.content).package
    history = api_client.get(
        f"{project}/sites/{tenant.site}/zones", params={"package_id": str(binding.package_id)}
    )
    zone = HistoricalZones.model_validate_json(history.content).zones[0]
    sign_in(api_client, signer, tenant.users["observer"])
    downloaded = api_client.get(url)
    assert FormVersionDetail.model_validate_json(downloaded.content).definition == frozen.definition
    question = FormDefinition.model_validate(frozen.definition).questions[0]
    question_id = question.id
    answers: dict[str, JsonValue] = {question_id: answer}
    observation = uuid4()
    payload = observation_payload(tenant.site, binding.package_id, zone.zone_id) | {
        "form_version": frozen.code,
        "answers": answers,
    }
    upload = api_client.put(f"{project}/observations/{observation}", json=payload)
    assert upload.status_code == 200, upload.text
    assert question.max is not None
    invalid = payload | {"answers": {question_id: question.max + 1}}
    rejected = api_client.put(f"{project}/observations/{uuid4()}", json=invalid)
    assert rejected.status_code == 422, rejected.text
    sign_in(api_client, signer, tenant.users["viewer"])
    readback = api_client.get(f"{project}/observations/{observation}")
    stored = HistoricalObservationDetail.model_validate_json(readback.content)
    assert stored.answers == answers
    assert stored.round_type == "standard"
    assert stored.form_version == frozen.code
    assert_exports(api_client, project, frozen, answers)


def assert_exports(
    client: TestClient, project: str, frozen: FormVersionDetail, answers: dict[str, JsonValue]
) -> None:
    question = FormDefinition.model_validate(frozen.definition).questions[0]
    answer_column = "answer_round_type" if question.id == "round_type" else question.export_column
    for format_name in ("csv", "geojson"):
        response = client.get(f"{project}/observations/export", params={"format": format_name})
        assert response.status_code == 200, response.text
        bundle = files(response.content)
        if format_name == "csv":
            row = next(csv.DictReader(StringIO(bundle["observations.csv"].decode("utf-8-sig"))))
            assert row["round_type"] == "standard"
            assert row[answer_column] == str(answers[question.id])
        else:
            features = document(bundle["observations.geojson"])["features"]
            assert isinstance(features, list)
            event = features[0]
            assert isinstance(event, dict)
            properties = event["properties"]
            assert isinstance(properties, dict)
            assert properties["round_type"] == "standard"
            assert properties["answers"] == answers
            assert properties[answer_column] == answers[question.id]
        assert document(bundle["forms.json"])[frozen.code] == frozen.definition
