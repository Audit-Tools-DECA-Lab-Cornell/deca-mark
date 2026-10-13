from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.routers import invitations, organizations
from fieldmaps_api.services import members as member_service
from fieldmaps_api.services import tenancy as service
from fieldmaps_api.tenancy_schemas import (
    Project,
    ProjectCreate,
    ProjectMember,
    ProjectPatch,
    ProjectRolePatch,
)


def create_router(
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    email_settings: EmailSettings | None = None,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)
    router.include_router(organizations.create_router(sessions, authenticate))
    router.include_router(invitations.create_router(sessions, authenticate, email_settings))

    @router.get("/v1/projects", operation_id="listProjects")
    async def projects(user: Annotated[UUID, Depends(authenticate)]) -> list[Project]:
        async with user_transaction(sessions, user) as session:
            return await service.list_projects(session)

    @router.get("/v1/projects/{project}", operation_id="getProject")
    async def detail(project: UUID, user: Annotated[UUID, Depends(authenticate)]) -> Project:
        async with user_transaction(sessions, user) as session:
            return await service.project(session, project)

    @router.patch("/v1/projects/{project}", operation_id="updateProject")
    async def patch(
        project: UUID, payload: ProjectPatch, user: Annotated[UUID, Depends(authenticate)]
    ) -> Project:
        async with user_transaction(sessions, user) as session:
            return await service.patch_project(session, project, payload)

    @router.get("/v1/projects/{project}/members", operation_id="listProjectMembers")
    async def members(
        project: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> list[ProjectMember]:
        async with user_transaction(sessions, user) as session:
            return await member_service.project_members(session, project)

    @router.patch(
        "/v1/projects/{project}/members/{member}",
        operation_id="setProjectRole",
        status_code=204,
        response_class=Response,
    )
    async def set_role(
        project: UUID,
        member: UUID,
        payload: ProjectRolePatch,
        user: Annotated[UUID, Depends(authenticate)],
    ) -> Response:
        async with user_transaction(sessions, user) as session:
            await member_service.set_project_role(session, project, member, payload.role)
        return Response(status_code=204)

    @router.delete(
        "/v1/projects/{project}/members/{member}",
        operation_id="removeProjectMember",
        status_code=204,
        response_class=Response,
    )
    async def remove(
        project: UUID, member: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> Response:
        async with user_transaction(sessions, user) as session:
            await member_service.remove_project_member(session, project, member)
        return Response(status_code=204)

    @router.get("/v1/orgs/{org}/projects", operation_id="listOrganizationProjects")
    async def org_projects(
        org: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> list[Project]:
        async with user_transaction(sessions, user) as session:
            return await service.organization_projects(session, org)

    @router.post("/v1/orgs/{org}/projects", operation_id="createProject", status_code=201)
    async def new_project(
        org: UUID, payload: ProjectCreate, user: Annotated[UUID, Depends(authenticate)]
    ) -> Project:
        async with user_transaction(sessions, user) as session:
            return await service.create_project(session, org, payload)

    return router
