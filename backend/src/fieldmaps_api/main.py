from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import ClassVar, Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from jwt import PyJWKClient
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.middleware.errors import ServerErrorMiddleware

from fieldmaps_api import readiness
from fieldmaps_api.auth import JwksVerifier, TokenVerifier, UnconfiguredVerifier
from fieldmaps_api.body_limits import BodySizeMiddleware
from fieldmaps_api.config import Settings, read_local_settings
from fieldmaps_api.database import database_connection
from fieldmaps_api.deps import Authentication
from fieldmaps_api.errors import ERROR_RESPONSES, error_response, register_error_handlers
from fieldmaps_api.observability import (
    RequestIdMiddleware,
    configure_observability,
    log_startup_failure,
)
from fieldmaps_api.routers import (
    collection,
    forms,
    identity,
    observation_analysis,
    sites,
    tenancy,
    zones,
)
from fieldmaps_api.services.zones import ZoneWork


class HealthResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    status: Literal["running"] = "running"


def create_app(
    settings: Settings | None = None,
    verifier: TokenVerifier | None = None,
) -> FastAPI:
    configuration = settings or Settings()
    connection = database_connection(configuration)
    engine = create_async_engine(
        connection.url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=0,
        connect_args={"ssl": connection.ssl} if connection.ssl is not None else {},
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    jwks = (
        PyJWKClient(str(configuration.jwks_url), timeout=5, lifespan=300)
        if configuration.jwks_url
        else None
    )
    if verifier is None:
        if configuration.issuer is not None and jwks is not None:
            verifier = JwksVerifier(
                str(configuration.issuer).rstrip("/"),
                configuration.audience,
                jwks,
            )
        else:
            verifier = UnconfiguredVerifier()
    authenticate = Authentication(verifier)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
        try:
            try:
                # Inside the guard: a malformed SENTRY_DSN fails here, after the log handlers exist.
                configure_observability()
                await readiness.assert_safe_role(engine)
            except Exception as error:
                log_startup_failure(error)
                raise
            yield
        finally:
            await engine.dispose()

    app = FastAPI(title="DECA Mark API", version="0.1.0", lifespan=lifespan)
    # Handle unexpected failures inside CORS and request-id middleware, so browsers can read
    # the sanitized error and its request ID instead of seeing an opaque network failure.
    app.add_middleware(ServerErrorMiddleware, handler=error_response)
    app.add_middleware(BodySizeMiddleware)
    # The management application runs on its own origin and sends an Authorization header, so
    # every call it makes is preflighted. Named origins only: a wildcard here would let any page
    # a manager has open spend their token.
    if configuration.allowed_origins or configuration.browser_origin_pattern:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=configuration.allowed_origins,
            allow_origin_regex=configuration.browser_origin_pattern,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["authorization", "content-type", "x-request-id", "if-match"],
            expose_headers=["etag", "Retry-After", "X-Request-Id"],
            max_age=600,
        )

    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)

    @app.get(
        "/health",
        operation_id="health",
        responses=ERROR_RESPONSES,
    )
    async def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/ready", operation_id="ready", responses=ERROR_RESPONSES)
    async def ready() -> readiness.ReadyResponse:
        return await readiness.check_ready(engine, jwks)

    app.include_router(tenancy.create_router(sessions, authenticate))
    app.include_router(identity.create_router(sessions, authenticate, configuration))
    app.include_router(observation_analysis.create_router(sessions, authenticate))
    app.include_router(collection.create_router(sessions, authenticate))
    zone_work = ZoneWork()
    app.include_router(
        sites.create_router(
            sessions,
            authenticate,
            work=zone_work,
        )
    )
    app.include_router(
        zones.create_router(sessions, authenticate, work=zone_work)
    )
    app.include_router(forms.create_router(sessions, authenticate))
    return app


def create_app_from_config() -> FastAPI:
    return create_app(read_local_settings())
