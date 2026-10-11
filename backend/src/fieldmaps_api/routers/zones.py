from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.repositories import zones as db
from fieldmaps_api.services import zone_discovery, zone_publication, zones
from fieldmaps_api.zone_draft_schemas import DraftCreate, DraftPublish, DraftReplace
from fieldmaps_api.zone_preconditions import zone_etag
from fieldmaps_api.zone_response_schemas import (
    Draft,
    DraftSummary,
    HistoricalZones,
    Publication,
    SiteV2,
    ZoneValidation,
)


@dataclass(frozen=True, slots=True)
class ZoneContext:
    project: UUID
    site: UUID
    user: UUID
    request: Request


def read_router(
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    *,
    enabled: bool,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)
    cache = zone_discovery.LegacyCapabilities()

    @router.get("/v2/projects/{project_id}/sites", operation_id="listSitesV2")
    async def site_list(
        project_id: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> list[SiteV2]:
        return await zone_discovery.list_sites(
            sessions, user, project_id, enabled=enabled, cache=cache
        )

    @router.get(
        "/v1/projects/{project_id}/sites/{site_id}/zones", operation_id="getHistoricalZones"
    )
    async def historical(
        project_id: UUID,
        site_id: UUID,
        user: Annotated[UUID, Depends(authenticate)],
        package_id: UUID | None = None,
    ) -> HistoricalZones:
        async with zones.transaction(sessions, user) as session:
            return await zones.historical(session, project_id, site_id, package_id)

    return router


def create_router(
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    *,
    enabled: bool,
    work: zones.ZoneWork | None = None,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)
    work = work or zones.ZoneWork()
    prefix = "/v1/projects/{project_id}/sites/{site_id}"

    async def manager(
        project_id: UUID,
        site_id: UUID,
        request: Request,
        user: Annotated[UUID, Depends(authenticate)],
    ) -> ZoneContext:
        async with zones.transaction(sessions, user) as session:
            await db.scope(session, project_id, site_id)
        return ZoneContext(project_id, site_id, user, request)

    def precondition(
        request: Request, if_match: Annotated[str | None, Header()] = None
    ) -> str | None:
        return ",".join(request.headers.getlist("if-match")) or if_match

    @router.post(
        prefix + "/zone-drafts",
        status_code=201,
        operation_id="createZoneDraft",
        responses={
            200: {"model": Draft},
            201: {"model": Draft, "headers": {"ETag": {"schema": {"type": "string"}}}},
        },
    )
    async def create(
        payload: DraftCreate,
        response: Response,
        context: Annotated[ZoneContext, Depends(manager)],
    ) -> Draft:
        async with work.slot():
            result, replayed = await zones.create(
                sessions, context.user, context.project, context.site, payload
            )
        response.status_code = 200 if replayed else 201
        context.request.scope["fieldmaps_zone_count"] = len(result.zones)
        response.headers["ETag"] = zone_etag(result.draft_id, result.revision)
        return result

    @router.get(prefix + "/zone-drafts", operation_id="listZoneDrafts")
    async def listing(
        context: Annotated[ZoneContext, Depends(manager)],
        state: Annotated[Literal["draft", "published", "discarded"], Query()] = "draft",
    ) -> list[DraftSummary]:
        async with zones.transaction(sessions, context.user) as session:
            return await zones.listing(session, context.project, context.site, state)

    @router.get(prefix + "/zone-drafts/{draft_id}", operation_id="getZoneDraft")
    async def get(
        draft_id: UUID,
        response: Response,
        context: Annotated[ZoneContext, Depends(manager)],
    ) -> Draft:
        async with zones.transaction(sessions, context.user) as session:
            result = await zones.get(session, context.project, context.site, draft_id)
        response.headers["ETag"] = zone_etag(result.draft_id, result.revision)
        return result

    @router.put(prefix + "/zone-drafts/{draft_id}", operation_id="replaceZoneDraft")
    async def replace(
        draft_id: UUID,
        payload: DraftReplace,
        response: Response,
        context: Annotated[ZoneContext, Depends(manager)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> Draft:
        etag = if_match
        async with zones.transaction(sessions, context.user) as session:
            result = await zones.change(
                session,
                zones.DraftReference(context.project, context.site, draft_id, etag),
                payload,
            )
        response.headers["ETag"] = zone_etag(result.draft_id, result.revision)
        return result

    @router.delete(
        prefix + "/zone-drafts/{draft_id}", status_code=204, operation_id="discardZoneDraft"
    )
    async def discard(
        draft_id: UUID,
        context: Annotated[ZoneContext, Depends(manager)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> Response:
        etag = if_match
        async with zones.transaction(sessions, context.user) as session:
            result = await zones.change(
                session, zones.DraftReference(context.project, context.site, draft_id, etag), None
            )
        return Response(
            status_code=204, headers={"ETag": zone_etag(result.draft_id, result.revision)}
        )

    @router.post(
        prefix + "/zone-drafts/{draft_id}/validate",
        operation_id="validateZoneDraft",
    )
    async def validate(
        draft_id: UUID,
        context: Annotated[ZoneContext, Depends(manager)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> ZoneValidation:
        etag = if_match
        async with work.slot(), zones.transaction(sessions, context.user) as session:
            result = await zones.validate(
                session, zones.DraftReference(context.project, context.site, draft_id, etag)
            )
        context.request.scope["fieldmaps_zone_count"] = len(result.zones)
        return ZoneValidation.model_validate(result.model_dump())

    @router.post(
        prefix + "/zone-drafts/{draft_id}/publish",
        status_code=201,
        operation_id="publishZoneDraft",
        responses={200: {"model": Publication}},
    )
    async def publish(
        draft_id: UUID,
        payload: DraftPublish,
        response: Response,
        context: Annotated[ZoneContext, Depends(manager)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> Publication:
        etag = if_match
        async with work.slot():
            result, replayed = await zone_publication.publish(
                sessions,
                context.user,
                zones.DraftReference(context.project, context.site, draft_id, etag),
                payload,
                enabled=enabled,
            )
        response.status_code = 200 if replayed else 201
        context.request.scope["fieldmaps_zone_archive_bytes"] = result.package.archive_bytes
        return result

    router.include_router(read_router(sessions, authenticate, enabled=enabled))

    return router
