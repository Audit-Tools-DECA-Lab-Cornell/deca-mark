"""Six explicit read-only library routes; no write/template endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES, ValidationFailedError
from fieldmaps_api.library_schemas import Library, Variable, VariableUsage
from fieldmaps_api.services import library


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication
) -> APIRouter:
    async def no_query(request: Request, response: Response) -> None:
        if request.query_params:
            message = "Library reads do not accept query parameters"
            raise ValidationFailedError(message, field="query")
        response.headers["Cache-Control"] = "private, no-store"

    router = APIRouter(responses=ERROR_RESPONSES, dependencies=[Depends(no_query)])

    def scope_router(prefix: str, *, project: bool) -> APIRouter:
        child = APIRouter(prefix=prefix)
        kind = "Project" if project else "Org"

        @child.get(
            "/variables",
            operation_id=f"list{kind}LibraryVariables",
            response_model_exclude_unset=True,
        )
        async def variables(
            scope_id: Annotated[UUID, Path(alias="project_id" if project else "org_id")],
            user_id: Annotated[UUID, Depends(authenticate)],
        ) -> Library:
            async with user_transaction(sessions, user_id) as session:
                return await library.read(session, scope_id, project=project)

        @child.get(
            "/variables/{variable_id}",
            operation_id=f"get{kind}LibraryVariable",
            response_model_exclude_unset=True,
        )
        async def detail(
            response: Response,
            scope_id: Annotated[UUID, Path(alias="project_id" if project else "org_id")],
            variable_id: UUID,
            user_id: Annotated[UUID, Depends(authenticate)],
        ) -> Variable:
            async with user_transaction(sessions, user_id) as session:
                result = await library.detail(session, scope_id, variable_id, project=project)
                response.headers["ETag"] = result.etag
                return result

        @child.get(
            "/variables/{variable_id}/usage",
            operation_id=f"get{kind}LibraryVariableUsage",
            response_model_exclude_unset=True,
        )
        async def usage(
            scope_id: Annotated[UUID, Path(alias="project_id" if project else "org_id")],
            variable_id: UUID,
            user_id: Annotated[UUID, Depends(authenticate)],
        ) -> VariableUsage:
            async with user_transaction(sessions, user_id) as session:
                return await library.usage(session, scope_id, variable_id, project=project)

        return child

    router.include_router(scope_router("/v1/projects/{project_id}/library", project=True))
    router.include_router(scope_router("/v1/orgs/{org_id}/library", project=False))
    return router
