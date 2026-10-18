from typing import Annotated, ClassVar, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.account_deletion_worker import reconcile_one
from fieldmaps_api.config import Settings
from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.identity_schemas import Identity, Profile, ProfilePatch
from fieldmaps_api.repositories.account_deletions import pending
from fieldmaps_api.repositories.identity import forget_user
from fieldmaps_api.services.account_deletion import admin_key
from fieldmaps_api.services.identity import get_identity, patch_profile


class DeletionPending(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    status: Literal["pending"] = "pending"


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication, settings: Settings
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    @router.get("/v1/me", operation_id="get_identity")
    async def me(user_id: Annotated[UUID, Depends(authenticate)]) -> Identity:
        async with user_transaction(sessions, user_id) as session:
            return await get_identity(session)

    @router.patch("/v1/me", operation_id="update_profile")
    async def update_me(
        patch: ProfilePatch, user_id: Annotated[UUID, Depends(authenticate)]
    ) -> Profile:
        async with user_transaction(sessions, user_id) as session:
            return await patch_profile(session, patch)

    @router.delete(
        "/v1/me",
        operation_id="delete_account",
        status_code=204,
        response_model=None,
        responses={202: {"model": DeletionPending}},
    )
    async def delete_me(user_id: Annotated[UUID, Depends(authenticate)]) -> Response:
        key = await admin_key(settings)
        async with user_transaction(sessions, user_id) as session:
            await forget_user(session)
        if await reconcile_one(sessions, settings, user_id, key):
            return Response(status_code=204)
        async with sessions.begin() as session:
            still_pending = await pending(session, user_id)
        if not still_pending:
            return Response(status_code=204)
        return Response(
            status_code=202,
            content=DeletionPending().model_dump_json(),
            media_type="application/json",
        )

    return router
