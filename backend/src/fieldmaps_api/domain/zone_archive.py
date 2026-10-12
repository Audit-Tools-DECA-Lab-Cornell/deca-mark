"""Build and read the one immutable, zone-aware package archive format."""

import zipfile
from hashlib import sha256
from io import BytesIO
from typing import Final, assert_never

from pydantic import JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.domain.geojson import FeatureCollection, Geometry, positions
from fieldmaps_api.domain.packages import (
    LAYER_ORDER,
    MAX_ARCHIVE_BYTES,
    MAX_FEATURES_PER_LAYER,
    NO_PERMITTED_HOSTS,
    LayerName,
    PackageError,
    PackageSubmission,
    PreparationCheck,
    check_coordinate_reference,
    check_imagery_licence,
    check_layer_sources,
    read_source_project,
)
from fieldmaps_api.domain.zone_package_schemas import (
    ArchiveCollection,
    ArchiveLayer,
    BaseArchive,
    GroundGeometry,
    GroundMultiPolygon,
    PackageZone,
    ZonePackageManifest,
)
from fieldmaps_api.zone_geometry_schemas import MAX_PACKAGE_ZONES, Position
from fieldmaps_api.zone_import_schemas import PackageRequest
from fieldmaps_api.zone_response_schemas import PackageForms

MAX_EXPANDED_BYTES: Final = 5 * MAX_ARCHIVE_BYTES
_GROUND: Final[TypeAdapter[GroundGeometry]] = TypeAdapter(GroundGeometry)
_GEOMETRY: Final[TypeAdapter[Geometry]] = TypeAdapter(Geometry)
_POSITION: Final[TypeAdapter[Position]] = TypeAdapter(Position)
_COLLECTION: Final[TypeAdapter[FeatureCollection]] = TypeAdapter(FeatureCollection)


def _text(value: JsonValue) -> str | None:
    match value:
        case str():
            return value.strip() or None
        case None | bool() | int() | float() | list() | dict():
            return None
    assert_never(value)


def _read_layer(name: LayerName, payload: bytes) -> ArchiveLayer:
    collection = ArchiveCollection.model_validate_json(payload)
    if len(collection.features) > MAX_FEATURES_PER_LAYER:
        message = "The package contains an unsupported layer"
        raise PackageError(message)
    return ArchiveLayer(
        name,
        payload,
        len(collection.features),
        tuple(
            _POSITION.validate_python(position)
            for feature in collection.features
            for position in positions(_GEOMETRY.validate_python(feature.geometry))
        ),
    )


def _ground(payload: bytes) -> GroundGeometry:
    collection = ArchiveCollection.model_validate_json(payload)
    site_features = [
        feature
        for feature in collection.features
        if _text(feature.properties.get("kind")) == "site"
    ]
    if len(site_features) != 1:
        message = "The ground layer needs exactly one actual site polygon"
        raise PackageError(message)
    return _GROUND.validate_python(site_features[0].geometry)


def _positions(geometry: GroundGeometry) -> tuple[Position, ...]:
    match geometry:
        case GroundMultiPolygon(coordinates=parts):
            raw = [point for part in parts for ring in part for point in ring]
        case _:
            raw = [point for ring in geometry.coordinates for point in ring]
    return tuple(_POSITION.validate_python(point) for point in raw)


def _bounds(points: tuple[Position, ...]) -> tuple[float, float, float, float]:
    return (
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    )


def _manifest_zones(manifest: ZonePackageManifest, payload: bytes) -> tuple[PackageZone, ...]:
    message = "The retained zone layer does not match its manifest"
    collection = ArchiveCollection.model_validate_json(payload)
    if len(collection.features) != len(manifest.zones):
        raise PackageError(message)
    zones: list[PackageZone] = []
    for metadata, feature in zip(manifest.zones, collection.features, strict=True):
        properties = feature.properties
        zone_id = _text(properties.get("zone_id"))
        zone_code = _text(properties.get("zone_code"))
        label = _text(properties.get("name"))
        digest = _text(properties.get("geometry_sha256"))
        anchor = properties.get("display_anchor")
        geometry = _GROUND.validate_python(feature.geometry)
        if isinstance(geometry, GroundMultiPolygon):
            shape = geometry
        else:
            shape = GroundMultiPolygon(
                type="MultiPolygon", coordinates=(geometry.coordinates,)
            )
        try:
            anchor_position = _POSITION.validate_python(anchor)
        except ValidationError as error:
            raise PackageError(message) from error
        points = _positions(shape)
        if (
            zone_id != str(metadata.zone_id)
            or zone_code != metadata.zone_code
            or label != metadata.label
            or digest != metadata.geometry_sha256
            or tuple(anchor_position) != tuple(metadata.display_anchor)
            or _bounds(points) != metadata.bbox
        ):
            raise PackageError(message)
        zones.append(
            PackageZone(
                zone_id=metadata.zone_id,
                zone_code=metadata.zone_code,
                label=metadata.label,
                bbox=metadata.bbox,
                display_anchor=metadata.display_anchor,
                geometry_sha256=metadata.geometry_sha256,
                geometry=shape,
            )
        )
    return tuple(zones)


