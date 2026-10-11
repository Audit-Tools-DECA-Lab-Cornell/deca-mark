import zipfile
from hashlib import sha256
from io import BytesIO
from uuid import UUID

import pytest
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.packages import PackageError, PackageSubmission, prepare
from fieldmaps_api.domain.zone_archive import extract_base_archive, prepare_import_base
from fieldmaps_api.domain.zone_package_schemas import ManifestV2, PackageIdentity, ZoneLayer
from fieldmaps_api.domain.zone_packages import prepare_zone_package
from fieldmaps_api.zone_response_schemas import ImportValidation, PackageForms

SITE = UUID("80000000-0000-4000-8000-000000000001")
PACKAGE = UUID("81000000-0000-4000-8000-000000000001")
ZONE = UUID("82000000-0000-4000-8000-000000000001")
PRECISION = 0.12345678901234568


def source() -> PackageSubmission:
    polygon: dict[str, JsonValue] = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [0.8, 0], [0.8, 0.8], [0, 0.8], [0, 0]]],
    }
    return PackageSubmission.model_validate(
        {
            "site_code": "NORTH",
            "form_version": "play-v1",
            "layers": {
                "ground": {
                    "type": "FeatureCollection",
                    "features": [
                        {"type": "Feature", "geometry": polygon, "properties": {"kind": "site"}}
                    ],
                },
                "zones": {
                    "type": "FeatureCollection",
                    "features": [
                        {"type": "Feature", "geometry": polygon, "properties": {"id": "A"}}
                    ],
                },
                "paths": {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": {"type": "LineString", "coordinates": [[0, 0], [0.2, 0.2]]},
                            "properties": {"name": "retained path"},
                        }
                    ],
                },
                "trees": {"type": "FeatureCollection", "features": []},
            },
        }
    )


def forms() -> PackageForms:
    return PackageForms.model_validate(
        {
            "play": {
                "form_version_id": "83000000-0000-4000-8000-000000000001",
                "form_version": "play-v1",
            },
            "inventory": None,
        }
    )


def validation(count: int = 1) -> ImportValidation:
    return ImportValidation.model_validate(
        {
            "ready": True,
            "issues": [],
            "warnings": [],
            "zones": [],
            "site_gap_area_m2": 0,
            "canonical_zones": [
                {
                    "zone_id": str(UUID(int=ZONE.int + index)),
                    "zone_code": f"A{index}",
                    "zone_label": f"Zone {index}",
                    "geometry": {
                        "type": "MultiPolygon",
                        "coordinates": [
                            [
                                [
                                    [PRECISION, 0],
                                    [0.3, 0],
                                    [0.3, 0.3],
                                    [PRECISION, 0.3],
                                    [PRECISION, 0],
                                ]
                            ]
                        ],
                    },
                    "display_anchor": [0.2, 0.15],
                    "geometry_sha256": "a" * 64,
                }
                for index in range(count)
            ],
        }
    )


def identity() -> PackageIdentity:
    return PackageIdentity(SITE, PACKAGE, 4, "NORTH")


def test_retains_reference_bytes_when_publishing_canonical_zones() -> None:
    legacy = prepare(source())
    base = extract_base_archive(legacy.archive, legacy.archive_sha256)
    result = prepare_zone_package(base, identity(), forms(), validation())
    with (
        zipfile.ZipFile(BytesIO(legacy.archive)) as old,
        zipfile.ZipFile(BytesIO(result.archive)) as new,
    ):
        for name in ("ground", "paths", "trees"):
            assert new.read(f"layers/{name}.json") == old.read(f"layers/{name}.json")
        manifest = ManifestV2.model_validate_json(new.read("manifest.json"))
        layer = ZoneLayer.model_validate_json(new.read("layers/zones.json"))
    assert manifest.forms == forms()
    assert manifest.package_id == PACKAGE
    assert layer == result.zone_layer
    assert layer.features[0].geometry.coordinates[0][0][0][0] == PRECISION
    assert manifest.zones[0].display_anchor == layer.features[0].properties.display_anchor
    assert manifest.zones[0].geometry_sha256 == "a" * 64
    assert result.archive_sha256 == sha256(result.archive).hexdigest()
    assert (
        next(record for record in manifest.layers if record.name == "zones").sha256
        == sha256(result.zone_layer_bytes).hexdigest()
    )


