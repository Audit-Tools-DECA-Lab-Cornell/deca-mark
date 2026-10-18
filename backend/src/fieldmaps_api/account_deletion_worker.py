"""Reconcile durable tombstones using bounded calls, leases and persistent backoff."""

from typing import Final
from uuid import UUID

import anyio
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from fieldmaps_api.config import Settings
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.observability import LOGGER
from fieldmaps_api.repositories import account_deletions
from fieldmaps_api.services.account_deletion import admin_key, delete_auth_user

POLL_SECONDS: Final = 5
BATCH_SIZE: Final = 10


def enabled(settings: Settings) -> bool:
    return settings.auth_admin_key_file is not None and settings.issuer is not None


async def assert_configured(engine: AsyncEngine, settings: Settings) -> None:
    if enabled(settings):
        async with engine.connect() as probe:
            await probe.execute(
                text("SELECT user_id FROM fieldmaps_private.account_deletions LIMIT 0")
            )
    LOGGER.info("account_deletion_recovery_configured enabled=%s", enabled(settings))


async def reconcile_one(
    sessions: async_sessionmaker[AsyncSession],
    settings: Settings,
    user_id: UUID | None = None,
    key: SecretStr | None = None,
) -> bool | None:
    """Attempt one due claim; None means another run owns it or nothing is due."""
    async with sessions.begin() as session:
        job = await account_deletions.claim(session, user_id)
    if job is None:
        return None
    try:
        credential = key if key is not None else await admin_key(settings)
    except StorageUnavailableError:
        outcome = "configuration"
    else:
        outcome = await delete_auth_user(settings, credential, job.user_id)
    async with sessions.begin() as session:
        if outcome == "complete":
            await account_deletions.complete(session, job)
        else:
            delay = (
                3600
                if outcome != "provider_unavailable"
                else min(30 * (1 << min(job.attempts - 1, 7)), 3600)
            )
            await account_deletions.retry(session, job, outcome, delay)
    if outcome != "complete":
        LOGGER.error("account_deletion_retry user_id=%s code=%s", job.user_id, outcome)
    else:
        LOGGER.info("account_deletion_complete user_id=%s", job.user_id)
    return outcome == "complete"


async def run(sessions: async_sessionmaker[AsyncSession], settings: Settings) -> None:
    while True:
        try:
            for _ in range(BATCH_SIZE):
                if await reconcile_one(sessions, settings) is None:
                    break
        except Exception:  # noqa: BLE001 - survive DB outages; leases expire; never log secrets.
            LOGGER.error("account_deletion_worker_unavailable")
        await anyio.sleep(POLL_SECONDS)
