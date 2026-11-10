"""Authenticated manager routes for unfinished map setup."""

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.map_setup_schemas import (
    MapSetup,
    MapSetupCandidate,
    MapSetupImport,
    MapSetupPublish,
    MapSetupReplace,
    MapSetupSources,
    MapSetupSummary,
)
from fieldmaps_api.repositories import map_setups as db
from fieldmaps_api.repositories import zones as zone_db
from fieldmaps_api.services import map_setup_publication, map_setups, zones
from fieldmaps_api.zone_response_schemas import ImportValidation, Publication


def create_router(  # noqa: C901 - explicit route registration with bounded lifecycle handlers
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    *,
    work: zones.ZoneWork,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)
    prefix = "/v1/projects/{project_id}/sites/{site_id}/map-setups"

    @router.get(prefix, operation_id="listMapSetups")
    async def listing(
        project_id: UUID, site_id: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> list[MapSetupSummary]:
        async with zones.transaction(sessions, user) as session:
            return await db.listing(session, project_id, site_id)

    @router.get(prefix + "/{setup_id}", operation_id="getMapSetup")
    async def get(
        project_id: UUID,
        site_id: UUID,
        setup_id: UUID,
        user: Annotated[UUID, Depends(authenticate)],
        response: Response,
    ) -> MapSetup:
        async with zones.transaction(sessions, user) as session:
            result = (await db.get(session, project_id, site_id, setup_id)).setup
        response.headers["ETag"] = map_setups.etag(result)
        return result

    @router.post(
        prefix + "/import",
        operation_id="importMapSetup",
        status_code=201,
        responses={
            200: {"model": MapSetup, "headers": {"ETag": {"schema": {"type": "string"}}}},
            201: {"model": MapSetup, "headers": {"ETag": {"schema": {"type": "string"}}}},
        },
    )
    async def create(
        project_id: UUID,
        site_id: UUID,
        payload: MapSetupImport,
        user: Annotated[UUID, Depends(authenticate)],
        response: Response,
    ) -> MapSetup:
        async with zones.transaction(sessions, user) as session:
            previous = await db.replay(
                session,
                project_id,
                site_id,
                payload.request_id,
                "import",
                map_setups.fingerprint(payload.model_dump_json().encode()),
            )
        if previous is not None:
            response.status_code = 200
            response.headers["ETag"] = map_setups.etag(previous)
            return previous
        async with work.slot():
            result, replayed = await map_setups.create(
                sessions, user, project_id, site_id, payload
            )
        response.status_code = 200 if replayed else 201
        response.headers["ETag"] = map_setups.etag(result)
        return result

    @router.put(prefix + "/{setup_id}", operation_id="replaceMapSetup")
    async def replace(  # noqa: PLR0913, PLR0917 - explicit authenticated request boundary
        project_id: UUID,
        site_id: UUID,
        setup_id: UUID,
        payload: MapSetupReplace,
        user: Annotated[UUID, Depends(authenticate)],
        response: Response,
        if_match: Annotated[str | None, Header()] = None,
    ) -> MapSetup:
        async with zones.transaction(sessions, user) as session:
            result = await map_setups.replace(
                session, project_id, site_id, setup_id, if_match, payload
            )
        response.headers["ETag"] = map_setups.etag(result)
        return result

    @router.post(prefix + "/{setup_id}/sources", operation_id="updateMapSetupSources")
    async def sources(  # noqa: PLR0913, PLR0917 - explicit authenticated request boundary
        project_id: UUID,
        site_id: UUID,
        setup_id: UUID,
        payload: MapSetupSources,
        user: Annotated[UUID, Depends(authenticate)],
        response: Response,
        if_match: Annotated[str | None, Header()] = None,
    ) -> MapSetupCandidate | MapSetup:
        async with work.slot():
            result = await map_setups.update_sources(
                sessions, user, project_id, site_id, setup_id, if_match, payload
            )
        if isinstance(result, MapSetup):
            response.headers["ETag"] = map_setups.etag(result)
        return result

    @router.post(prefix + "/{setup_id}/validate", operation_id="validateMapSetup")
    async def validate(
        project_id: UUID,
        site_id: UUID,
        setup_id: UUID,
        user: Annotated[UUID, Depends(authenticate)],
        if_match: Annotated[str | None, Header()] = None,
    ) -> ImportValidation:
        async with work.slot(), zones.transaction(sessions, user) as session:
            _, result = await map_setup_publication.validate(
                session, zones.DraftReference(project_id, site_id, setup_id, if_match), uuid4()
            )
        return result

    @router.post(
        prefix + "/{setup_id}/publish",
        operation_id="publishMapSetup",
        status_code=201,
        responses={
            200: {"model": Publication},
            201: {"model": Publication},
        },
    )
    async def publish(  # noqa: PLR0913, PLR0917 - explicit authenticated request boundary
        project_id: UUID,
        site_id: UUID,
        setup_id: UUID,
        payload: MapSetupPublish,
        user: Annotated[UUID, Depends(authenticate)],
        response: Response,
        if_match: Annotated[str | None, Header()] = None,
    ) -> Publication:
        async with work.slot():
            result = await map_setup_publication.publish(
                sessions,
                user,
                zones.DraftReference(project_id, site_id, setup_id, if_match),
                payload,
            )
        response.status_code = 200 if result.replayed else 201
        return result

    @router.post(prefix + "/{setup_id}/discard", operation_id="discardMapSetup")
    async def discard(
        project_id: UUID,
        site_id: UUID,
        setup_id: UUID,
        user: Annotated[UUID, Depends(authenticate)],
        if_match: Annotated[str | None, Header()] = None,
    ) -> MapSetup:
        async with zones.transaction(sessions, user) as session:
            current = (await db.get(session, project_id, site_id, setup_id)).setup
            map_setups.check(current, if_match)
            await zone_db.invoke(
                session,
                text("SELECT fieldmaps_private.discard_map_setup(:project,:site,:setup,:revision)"),
                {
                    "project": project_id,
                    "site": site_id,
                    "setup": setup_id,
                    "revision": current.revision,
                },
            )
            return (await db.get(session, project_id, site_id, setup_id)).setup

    return router