@pytest.mark.parametrize("count", [65, 250])
def test_new_format_uses_contract_cap_when_more_than_legacy_limit(count: int) -> None:
    base = prepare_import_base(source())
    result = prepare_zone_package(base, identity(), forms(), validation(count))
    assert len(result.manifest.zones) == count


def test_extracts_actual_ground_when_legacy_archive_has_only_bbox_metadata() -> None:
    legacy = prepare(source())
    base = extract_base_archive(legacy.archive, legacy.archive_sha256)
    assert base.ground.type == "Polygon"
    assert base.legacy_zones[0].zone_code == "A"
    assert base.legacy_zones[0].geometry == base.ground


def test_refuses_wrong_archive_hash_when_reading_a_retained_base() -> None:
    legacy = prepare(source())
    with pytest.raises(PackageError, match="checksum"):
        extract_base_archive(legacy.archive, "0" * 64)


def test_archive_is_deterministic_when_same_frozen_inputs_are_used() -> None:
    base = prepare_import_base(source())
    first = prepare_zone_package(base, identity(), forms(), validation())
    second = prepare_zone_package(base, identity(), forms(), validation())
    assert first.archive == second.archive


def test_readable_format_two_can_be_retained_for_a_later_publication() -> None:
    result = prepare_zone_package(prepare_import_base(source()), identity(), forms(), validation())
    base = extract_base_archive(result.archive, result.archive_sha256)
    assert base.ground == prepare_import_base(source()).ground
    assert base.legacy_zones == ()


def test_refuses_invalid_topology_result_when_preparing_archive() -> None:
    invalid = validation().model_copy(update={"ready": False})
    with pytest.raises(PackageError, match="validated"):
        prepare_zone_package(prepare_import_base(source()), identity(), forms(), invalid)


def test_zone_layer_is_exact_sql_shape_when_built_from_canonical_snapshot() -> None:
    result = prepare_zone_package(prepare_import_base(source()), identity(), forms(), validation())
    json_adapter: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)
    parsed = json_adapter.validate_json(result.zone_layer_bytes)
    assert parsed == result.zone_layer.model_dump(mode="json")


@pytest.mark.parametrize("count", [65, 250])
def test_managed_source_accepts_actual_features_when_above_legacy_limit(count: int) -> None:
    supplied = source()
    supplied = supplied.model_copy(
        update={
            "layers": {
                **supplied.layers,
                "zones": supplied.layers["zones"].model_copy(
                    update={"features": supplied.layers["zones"].features * count}
                ),
            }
        }
    )
    base = prepare_import_base(supplied)
    assert next(layer for layer in base.layers if layer.name == "zones").features == count
    with pytest.raises(PackageError, match="64"):
        prepare(supplied)


@pytest.mark.parametrize("count", [0, 2])
def test_refuses_missing_or_multiple_ground_site_features(count: int) -> None:
    supplied = source()
    supplied = supplied.model_copy(
        update={
            "layers": {
                **supplied.layers,
                "ground": supplied.layers["ground"].model_copy(
                    update={"features": supplied.layers["ground"].features * count}
                ),
            }
        }
    )
    with pytest.raises(PackageError, match="exactly one"):
        prepare_import_base(supplied)


def test_retained_layer_checksum_is_required_when_archive_hash_is_matching() -> None:
    original = prepare(source())
    buffer = BytesIO()
    with zipfile.ZipFile(BytesIO(original.archive)) as old, zipfile.ZipFile(buffer, "w") as altered:
        for name in old.namelist():
            payload = old.read(name)
            if name == "layers/ground.json":
                payload = payload.replace(b'"site"', b'"site "')
            altered.writestr(name, payload)
    corrupted = buffer.getvalue()
    with pytest.raises(PackageError, match="checksum"):
        extract_base_archive(corrupted, sha256(corrupted).hexdigest())
