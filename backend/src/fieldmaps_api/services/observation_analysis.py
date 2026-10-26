from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.domain.observation_filters import decode_cursor, encode_cursor
from fieldmaps_api.errors import NotFoundError
from fieldmaps_api.form_schema_version import require_current_schema
from fieldmaps_api.observation_analysis_schemas import (
    HistoricalObservationDetail,
    ObservationFilters,
    ObservationPage,
    ObservationPageQuery,
    ObservationSummary,
)
from fieldmaps_api.repositories import observation_analysis as db
from fieldmaps_api.services.tenancy import project


async def page(
    session: AsyncSession, project_id: UUID, filters: ObservationPageQuery
) -> ObservationPage:
    await project(session, project_id)
    await db.validate_scope(session, project_id, filters)
    cursor = decode_cursor(filters.cursor, project_id, filters)
    snapshot = await db.page(session, project_id, filters, cursor, filters.limit)
    items = snapshot.items[: filters.limit]
    next_cursor = None
    if len(snapshot.items) > filters.limit:
        last = items[-1]
        next_cursor = encode_cursor(
            project_id, filters, observed_at=last.observed_at, observation_id=last.observation_id
        )
    return ObservationPage(
        items=items,
        next_cursor=next_cursor,
        total_matching=snapshot.total_matching,
        generated_at=snapshot.generated_at,
    )


async def detail(
    session: AsyncSession, project_id: UUID, observation_id: UUID
) -> HistoricalObservationDetail:
    await project(session, project_id)
    result = await db.detail(session, project_id, observation_id)
    if result is None:
        message = "Observation not found"
        raise NotFoundError(message)
    require_current_schema(result.schema_version)
    return result


async def summary(
    session: AsyncSession, project_id: UUID, filters: ObservationFilters
) -> ObservationSummary:
    await project(session, project_id)
    await db.validate_scope(session, project_id, filters)
    return await db.summary(session, project_id, filters)
