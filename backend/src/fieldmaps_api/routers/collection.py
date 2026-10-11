from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.schemas import (
    ObservationQuery,
    ObservationRow,
    ObservationUpload,
    StoredObservation,
    UploadReceipt,
)
from fieldmaps_api.services.bound_uploads import upload as upload_bound
from fieldmaps_api.services.collection import (
    get_observation,
    list_observations,
    upload_observation,
)
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload, BoundUploadReceipt


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    @router.put(
        "/v2/projects/{project_id}/observations/{observation_id}",
        operation_id="uploadBoundObservation",
    )
    async def bound_upload(
        project_id: UUID,
        observation_id: UUID,
        payload: BoundObservationUpload,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> BoundUploadReceipt:
        async with user_transaction(sessions, user_id) as session:
            receipt = await upload_bound(session, project_id, observation_id, user_id, payload)
        return receipt

    @router.put(
        "/v1/projects/{project_id}/observations/{observation_id}",
        operation_id="uploadObservation",
    )
    async def upload(
        project_id: UUID,
        observation_id: UUID,
        payload: ObservationUpload,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> UploadReceipt:
        async with user_transaction(sessions, user_id) as session:
            receipt = await upload_observation(
                session, project_id, observation_id, user_id, payload
            )
        return receipt

    @router.get("/v1/projects/{project_id}/observations", operation_id="listObservations")
    async def observations(
        project_id: UUID,
        filters: Annotated[ObservationQuery, Query()],
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> list[ObservationRow]:
        """List the project's records, newest first, as the workspace shows and exports them."""
        async with user_transaction(sessions, user_id) as session:
            return await list_observations(session, project_id, filters)

    @router.get(
        "/v1/projects/{project_id}/observations/{observation_id}",
        operation_id="getObservation",
    )
    async def observation(
        project_id: UUID,
        observation_id: UUID,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> StoredObservation:
        async with user_transaction(sessions, user_id) as session:
            return await get_observation(session, project_id, observation_id)

    return router
