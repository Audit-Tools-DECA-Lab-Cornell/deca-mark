from dataclasses import dataclass
from typing import TYPE_CHECKING, ClassVar, assert_never
from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue, ValidationInfo, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.domain.forms import StoredFormDefinition
from fieldmaps_api.domain.stored_form_versions import historical_definition
from fieldmaps_api.queries import bound_uploads as queries
from fieldmaps_api.repositories.upload_receipts import ReceiptIdentity
from fieldmaps_api.schemas import UploadTarget
from fieldmaps_api.zone_observation_schemas import (
    BoundInventoryUpload,
    BoundObservationUpload,
    BoundPointUpload,
)

if TYPE_CHECKING:
    from sqlalchemy import Result


class BoundTarget(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    organization_id: UUID
    site_id: UUID
    ready: bool
    zone_present: bool
    form_version_id: UUID | None
    form_version: str | None
    schema_version: int | None
    definition: StoredFormDefinition | None
    point_covered: bool

    @field_validator("definition", mode="before")
    @classmethod
    def historical_parser(
        cls, value: JsonValue, info: ValidationInfo
    ) -> StoredFormDefinition | None:
        if value is None:
            return None
        version = info.data.get("schema_version")
        if type(version) is not int:
            message = "Stored form schema_version is required"
            raise ValueError(message)
        return historical_definition(value, version)


@dataclass(frozen=True, slots=True)
class BoundWrite:
    identity: ReceiptIdentity
    target: UploadTarget
    payload: BoundObservationUpload
    answers_json: str


def placement(payload: BoundObservationUpload) -> tuple[float | None, float | None, bool | None]:
    match payload:
        case BoundPointUpload():
            return (*payload.coordinates, payload.first_round)
        case BoundInventoryUpload():
            return None, None, None
        case _:
            assert_never(payload)


async def target(
    session: AsyncSession, project: UUID, payload: BoundObservationUpload
) -> BoundTarget | None:
    longitude, latitude, _first = placement(payload)
    result: Result[tuple[str]] = await session.execute(
        queries.TARGET,
        {
            "project": project,
            "package": payload.package_id,
            "zone": payload.zone_id,
            "round_type": payload.round_type,
            "longitude": longitude,
            "latitude": latitude,
        },
    )
    data = result.scalar_one_or_none()
    return None if data is None else BoundTarget.model_validate_json(data)


async def insert(session: AsyncSession, upload: BoundWrite) -> None:
    longitude, latitude, first = placement(upload.payload)
    await session.execute(
        queries.INSERT,
        {
            "id": upload.identity.observation_id,
            "organization": upload.target.organization_id,
            "project": upload.identity.project_id,
            "site": upload.target.site_id,
            "form": upload.target.form_version_id,
            "observer": upload.payload.observer,
            "observed_at": upload.payload.observed_at,
            "started_at": upload.payload.started_at,
            "longitude": longitude,
            "latitude": latitude,
            "first_round": first,
            "answers": upload.answers_json,
            "user_id": upload.identity.user_id,
            "fingerprint": upload.identity.fingerprint,
            "round_type": upload.payload.round_type,
            "placement": upload.payload.placement,
            "package": upload.payload.package_id,
            "zone": upload.payload.zone_id,
        },
    )
