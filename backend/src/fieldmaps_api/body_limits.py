"""Bound ASGI request bytes before FastAPI parses JSON, including chunked bodies."""

import re
from typing import ClassVar, Final, Literal

from pydantic import BaseModel, ConfigDict
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from fieldmaps_api.errors import ErrorDetail, ErrorEnvelope, zone_request
from fieldmaps_api.zone_upload_json import valid_upload_json

KIB: Final = 1024
MIB: Final = 1024 * KIB


class BodyFrame(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    type: Literal["http.request", "http.disconnect"]
    body: bytes = b""
    more_body: bool = False


def body_limit(method: str, path: str) -> int:
    path = path.rstrip("/")
    if method == "PUT" and re.fullmatch(r"/v1/projects/[^/]+/sites/[^/]+/zone-drafts/[^/]+", path):
        return 4 * MIB
    if method == "POST" and re.fullmatch(r"/v1/projects/[^/]+/packages(/import)?", path):
        return 24 * MIB
    # A form definition with many questions, options and protocol notes outgrows the default.
    if method in {"POST", "PUT"} and re.fullmatch(
        r"/v1/projects/[^/]+/(forms(/[^/]+/versions)?|form-versions/[^/]+)", path
    ):
        return MIB
    return 256 * KIB


class BodySizeMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app: ASGIApp = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        new_zone_request = zone_request(request.url.path)
        if (
            new_zone_request
            and request.headers.get("content-encoding", "identity").lower() != "identity"
        ):
            envelope = ErrorEnvelope(
                error=ErrorDetail(
                    code="validation_failed",
                    message="Encoded zone request bodies are unsupported",
                    details={
                        "issues": [
                            {
                                "code": "invalid_structure",
                                "zone_ids": [],
                                "path": "",
                                "message": "Send an uncompressed JSON request body",
                            }
                        ]
                    },
                )
            )
            await JSONResponse(envelope.model_dump(mode="json"), status_code=422)(
                scope, receive, send
            )
            return
        limit = body_limit(request.method, request.url.path)
        buffer = bytearray()
        while True:
            message = BodyFrame.model_validate(await receive())
            if message.type == "http.disconnect":
                return
            if len(buffer) + len(message.body) > limit:
                envelope = ErrorEnvelope(
                    error=ErrorDetail(
                        code="payload_too_large" if new_zone_request else "validation_failed",
                        message="Request body exceeds the size limit",
                        details={
                            "fields": [
                                {"id": "body", "problem": "Request body exceeds the size limit"}
                            ]
                        },
                    )
                )
                await JSONResponse(envelope.model_dump(mode="json"), status_code=413)(
                    scope, receive, send
                )
                return
            buffer.extend(message.body)
            if not message.more_body:
                break
        body = bytes(buffer)
        if (
            request.method == "PUT"
            and re.fullmatch(
                r"/v1/projects/[^/]+/observations/[^/]+", request.url.path.rstrip("/")
            )
            and not valid_upload_json(body)
        ):
            envelope = ErrorEnvelope(
                error=ErrorDetail(
                    code="validation_failed",
                    message="Send valid UTF-8 JSON with unique object keys",
                    details={
                        "issues": [
                            {
                                "code": "invalid_structure",
                                "zone_ids": [],
                                "path": "",
                                "message": "Send valid UTF-8 JSON with unique object keys",
                            }
                        ]
                    },
                )
            )
            await JSONResponse(envelope.model_dump(mode="json"), status_code=422)(
                scope, receive, send
            )
            return
        delivered = False

        async def replay() -> Message:
            nonlocal delivered
            if delivered:
                return await receive()
            delivered = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)
