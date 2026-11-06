"""Historical observation reads; binding fields always describe capture, never current state."""

from datetime import UTC, datetime
from typing import Annotated, ClassVar, Literal, Self
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StringConstraints,
    field_validator,
    model_validator,
)

from fieldmaps_api.observation_bbox import BoundingBox

type SpatialSupport = Literal["point", "zone"]
type RoundType = Literal["standard", "reliability", "inventory"]
type Observer = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12)
]


class Frozen(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")


class ObservationFilters(Frozen):
    site_id: UUID | None = None
    package_id: UUID | None = None
    zone_id: Annotated[tuple[UUID, ...], Field(max_length=500)] = ()
    round_type: RoundType | None = None
    observer: Observer | None = None
    observed_from: AwareDatetime | None = None
    observed_before: AwareDatetime | None = None
    bbox: Annotated[
        BoundingBox | None,
        Field(
            description=(
                "WGS84 west,south,east,north; inclusive point bounds, "
                "west < east and south < north. Inventory has no point geometry and is excluded."
            )
        ),
    ] = None

    @field_validator("observed_from", "observed_before")
    @classmethod
    def utc_bound(cls, value: datetime | None) -> datetime | None:
        try:
            return None if value is None else value.astimezone(UTC)
        except OverflowError:
            message = "Timestamp outside UTC range"
            raise ValueError(message) from None

    @field_validator("zone_id")
    @classmethod
    def canonical_zones(cls, value: tuple[UUID, ...]) -> tuple[UUID, ...]:
        return tuple(sorted(set(value)))

    @model_validator(mode="after")
    def combinations(self) -> Self:
        if self.bbox is not None:
            west, south, east, north = self.bbox
            if west >= east or south >= north:
                message = "The bbox must have west < east and south < north"
                raise ValueError(message)
        if self.zone_id and self.site_id is None:
            message = "Zone filters require a site"
            raise ValueError(message)
        if (
            self.observed_from is not None
            and self.observed_before is not None
            and self.observed_from >= self.observed_before
        ):
            message = "The observed interval must be nonempty"
            raise ValueError(message)
        return self


class ObservationPageQuery(ObservationFilters):
    cursor: Annotated[str, Field(min_length=1, max_length=2048)] | None = None
    limit: Annotated[int, Field(ge=1, le=500)] = 100


class ObservationExportQuery(ObservationFilters):
    format: Literal["csv", "geojson"] = "csv"


class Point(Frozen):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class HistoricalObservation(Frozen):
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    site_id: UUID
    site_code: str
    site_name: str
    observer: str
    observed_at: datetime
    started_at: datetime | None = None
    received_at: datetime
    revision: int
    answers: dict[str, JsonValue]
    form_version: str
    round_type: RoundType
    first_round: bool | None
    placement: Literal["hand", "zone"]
    package_id: UUID
    package_version: int
    zone_id: UUID
    zone_code: str
    zone_label: str
    spatial_support: SpatialSupport
    geometry: Point | None
    display_anchor: Point | None


class HistoricalObservationDetail(HistoricalObservation):
    schema_version: int
    definition: dict[str, JsonValue]


class ExportObservation(HistoricalObservationDetail):
    historical_geometry: dict[str, JsonValue] | None


class ObservationPage(Frozen):
    items: list[HistoricalObservation]
    next_cursor: str | None
    total_matching: int
    generated_at: datetime


class SummaryGroup(Frozen):
    site_id: UUID
    package_id: UUID
    package_version: int
    zone_id: UUID
    zone_code: str
    zone_label: str
    round_type: RoundType
    spatial_support: SpatialSupport
    count: int


class ObservationSummary(Frozen):
    groups: list[SummaryGroup]
    total_matching: int
    generated_at: datetime


class PageSnapshot(Frozen):
    items: list[HistoricalObservation]
    total_matching: int
    generated_at: datetime


class ExportSnapshot(Frozen):
    items: list[HistoricalObservation]
    forms: dict[str, dict[str, JsonValue]]
    form_schema_versions: dict[str, int]
    historical_zones: dict[str, dict[str, JsonValue]]
    total_matching: int
    source_bytes: int
    timezone: str
    generated_at: datetime
