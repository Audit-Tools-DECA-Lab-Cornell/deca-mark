"""Managers schedule service emails to verified members of their project."""

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.email.outbox import Delivery, MessageRequest, enqueue, existing_delivery
from fieldmaps_api.email.templates import EmailContent, render
from fieldmaps_api.errors import (
    ERROR_RESPONSES,
    NotFoundError,
    StorageUnavailableError,
    ValidationFailedError,
)
from fieldmaps_api.queries import tenancy as q
from fieldmaps_api.repositories.tenancy import one as read_org
from fieldmaps_api.repositories.tenancy import require_manager
from fieldmaps_api.services.tenancy import project as read_project
from fieldmaps_api.tenancy_schemas import Organization

if TYPE_CHECKING:
    from sqlalchemy import Result


def validate_new_schedule(when: datetime | None) -> None:
    """Apply scheduling limits only to newly accepted requests, never idempotent replays."""
    if when is None:
        return
    now = datetime.now(UTC)
    if (
        when.tzinfo is None
        or when < now - timedelta(minutes=1)
        or when > now + timedelta(days=90)
    ):
        msg = "Choose a time with a timezone within the next 90 days"
        raise ValidationFailedError(msg, "scheduled_at")


def create_router(
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    settings: EmailSettings,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    @router.post(
        "/v1/projects/{project}/emails", operation_id="scheduleProjectEmail", status_code=202
    )
    async def schedule(
        project: UUID, payload: MessageRequest, user: Annotated[UUID, Depends(authenticate)]
    ) -> Delivery:
        async with user_transaction(sessions, user) as session:
            await require_manager(session, q.PROJECT_MANAGER, project)
            if not settings.enabled or settings.sandbox:
                msg = "Email delivery is not available"
                raise StorageUnavailableError(msg)
            when = payload.scheduled_at
            record = await read_project(session, project)
            org = await read_org(session, q.ORG, Organization, {"id": record.organization_id})
            result: Result[tuple[str | None]] = await session.execute(
                text("SELECT fieldmaps_private.email_recipient(:project, :recipient)"),
                {"project": project, "recipient": payload.recipient_user_id},
            )
            recipient = result.scalar_one_or_none()
            if recipient is None:
                msg = "Choose an active project member with a verified email address"
                raise ValidationFailedError(msg, "recipient_user_id")
            message = render(
                EmailContent(
                    f"DECA Mark · {record.name}: {payload.heading}",
                    payload.heading,
                    (payload.message,),
                    kicker=f"DECA MARK · {record.name.upper()}",
                    action="Open project",
                    url=f"{str(settings.app_url).rstrip('/')}/o/{org.slug}/p/{record.code}",
                    footnote=f"A {payload.kind} from your {record.name} project team.",
                )
            )
            replay = await existing_delivery(
                session,
                created_by=user,
                dedupe_key=payload.idempotency_key,
                recipient=recipient,
                kind=payload.kind,
                message=message,
                project_id=project,
                scheduled_at=when,
            )
            if replay is not None:
                return replay
            validate_new_schedule(when)
            return await enqueue(
                session,
                created_by=user,
                recipient=recipient,
                kind=payload.kind,
                message=message,
                dedupe_key=payload.idempotency_key,
                project_id=project,
                recipient_user_id=payload.recipient_user_id,
                scheduled_at=when,
            )

    @router.get("/v1/projects/{project}/emails", operation_id="listProjectEmails")
    async def deliveries(
        project: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> list[Delivery]:
        async with user_transaction(sessions, user) as session:
            await require_manager(session, q.PROJECT_MANAGER, project)
            if not settings.enabled:
                msg = "Email delivery is not available"
                raise StorageUnavailableError(msg)
            result: Result[tuple[str]] = await session.execute(
                text("""SELECT row_to_json(e)::text
                FROM fieldmaps_private.email_outbox e WHERE project_id = :project
                ORDER BY created_at DESC, id DESC LIMIT 100"""),
                {"project": project},
            )
            return [Delivery.model_validate_json(row) for row in result.scalars()]

    @router.delete(
        "/v1/projects/{project}/emails/{delivery}",
        operation_id="cancelProjectEmail",
        status_code=204,
    )
    async def cancel(
        project: UUID, delivery: UUID, user: Annotated[UUID, Depends(authenticate)]
    ) -> Response:
        async with user_transaction(sessions, user) as session:
            await require_manager(session, q.PROJECT_MANAGER, project)
            if not settings.enabled:
                msg = "Email delivery is not available"
                raise StorageUnavailableError(msg)
            result = await session.execute(
                text("""UPDATE fieldmaps_private.email_outbox
                SET status = 'cancelled', recipient = '', subject = '', html = '', plain_text = ''
                WHERE id = :id AND project_id = :project AND status = 'queued' RETURNING id"""),
                {"id": delivery, "project": project},
            )
            if result.scalar_one_or_none() is None:
                msg = "No queued email was found"
                raise NotFoundError(msg)
        return Response(status_code=204)

    return router
