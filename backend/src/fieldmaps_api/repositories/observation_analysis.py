from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.domain.observation_filters import Cursor, invalid_query
from fieldmaps_api.observation_analysis_schemas import (
    ExportSnapshot,
    HistoricalObservationDetail,
    ObservationFilters,
    ObservationSummary,
    PageSnapshot,
)
from fieldmaps_api.queries import observation_analysis as q

if TYPE_CHECKING:
    from sqlalchemy import Result

type Parameter = UUID | datetime | str | int | list[UUID] | None


def parameters(project_id: UUID, filters: ObservationFilters) -> dict[str, Parameter]:
    return {
        "project": project_id,
        "site": filters.site_id,
        "package": filters.package_id,
        "zones": list(filters.zone_id),
        "basis": filters.assignment_basis,
        "legacy_code": filters.legacy_zone_code,
        "round": filters.round_type,
        "observer": filters.observer,
        "from": filters.observed_from,
        "before": filters.observed_before,
    }


async def validate_scope(
    session: AsyncSession, project_id: UUID, filters: ObservationFilters
) -> None:
    result: Result[tuple[bool]] = await session.execute(
        q.VALID_SCOPE, parameters(project_id, filters)
    )
    if not result.scalar_one():
        raise invalid_query()


async def page(
    session: AsyncSession,
    project_id: UUID,
    filters: ObservationFilters,
    cursor: Cursor | None,
    limit: int,
) -> PageSnapshot:
    result: Result[tuple[str]] = await session.execute(
        q.PAGE,
        parameters(project_id, filters)
        | {
            "cursor_time": None if cursor is None else cursor.observed_at,
            "cursor_id": None if cursor is None else cursor.observation_id,
            "limit": limit + 1,
        },
    )
    return PageSnapshot.model_validate_json(result.scalar_one())


async def detail(
    session: AsyncSession, project_id: UUID, observation_id: UUID
) -> HistoricalObservationDetail | None:
    result: Result[tuple[str]] = await session.execute(
        q.DETAIL, parameters(project_id, ObservationFilters()) | {"id": observation_id}
    )
    value = result.scalar_one_or_none()
    return None if value is None else HistoricalObservationDetail.model_validate_json(value)


async def summary(
    session: AsyncSession, project_id: UUID, filters: ObservationFilters
) -> ObservationSummary:
    result: Result[tuple[str]] = await session.execute(q.SUMMARY, parameters(project_id, filters))
    return ObservationSummary.model_validate_json(result.scalar_one())


async def export(
    session: AsyncSession,
    project_id: UUID,
    filters: ObservationFilters,
    *,
    row_limit: int,
    byte_limit: int,
) -> ExportSnapshot:
    result: Result[tuple[str]] = await session.execute(
        q.EXPORT,
        parameters(project_id, filters)
        | {
            "row_probe": row_limit + 1,
            "row_limit": row_limit,
            "byte_limit": byte_limit,
        },
    )
    return ExportSnapshot.model_validate_json(result.scalar_one())
