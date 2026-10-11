import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from fieldmaps_api.body_limits import BodySizeMiddleware
from fieldmaps_api.errors import ErrorEnvelope, register_error_handlers
from fieldmaps_api.zone_error_details import SafeZoneIssue
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload

PATH = (
    "/v2/projects/50000000-0000-4000-8000-000000000001"
    "/observations/40000000-0000-4000-8000-000000000001"
)


def boundary_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(BodySizeMiddleware)
    register_error_handlers(app)

    @app.put(PATH)
    @app.put(PATH.replace("/v2/", "/v1/"))
    async def upload() -> str:
        return "accepted"

    return app


@pytest.mark.parametrize(
    "body",
    [
        b'{"schema_version":2,"schema_version":2}',
        b'{"answers":{"people":1,"people":2}}',
        b'{"answers":{"people":1,"\\u0070eople":2}}',
        b'{"answers":{"nested":[{"people":1,"people":2}]}}',
        b'{"observer":"\\ud800"}',
        b'{"answers":{"\\udc00":"invalid"}}',
        b'{"answers":{"choices":["\\ud800"]}}',
        b'{"observer":"\xff"}',
        b'{"answers":{"people":NaN}}',
        b'{"answers":{"people":Infinity}}',
        b'{"answers":{"people":' + b"9" * 5000 + b"}}",
        b'{"unterminated":',
        b"[" * 300 + b"1" + b"]" * 300,
    ],
)
def test_ambiguous_or_invalid_json_is_rejected_without_echoing_body(body: bytes) -> None:
    with TestClient(boundary_app()) as client:
        response = client.put(PATH, content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_failed"
    assert response.json()["error"]["details"]["issues"][0]["code"] == "invalid_structure"
    assert "people" not in response.text


def test_unicode_surrogate_pair_and_valid_json_pass() -> None:
    with TestClient(boundary_app()) as client:
        response = client.put(PATH, content=b'{"answers":{"label":"\\ud83d\\ude00"}}')
    assert response.status_code == 200


def test_v1_duplicate_key_behavior_is_unchanged() -> None:
    with TestClient(boundary_app()) as client:
        response = client.put(PATH.replace("/v2/", "/v1/"), content=b'{"answer":1,"answer":2}')
    assert response.status_code == 200


def test_v2_encoded_request_is_rejected() -> None:
    with TestClient(boundary_app()) as client:
        response = client.put(PATH, content=b"{}", headers={"Content-Encoding": "gzip"})
    assert response.status_code == 422


def test_v2_request_size_is_bounded_before_json_parsing() -> None:
    with TestClient(boundary_app()) as client:
        response = client.put(PATH, content=b"x" * (256 * 1024 + 1))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


@pytest.mark.parametrize(
    ("field", "value", "pointer"),
    [
        ("first_round", 1, "/first_round"),
        ("answers", {"Polygon/a~": False}, "/answers/Polygon~1a~0"),
        ("observed_at", "0001-01-01T00:00:00+01:00", "/observed_at"),
        ("observed_at", "9999-12-31T23:59:59-01:00", "/observed_at"),
    ],
)
def test_validation_pointers_reference_the_submitted_body(
    field: str, value: int | str | dict[str, bool], pointer: str
) -> None:
    app = boundary_app()

    @app.post(PATH)
    async def upload(payload: BoundObservationUpload) -> str:
        return payload.observer

    body = {
        "schema_version": 2,
        "site_id": "10000000-0000-4000-8000-000000000001",
        "package_id": "20000000-0000-4000-8000-000000000007",
        "zone_id": "30000000-0000-4000-8000-000000000001",
        "form_version": "shell-v1",
        "round_type": "standard",
        "first_round": True,
        "placement": "hand",
        "coordinates": [-76.48, 42.44],
        "observer": "AB",
        "observed_at": "2026-10-10T14:00:00Z",
        "answers": {},
    } | {field: value}
    with TestClient(app) as client:
        response = client.post(PATH, json=body)
    assert response.status_code == 422
    envelope = ErrorEnvelope.model_validate_json(response.content)
    issues = TypeAdapter[list[SafeZoneIssue]](list[SafeZoneIssue]).validate_python(
        envelope.error.details["issues"]
    )
    assert all(issue.path == pointer for issue in issues)
