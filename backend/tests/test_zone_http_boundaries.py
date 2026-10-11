import json
from uuid import UUID, uuid4

import anyio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError
from starlette.types import Message, Receive, Scope, Send

from fieldmaps_api.body_limits import MIB, BodySizeMiddleware, body_limit
from fieldmaps_api.database_errors import database_error
from fieldmaps_api.errors import DomainError, register_error_handlers, zone_request
from fieldmaps_api.rate_limits import ZONE_PUBLICATION, ZONE_VALIDATION, policy_for
from fieldmaps_api.zone_draft_schemas import DraftPublish, DraftReplace
from fieldmaps_api.zone_error_details import SafeZoneIssue
from fieldmaps_api.zone_preconditions import assert_zone_etag, require_zone_etag, zone_etag

DRAFT = UUID("10000000-0000-4000-8000-000000000001")
PATH = f"/v1/projects/{uuid4()}/sites/{uuid4()}/zone-drafts/{DRAFT}"


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "*",
        'W/"zone-draft:abc:1"',
        f'"zone-draft:{DRAFT}:0"',
        f'"zone-draft:{DRAFT}:01"',
        f'"zone-draft:{DRAFT}:1", "zone-draft:{DRAFT}:2"',
    ],
)
def test_strong_etag_rejects_invalid_preconditions(value: str | None) -> None:
    with pytest.raises(DomainError) as failure:
        require_zone_etag(value)
    assert (failure.value.code, failure.value.status) == ("precondition_required", 428)


def test_strong_etag_matches_and_preserves_authorized_current_details() -> None:
    assert require_zone_etag(zone_etag(DRAFT, 2)) == (DRAFT, 2)
    with pytest.raises(DomainError) as failure:
        assert_zone_etag(zone_etag(uuid4(), 2), DRAFT, 3)
    assert failure.value.status == 412
    assert failure.value.details == {
        "draft_id": str(DRAFT),
        "revision": 3,
        "etag": zone_etag(DRAFT, 3),
    }


@pytest.mark.parametrize("revision", ["9223372036854775808", "9" * 5000])
def test_syntactically_valid_impossible_revision_is_stale(revision: str) -> None:
    with pytest.raises(DomainError) as failure:
        require_zone_etag(f'"zone-draft:{DRAFT}:{revision}"')
    assert failure.value.status == 412


class DriverFailureError(Exception):
    def __init__(self, state: str, detail: str | None) -> None:
        super().__init__("private SQL shape and answers")
        self.sqlstate: str = state
        self.detail: str | None = detail


@pytest.mark.parametrize(
    ("state", "status", "code"),
    [
        ("ZB001", 422, "validation_failed"),
        ("ZB002", 412, "revision_conflict"),
        ("ZB003", 409, "publication_conflict"),
        ("ZB004", 409, "idempotency_conflict"),
        ("ZB006", 428, "precondition_required"),
    ],
)
def test_zone_sqlstates(state: str, status: int, code: str) -> None:
    failure = database_error(DBAPIError("private SQL", {}, DriverFailureError(state, None)))
    assert (failure.status, failure.code) == (status, code)
    assert "private" not in failure.message


def test_sql_details_allowlist_and_driver_cause() -> None:
    raw = DriverFailureError(
        "ZB001",
        json.dumps(
            {
                "issues": [
                    {
                        "code": "outside_site",
                        "zone_ids": [str(DRAFT)],
                        "path": "/zones/0/geometry",
                        "message": "private coords",
                    }
                ],
                "sql": "private SQL",
            }
        ),
    )
    adapter = DriverFailureError("ZB001", None)
    adapter.__cause__ = raw
    failure = database_error(DBAPIError("private", {}, adapter))
    assert failure.details == {
        "issues": [
            {
                "code": "outside_site",
                "zone_ids": [str(DRAFT)],
                "path": "/zones/0/geometry",
                "message": "Outside site",
            }
        ]
    }
    conflict = database_error(
        DBAPIError(
            "private",
            {},
            DriverFailureError(
                "ZB003",
                json.dumps(
                    {"current_package_id": str(DRAFT), "geometry": "private", "etag": "private"}
                ),
            ),
        )
    )
    assert conflict.details == {"current_package_id": str(DRAFT)}


@pytest.mark.parametrize(
    "detail",
    [
        "private text",
        '{"issues":[{"code":"private"}]}',
        '{"issues":[{"code":"outside_site","path":"/bad~2"}]}',
    ],
)
def test_malformed_details_never_escape(detail: str) -> None:
    failure = database_error(DBAPIError("private", {}, DriverFailureError("ZB001", detail)))
    assert failure.details == {}


