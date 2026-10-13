"""Turning a QGIS export into a site package an observer can carry offline.

A `.qgz` is not a package. It is a set of references — to GeoPackages on the author's machine,
to tile services on somebody else's — so preparation resolves what it can, refuses what it must,
and only then produces an archive. The five checks below are the whole of that, and each one
records why it passed, warned or blocked rather than reducing to a boolean.

Nothing here reaches the network or shells out to GDAL: the layers arrive as GeoJSON, which the
models in `geojson` validate, and the project file is read only for provenance and for the two
questions a GeoJSON export cannot answer — which layers the author meant to include, and whether
the imagery under them may be redistributed offline.
"""

from __future__ import annotations

import zipfile
from typing import ClassVar, Final, Literal

from pydantic import Base64Bytes, BaseModel, ConfigDict, Field

from fieldmaps_api.domain import qgis_project
from fieldmaps_api.domain.geojson import FeatureCollection, declared_crs_is_wgs84

#: Tile hosts the lab has established it may redistribute offline. Empty until one is named:
#: permission to repackage somebody else's imagery is granted, never assumed.
NO_PERMITTED_HOSTS: Final[frozenset[str]] = frozenset()

MAX_FEATURES_PER_LAYER: Final = 20_000
MAX_PROJECT_BYTES: Final = 8 * 1024 * 1024
MAX_ARCHIVE_BYTES: Final = 16 * 1024 * 1024

LayerName = Literal["ground", "paths", "trees", "zones"]
LAYER_ORDER: Final[tuple[LayerName, ...]] = ("ground", "paths", "trees", "zones")

#: Providers that read a file the institution holds. Redistribution is the lab's own decision.
FILE_RASTER_PROVIDERS: Final = frozenset({"gdal"})
#: Providers that fetch imagery from somebody else's server on demand.
NETWORK_PROVIDERS: Final = frozenset(
    {"wms", "xyz", "wmts", "arcgismapserver", "arcgisfeatureserver"}
)


class PackageError(ValueError):
    """A submission that cannot become a package, with a reason worth showing the manager."""


