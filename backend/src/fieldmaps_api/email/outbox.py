"""Atomic enqueue and worker leases; provider I/O never holds a DB transaction."""

import hashlib
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Annotated, ClassVar, Literal
from uuid import UUID, uuid4

import orjson
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.email.templates import RenderedEmail
from fieldmaps_api.errors import ConflictError

MAX_ATTEMPTS = 6

if TYPE_CHECKING:
    from sqlalchemy import Result


class Delivery(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    id: UUID
    kind: Literal["invitation", "reminder", "notification"]
    status: Literal["queued", "sending", "sent", "failed", "cancelled"]
    scheduled_at: datetime
    attempts: int
    last_error: str | None


class Job(Delivery):
    created_by: UUID
    recipient: str
    recipient_user_id: UUID | None
    project_id: UUID | None
    invitation_id: UUID | None
    subject: str
    html: str
    plain_text: str
    expires_at: datetime
    lease: UUID


class MessageRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    idempotency_key: UUID
    recipient_user_id: UUID
    kind: Literal["reminder", "notification"]
    heading: Annotated[str, Field(min_length=1, max_length=100)]
    message: Annotated[str, Field(min_length=1, max_length=2000)]
    scheduled_at: datetime | None = None


class StoredDelivery(Delivery):
    fingerprint: str


def request_fingerprint(
    *,
    recipient: str,
    kind: Literal["invitation", "reminder", "notification"],
    message: RenderedEmail,
    project_id: UUID | None,
    scheduled_at: datetime | None,
) -> str:
    """Keep retries comparable even after the outbox message body is scrubbed."""
    return hashlib.sha256(
        orjson.dumps(
            [recipient, kind, message.subject, message.html, str(project_id), str(scheduled_at)]
        )
    ).hexdigest()


async def existing_delivery(  # noqa: PLR0913 - compare the original delivery fields.
    session: AsyncSession,
    *,
    created_by: UUID,
    dedupe_key: UUID,
    recipient: str,
    kind: Literal["invitation", "reminder", "notification"],
    message: RenderedEmail,
    project_id: UUID,
    scheduled_at: datetime | None,
) -> Delivery | None:
    """Return a validated replay before new-request scheduling limits apply."""
    result: Result[tuple[str]] = await session.execute(
        text("""
        SELECT row_to_json(e)::text FROM fieldmaps_private.email_outbox e
        WHERE created_by = :creator AND dedupe_key = :dedupe
        """),
        {"creator": created_by, "dedupe": dedupe_key},
    )
    value = result.scalar_one_or_none()
    if value is None:
        return None
    stored = StoredDelivery.model_validate_json(value)
    if stored.fingerprint != request_fingerprint(
        recipient=recipient,
        kind=kind,
        message=message,
        project_id=project_id,
        scheduled_at=scheduled_at,
    ):
        msg = "This email request was already used with different content"
        raise ConflictError(msg)
    return stored


async def enqueue(  # noqa: PLR0913 - explicit persisted delivery fields.
    session: AsyncSession,
    *,
    created_by: UUID,
    recipient: str,
    kind: Literal["invitation", "reminder", "notification"],
    message: RenderedEmail,
    dedupe_key: UUID,
    project_id: UUID | None = None,
    invitation_id: UUID | None = None,
    recipient_user_id: UUID | None = None,
    scheduled_at: datetime | None = None,
    expires_at: datetime | None = None,
) -> Delivery:
    scheduled = scheduled_at or datetime.now(UTC)
    digest = request_fingerprint(
        recipient=recipient,
        kind=kind,
        message=message,
        project_id=project_id,
        scheduled_at=scheduled_at,
    )
    result: Result[tuple[str]] = await session.execute(
        text("""
        INSERT INTO fieldmaps_private.email_outbox
        (id, created_by, recipient, kind, subject, html, plain_text, dedupe_key, fingerprint,
         project_id, invitation_id, recipient_user_id, scheduled_at, available_at, expires_at)
        VALUES (:id, :creator, :recipient, :kind, :subject, :html, :plain, :dedupe, :fingerprint,
                :project, :invitation, :recipient_user, :scheduled, :scheduled, :expires)
        ON CONFLICT (created_by, dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
        RETURNING row_to_json(email_outbox)::text
    """),
        {
            "id": uuid4(),
            "creator": created_by,
            "recipient": recipient,
            "kind": kind,
            "subject": message.subject,
            "html": message.html,
            "plain": message.text,
            "dedupe": dedupe_key,
            "fingerprint": digest,
            "project": project_id,
            "invitation": invitation_id,
            "recipient_user": recipient_user_id,
            "scheduled": scheduled,
            "expires": min(expires_at, scheduled + timedelta(days=1))
            if expires_at
            else scheduled + timedelta(days=1),
        },
    )
    value = result.scalar_one()

    if StoredDelivery.model_validate_json(value).fingerprint != digest:
        msg = "This email request was already used with different content"
        raise ConflictError(msg)
    return Delivery.model_validate_json(value)


async def claim(session: AsyncSession) -> Job | None:
    # Expired payloads are scrubbed even when retries have stopped.
    await session.execute(
        text("""
        UPDATE fieldmaps_private.email_outbox SET
          status = CASE WHEN status IN ('queued','sending') THEN 'cancelled' ELSE status END,
          recipient = '', subject = '', html = '', plain_text = ''
        WHERE expires_at <= now() AND recipient <> ''
    """)
    )
    # Do not retry outside Brevo's 30-minute deduplication window after an uncertain send.
    await session.execute(
        text("""
        UPDATE fieldmaps_private.email_outbox SET status = 'failed',
          last_error = 'delivery_window_exceeded',
          recipient = '', subject = '', html = '', plain_text = ''
        WHERE status IN ('queued','sending')
          AND (attempts >= 6 OR first_attempt_at < now() - interval '25 minutes')
          AND (status = 'queued' OR lease_until <= now())
    """)
    )
    result: Result[tuple[str]] = await session.execute(
        text("""
        WITH next_job AS (
          SELECT id FROM fieldmaps_private.email_outbox
          WHERE ((status = 'queued' AND available_at <= now())
            OR (status = 'sending' AND lease_until <= now())) AND expires_at > now()
          ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE fieldmaps_private.email_outbox e SET status = 'sending',
          first_attempt_at = coalesce(first_attempt_at, now()),
          lease = :lease, lease_until = now() + interval '60 seconds', attempts = attempts + 1
        FROM next_job WHERE e.id = next_job.id RETURNING row_to_json(e)::text
    """),
        {"lease": uuid4()},
    )
    value = result.scalar_one_or_none()
    return Job.model_validate_json(value) if value is not None else None


async def complete(session: AsyncSession, job: Job, message_id: str) -> None:
    await session.execute(
        text("""
        UPDATE fieldmaps_private.email_outbox SET status = 'sent', message_id = :message,
          sent_at = now(), last_error = NULL,
          recipient = '', subject = '', html = '', plain_text = ''
        WHERE id = :id AND lease = :lease AND status = 'sending'
    """),
        {"id": job.id, "lease": job.lease, "message": message_id},
    )


async def fail(session: AsyncSession, job: Job, code: str, *, retryable: bool, delay: int) -> None:
    retry = retryable and job.attempts < MAX_ATTEMPTS
    await session.execute(
        text("""
        UPDATE fieldmaps_private.email_outbox SET status = :status, last_error = :error,
          available_at = now() + :delay, lease_until = NULL,
          recipient = CASE WHEN :retry THEN recipient ELSE '' END,
          subject = CASE WHEN :retry THEN subject ELSE '' END,
          html = CASE WHEN :retry THEN html ELSE '' END,
          plain_text = CASE WHEN :retry THEN plain_text ELSE '' END
        WHERE id = :id AND lease = :lease AND status = 'sending'
    """),
        {
            "id": job.id,
            "lease": job.lease,
            "status": "queued" if retry else "failed",
            "error": code,
            "delay": timedelta(seconds=delay),
            "retry": retry,
        },
    )


async def eligible(session: AsyncSession, job: Job) -> bool:
    if job.invitation_id is not None:
        invitation_result: Result[tuple[bool]] = await session.execute(
            text("""SELECT EXISTS (
          SELECT FROM fieldmaps.invitations WHERE id = :id AND revoked_at IS NULL
          AND expires_at > now() AND use_count < max_uses)"""),
            {"id": job.invitation_id},
        )
        return invitation_result.scalar_one()
    result: Result[tuple[str | None]] = await session.execute(
        text("SELECT fieldmaps_private.email_recipient(:project, :recipient)"),
        {"project": job.project_id, "recipient": job.recipient_user_id},
    )
    return result.scalar_one_or_none() == job.recipient