def extract_base_archive(archive: bytes, expected_sha256: str | None = None) -> BaseArchive:
    if len(archive) > MAX_ARCHIVE_BYTES:
        message = "The retained archive exceeds the package size ceiling"
        raise PackageError(message)
    if expected_sha256 is not None and sha256(archive).hexdigest() != expected_sha256:
        message = "The retained archive checksum does not match"
        raise PackageError(message)
    try:
        with zipfile.ZipFile(BytesIO(archive)) as opened:
            entries = opened.infolist()
            names = [entry.filename for entry in entries]
            permitted = {"manifest.json", *(f"layers/{name}.json" for name in LAYER_ORDER)}
            required = {"manifest.json", "layers/ground.json", "layers/zones.json"}
            if (
                len(set(names)) != len(names)
                or not set(names) <= permitted
                or not required <= set(names)
                or sum(entry.file_size for entry in entries) > MAX_EXPANDED_BYTES
                or any(entry.flag_bits & 1 for entry in entries)
            ):
                message = "The retained archive has unsupported or oversized entries"
                raise PackageError(message)
            manifest = ZonePackageManifest.model_validate_json(opened.read("manifest.json"))
            layers = tuple(
                _read_layer(name, opened.read(f"layers/{name}.json"))
                for name in LAYER_ORDER
                if f"layers/{name}.json" in names
            )
            zone_payload = opened.read("layers/zones.json")
            ground_payload = opened.read("layers/ground.json")
    except (zipfile.BadZipFile, ValidationError, UnicodeDecodeError) as error:
        message = "The retained package is not a readable zone package"
        raise PackageError(message) from error
    try:
        ground = _ground(ground_payload)
        zones = _manifest_zones(manifest, zone_payload)
    except ValidationError as error:
        message = "The retained package contains an invalid geometry or zone snapshot"
        raise PackageError(message) from error
    return BaseArchive(
        layers=layers,
        ground=ground,
        zones=zones,
        site_code=manifest.site_code,
        source_project=None,
        checks=(
            PreparationCheck(
                step="layer-sources", state="passed", detail="Retained layers verified"
            ),
        ),
    )


def prepare_import_base(
    submission: PackageRequest, site_code: str, forms: PackageForms
) -> BaseArchive:
    if not {"ground", "zones"} <= submission.layers.keys():
        message = "A package needs a ground and a zones layer"
        raise PackageError(message)
    collections: dict[LayerName, FeatureCollection] = {
        name: _COLLECTION.validate_python(payload) for name, payload in submission.layers.items()
    }
    if any(len(layer.features) > MAX_FEATURES_PER_LAYER for layer in collections.values()):
        message = "A layer exceeds the feature count ceiling"
        raise PackageError(message)
    if not 1 <= len(collections["zones"].features) <= MAX_PACKAGE_ZONES:
        message = "A package needs between 1 and 250 zones"
        raise PackageError(message)
    checks: list[PreparationCheck] = []
    internal_submission = PackageSubmission(
        site_code=site_code,
        form_version=forms.play.form_version,
        layers=collections,
        project_file=submission.project_file,
    )
    project = read_source_project(submission.project_file, checks)
    check_layer_sources(internal_submission, project, checks)
    check_coordinate_reference(internal_submission, project, checks)
    check_imagery_licence(project, NO_PERMITTED_HOSTS, checks)
    if any(check.state == "blocked" for check in checks):
        message = "The imported sources did not pass package preparation"
        raise PackageError(message)
    layers = tuple(
        _read_layer(name, collections[name].model_dump_json(exclude_none=True).encode())
        for name in LAYER_ORDER
        if name in collections
    )
    ground = _ground(next(layer.payload for layer in layers if layer.name == "ground"))
    return BaseArchive(
        layers=layers,
        ground=ground,
        zones=(),
        site_code=site_code,
        source_project=project,
        checks=tuple(checks),
    )