def test_missing_expected_current_only_is_428_and_invalid_values_are_422() -> None:
    app = FastAPI()
    register_error_handlers(app)

    @app.post(PATH + "/publish")
    async def publish(body: DraftPublish) -> str:
        return str(body.request_id)

    with TestClient(app) as client:
        response = client.post(PATH + "/publish", json={"request_id": str(uuid4())})
        assert response.status_code == 428
        for value in (None, "malformed"):
            response = client.post(
                PATH + "/publish",
                json={"request_id": str(uuid4()), "expected_current_package_id": value},
            )
            assert response.status_code == 422
            assert (
                response.json()["error"]["details"]["issues"][0]["path"]
                == "/expected_current_package_id"
            )
            assert "malformed" not in response.text


def test_zone_structure_error_is_pointer_without_input_or_union_tags() -> None:
    app = FastAPI()
    register_error_handlers(app)

    @app.put(PATH)
    async def replace(body: DraftReplace) -> int:
        return len(body.zones)

    with TestClient(app) as client:
        response = client.put(
            PATH,
            json={
                "zones": [
                    {
                        "zone_id": str(DRAFT),
                        "zone_code": "a",
                        "zone_label": "A",
                        "geometry": {"type": "Polygon", "coordinates": "private"},
                    }
                ],
                "change_note": "",
            },
        )
    assert response.status_code == 422
    issue = SafeZoneIssue.model_validate(response.json()["error"]["details"]["issues"][0])
    assert issue.path == "/zones/0/geometry/coordinates"
    assert issue.code == "invalid_structure"
    assert issue.zone_ids == []
    assert "private" not in response.text


def test_invalid_json_uses_body_pointer_without_parser_input() -> None:
    app = FastAPI()
    register_error_handlers(app)

    @app.put(PATH)
    async def replace(body: DraftReplace) -> int:
        return len(body.zones)

    with TestClient(app) as client:
        response = client.put(
            PATH, content=b'{"private parser input', headers={"Content-Type": "application/json"}
        )
    assert response.status_code == 422
    issue = SafeZoneIssue.model_validate(response.json()["error"]["details"]["issues"][0])
    assert issue.path == ""
    assert "private" not in response.text


def test_streamed_zone_body_limit_uses_actual_bytes() -> None:
    entered = False
    sent: list[Message] = []
    messages: list[Message] = [
        {"type": "http.request", "body": b"a" * (4 * MIB), "more_body": True},
        {"type": "http.request", "body": b"b", "more_body": False},
    ]

    async def app(_scope: Scope, _receive: Receive, _send: Send) -> None:
        nonlocal entered
        entered = True

    async def receive() -> Message:
        return messages.pop(0)

    async def send(message: Message) -> None:
        sent.append(message)

    scope: Scope = {
        "type": "http",
        "method": "PUT",
        "path": PATH,
        "headers": [(b"content-length", b"1")],
    }
    anyio.run(BodySizeMiddleware(app), scope, receive, send)
    assert not entered
    assert sent[0]["status"] == 413
    assert b"payload_too_large" in sent[1]["body"]
    assert body_limit("PUT", PATH) == 4 * MIB


def test_zone_encoding_is_rejected_without_reading_body() -> None:
    app = FastAPI()
    app.add_middleware(BodySizeMiddleware)
    with TestClient(app) as client:
        response = client.put(
            PATH, content=b"private compressed data", headers={"Content-Encoding": "gzip"}
        )
    assert response.status_code == 422
    assert "private" not in response.text


def test_zone_publication_rates_share_scopes_but_conversion_is_unchanged() -> None:
    assert policy_for("POST", PATH + "/validate") == ZONE_VALIDATION
    assert policy_for("POST", PATH + "/publish") == ZONE_PUBLICATION
    assert policy_for("POST", "/v1/projects/other/packages") == ZONE_PUBLICATION
    assert policy_for("POST", "/v1/projects/other/packages/import") is None


def test_zone_boundaries_match_only_canonical_nested_resources() -> None:
    assert zone_request(PATH)
    assert zone_request(PATH.rsplit("/", 1)[0])
    assert zone_request(PATH + "/validate")
    assert zone_request(PATH + "/publish")
    obsolete_path = f"/v1/projects/{uuid4()}/zone-drafts/{DRAFT}"
    assert not zone_request(obsolete_path)
    assert body_limit("PUT", obsolete_path) < body_limit("PUT", PATH)
    assert policy_for("POST", obsolete_path + "/validate") is None
    assert policy_for("POST", obsolete_path + "/publish") is None
    assert not zone_request(PATH + "/unexpected")
