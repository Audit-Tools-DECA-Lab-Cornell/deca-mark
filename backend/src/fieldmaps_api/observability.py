import logging
import os
import re
from contextvars import ContextVar
from http import HTTPStatus
from time import monotonic
from typing import Final, override
from uuid import UUID, uuid4

import orjson
import sentry_sdk
from pydantic import BaseModel, Field
from sentry_sdk.types import Event, Hint
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from fieldmaps_api.zone_diagnostics import metadata

REQUEST_ID: Final = ContextVar("request_id", default="")
LOGGER: Final = logging.getLogger("fieldmaps.requests")
VALID_ID: Final = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
#: How far down a chain of causes a log line follows.
CAUSE_DEPTH: Final = 8


class ExceptionType(BaseModel):
    type: str = "Exception"


class ExceptionTypes(BaseModel):
    values: list[ExceptionType] = Field(default_factory=list[ExceptionType])


class DeletionUser(BaseModel):
    id: UUID


def scrub_event(event: Event, _hint: Hint) -> Event:
    """Allow only diagnostic metadata; discard SQL, locals, requests and breadcrumbs."""
    if event.get("message") == "Account deletion pending":
        user = DeletionUser.model_validate(event.get("user", {}))
        return {
            "message": "Account deletion pending",
            "level": "error",
            "user": {"id": str(user.id)},
        }
    kinds = ExceptionTypes.model_validate(event.get("exception", {}))
    return {
        "exception": {"values": [{"type": kind.type} for kind in kinds.values]},
        "event_id": event.get("event_id", uuid4().hex),
        "level": "error",
        "platform": "python",
        "message": "Unhandled API failure",
        "tags": {"request_id": REQUEST_ID.get()},
    }


def exception_types(error: BaseException | None) -> list[str]:
    """Name the class of an exception and of each one behind it, outermost first; never text."""
    kinds: list[str] = []
    seen: set[int] = set()
    while error is not None and id(error) not in seen and len(kinds) < CAUSE_DEPTH:
        seen.add(id(error))
        kinds.append(f"{type(error).__module__}.{type(error).__qualname__}")
        error = error.__cause__ or error.__context__
    return kinds


class SafeServerFormatter(logging.Formatter):
    @override
    def format(self, record: logging.LogRecord) -> str:
        line: dict[str, object] = {
            "event": "server_log",
            "level": record.levelname,
            "logger": record.name,
        }
        if record.exc_info and record.exc_info[1] is not None:
            line["exception"] = exception_types(record.exc_info[1])
        return orjson.dumps(line).decode()


def log_startup_failure(error: BaseException) -> None:
    """Say why the API could not start: before any request there is no request data to leak."""
    LOGGER.error(
        orjson.dumps(
            {
                "event": "startup_failed",
                "exception": exception_types(error),
                "detail": str(error)[:300],
            }
        ).decode()
    )


def configure_observability() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    LOGGER.handlers = [handler]
    LOGGER.setLevel(logging.INFO)
    LOGGER.propagate = False
    logging.getLogger("uvicorn.access").disabled = True
    server_handler = logging.StreamHandler()
    server_handler.setFormatter(SafeServerFormatter())
    server_logger = logging.getLogger("uvicorn.error")
    server_logger.handlers = [server_handler]
    server_logger.propagate = False
    # Default integrations may capture request bodies, SQL parameters or exception locals.
    if dsn := os.environ.get("SENTRY_DSN"):
        sentry_sdk.init(
            dsn=dsn,
            default_integrations=False,
            auto_enabling_integrations=False,
            send_default_pii=False,
            include_local_variables=False,
            before_send=scrub_event,
        )


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app: ASGIApp = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        candidate = MutableHeaders(scope=scope).get("x-request-id", "")
        request_id = candidate if VALID_ID.fullmatch(candidate) else uuid4().hex
        scope["fieldmaps_request_id"] = request_id
        token = REQUEST_ID.set(request_id)
        started = monotonic()

        async def send_response(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-Id"] = request_id
                diagnostic = metadata(scope)
                healthy_probe = (
                    diagnostic.get("operation") in {"health", "ready"}
                    and message["status"] == HTTPStatus.OK
                )
                # No raw URLs: invitation codes and query strings can be credentials.
                # Render and container probes are frequent; keep failed probes visible.
                log_response = LOGGER.debug if healthy_probe else LOGGER.info
                log_response(
                    orjson.dumps(
                        {
                            "event": "http_response",
                            "request_id": request_id,
                            "method": scope["method"],
                            "status": message["status"],
                            "duration_ms": round((monotonic() - started) * 1000),
                            **diagnostic,
                        }
                    ).decode()
                )
            await send(message)

        try:
            await self.app(scope, receive, send_response)
        finally:
            REQUEST_ID.reset(token)
