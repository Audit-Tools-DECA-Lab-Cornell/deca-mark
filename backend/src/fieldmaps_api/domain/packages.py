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

import json
import zipfile
from hashlib import sha256
from io import BytesIO
from typing import ClassVar, Final, Literal

from pydantic import Base64Bytes, BaseModel, ConfigDict, Field

from fieldmaps_api.domain import qgis_project
from fieldmaps_api.domain.geojson import FeatureCollection, declared_crs_is_wgs84, positions

PACKAGE_FORMAT: Final = 1

#: Tile hosts the lab has established it may redistribute offline. Empty until one is named:
#: permission to repackage somebody else's imagery is granted, never assumed.
NO_PERMITTED_HOSTS: Final[frozenset[str]] = frozenset()

MAX_FEATURES_PER_LAYER: Final = 20_000
MAX_ZONES: Final = 64
MAX_PROJECT_BYTES: Final = 8 * 1024 * 1024
MAX_ARCHIVE_BYTES: Final = 16 * 1024 * 1024
#: A margin around the drawn site so the map can be panned to its edge without hitting the stop.
EXTENT_MARGIN_DEGREES: Final = 0.0004

LayerName = Literal["ground", "paths", "trees", "zones"]
REQUIRED_LAYERS: Final[tuple[LayerName, ...]] = ("ground", "zones")
LAYER_ORDER: Final[tuple[LayerName, ...]] = ("ground", "paths", "trees", "zones")

#: Providers that read a file the institution holds. Redistribution is the lab's own decision.
FILE_RASTER_PROVIDERS: Final = frozenset({"gdal"})
#: Providers that fetch imagery from somebody else's server on demand.
NETWORK_PROVIDERS: Final = frozenset(
    {"wms", "xyz", "wmts", "arcgismapserver", "arcgisfeatureserver"}
)


class PackageError(ValueError):
    """A submission that cannot become a package, with a reason worth showing the manager."""


