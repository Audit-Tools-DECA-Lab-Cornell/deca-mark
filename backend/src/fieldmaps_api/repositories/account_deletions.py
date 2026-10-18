"""Minimal durable recovery metadata, independent of profile or research content."""

from datetime import timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.queries import account_deletions as queries

if TYPE_CHECKING:
    from sqlalchemy import Result


class Claim(BaseModel):
    user_id: UUID
    attempts: int
    lease_token: UUID


async def claim(session: AsyncSession, user_id: UUID | None = None) -> Claim | None:
    result = await session.execute(queries.CLAIM, {"user_id": user_id, "lease": uuid4()})
    row = result.mappings().one_or_none()
    return Claim.model_validate(row) if row is not None else None


async def complete(session: AsyncSession, job: Claim) -> None:
    await session.execute(queries.COMPLETE, {"user": job.user_id, "lease": job.lease_token})


async def retry(session: AsyncSession, job: Claim, error: str, delay: int) -> None:
    await session.execute(
        queries.RETRY,
        {
            "user": job.user_id,
            "lease": job.lease_token,
            "error": error,
            "delay": timedelta(seconds=delay),
        },
    )


async def pending(session: AsyncSession, user_id: UUID) -> bool:
    result: Result[tuple[bool]] = await session.execute(queries.PENDING, {"user": user_id})
    return result.scalar_one()
