from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.observation_analysis_schemas import (
    HistoricalObservationDetail,
    ObservationExportQuery,
    ObservationFilters,
    ObservationPage,
    ObservationPageQuery,
    ObservationSummary,
)
from fieldmaps_api.services import observation_analysis as service
from fieldmaps_api.services.observation_export_requests import download as download_export


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)
    base = "/v2/projects/{project_id}/observations"

    @router.get(base, operation_id="listHistoricalObservations")
    async def observations(
        project_id: UUID,
        filters: Annotated[ObservationPageQuery, Query()],
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> ObservationPage:
        async with user_transaction(sessions, user_id) as session:
            return await service.page(session, project_id, filters)

    @router.get(base + "/summary", operation_id="summarizeHistoricalObservations")
    async def summary(
        project_id: UUID,
        filters: Annotated[ObservationFilters, Query()],
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> ObservationSummary:
        async with user_transaction(sessions, user_id) as session:
            return await service.summary(session, project_id, filters)

    @router.get(
        base + "/export",
        operation_id="exportHistoricalObservations",
        response_class=Response,
        responses={
            200: {
                "content": {"application/zip": {"schema": {"type": "string", "format": "binary"}}}
            }
        },
    )
    async def download(
        request: Request,
        project_id: UUID,
        filters: Annotated[ObservationExportQuery, Query()],
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> Response:
        data = await download_export(request, sessions, user_id, project_id, filters)
        return Response(
            data,
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="observations.zip"',
                "Cache-Control": "no-store",
            },
        )

    @router.get(
        base + "/{observation_id}",
        operation_id="getHistoricalObservation",
        response_model_exclude_unset=True,
    )
    async def observation(
        project_id: UUID, observation_id: UUID, user_id: Annotated[UUID, Depends(authenticate)]
    ) -> HistoricalObservationDetail:
        async with user_transaction(sessions, user_id) as session:
            return await service.detail(session, project_id, observation_id)

    return router