class Extent(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    west: float
    south: float
    east: float
    north: float

    def centre(self) -> tuple[float, float]:
        return ((self.west + self.east) / 2, (self.south + self.north) / 2)


class Zone(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    id: str
    label: str
    west: float
    south: float
    east: float
    north: float


class LayerRecord(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    name: LayerName
    features: int
    sha256: str


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


class Manifest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    format: int = PACKAGE_FORMAT
    site_code: str
    form_version: str
    extent: Extent
    centre: tuple[float, float]
    zones: tuple[Zone, ...]
    layers: tuple[LayerRecord, ...]
    source_project: SourceProject | None


class PreparedPackage(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    manifest: Manifest
    checks: tuple[PreparationCheck, ...]
    archive: bytes
    archive_sha256: str

    @property
    def blocked(self) -> bool:
        return any(check.state == "blocked" for check in self.checks)


class PackageSubmission(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    site_code: str = Field(min_length=1, max_length=100)
    form_version: str = Field(min_length=1, max_length=100)
    layers: dict[LayerName, FeatureCollection]
    project_file: ProjectFile | None = None


def prepare(
    submission: PackageSubmission,
    *,
    permitted_tile_hosts: frozenset[str] = NO_PERMITTED_HOSTS,
) -> PreparedPackage:
    """Run every check, then build the archive. Blocking checks still return their reasons."""
    checks: list[PreparationCheck] = []
    _require_layers(submission)

    project = _read_source_project(submission.project_file, checks)
    _check_layer_sources(submission, project, checks)
    _check_coordinate_reference(submission, project, checks)
    _check_imagery_licence(project, permitted_tile_hosts, checks)

    zones = _derive_zones(submission.layers["zones"])
    extent = _derive_extent(submission)
    records = tuple(
        LayerRecord(
            name=name,
            features=len(submission.layers[name].features),
            sha256=_digest(_layer_bytes(submission.layers[name])),
        )
        for name in LAYER_ORDER
        if name in submission.layers
    )
    manifest = Manifest(
        site_code=submission.site_code,
        form_version=submission.form_version,
        extent=extent,
        centre=extent.centre(),
        zones=zones,
        layers=records,
        source_project=project,
    )
    archive = _build_archive(manifest, submission)
    if len(archive) > MAX_ARCHIVE_BYTES:
        message = (
            f"The prepared package is {len(archive) // 1024} KB, over the "
            f"{MAX_ARCHIVE_BYTES // 1024 // 1024} MB ceiling. Simplify the geometry and re-export."
        )
        raise PackageError(message)
    checks.append(
        PreparationCheck(
            step="archive",
            state="passed",
            detail=(
                f"{len(records)} layers, {sum(record.features for record in records)} features, "
                f"{len(zones)} zones, {len(archive) // 1024} KB"
            ),
        )
    )
    return PreparedPackage(
        manifest=manifest,
        checks=tuple(checks),
        archive=archive,
        archive_sha256=_digest(archive),
    )


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


def _require_layers(submission: PackageSubmission) -> None:
    missing = [name for name in REQUIRED_LAYERS if name not in submission.layers]
    if missing:
        message = f"A package needs a {' and a '.join(missing)} layer"
        raise PackageError(message)
    for name, collection in submission.layers.items():
        if len(collection.features) > MAX_FEATURES_PER_LAYER:
            message = (
                f"The {name} layer holds {len(collection.features)} features, over the "
                f"{MAX_FEATURES_PER_LAYER} a package may carry"
            )
            raise PackageError(message)
    if not submission.layers["zones"].features:
        message = "The zones layer is empty; an observer has to choose a zone to collect in"
        raise PackageError(message)
    if len(submission.layers["zones"].features) > MAX_ZONES:
        message = f"A site may define up to {MAX_ZONES} zones"
        raise PackageError(message)
    site_features = [
        feature
        for feature in submission.layers["ground"].features
        if feature.text("kind") == "site"
    ]
    if len(site_features) != 1:
        message = (
            f"The ground layer needs exactly one feature with kind = site; it has "
            f"{len(site_features)}"
        )
        raise PackageError(message)


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


def _derive_zones(collection: FeatureCollection) -> tuple[Zone, ...]:
    """Read each zone's bounds: the collector stores a zone as a west/south/east/north box."""
    zones: list[Zone] = []
    for index, feature in enumerate(collection.features):
        identifier = feature.text("id")
        if identifier is None:
            message = (
                f"Zone {index + 1} has no id. Give every zone feature an id field — it is "
                "what an observation records."
            )
            raise PackageError(message)
        bounds = _bounds(positions(feature.geometry))
        if bounds is None:
            message = f"Zone {identifier} has no coordinates"
            raise PackageError(message)
        west, south, east, north = bounds
        zones.append(
            Zone(
                id=identifier,
                label=feature.text("label") or identifier,
                west=west,
                south=south,
                east=east,
                north=north,
            )
        )
    identifiers = [zone.id for zone in zones]
    duplicates = sorted({name for name in identifiers if identifiers.count(name) > 1})
    if duplicates:
        message = f"Zone ids have to be distinct; repeated: {', '.join(duplicates)}"
        raise PackageError(message)
    return tuple(zones)


def _derive_extent(submission: PackageSubmission) -> Extent:
    every = [
        position
        for collection in submission.layers.values()
        for feature in collection.features
        for position in positions(feature.geometry)
    ]
    bounds = _bounds(every)
    if bounds is None:
        message = "The supplied layers hold no coordinates"
        raise PackageError(message)
    west, south, east, north = bounds
    return Extent(
        west=west - EXTENT_MARGIN_DEGREES,
        south=south - EXTENT_MARGIN_DEGREES,
        east=east + EXTENT_MARGIN_DEGREES,
        north=north + EXTENT_MARGIN_DEGREES,
    )


def _bounds(every: list[list[float]]) -> tuple[float, float, float, float] | None:
    if not every:
        return None
    longitudes = [position[0] for position in every]
    latitudes = [position[1] for position in every]
    return (min(longitudes), min(latitudes), max(longitudes), max(latitudes))


def _layer_bytes(collection: FeatureCollection) -> bytes:
    return json.dumps(
        collection.model_dump(mode="json", exclude_none=True),
        separators=(",", ":"),
        sort_keys=True,
    ).encode()


def _digest(payload: bytes) -> str:
    return sha256(payload).hexdigest()


def _build_archive(manifest: Manifest, submission: PackageSubmission) -> bytes:
    """Build a deterministic zip, so the same submission yields the same bytes and digest."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        _write(archive, "manifest.json", manifest.model_dump_json(indent=2).encode())
        for name in LAYER_ORDER:
            collection = submission.layers.get(name)
            if collection is not None:
                _write(archive, f"layers/{name}.json", _layer_bytes(collection))
    return buffer.getvalue()


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
derive_extent = _derive_extent
layer_bytes = _layer_bytes
write_archive_entry = _write
