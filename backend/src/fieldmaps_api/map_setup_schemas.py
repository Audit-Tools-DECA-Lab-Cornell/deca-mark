from datetime import datetime
from typing import Annotated, ClassVar, Final, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from fieldmaps_api.domain.geojson import Feature
from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.zone_draft_schemas import ChangeNote
from fieldmaps_api.zone_geometry_schemas import (
    MAX_PACKAGE_POSITIONS,
    MAX_PACKAGE_ZONES,
    ZoneGeometry,
    position_count,
)

MAX_SETUP_BYTES: Final = 24 * 1024 * 1024
MAX_SOURCE_BYTES: Final = 16 * 1024 * 1024
MAX_SETUP_FEATURES: Final = 20_000

type SourceId = Annotated[str, StringConstraints(min_length=1, max_length=300)]
type FeatureKey = Annotated[str, StringConstraints(min_length=1, max_length=200)]
type SetupRole = Literal["outline", "ground", "zones", "paths", "trees", "leave_out"]
type FormCode = Annotated[str, StringConstraints(min_length=1, max_length=100)]


class SetupModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")


class SetupAssignment(SetupModel):
    source_id: SourceId
    feature_key: FeatureKey
    role: SetupRole
    zone_id: UUID | None = None

    @model_validator(mode="after")
    def zone_identity_matches_role(self) -> Self:
        if self.role == "zones" and self.zone_id is None:
            message = "Zone assignments require a zone UUID"
            raise ValueError(message)
        if self.role != "zones" and self.zone_id is not None:
            message = "Only zone assignments may carry a zone UUID"
            raise ValueError(message)
        return self


class SetupZone(SetupModel):
    zone_id: UUID
    zone_code: Annotated[str, StringConstraints(max_length=100)] = ""
    zone_label: Annotated[str, StringConstraints(max_length=200)] = ""
    geometry: ZoneGeometry


class MapSetupReplace(SetupModel):
    import_generation: Annotated[int, Field(ge=1, le=9_223_372_036_854_775_807, strict=True)]
    assignments: Annotated[tuple[SetupAssignment, ...], Field(max_length=MAX_SETUP_FEATURES)] = ()
    outline: ZoneGeometry | None = None
    zones: Annotated[tuple[SetupZone, ...], Field(max_length=MAX_PACKAGE_ZONES)] = ()
    form_version: FormCode | None = None
    inventory_form_version: FormCode | None = None
    change_note: ChangeNote = ""
    confirmed_omissions: Annotated[tuple[SourceId, ...], Field(max_length=64)] = ()

    @model_validator(mode="after")
    def bounded_unique_content(self) -> Self:
        zone_ids = {zone.zone_id for zone in self.zones}
        if len(zone_ids) != len(self.zones):
            message = "Zone UUIDs must be distinct within a setup"
            raise ValueError(message)
        if len({(item.source_id, item.feature_key) for item in self.assignments}) != len(
            self.assignments
        ):
            message = "Each imported feature needs exactly one disposition"
            raise ValueError(message)
        zone_assignments = [item.zone_id for item in self.assignments if item.zone_id is not None]
        if len(set(zone_assignments)) != len(zone_assignments):
            message = "Imported zone assignments must target distinct zone UUIDs"
            raise ValueError(message)
        if not set(zone_assignments).issubset(zone_ids):
            message = "Every assigned zone UUID must exist in the saved zones"
            raise ValueError(message)
        if sum(item.role == "outline" for item in self.assignments) > 1:
            message = "A setup may have at most one outline assignment"
            raise ValueError(message)
        if sum(position_count(zone.geometry) for zone in self.zones) > MAX_PACKAGE_POSITIONS:
            message = "A setup may carry at most 20,000 zone positions"
            raise ValueError(message)
        if len(self.model_dump_json().encode()) > MAX_SETUP_BYTES:
            message = "The editable map setup exceeds 24 MB"
            raise ValueError(message)
        return self


class MapSetupImport(SetupModel):
    request_id: UUID
    expected_current_package_id: UUID | None
    mode: Literal["project", "geojson"] = "project"
    files: Annotated[tuple[ProjectFile, ...], Field(min_length=1, max_length=64)]

    @model_validator(mode="after")
    def bounded_sources(self) -> Self:
        if sum(len(item.content) for item in self.files) > MAX_SOURCE_BYTES:
            message = "Choose at most 64 files totalling 16 MB"
            raise ValueError(message)
        if len({item.file_name for item in self.files}) != len(self.files):
            message = "Source paths must be distinct"
            raise ValueError(message)
        return self


class MapSetupSources(SetupModel):
    request_id: UUID
    files: Annotated[tuple[ProjectFile, ...], Field(min_length=1, max_length=64)]
    replace_project: bool = Field(
        default=False,
        description=(
            "Replace the entire source selection with a new QGIS project and its data files. "
            "Drawn boundaries are retained."
        ),
    )
    preview: bool = True
    candidate_hash: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")] | None = None

    @model_validator(mode="after")
    def require_confirmation(self) -> Self:
        if not self.preview and self.candidate_hash is None:
            message = "Confirm the reviewed source candidate before replacing saved data"
            raise ValueError(message)
        if sum(len(item.content) for item in self.files) > MAX_SOURCE_BYTES:
            message = "Choose at most 64 files totalling 16 MB"
            raise ValueError(message)
        if len({item.file_name for item in self.files}) != len(self.files):
            message = "Source paths must be distinct"
            raise ValueError(message)
        return self


class MapSetupPublish(SetupModel):
    request_id: UUID
    expected_current_package_id: UUID | None


class SetupFeature(SetupModel):
    feature_key: FeatureKey
    feature: Feature


class SetupLayer(SetupModel):
    source_id: SourceId
    name: str
    features: tuple[SetupFeature, ...]


class SetupIssue(SetupModel):
    source_id: SourceId
    layer: str
    message: str
    kind: Literal["online_basemap"] | None = None
    host: str | None = None


class SetupSource(SetupModel):
    file_name: str
    size: Annotated[int, Field(ge=0, le=MAX_SOURCE_BYTES)]


class MapSetupSummary(SetupModel):
    """Minimal collection item for resuming one unfinished setup."""

    setup_id: UUID
    state: Literal["draft", "published", "discarded"]
    updated_at: datetime


class MapSetup(SetupModel):
    setup_id: UUID
    project_id: UUID
    site_id: UUID
    state: Literal["draft", "published", "discarded"]
    revision: Annotated[int, Field(ge=1, le=9_223_372_036_854_775_807, strict=True)]
    import_generation: Annotated[int, Field(ge=1, le=9_223_372_036_854_775_807, strict=True)]
    expected_current_package_id: UUID | None
    created_by: UUID | None
    updated_by: UUID | None
    created_at: datetime
    updated_at: datetime
    content: MapSetupReplace
    layers: tuple[SetupLayer, ...] = ()
    issues: tuple[SetupIssue, ...] = ()
    sources: tuple[SetupSource, ...] = ()
    published_package_id: UUID | None = None
    base_zone_ids: tuple[UUID, ...] = ()


class MapSetupCandidate(SetupModel):
    candidate_hash: str
    import_generation: Annotated[int, Field(ge=1, le=9_223_372_036_854_775_807, strict=True)]
    layers: tuple[SetupLayer, ...]
    issues: tuple[SetupIssue, ...]
    sources: tuple[SetupSource, ...]
