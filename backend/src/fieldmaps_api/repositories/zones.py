from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import TextClause

from fieldmaps_api.database_errors import database_error
from fieldmaps_api.errors import DomainError, ErrorCode, RoleRequiredError
from fieldmaps_api.queries import zones as q
from fieldmaps_api.repositories.tenancy import one, rows
from fieldmaps_api.zone_preconditions import zone_etag
from fieldmaps_api.zone_response_schemas import Draft, DraftSummary, HistoricalZones, ZoneResponse

if TYPE_CHECKING:
    from sqlalchemy import Result

type Parameters = dict[str, UUID | str | int | bool | bytes | None]


class Scope(ZoneResponse):
    site_id: UUID
    code: str
    managed: bool
    manager: bool
    current_package_id: UUID | None
    next_version: int


async def scope(session: AsyncSession, project: UUID, site: UUID, *, manager: bool = True) -> Scope:
    await session.execute(text("SELECT fieldmaps_private.assert_active_user()"))
    result = await one(session, q.SCOPE, Scope, {"project": project, "site": site})
    if manager and not result.manager:
        message = "Manager access required"
        raise RoleRequiredError(message)
    return result


async def draft(session: AsyncSession, project: UUID, site: UUID, identifier: UUID) -> Draft:
    return await one(
        session, q.GET_DRAFT, Draft, {"project": project, "site": site, "draft": identifier}
    )


async def drafts(
    session: AsyncSession, project: UUID, site: UUID, state: str
) -> list[DraftSummary]:
    return await rows(
        session, q.LIST_DRAFTS, DraftSummary, {"project": project, "site": site, "state": state}
    )


async def invoke(session: AsyncSession, query: TextClause, params: Parameters) -> str:
    try:
        async with session.begin_nested():
            result: Result[tuple[str]] = await session.execute(query, params)
            return result.scalar_one()
    except DBAPIError as error:
        mapped = database_error(error)
        details = dict(mapped.details)
        project = TypeAdapter(UUID).validate_python(params["project"])
        site = TypeAdapter(UUID).validate_python(params["site"])
        if mapped.code in {"revision_conflict", "publication_conflict"}:
            authorized = await scope(session, project, site)
            details["current_package_id"] = (
                str(authorized.current_package_id) if authorized.current_package_id else None
            )
            identifier = params.get("draft")
            if identifier is not None:
                current = await draft(
                    session, project, site, TypeAdapter(UUID).validate_python(identifier)
                )
                details.update(
                    draft_id=str(current.draft_id),
                    revision=current.revision,
                    etag=zone_etag(current.draft_id, current.revision),
                )
        raise DomainError(
            TypeAdapter[ErrorCode](ErrorCode).validate_python(mapped.code),
            mapped.message,
            mapped.status,
            details,
        ) from error


async def identifier(session: AsyncSession, query: TextClause, params: Parameters) -> UUID | None:
    result: Result[tuple[UUID]] = await session.execute(query, params)
    return result.scalar_one_or_none()


async def history(
    session: AsyncSession, project: UUID, site: UUID, package: UUID
) -> HistoricalZones:
    return await one(
        session, q.HISTORY, HistoricalZones, {"project": project, "site": site, "package": package}
    )


async def finalize(session: AsyncSession, params: Parameters) -> tuple[UUID, bool]:
    try:
        async with session.begin_nested():
            result: Result[tuple[UUID, bool]] = await session.execute(q.FINALIZE, params)
            return result.tuples().one()
    except DBAPIError as error:
        mapped = database_error(error)
        details = dict(mapped.details)
        authorized = await scope(
            session,
            TypeAdapter(UUID).validate_python(params["project"]),
            TypeAdapter(UUID).validate_python(params["site"]),
        )
        if mapped.code in {"revision_conflict", "publication_conflict"}:
            details["current_package_id"] = (
                str(authorized.current_package_id) if authorized.current_package_id else None
            )
            if params["draft"] is not None:
                current = await draft(
                    session,
                    TypeAdapter(UUID).validate_python(params["project"]),
                    authorized.site_id,
                    TypeAdapter(UUID).validate_python(params["draft"]),
                )
                details.update(
                    draft_id=str(current.draft_id),
                    revision=current.revision,
                    etag=zone_etag(current.draft_id, current.revision),
                )
        raise DomainError(
            TypeAdapter[ErrorCode](ErrorCode).validate_python(mapped.code),
            mapped.message,
            mapped.status,
            details,
        ) from error


async def available(session: AsyncSession, project: UUID, site: UUID, ground: str | None) -> bool:
    result: Result[tuple[bool]] = await session.execute(
        q.CAPABILITY, {"project": project, "site": site, "ground": ground}
    )
    return result.scalar_one()


async def package_belongs(session: AsyncSession, project: UUID, site: UUID, package: UUID) -> bool:
    result: Result[tuple[bool]] = await session.execute(
        text("""
      SELECT EXISTS (SELECT FROM fieldmaps.site_packages WHERE project_id=:project AND
  site_id=:site AND id=:package)
    """),
        {"project": project, "site": site, "package": package},
    )
    return result.scalar_one()
