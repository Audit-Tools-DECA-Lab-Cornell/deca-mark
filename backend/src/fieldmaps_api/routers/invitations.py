from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.invitation_schemas import (
    Invitation,
    InvitationCreated,
    InvitationCredential,
    InvitationPreview,
    InvitationRedeemed,
    OrgInvitationCreate,
    ProjectInvitationCreate,
)
from fieldmaps_api.services import invitations as service


def create_router(
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    email_settings: EmailSettings | None = None,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    @router.post(
        "/v1/orgs/{org}/invitations", operation_id="createOrganizationInvitation", status_code=201
    )
    async def create_org(
        org: UUID, payload: OrgInvitationCreate, user: Annotated[UUID, Depends(authenticate)]
    ) -> InvitationCreated:
        async with user_transaction(sessions, user) as session:
            return await service.create(
                session, org, None, payload, email_settings=email_settings, user=user
            )

    @router.post(
        "/v1/projects/{project}/invitations",
        operation_id="createProjectInvitation",
        status_code=201,
    )
    async def create_project(
        project: UUID,
        payload: ProjectInvitationCreate,
        user: Annotated[UUID, Depends(authenticate)],
    ) -> InvitationCreated:
        async with user_transaction(sessions, user) as session:
            return await service.create_project(session, project, payload, email_settings, user)

    @router.get("/v1/orgs/{org}/invitations", operation_id="listOrganizationInvitations")
    async def list_org(org: UUID, user: Annotated[UUID, Depends(authenticate)]) -> list[Invitation]:
        async with user_transaction(sessions, user) as session:
            return await service.list_org(session, org)

    @router.get("/v1/projects/{project}/invitations", operation_id="listProjectInvitations")
    async def list_project(
        project: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> list[Invitation]:
        async with user_transaction(sessions, user) as session:
            return await service.list_project(session, project)

    @router.delete(
        "/v1/orgs/{org}/invitations/{invitation}",
        operation_id="revokeOrganizationInvitation",
        status_code=204,
        response_class=Response,
    )
    async def revoke_org(
        org: UUID, invitation: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> Response:
        async with user_transaction(sessions, user) as session:
            await service.revoke_org(session, org, invitation)
        return Response(status_code=204)

    @router.delete(
        "/v1/projects/{project}/invitations/{invitation}",
        operation_id="revokeProjectInvitation",
        status_code=204,
        response_class=Response,
    )
    async def revoke_project(
        project: UUID, invitation: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> Response:
        async with user_transaction(sessions, user) as session:
            await service.revoke_project(session, project, invitation)
        return Response(status_code=204)

    @router.post("/v1/invitations/preview", operation_id="previewInvitation")
    async def preview(
        payload: InvitationCredential, user: Annotated[UUID, Depends(authenticate)]
    ) -> InvitationPreview:
        async with user_transaction(sessions, user) as session:
            return await service.preview(session, payload)

    @router.post("/v1/invitations/redeem", operation_id="redeemInvitation")
    async def redeem(
        payload: InvitationCredential, user: Annotated[UUID, Depends(authenticate)]
    ) -> InvitationRedeemed:
        async with user_transaction(sessions, user) as session:
            return await service.redeem(session, payload)

    return router
