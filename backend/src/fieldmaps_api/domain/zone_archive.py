import zipfile
from hashlib import sha256
from io import BytesIO
from typing import Final, assert_never

from pydantic import JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.domain.geojson import Geometry, positions
from fieldmaps_api.domain.packages import (
    LAYER_ORDER,
    MAX_ARCHIVE_BYTES,
    MAX_FEATURES_PER_LAYER,
    NO_PERMITTED_HOSTS,
    LayerName,
    LayerRecord,
    Manifest,
    PackageError,
    PackageSubmission,
    PreparationCheck,
    check_coordinate_reference,
    check_imagery_licence,
    check_layer_sources,
    derive_extent,
    layer_bytes,
    read_source_project,
)
from fieldmaps_api.domain.zone_package_schemas import (
    ArchiveCollection,
    ArchiveLayer,
    BaseArchive,
    GroundGeometry,
    LegacyZone,
)
from fieldmaps_api.zone_geometry_schemas import MAX_PACKAGE_ZONES, Position

MAX_EXPANDED_BYTES: Final = 5 * MAX_ARCHIVE_BYTES
_GROUND: Final[TypeAdapter[GroundGeometry]] = TypeAdapter(GroundGeometry)
_GEOMETRY: Final[TypeAdapter[Geometry]] = TypeAdapter(Geometry)
_POSITION: Final[TypeAdapter[Position]] = TypeAdapter(Position)


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
        message = "The retained package contains an unsupported layer"
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


def _legacy_zones(manifest: Manifest, payload: bytes) -> tuple[LegacyZone, ...]:
    if manifest.format != 1:
        return ()
    collection = ArchiveCollection.model_validate_json(payload)
    labels = {zone.id: zone.label for zone in manifest.zones}
    zones: list[LegacyZone] = []
    for feature in collection.features:
        code = _text(feature.properties.get("id"))
        if code is None or code not in labels:
            message = "The retained zone layer does not match its manifest"
            raise PackageError(message)
        zones.append(
            LegacyZone(
                zone_code=code,
                zone_label=labels[code],
                geometry=_GROUND.validate_python(feature.geometry),
            )
        )
    if len(zones) != len(labels) or len({zone.zone_code for zone in zones}) != len(zones):
        message = "The retained zone layer does not match its manifest"
        raise PackageError(message)
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
            if (
                len(set(names)) != len(names)
                or not set(names) <= permitted
                or not {"manifest.json", "layers/ground.json", "layers/zones.json"} <= set(names)
                or sum(entry.file_size for entry in entries) > MAX_EXPANDED_BYTES
                or any(entry.flag_bits & 1 for entry in entries)
            ):
                message = "The retained archive has unsupported or oversized entries"
                raise PackageError(message)
            manifest = Manifest.model_validate_json(opened.read("manifest.json"))
            layers = tuple(
                _read_layer(name, opened.read(f"layers/{name}.json"))
                for name in LAYER_ORDER
                if f"layers/{name}.json" in names
            )
    except (zipfile.BadZipFile, ValidationError, UnicodeDecodeError) as error:
        message = "The retained package is not a readable polygon package"
        raise PackageError(message) from error
    records = {record.name: record for record in manifest.layers}
    if (
        manifest.format not in {1, 2}
        or len(records) != len(manifest.layers)
        or set(records) != {layer.name for layer in layers}
        or any(
            records[layer.name].features != layer.features
            or records[layer.name].sha256 != sha256(layer.payload).hexdigest()
            for layer in layers
        )
    ):
        message = "The retained layer checksum or feature count does not match its manifest"
        raise PackageError(message)
    by_name = {layer.name: layer for layer in layers}
    try:
        ground = _ground(by_name["ground"].payload)
        zones = _legacy_zones(manifest, by_name["zones"].payload)
    except ValidationError as error:
        message = "The retained package needs usable two-dimensional site and zone polygons"
        raise PackageError(message) from error
    return BaseArchive(
        manifest,
        layers,
        ground,
        zones,
        (
            PreparationCheck(
                step="layer-sources", state="passed", detail="Retained base layers verified"
            ),
        ),
    )


def prepare_import_base(submission: PackageSubmission) -> BaseArchive:
    if not {"ground", "zones"} <= submission.layers.keys():
        message = "A package needs a ground and a zones layer"
        raise PackageError(message)
    if any(len(layer.features) > MAX_FEATURES_PER_LAYER for layer in submission.layers.values()):
        message = "A layer exceeds the feature count ceiling"
        raise PackageError(message)
    if not 1 <= len(submission.layers["zones"].features) <= MAX_PACKAGE_ZONES:
        message = "A managed package needs between 1 and 250 zones"
        raise PackageError(message)
    checks: list[PreparationCheck] = []
    project = read_source_project(submission.project_file, checks)
    check_layer_sources(submission, project, checks)
    check_coordinate_reference(submission, project, checks)
    check_imagery_licence(project, NO_PERMITTED_HOSTS, checks)
    if any(check.state == "blocked" for check in checks):
        message = "The imported sources did not pass package preparation"
        raise PackageError(message)
    layers = tuple(
        _read_layer(name, layer_bytes(submission.layers[name]))
        for name in LAYER_ORDER
        if name in submission.layers
    )
    ground = _ground(next(layer.payload for layer in layers if layer.name == "ground"))
    extent = derive_extent(submission)
    manifest = Manifest(
        site_code=submission.site_code,
        form_version=submission.form_version,
        extent=extent,
        centre=extent.centre(),
        zones=(),
        layers=tuple(
            LayerRecord(
                name=layer.name, features=layer.features, sha256=sha256(layer.payload).hexdigest()
            )
            for layer in layers
        ),
        source_project=project,
    )
    return BaseArchive(manifest, layers, ground, (), tuple(checks))
