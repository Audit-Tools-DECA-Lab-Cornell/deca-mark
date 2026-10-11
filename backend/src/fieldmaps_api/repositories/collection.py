from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.queries import collection as queries
from fieldmaps_api.schemas import (
    ObservationQuery,
    ObservationRow,
    ObservationUpload,
    StoredObservation,
    UploadTarget,
)

if TYPE_CHECKING:
    from sqlalchemy import Result


@dataclass(frozen=True, slots=True)
class ObservationWrite:
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    target: UploadTarget
    payload: ObservationUpload
    answers_json: str
    fingerprint: str


async def upload_target(
    session: AsyncSession, project_id: UUID, payload: ObservationUpload
) -> UploadTarget | None:
    result: Result[tuple[str]] = await session.execute(
        queries.UPLOAD_TARGET,
        {"project": project_id, "site": payload.site_id, "form": payload.form_version},
    )
    data = result.scalar_one_or_none()
    return None if data is None else UploadTarget.model_validate_json(data)


async def insert_observation(session: AsyncSession, upload: ObservationWrite) -> None:
    await session.execute(
        queries.INSERT_OBSERVATION,
        {
            "id": upload.observation_id,
            "organization": upload.target.organization_id,
            "project": upload.project_id,
            "site": upload.target.site_id,
            "form": upload.target.form_version_id,
            "observer": upload.payload.observer,
            "observed_at": upload.payload.observed_at,
            "longitude": upload.payload.coordinates[0],
            "latitude": upload.payload.coordinates[1],
            "answers": upload.answers_json,
            "user_id": upload.user_id,
            "fingerprint": upload.fingerprint,
            "zone": upload.payload.zone,
            "round_type": upload.payload.round_type,
            "first_round": upload.payload.first_round,
            "placement": upload.payload.placement,
        },
    )


async def list_observations(
    session: AsyncSession, project_id: UUID, filters: ObservationQuery
) -> list[ObservationRow]:
    result: Result[tuple[str]] = await session.execute(
        queries.OBSERVATIONS,
        {
            "project": project_id,
            "site": filters.site,
            "round_type": filters.round_type,
            "since": filters.since,
            "limit": filters.limit,
        },
    )
    return [ObservationRow.model_validate_json(row) for row in result.scalars()]


async def get_observation(
    session: AsyncSession, project_id: UUID, observation_id: UUID
) -> StoredObservation | None:
    result: Result[tuple[str]] = await session.execute(
        queries.OBSERVATION, {"id": observation_id, "project": project_id}
    )
    data = result.scalar_one_or_none()
    return None if data is None else StoredObservation.model_validate_json(data)
