import zipfile
from hashlib import sha256
from io import BytesIO
from typing import Final, assert_never

from fieldmaps_api.domain.packages import (
    EXTENT_MARGIN_DEGREES,
    LAYER_ORDER,
    MAX_ARCHIVE_BYTES,
    Extent,
    LayerRecord,
    PackageError,
    PreparationCheck,
    write_archive_entry,
)
from fieldmaps_api.domain.zone_package_schemas import (
    BaseArchive,
    GroundGeometry,
    GroundMultiPolygon,
    GroundPolygon,
    ManifestV2,
    ManifestZoneV2,
    PackageIdentity,
    PreparedZonePackage,
    ZoneLayer,
    ZoneLayerFeature,
    ZoneLayerProperties,
)
from fieldmaps_api.zone_geometry_schemas import (
    MAX_PACKAGE_POSITIONS,
    MAX_PACKAGE_ZONES,
    position_count,
)
from fieldmaps_api.zone_response_schemas import (
    CanonicalZone,
    ImportValidation,
    InternalZoneValidation,
    PackageForms,
)

MAX_PUBLICATION_LATITUDE: Final = 85
MAX_PUBLICATION_SPAN: Final = 1


def _zone_positions(zone: CanonicalZone) -> list[tuple[float, float]]:
    return [position for part in zone.geometry.coordinates for ring in part for position in ring]


def _ground_positions(ground: GroundGeometry) -> list[tuple[float, float]]:
    match ground:
        case GroundPolygon(coordinates=rings):
            return [point for ring in rings for point in ring]
        case GroundMultiPolygon(coordinates=parts):
            return [point for part in parts for ring in part for point in ring]
    assert_never(ground)


def _manifest_zone(zone: CanonicalZone) -> ManifestZoneV2:
    every = _zone_positions(zone)
    return ManifestZoneV2(
        id=zone.zone_code,
        label=zone.zone_label,
        zone_id=zone.zone_id,
        zone_code=zone.zone_code,
        west=min(point[0] for point in every),
        south=min(point[1] for point in every),
        east=max(point[0] for point in every),
        north=max(point[1] for point in every),
        display_anchor=zone.display_anchor,
        geometry_sha256=zone.geometry_sha256,
    )


def prepare_zone_package(
    base: BaseArchive,
    identity: PackageIdentity,
    forms: PackageForms,
    validation: ImportValidation | InternalZoneValidation,
) -> PreparedZonePackage:
    zones = validation.canonical_zones
    if not validation.ready or validation.issues:
        message = "Package zones must be validated before archive preparation"
        raise PackageError(message)
    if not 1 <= len(zones) <= MAX_PACKAGE_ZONES or (
        sum(position_count(zone.geometry) for zone in zones) > MAX_PACKAGE_POSITIONS
    ):
        message = "The zone set exceeds the publication complexity limits"
        raise PackageError(message)
    if forms.play.form_version != base.manifest.form_version:
        message = "The frozen play form does not match the base package"
        raise PackageError(message)
    published_positions = [
        *_ground_positions(base.ground),
        *(point for zone in zones for point in _zone_positions(zone)),
    ]
    if (
        any(
            not -MAX_PUBLICATION_LATITUDE <= point[1] <= MAX_PUBLICATION_LATITUDE
            for point in published_positions
        )
        or max(point[0] for point in published_positions)
        - min(point[0] for point in published_positions)
        > MAX_PUBLICATION_SPAN
        or max(point[1] for point in published_positions)
        - min(point[1] for point in published_positions)
        > MAX_PUBLICATION_SPAN
    ):
        message = "The site and zones exceed the supported publication extent"
        raise PackageError(message)
    zone_layer = ZoneLayer(
        features=tuple(
            ZoneLayerFeature(
                geometry=GroundMultiPolygon(
                    type="MultiPolygon", coordinates=zone.geometry.coordinates
                ),
                properties=ZoneLayerProperties(
                    id=zone.zone_code,
                    zone_id=zone.zone_id,
                    zone_code=zone.zone_code,
                    name=zone.zone_label,
                    display_anchor=zone.display_anchor,
                    geometry_sha256=zone.geometry_sha256,
                ),
            )
            for zone in zones
        )
    )
    layer_bytes = zone_layer.model_dump_json().encode()
    payloads = {layer.name: layer.payload for layer in base.layers if layer.name != "zones"}
    payloads["zones"] = layer_bytes
    retained = [
        LayerRecord(
            name=layer.name, features=layer.features, sha256=sha256(layer.payload).hexdigest()
        )
        for layer in base.layers
        if layer.name != "zones"
    ]
    retained.append(
        LayerRecord(name="zones", features=len(zones), sha256=sha256(layer_bytes).hexdigest())
    )
    all_positions = [
        point for layer in base.layers if layer.name != "zones" for point in layer.positions
    ]
    all_positions.extend(point for zone in zones for point in _zone_positions(zone))
    extent = Extent(
        west=max(-180, min(point[0] for point in all_positions) - EXTENT_MARGIN_DEGREES),
        south=max(-90, min(point[1] for point in all_positions) - EXTENT_MARGIN_DEGREES),
        east=min(180, max(point[0] for point in all_positions) + EXTENT_MARGIN_DEGREES),
        north=min(90, max(point[1] for point in all_positions) + EXTENT_MARGIN_DEGREES),
    )
    manifest = ManifestV2(
        site_code=identity.site_code,
        form_version=forms.play.form_version,
        extent=extent,
        centre=extent.centre(),
        zones=tuple(_manifest_zone(zone) for zone in zones),
        layers=tuple(retained),
        source_project=base.manifest.source_project,
        site_id=identity.site_id,
        package_id=identity.package_id,
        package_version=identity.package_version,
        forms=forms,
    )
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        write_archive_entry(archive, "manifest.json", manifest.model_dump_json(indent=2).encode())
        for name in LAYER_ORDER:
            if name in payloads:
                write_archive_entry(archive, f"layers/{name}.json", payloads[name])
    archive_bytes = buffer.getvalue()
    if len(archive_bytes) > MAX_ARCHIVE_BYTES:
        message = "The prepared archive exceeds the 16 MB package size ceiling"
        raise PackageError(message)
    checks = (
        *base.checks,
        PreparationCheck(
            step="archive",
            state="passed",
            detail=f"{len(payloads)} layers, {len(zones)} zones, {len(archive_bytes) // 1024} KB",
        ),
    )
    return PreparedZonePackage(
        manifest, zone_layer, layer_bytes, checks, archive_bytes, sha256(archive_bytes).hexdigest()
    )
