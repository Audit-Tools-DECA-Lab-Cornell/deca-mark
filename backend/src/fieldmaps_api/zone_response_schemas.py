from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from fieldmaps_api.schemas import PackageSummary
from fieldmaps_api.site_schemas import Extent
from fieldmaps_api.zone_draft_schemas import ZoneInput
from fieldmaps_api.zone_geometry_schemas import MultiPolygonInput, Position


class ZoneResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)


class FormBinding(ZoneResponse):
    form_version_id: UUID
    form_version: str


class PackageForms(ZoneResponse):
    play: FormBinding
    inventory: FormBinding | None


class DraftSummary(ZoneResponse):
    draft_id: UUID
    site_id: UUID
    base_package_id: UUID
    base_package_version: int
    current_package_id: UUID | None
    current_package_version: int | None
    revision: Annotated[int, Field(ge=1)]
    etag: str
    state: Literal["draft", "published", "discarded"]
    change_note: str
    created_at: AwareDatetime
    created_by: UUID
    updated_at: AwareDatetime
    updated_by: UUID
    created_by_name: str | None
    updated_by_name: str | None
    published_package_id: UUID | None
    forms: PackageForms


class Draft(DraftSummary):
    zones: tuple[ZoneInput, ...]


class ZoneIssue(ZoneResponse):
    code: str
    zone_ids: tuple[UUID, ...] = ()
    path: str = ""
    message: str = ""


class ZoneValidationSummary(ZoneResponse):
    zone_id: UUID
    area_m2: float | None
    extent: Extent | None
    display_anchor: Position | None
    geometry_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None
    change: Literal["added", "removed", "geometry_changed", "label_changed", "unchanged"] | None


class ValidationResult(ZoneResponse):
    ready: bool
    issues: tuple[ZoneIssue, ...]
    warnings: tuple[ZoneIssue, ...]
    zones: tuple[ZoneValidationSummary, ...]
    site_gap_area_m2: float | None


class ZoneValidation(ValidationResult):
    draft_id: UUID
    revision: int


class CanonicalZone(ZoneResponse):
    zone_id: UUID
    zone_code: str
    zone_label: str
    geometry: MultiPolygonInput
    display_anchor: Position
    geometry_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class ImportValidation(ValidationResult):
    canonical_zones: tuple[CanonicalZone, ...]


class InternalZoneValidation(ZoneValidation):
    canonical_zones: tuple[CanonicalZone, ...]


class HistoricalZones(ZoneResponse):
    site_id: UUID
    package_id: UUID
    package_version: int
    zones: tuple[CanonicalZone, ...]


class Publication(ZoneResponse):
    site_id: UUID
    draft_id: UUID | None
    package: PackageSummary
    current_package_id: UUID | None
    replayed: bool
