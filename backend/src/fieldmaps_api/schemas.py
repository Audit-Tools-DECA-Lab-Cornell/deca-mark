from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
)

from fieldmaps_api.domain.forms import StoredFormDefinition
from fieldmaps_api.domain.packages import PreparationCheck

#: A site or form version is named by its code within a project, which is what the collector
#: carries and what an export column is keyed by.
Code = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][\w.-]*$")]

class ProjectAccess(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    project_id: UUID
    organization_id: UUID
    name: str
    role: Literal["observer", "manager", "viewer"]


class PackageSummary(BaseModel):
    """One immutable package as a site version history presents it."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    package_id: UUID
    site_id: UUID
    package_version: int
    state: Literal["ready", "blocked"]
    prepared_at: AwareDatetime
    archive_bytes: int
    archive_sha256: str
    forms: dict[str, JsonValue]
    zone_count: int
    change_note: str
    published_by: UUID
    source: Literal["upload", "draft"]


class PackageDetail(PackageSummary):
    manifest: JsonValue
    checks: list[PreparationCheck]


class PackageHistory(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    packages: list[PackageSummary]
    current_package_id: UUID | None


class UploadTarget(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    organization_id: UUID
    site_id: UUID
    form_version_id: UUID
    definition: StoredFormDefinition
    #: Uploads only ever resolve published or retired versions; a package target reports its state.
    form_state: Literal["draft", "published", "retired"] = "published"
