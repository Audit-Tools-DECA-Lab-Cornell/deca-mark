"""The contract for a temporary QGIS import preview; importing never saves a site package."""

from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field

from fieldmaps_api.domain.geojson import FeatureCollection
from fieldmaps_api.domain.packages import ProjectFile


class ProjectImportRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    files: list[ProjectFile] = Field(min_length=1, max_length=64)


class ImportedLayer(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    name: str
    collection: FeatureCollection


class ImportIssue(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    layer: str
    message: str
    kind: Literal["online_basemap"] | None = Field(
        default=None,
        description=(
            "`online_basemap` marks a layer drawn from a tile service on demand (an XYZ or WMS "
            "background map). A package leaves it out only once the manager agrees (D35): send "
            "its name in `leave_out_online_basemaps` when creating the package. Other issues "
            "carry no kind."
        ),
    )
    host: str | None = Field(
        default=None,
        description="The tile service's host, for an online background map; null otherwise.",
    )


class ProjectImportResult(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    project_file: ProjectFile
    layers: list[ImportedLayer]
    issues: list[ImportIssue]


class ImportFailure(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    error: str
