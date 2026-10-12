from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.services.bound_uploads import upload
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload, BoundUploadReceipt


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    @router.put(
        "/v1/projects/{project_id}/observations/{observation_id}",
        operation_id="uploadObservation",
    )
    async def observation_upload(
        project_id: UUID,
        observation_id: UUID,
        payload: BoundObservationUpload,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> BoundUploadReceipt:
        async with user_transaction(sessions, user_id) as session:
            return await upload(session, project_id, observation_id, user_id, payload)

    return router
