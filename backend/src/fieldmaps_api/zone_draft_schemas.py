from typing import Annotated, ClassVar, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from fieldmaps_api.zone_geometry_schemas import (
    MAX_PACKAGE_POSITIONS,
    MAX_PACKAGE_ZONES,
    ZoneGeometry,
    position_count,
)

type ZoneCode = Annotated[
    str, StringConstraints(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
]
type ZoneLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
type ChangeNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2_000)]


class ZoneInput(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    zone_id: UUID
    zone_code: ZoneCode
    zone_label: ZoneLabel
    geometry: ZoneGeometry


class ZoneDraftCreate(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    request_id: UUID
    base_package_id: UUID


class DraftReplace(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    zones: Annotated[tuple[ZoneInput, ...], Field(max_length=MAX_PACKAGE_ZONES)]
    change_note: ChangeNote

    @model_validator(mode="after")
    def bounded_unique_zones(self) -> Self:
        if len({zone.zone_id for zone in self.zones}) != len(self.zones):
            message = "Zone UUIDs must be distinct within a draft"
            raise ValueError(message)
        if len({zone.zone_code for zone in self.zones}) != len(self.zones):
            message = "Zone codes must be distinct within a draft"
            raise ValueError(message)
        if sum(position_count(zone.geometry) for zone in self.zones) > MAX_PACKAGE_POSITIONS:
            message = "A package may carry at most 20,000 zone positions"
            raise ValueError(message)
        return self


class DraftPublish(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    request_id: UUID
    expected_current_package_id: UUID
