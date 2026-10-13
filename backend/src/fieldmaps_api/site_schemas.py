from datetime import datetime
from typing import Annotated, ClassVar, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, model_validator

from fieldmaps_api.tenancy_schemas import Input, Name, Slug

type Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class Extent(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    west: float
    south: float
    east: float
    north: float


class SitePackageInfo(BaseModel):
    """The immutable package currently selected for new collection sessions."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    package_id: UUID
    site_id: UUID
    package_version: int
    state: Literal["ready"]
    archive_bytes: int
    archive_sha256: str
    prepared_at: datetime
    forms: dict[str, JsonValue]
    zone_count: int
    change_note: str
    published_by: UUID
    source: Literal["upload", "draft"]


class SiteZone(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    zone_id: UUID
    zone_code: str
    label: str
    bbox: tuple[float, float, float, float]
    display_anchor: tuple[float, float]
    geometry_sha256: str


class Site(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    site_id: UUID
    code: str
    name: str
    description: str | None
    created_at: datetime
    package: SitePackageInfo | None
    zones: list[SiteZone] = Field(default_factory=list[SiteZone])
    extent: Extent | None = None
    centre: tuple[float, float] | None = None
    observation_count: int
    current_package_id: UUID | None = None
    zone_editing_available: bool = False


class SiteCreate(Input):
    code: Slug
    name: Name
    description: Description | None = None


class SitePatch(Input):
    name: Name | None = None
    description: Description | None = None

    @model_validator(mode="after")
    def name_not_null(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            message = "A site needs a name"
            raise ValueError(message)
        return self
