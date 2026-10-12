from typing import Annotated
from uuid import UUID, uuid4

import anyio
import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import HttpUrl
from starlette.types import Message, Receive, Scope, Send

import fieldmaps_api.body_limits as body_limits_module
from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.body_limits import KIB, MIB, BodySizeMiddleware, body_limit
from fieldmaps_api.config import Settings
from fieldmaps_api.deps import Authentication
from fieldmaps_api.errors import register_error_handlers
from fieldmaps_api.main import create_app
from fieldmaps_api.rate_limits import (
    DELETION,
    INVITATIONS,
    ORGANIZATIONS,
    REDEMPTION,
    RateLimiter,
    RateLimitError,
    policy_for,
)
from tests.signing import ISSUER, Signer


@pytest.mark.parametrize(
    ("method", "path", "limit"),
    [
        ("POST", "/v1/projects/project/packages", 24 * MIB),
        ("POST", "/v1/projects/project/packages/import", 24 * MIB),
        ("POST", "/v1/projects/project/packages/import/other", 256 * KIB),
        ("PUT", "/v1/projects/project/observations/id", 256 * KIB),
        ("PUT", "/v1/projects/project/sites/site/zone-drafts/draft", 4 * MIB),
        ("POST", "/v1/invitations/preview", 256 * KIB),
    ],
)
def test_limit_depends_on_exact_endpoint(method: str, path: str, limit: int) -> None:
    assert body_limit(method, path) == limit


def test_size_rejection_precedes_json_validation() -> None:
    app = FastAPI()
    app.add_middleware(BodySizeMiddleware)

    @app.post("/body")
    async def body(request: Request) -> int:
        return len(await request.body())

    with TestClient(app) as client:
        assert client.post("/body", content=b"x" * (256 * KIB)).json() == 256 * KIB
        response = client.post("/body", content=b"{" * (256 * KIB + 1))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "validation_failed"


def test_managed_package_oversize_uses_zone_error_code(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.add_middleware(BodySizeMiddleware)

    @app.post("/v1/projects/{project_id}/packages")
    async def package(project_id: str, request: Request) -> int:
        return len(await request.body()) + len(project_id)

    def small_body_limit(_method: str, _path: str) -> int:
        return 1

    monkeypatch.setattr(body_limits_module, "body_limit", small_body_limit)
    with TestClient(app) as client:
        response = client.post("/v1/projects/project/packages", content=b"{}")
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_chunked_body_cannot_bypass_limit_with_false_content_length() -> None:
    entered = False
    sent: list[Message] = []
    messages: list[Message] = [
        {"type": "http.request", "body": b"a" * (256 * KIB), "more_body": True},
        {"type": "http.request", "body": b"b", "more_body": False},
    ]

    async def downstream(_scope: Scope, _receive: Receive, _send: Send) -> None:
        nonlocal entered
        entered = True

    async def receive() -> Message:
        return messages.pop(0)

    async def send(message: Message) -> None:
        sent.append(message)

    scope: Scope = {
        "type": "http",
        "method": "POST",
        "path": "/v1/orgs",
        "headers": [(b"content-length", b"1")],
    }
    anyio.run(BodySizeMiddleware(downstream), scope, receive, send)
    assert not entered
    assert sent[0]["status"] == 413


def test_app_size_error_keeps_cors_and_request_id() -> None:
    origin = "https://manager.invalid"
    with TestClient(create_app(Settings(browser_origins=(HttpUrl(origin),)))) as client:
        response = client.post(
            "/v1/orgs",
            content=b"{" * (256 * KIB + 1),
            headers={"Origin": origin, "X-Request-Id": "size-check"},
        )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["x-request-id"] == "size-check"


def test_token_bucket_refills_and_isolates_users() -> None:
    now = [0.0]
    limiter = RateLimiter(lambda: now[0])
    user = uuid4()
    for _ in range(5):
        limiter.consume(user, ORGANIZATIONS)
    with pytest.raises(RateLimitError) as failure:
        limiter.consume(user, ORGANIZATIONS)
    assert failure.value.retry_after == 720
    limiter.consume(uuid4(), ORGANIZATIONS)
    now[0] = 719.0
    with pytest.raises(RateLimitError):
        limiter.consume(user, ORGANIZATIONS)
    now[0] = 720.0
    limiter.consume(user, ORGANIZATIONS)


def test_mutation_policies_share_budgets_across_scopes() -> None:
    assert policy_for("POST", "/v1/orgs") == ORGANIZATIONS
    assert policy_for("DELETE", "/v1/me") == DELETION
    assert policy_for("POST", "/v1/orgs/a/invitations") == INVITATIONS
    assert policy_for("POST", "/v1/projects/b/invitations") == INVITATIONS
    assert policy_for("POST", "/v1/invitations/preview/") == REDEMPTION
    assert policy_for("POST", "/v1/invitations/redeem") == REDEMPTION
    assert policy_for("GET", "/v1/orgs") is None
    assert policy_for("DELETE", "/v1/orgs/a/invitations/id") is None


def test_preview_and_redemption_share_verified_user_budget(signer: Signer) -> None:
    app = FastAPI()
    register_error_handlers(app)
    authenticate = Authentication(JwksVerifier(ISSUER, "authenticated", signer))

    @app.post("/v1/invitations/preview")
    @app.post("/v1/invitations/redeem")
    async def invitation(user: Annotated[UUID, Depends(authenticate)]) -> str:
        return str(user)

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {signer.issue()}"}
        for index in range(10):
            path = "preview" if index % 2 else "redeem"
            assert client.post(f"/v1/invitations/{path}", headers=headers).status_code == 200
        response = client.post("/v1/invitations/preview", headers=headers)
        assert response.status_code == 429
        assert response.json()["error"]["code"] == "rate_limited"
        assert 1 <= int(response.headers["retry-after"]) <= 60
        other = {"Authorization": f"Bearer {signer.issue(uuid4())}"}
        assert client.post("/v1/invitations/preview", headers=other).status_code == 200
