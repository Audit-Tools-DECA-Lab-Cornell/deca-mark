from datetime import datetime
from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from fieldmaps_api.schemas import PackageDetail, PackageSummary
from fieldmaps_api.site_schemas import Extent, ManifestZone, SitePackageInfo
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
    revision: Annotated[int, Field(ge=1)]
    state: Literal["draft", "published", "discarded"]
    change_note: str
    updated_at: AwareDatetime
    updated_by: UUID
    published_package_id: UUID | None
    forms: PackageForms
    legacy_codes_requiring_mapping: tuple[str, ...] = ()


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


class SitePackageInfoV2(SitePackageInfo):
    format: Literal[1, 2] = 1
    zone_contract_version: Literal[1] | None = None
    map_revision: int | None = None


class SiteZoneV2(ManifestZone):
    zone_id: UUID | None = None
    zone_code: str | None = None
    display_anchor: Position | None = None
    geometry_sha256: str | None = None


class SiteV2(ZoneResponse):
    site_id: UUID
    code: str
    name: str
    description: str | None
    created_at: datetime
    package: SitePackageInfoV2 | None
    zones: list[SiteZoneV2] = Field(default_factory=list[SiteZoneV2])
    extent: Extent | None = None
    centre: tuple[float, float] | None = None
    observation_count: int
    current_package_id: UUID | None
    map_revision: int | None
    zone_contract_version: Literal[1] | None
    zone_editing_available: bool


class PackageDetailV2(PackageDetail):
    pass
