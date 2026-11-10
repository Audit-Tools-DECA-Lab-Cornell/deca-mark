"""Restricted map-setup persistence; mutations are database lifecycle functions."""

from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter
from sqlalchemy import Result, text
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.errors import DomainError, NotFoundError
from fieldmaps_api.map_setup_schemas import MapSetup, MapSetupSummary
from fieldmaps_api.repositories import tenancy, zones


class StoredSetup(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    setup: MapSetup
    document: dict[str, JsonValue]


async def get(session: AsyncSession, project: UUID, site: UUID, identifier: UUID) -> StoredSetup:
    await zones.scope(session, project, site)
    result: Result[tuple[str, str]] = await session.execute(
        text("""
        SELECT ((to_jsonb(s) - 'id' - 'organization_id' - 'document') ||
        jsonb_build_object('setup_id',s.id) || s.document)::text AS response, s.document::text
        FROM fieldmaps.map_setups s WHERE s.project_id=:project AND s.site_id=:site AND s.id=:setup
    """),
        {"project": project, "site": site, "setup": identifier},
    )
    row = result.tuples().one_or_none()
    if row is None:
        message = "Map setup not found"
        raise NotFoundError(message)
    response = TypeAdapter(dict[str, JsonValue]).validate_json(row[0])
    response.pop("project_file", None)
    return StoredSetup(
        setup=MapSetup.model_validate(response),
        document=TypeAdapter(dict[str, JsonValue]).validate_json(row[1]),
    )


async def listing(session: AsyncSession, project: UUID, site: UUID) -> list[MapSetupSummary]:
    await zones.scope(session, project, site)
    return await tenancy.rows(
        session,
        text("""
        SELECT jsonb_build_object(
            'setup_id',id,
            'state',state,
            'updated_at',updated_at
        )::text
        FROM fieldmaps.map_setups
        WHERE project_id=:project AND site_id=:site AND state='draft'
        ORDER BY updated_at DESC,id
        """),
        MapSetupSummary,
        {"project": project, "site": site},
    )


async def sources(session: AsyncSession, project: UUID, site: UUID, identifier: UUID) -> str:
    await get(session, project, site, identifier)
    result: Result[tuple[str]] = await session.execute(
        text("SELECT bundle::text FROM fieldmaps_private.map_setup_sources WHERE setup_id=:setup"),
        {"setup": identifier},
    )
    return result.scalar_one()


async def replay(  # noqa: PLR0913, PLR0917 - scoped immutable operation identity
    session: AsyncSession,
    project: UUID,
    site: UUID,
    request: UUID,
    operation: str,
    fingerprint: str,
) -> MapSetup | None:
    await zones.scope(session, project, site)
    result: Result[tuple[UUID, str]] = await session.execute(
        text("""
        SELECT o.setup_id,o.fingerprint FROM fieldmaps_private.map_setup_operations o
        JOIN fieldmaps.map_setups s ON s.id=o.setup_id
        WHERE o.actor=fieldmaps.request_user_id() AND o.request_id=:request
        AND o.operation=:operation AND s.project_id=:project AND s.site_id=:site
    """),
        {"request": request, "operation": operation, "project": project, "site": site},
    )
    receipt = result.tuples().one_or_none()
    if receipt is None:
        return None
    if receipt[1] != fingerprint:
        message = "idempotency_conflict"
        raise DomainError(
            message, "This request was already used with different source files.", 409
        )
    return (await get(session, project, site, receipt[0])).setup
