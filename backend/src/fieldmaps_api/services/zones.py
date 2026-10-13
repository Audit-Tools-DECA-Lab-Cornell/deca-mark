from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from uuid import UUID

import anyio
import orjson
from pydantic import TypeAdapter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import user_transaction
from fieldmaps_api.errors import DomainError, NotFoundError, StorageUnavailableError
from fieldmaps_api.queries import zones as q
from fieldmaps_api.repositories import zones as db
from fieldmaps_api.services.sites import get_package
from fieldmaps_api.zone_draft_schemas import DraftReplace, ZoneDraftCreate
from fieldmaps_api.zone_preconditions import assert_zone_etag, zone_etag
from fieldmaps_api.zone_response_schemas import (
    Draft,
    DraftSummary,
    HistoricalZones,
    InternalZoneValidation,
)


@dataclass(frozen=True, slots=True)
class DraftReference:
    project: UUID
    site: UUID
    identifier: UUID
    etag: str | None


@asynccontextmanager
async def transaction(
    sessions: async_sessionmaker[AsyncSession], user: UUID
) -> AsyncGenerator[AsyncSession]:
    async with user_transaction(sessions, user) as session:
        await session.execute(text("SET LOCAL statement_timeout = '20s'"))
        await session.execute(text("SET LOCAL lock_timeout = '3s'"))
        yield session


class ZoneWork:
    def __init__(self) -> None:
        self.limiter: anyio.CapacityLimiter = anyio.CapacityLimiter(2)

    @asynccontextmanager
    async def slot(self) -> AsyncGenerator[None]:
        try:
            self.limiter.acquire_nowait()
        except anyio.WouldBlock as error:
            message = "Zone processing is busy; retry later"
            raise StorageUnavailableError(message) from error
        try:
            with anyio.fail_after(45):
                yield
        except TimeoutError as error:
            message = "Zone processing timed out; retry later"
            raise StorageUnavailableError(message) from error
        finally:
            self.limiter.release()


def issue(code: str) -> DomainError:
    return DomainError(
        "validation_failed",
        code.replace("_", " ").capitalize(),
        422,
        {
            "issues": [
                {
                    "code": code,
                    "zone_ids": [],
                    "path": "",
                    "message": code.replace("_", " ").capitalize(),
                }
            ]
        },
    )


def check_etag(value: str | None, current: Draft) -> int:
    try:
        return assert_zone_etag(value, current.draft_id)
    except DomainError as error:
        if error.code == "revision_conflict":
            raise DomainError(
                error.code,
                error.message,
                error.status,
                {
                    "draft_id": str(current.draft_id),
                    "revision": current.revision,
                    "etag": zone_etag(current.draft_id, current.revision),
                    "current_package_id": str(current.current_package_id)
                    if current.current_package_id
                    else None,
                },
            ) from error
        raise


async def create(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    project: UUID,
    site: UUID,
    payload: ZoneDraftCreate,
) -> tuple[Draft, bool]:
    async with transaction(sessions, user) as session:
        await db.scope(session, project, site)
        replay = await db.identifier(
            session, q.CREATE_REPLAY, {"project": project, "request": payload.request_id}
        )
        base = (
            await get_package(session, project, payload.base_package_id) if replay is None else None
        )
        if base is not None and not await db.package_belongs(
            session, project, site, base.package_id
        ):
            message = "package_not_in_site"
            raise issue(message)
        if base is not None and base.state != "ready":
            msg = "package_not_ready"
            raise issue(msg)
    async with transaction(sessions, user) as session:
        await db.scope(session, project, site)
        await db.invoke(
            session,
            text("SELECT fieldmaps_private.lock_zone_authoring_site(:project,:site)"),
            {"project": project, "site": site},
        )
        replay = await db.identifier(
            session, q.CREATE_REPLAY, {"project": project, "request": payload.request_id}
        )
        created = TypeAdapter(UUID).validate_python(
            await db.invoke(
                session,
                q.CREATE,
                {
                    "project": project,
                    "site": site,
                    "request": payload.request_id,
                    "base": payload.base_package_id,
                },
            )
        )
        result = await db.draft(session, project, site, created)
    return result, replay is not None


async def get(session: AsyncSession, project: UUID, site: UUID, identifier: UUID) -> Draft:
    await db.scope(session, project, site)
    return await db.draft(session, project, site, identifier)


async def listing(
    session: AsyncSession, project: UUID, site: UUID, state: str
) -> list[DraftSummary]:
    await db.scope(session, project, site)
    return await db.drafts(session, project, site, state)


async def change(
    session: AsyncSession, reference: DraftReference, payload: DraftReplace | None
) -> Draft:
    project, site, identifier, etag = (
        reference.project,
        reference.site,
        reference.identifier,
        reference.etag,
    )
    current = await get(session, project, site, identifier)
    revision = check_etag(etag, current)
    await db.invoke(
        session,
        q.CHANGE,
        {
            "project": project,
            "site": site,
            "draft": identifier,
            "revision": revision,
            "zones": orjson.dumps([z.model_dump(mode="json") for z in payload.zones]).decode()
            if payload
            else None,
            "note": payload.change_note if payload else None,
            "discard": payload is None,
        },
    )
    return await db.draft(session, project, site, identifier)


async def validate(session: AsyncSession, reference: DraftReference) -> InternalZoneValidation:
    project, site, identifier, etag = (
        reference.project,
        reference.site,
        reference.identifier,
        reference.etag,
    )
    current = await get(session, project, site, identifier)
    revision = check_etag(etag, current)
    return InternalZoneValidation.model_validate_json(
        await db.invoke(
            session,
            q.VALIDATE,
            {"project": project, "site": site, "draft": identifier, "revision": revision},
        )
    )


async def historical(
    session: AsyncSession, project: UUID, site: UUID, package: UUID | None
) -> HistoricalZones:
    authorized = await db.scope(session, project, site, manager=False)
    selected = package or authorized.current_package_id
    if selected is None:
        message = "Package not found"
        raise NotFoundError(message)
    if not await db.package_belongs(session, project, site, selected):
        message = "Package not found"
        raise NotFoundError(message)
    metadata = await get_package(session, project, selected)
    if metadata.state != "ready":
        message = "package_not_ready"
        raise issue(message)
    return await db.history(session, project, site, selected)
