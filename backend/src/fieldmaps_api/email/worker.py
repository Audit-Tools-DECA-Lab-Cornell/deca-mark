"""Bounded background delivery, safe to run in multiple API processes."""

import anyio
import httpx2
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from fieldmaps_api.deps import user_transaction
from fieldmaps_api.email import outbox
from fieldmaps_api.email.brevo import Brevo, ProviderError
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.email.templates import RenderedEmail
from fieldmaps_api.observability import LOGGER


async def assert_configured(engine: AsyncEngine, settings: EmailSettings) -> None:
    if settings.enabled and not settings.sandbox:
        async with engine.connect() as probe:
            await probe.execute(text("SELECT id FROM fieldmaps_private.email_outbox LIMIT 0"))


async def deliver_one(sessions: async_sessionmaker[AsyncSession], provider: Brevo) -> bool:
    async with sessions.begin() as session:
        job = await outbox.claim(session)
    if job is None:
        return False
    try:
        async with user_transaction(sessions, job.created_by) as session:
            active = await outbox.eligible(session, job)
        if not active:
            async with sessions.begin() as session:
                await outbox.fail(
                    session, job, "recipient_or_invitation_unavailable", retryable=False, delay=0
                )
            return True
        message_id = await provider.send(
            job.recipient, RenderedEmail(job.subject, job.html, job.plain_text), job.id
        )
    except ProviderError as error:
        async with sessions.begin() as session:
            await outbox.fail(
                session,
                job,
                error.code,
                retryable=error.retryable,
                delay=max(error.retry_after, min(10 * (1 << max(0, job.attempts - 1)), 300)),
            )
        LOGGER.warning("email_delivery_failed job=%s code=%s", job.id, error.code)
    else:
        async with sessions.begin() as session:
            await outbox.complete(session, job, message_id)
    return True


async def run(sessions: async_sessionmaker[AsyncSession], settings: EmailSettings) -> None:
    async with httpx2.AsyncClient(timeout=10, follow_redirects=False, trust_env=True) as client:
        provider = Brevo(settings, client)
        while True:
            try:
                found = await deliver_one(sessions, provider)
            except Exception:  # noqa: BLE001 - worker survives DB outages; never log payloads.
                LOGGER.error("email_worker_unavailable")
                found = False
            await anyio.sleep(0.1 if found else 5)
