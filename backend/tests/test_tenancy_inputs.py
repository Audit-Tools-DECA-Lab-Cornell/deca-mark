import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Study", "code": "UpperCase"},
        {"name": "Study", "code": "ab"},
        {"name": "Study", "code": "valid-code", "timezone": "Not/A_Zone"},
        {"name": "  ", "code": "valid-code"},
        {"name": "Study", "code": "valid-code", "organization_id": "forged"},
    ],
)
def test_project_input_rejected_before_database(
    validation_client: TestClient, payload: dict[str, JsonValue]
) -> None:
    response = validation_client.post(
        "/v1/orgs/10000000-0000-4000-8000-000000000001/projects", json=payload
    )
    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"token": "one", "code": "two"},
        {"token": ""},
        {"code": None},
    ],
)
def test_invitation_requires_exactly_one_credential(
    validation_client: TestClient, payload: dict[str, JsonValue]
) -> None:
    response = validation_client.post("/v1/invitations/preview", json=payload)
    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/v1/orgs/10000000-0000-4000-8000-000000000001", {"name": None}),
        ("/v1/orgs/10000000-0000-4000-8000-000000000001", {"plan": "enterprise"}),
        ("/v1/projects/10000000-0000-4000-8000-000000000002", {"timezone": None}),
        ("/v1/projects/10000000-0000-4000-8000-000000000002", {"is_training": True}),
    ],
)
def test_patch_rejects_null_required_fields_and_immutable_fields(
    validation_client: TestClient, path: str, payload: dict[str, JsonValue]
) -> None:
    assert validation_client.patch(path, json=payload).status_code == 422
