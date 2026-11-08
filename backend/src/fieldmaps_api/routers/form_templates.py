from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.form_schemas import FormTemplate
from fieldmaps_api.services import forms


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    @router.get("/v1/form-templates", operation_id="listFormTemplates")
    async def template_list(user_id: Annotated[UUID, Depends(authenticate)]) -> list[FormTemplate]:
        """List the ready-made forms to start from; managers only."""
        async with user_transaction(sessions, user_id) as session:
            return await forms.list_templates(session)

    return router
