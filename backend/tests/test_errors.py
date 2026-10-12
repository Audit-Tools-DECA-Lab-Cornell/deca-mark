from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter
from sqlalchemy.exc import SQLAlchemyError

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.main import create_app
from tests.bound_upload_fixtures import BoundSite
from tests.signing import ISSUER, PROJECT, make_signer
from tests.tenant_fixtures import observation_payload

JSON = TypeAdapter[JsonValue](JsonValue)


def test_missing_authentication_has_envelope_and_bearer_challenge() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/v1/projects")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert JSON.validate_json(response.content) == {
        "error": {
            "code": "unauthenticated",
            "message": "Sign in to synchronize",
            "details": {},
        }
    }


def test_unconfigured_authentication_uses_service_error_envelope() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/v1/projects", headers={"Authorization": "Bearer example"})
    assert response.status_code == 503
    assert JSON.validate_json(response.content) == {
        "error": {
            "code": "storage_unavailable",
            "message": "Sign-in provider has not been configured",
            "details": {},
        }
    }


def test_invalid_token_has_distinct_code_and_bearer_challenge() -> None:
    with TestClient(
        create_app(verifier=JwksVerifier(ISSUER, "authenticated", make_signer()))
    ) as client:
        response = client.get("/v1/projects", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert JSON.validate_json(response.content) == {
        "error": {"code": "token_invalid", "message": "Sign in again to synchronize", "details": {}}
    }


@pytest.mark.parametrize(
    ("method", "path", "status", "code"),
    [("GET", "/missing", 404, "not_found"), ("POST", "/health", 405, "method_not_allowed")],
)
def test_framework_errors_use_envelope(method: str, path: str, status: int, code: str) -> None:
    with TestClient(create_app()) as client:
        response = client.request(method, path)
    assert response.status_code == status
    content = JSON.validate_json(response.content)
    assert isinstance(content, dict)
    error = content["error"]
    assert isinstance(error, dict)
    assert error["code"] == code
    assert error["details"] == {}
    if status == 405:
        assert "GET" in response.headers["Allow"]


@pytest.mark.parametrize(
    ("failure", "status", "code"),
    [
        (SQLAlchemyError("private database connection"), 500, "internal"),
        (RuntimeError("private server detail"), 500, "internal"),
    ],
)
def test_server_failures_are_sanitized(failure: Exception, status: int, code: str) -> None:
    app = create_app()

    @app.get("/failure")
    async def fail() -> None:
        raise failure

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/failure")
    assert response.status_code == status
    content = JSON.validate_json(response.content)
    assert isinstance(content, dict)
    error = content["error"]
    assert isinstance(error, dict)
    assert error["code"] == code
    assert error["details"] == {}
    assert "private" not in response.text


@pytest.mark.integration
def test_request_validation_reports_fields_without_input(api_client: TestClient) -> None:
    response = api_client.put(
        f"/v1/projects/{PROJECT}/observations/{uuid4()}",
        json={"round_type": "standard", "observer": "private field note"},
    )
    assert response.status_code == 422
    content = JSON.validate_json(response.content)
    assert isinstance(content, dict)
    error = content["error"]
    assert isinstance(error, dict)
    assert error["code"] == "validation_failed"
    details = error["details"]
    assert isinstance(details, dict)
    issues = details["issues"]
    assert isinstance(issues, list)
    assert any(isinstance(issue, dict) and issue["path"] == "/coordinates" for issue in issues)
    assert "private field note" not in response.text


@pytest.mark.integration
def test_domain_validation_reports_answer_field(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    response = api_client.put(
        bound_site.url(uuid4()),
        json=bound_site.point(answers={"people": -1, "notes": ""}),
    )
    assert response.status_code == 422
    assert JSON.validate_json(response.content) == {
        "error": {
            "code": "validation_failed",
            "message": "people cannot be below 0",
            "details": {"fields": [{"id": "answers", "problem": "people cannot be below 0"}]},
        }
    }


@pytest.mark.integration
def test_invalid_body_encoding_keeps_bad_request_status(api_client: TestClient) -> None:
    response = api_client.put(
        f"/v1/projects/{PROJECT}/observations/{uuid4()}",
        content=b"\xff",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    error = ErrorEnvelope.model_validate_json(response.content).error
    assert error.code == "validation_failed"
    issues = error.details["issues"]
    assert isinstance(issues, list)
    assert issues
    issue = issues[0]
    assert isinstance(issue, dict)
    assert issue["code"] == "invalid_structure"
    assert "\ufffd" not in response.text


@pytest.mark.integration
def test_hidden_site_upload_uses_not_found_without_revealing_membership(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    url = bound_site.url(uuid4())
    missing = api_client.get(url)
    assert missing.status_code == 404
    assert JSON.validate_json(missing.content) == {
        "error": {"code": "not_found", "message": "Observation not found", "details": {}}
    }
    denied = api_client.put(
        url,
        json=observation_payload(site_id=uuid4()),
    )
    assert denied.status_code == 404
    assert ErrorEnvelope.model_validate_json(denied.content).error.code == "not_found"


def test_openapi_preserves_routes_and_declares_error_envelope() -> None:
    with TestClient(create_app()) as client:
        document = JSON.validate_json(client.get("/openapi.json").content)
    assert isinstance(document, dict)
    components = document["components"]
    assert isinstance(components, dict)
    schemas = components["schemas"]
    assert isinstance(schemas, dict)
    assert "ErrorEnvelope" in schemas
    paths = document["paths"]
    assert isinstance(paths, dict)
    assert set(paths) >= {
        "/health",
        "/ready",
        "/v1/me",
        "/v1/projects",
        "/v1/projects/{project_id}/observations/{observation_id}",
        "/v1/projects/{project_id}/packages",
        "/v1/projects/{project_id}/packages/{package_id}",
        "/v1/projects/{project_id}/packages/{package_id}/archive",
    }
    for methods in paths.values():
        assert isinstance(methods, dict)
        for operation in methods.values():
            assert isinstance(operation, dict)
            responses = operation["responses"]
            assert isinstance(responses, dict)
            validation = responses["422"]
            assert isinstance(validation, dict)
            assert validation["content"] == {
                "application/json": {"schema": {"$ref": "#/components/schemas/ErrorEnvelope"}}
            }
