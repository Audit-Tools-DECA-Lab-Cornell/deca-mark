"""SQL adapters for library reads."""

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.library_schemas import Library, Variable, VariableUsage
from fieldmaps_api.queries import library as q

if TYPE_CHECKING:
    from sqlalchemy import Result


async def read(session: AsyncSession, org: UUID, project: UUID | None) -> Library:
    result: Result[tuple[str]] = await session.execute(q.LIBRARY, {"org": org, "project": project})
    return Library.model_validate_json(result.scalar_one())


async def variable(
    session: AsyncSession,
    org: UUID,
    project: UUID | None,
    variable_id: UUID,
) -> Variable | None:
    result: Result[tuple[str]] = await session.execute(
        q.VARIABLE,
        {"org": org, "project": project, "id": variable_id},
    )
    body = result.scalar_one_or_none()
    return Variable.model_validate_json(body) if body is not None else None


async def usage(
    session: AsyncSession,
    org: UUID,
    project: UUID | None,
    item: Variable,
    *,
    can_edit: bool,
) -> VariableUsage:
    result: Result[tuple[str]] = await session.execute(
        q.USAGE,
        {"org": org, "project": project, "id": item.id},
    )
    # Capability is independent of the entity ETag. No reference templates exist until DB-24.
    return VariableUsage.model_validate_json(result.scalar_one()).model_copy(
        update={"can_edit": can_edit},
    )