class SourceProject(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    file_name: str
    title: str | None
    crs: str | None
    vector_layers: tuple[str, ...]
    raster_layers: tuple[RasterSource, ...]


class RasterSource(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    layer_name: str
    provider: str
    host: str | None


class ProjectFile(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    file_name: str = Field(min_length=1, max_length=200)
    #: The `.qgz` bytes, base64 encoded on the wire. A browser reads the file and encodes it, so
    #: the whole submission stays one JSON document and the API needs no multipart parser.
    content: Base64Bytes


CheckStep = Literal[
    "source-project", "layer-sources", "coordinate-reference", "imagery-licence", "archive"
]
CheckState = Literal["passed", "warning", "blocked", "skipped"]


class PreparationCheck(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    step: CheckStep
    state: CheckState
    detail: str


class PackageSubmission(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    site_code: str = Field(min_length=1, max_length=100)
    form_version: str = Field(min_length=1, max_length=100)
    layers: dict[LayerName, FeatureCollection]
    project_file: ProjectFile | None = None


def _read_source_project(
    supplied: ProjectFile | None, checks: list[PreparationCheck]
) -> SourceProject | None:
    """Read the `.qgz`, or record honestly that preparation ran without one."""
    if supplied is None:
        checks.append(
            PreparationCheck(
                step="source-project",
                state="skipped",
                detail=(
                    "No QGIS project was supplied. The layers below were taken at face value; "
                    "nothing checked them against the project they came from."
                ),
            )
        )
        return None
    if len(supplied.content) > MAX_PROJECT_BYTES:
        message = f"The project file is over the {MAX_PROJECT_BYTES // 1024 // 1024} MB ceiling"
        raise PackageError(message)
    try:
        root = qgis_project.parse(qgis_project.read_document(supplied.content))
    except qgis_project.ProjectFileError as error:
        raise PackageError(str(error)) from error

    vectors: list[str] = []
    rasters: list[RasterSource] = []
    for layer in qgis_project.map_layers(root):
        name = qgis_project.layer_name(layer)
        if name is None:
            continue
        if qgis_project.layer_kind(layer) == "raster":
            rasters.append(
                RasterSource(
                    layer_name=name,
                    provider=qgis_project.layer_provider(layer),
                    host=qgis_project.datasource_host(layer),
                )
            )
        else:
            vectors.append(name)

    project = SourceProject(
        file_name=supplied.file_name,
        title=qgis_project.title(root),
        crs=qgis_project.project_crs(root),
        vector_layers=tuple(vectors),
        raster_layers=tuple(rasters),
    )
    checks.append(
        PreparationCheck(
            step="source-project",
            state="passed",
            detail=(
                f"{project.file_name} · {len(vectors)} vector and {len(rasters)} raster layers"
                f"{f' · {project.crs}' if project.crs else ''}"
            ),
        )
    )
    return project


def _check_coordinate_reference(
    submission: PackageSubmission,
    project: SourceProject | None,
    checks: list[PreparationCheck],
) -> None:
    # Coordinate ranges were already enforced by the GeoJSON models, so anything projected has
    # failed before reaching here. What is left is a collection that declares another CRS while
    # happening to hold plausible degrees.
    declared = [
        name
        for name, collection in submission.layers.items()
        if not declared_crs_is_wgs84(collection)
    ]
    if declared:
        checks.append(
            PreparationCheck(
                step="coordinate-reference",
                state="blocked",
                detail=(
                    f"{', '.join(sorted(declared))} declares a CRS that is not WGS 84. "
                    "Re-export with CRS EPSG:4326."
                ),
            )
        )
        return
    # The project's own CRS is a display choice — tracing over Web Mercator tiles is the
    # documented way to draw a site — so it is reported rather than enforced. What ships is the
    # exported geometry, and that is in WGS 84 or it did not get this far.
    declared_project = f"; project drawn in {project.crs}" if project and project.crs else ""
    checks.append(
        PreparationCheck(
            step="coordinate-reference",
            state="passed",
            detail=(
                f"{len(submission.layers)} layers in WGS 84 longitude/latitude, "
                f"as the database and the collector both read{declared_project}"
            ),
        )
    )


def _check_layer_sources(
    submission: PackageSubmission,
    project: SourceProject | None,
    checks: list[PreparationCheck],
) -> None:
    supplied = sorted(submission.layers)
    if project is None:
        checks.append(
            PreparationCheck(
                step="layer-sources",
                state="passed",
                detail=f"{len(supplied)} layers supplied directly: {', '.join(supplied)}",
            )
        )
        return
    named = {name.strip().lower() for name in project.vector_layers}
    unmatched = sorted(named - set(supplied))
    if unmatched:
        checks.append(
            PreparationCheck(
                step="layer-sources",
                state="warning",
                detail=(
                    f"{len(supplied)} of {len(named)} project layers were supplied. "
                    f"No export for: {', '.join(unmatched)}. They will not reach the device."
                ),
            )
        )
        return
    checks.append(
        PreparationCheck(
            step="layer-sources",
            state="passed",
            detail=f"Every vector layer in the project was supplied: {', '.join(supplied)}",
        )
    )


def _check_imagery_licence(
    project: SourceProject | None,
    permitted_tile_hosts: frozenset[str],
    checks: list[PreparationCheck],
) -> None:
    if project is None:
        checks.append(
            PreparationCheck(
                step="imagery-licence",
                state="passed",
                detail="Vector only; no raster imagery was referenced",
            )
        )
        return
    if not project.raster_layers:
        checks.append(
            PreparationCheck(
                step="imagery-licence",
                state="passed",
                detail="The project references no raster layer",
            )
        )
        return
    # Permission to redistribute is granted, never assumed, so a network source blocks unless the
    # lab has named its host. A file the institution holds is its own to package.
    refused = [
        source
        for source in project.raster_layers
        if source.provider in NETWORK_PROVIDERS
        and (source.host is None or source.host.lower() not in permitted_tile_hosts)
    ]
    if refused:
        names = ", ".join(
            f"{source.layer_name} ({source.host or source.provider})" for source in refused
        )
        checks.append(
            PreparationCheck(
                step="imagery-licence",
                state="blocked",
                detail=(
                    f"{names} is fetched from a tile service on demand. Tiles a desktop may draw "
                    "are not tiles an institution may render, store and redistribute inside an "
                    "offline package. Supply institution-owned or openly licensed imagery."
                ),
            )
        )
        return
    held = [source for source in project.raster_layers if source.provider in FILE_RASTER_PROVIDERS]
    checks.append(
        PreparationCheck(
            step="imagery-licence",
            state="passed",
            detail=(
                f"{len(held)} raster layers read from files the institution holds"
                if held
                else "Every raster source is on the permitted list"
            ),
        )
    )


def _write(archive: zipfile.ZipFile, name: str, payload: bytes) -> None:
    # A fixed timestamp keeps the archive reproducible; the real one is in the manifest.
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, payload)


read_source_project = _read_source_project
check_layer_sources = _check_layer_sources
check_coordinate_reference = _check_coordinate_reference
check_imagery_licence = _check_imagery_licence
write_archive_entry = _write
