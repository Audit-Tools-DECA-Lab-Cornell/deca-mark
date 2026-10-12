import zipfile
from hashlib import sha256
from io import BytesIO
from typing import TYPE_CHECKING
from uuid import UUID

import pytest

if TYPE_CHECKING:
    from pydantic import JsonValue

from fieldmaps_api.domain.packages import PackageError
from fieldmaps_api.domain.zone_archive import extract_base_archive, prepare_import_base
from fieldmaps_api.domain.zone_package_schemas import (
    ArchiveCollection,
    PackageIdentity,
    PreparedZonePackage,
    ZonePackageManifest,
)
from fieldmaps_api.domain.zone_packages import prepare_zone_package
from fieldmaps_api.zone_import_schemas import PackageRequest
from fieldmaps_api.zone_response_schemas import ImportValidation, PackageForms

SITE = UUID("80000000-0000-4000-8000-000000000001")
PACKAGE = UUID("81000000-0000-4000-8000-000000000001")
ZONE = UUID("82000000-0000-4000-8000-000000000001")
PRECISION = 0.12345678901234568


def source(count: int = 1) -> PackageRequest:
    polygon: dict[str, JsonValue] = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [0.8, 0], [0.8, 0.8], [0, 0.8], [0, 0]]],
    }
    zone = {
        "type": "Feature",
        "geometry": polygon,
        "properties": {"id": "A", "name": "Source zone"},
    }
    return PackageRequest.model_validate(
        {
            "site_id": str(SITE),
            "form_version": "play-v1",
            "request_id": "84000000-0000-4000-8000-000000000001",
            "expected_current_package_id": None,
            "change_note": "Synthetic package test",
            "zone_identity_map": [
                {
                    "source_feature_id": "A",
                    "zone_id": str(ZONE),
                    "zone_code": "A",
                }
            ],
            "layers": {
                "ground": {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": polygon,
                            "properties": {"kind": "site"},
                        }
                    ],
                },
                "zones": {"type": "FeatureCollection", "features": [zone] * count},
                "paths": {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [[0, 0], [0.2, 0.2]],
                            },
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


def prepared(count: int = 1) -> PreparedZonePackage:
    request, bindings = source(), forms()
    base = prepare_import_base(request, "NORTH", bindings)
    return prepare_zone_package(base, identity(), bindings, validation(count))


def test_archive_contains_the_single_current_format_and_canonical_zone_shape() -> None:
    result = prepared()
    with zipfile.ZipFile(BytesIO(result.archive)) as archive:
        manifest = ZonePackageManifest.model_validate_json(archive.read("manifest.json"))
        layer = ArchiveCollection.model_validate_json(archive.read("layers/zones.json"))
    assert manifest.model_dump(mode="json").keys() == {
        "format",
        "site_id",
        "site_code",
        "package_id",
        "package_version",
        "forms",
        "zones",
    }
    assert manifest.format == 1
    assert (manifest.site_id, manifest.package_id, manifest.package_version) == (SITE, PACKAGE, 4)
    assert manifest.forms == forms()
    assert set(layer.features[0].properties) == {
        "zone_id",
        "zone_code",
        "name",
        "display_anchor",
        "geometry_sha256",
    }
    assert result.zone_layer.features[0].geometry.coordinates[0][0][0][0] == PRECISION
    assert (
        manifest.zones[0].display_anchor
        == result.zone_layer.features[0].properties.display_anchor
    )
    assert result.archive_sha256 == sha256(result.archive).hexdigest()


@pytest.mark.parametrize("count", [65, 250])
def test_current_package_limit_accepts_up_to_250_zones(count: int) -> None:
    assert len(prepared(count).manifest.zones) == count


def test_current_archive_can_be_retained_as_a_publication_base() -> None:
    first = prepared()
    retained = extract_base_archive(first.archive, first.archive_sha256)
    assert retained.ground.type == "Polygon"
    assert retained.zones[0].zone_id == ZONE
    assert retained.zones[0].geometry == first.zone_layer.features[0].geometry


def test_refuses_wrong_archive_hash_when_reading_a_retained_base() -> None:
    result = prepared()
    with pytest.raises(PackageError, match="checksum"):
        extract_base_archive(result.archive, "0" * 64)


def test_archive_is_deterministic_when_same_frozen_inputs_are_used() -> None:
    assert prepared().archive == prepared().archive


def test_refuses_unvalidated_zone_set_when_preparing_archive() -> None:
    invalid = validation().model_copy(update={"ready": False})
    base = prepare_import_base(source(), "NORTH", forms())
    with pytest.raises(PackageError, match="validated"):
        prepare_zone_package(base, identity(), forms(), invalid)


def test_zone_layer_is_exact_json_shape_used_by_the_archive() -> None:
    result = prepared()
    with zipfile.ZipFile(BytesIO(result.archive)) as archive:
        layer = ArchiveCollection.model_validate_json(archive.read("layers/zones.json"))
    assert layer.model_dump(mode="json") == result.zone_layer.model_dump(mode="json")


def test_refuses_more_than_the_current_250_zone_limit() -> None:
    with pytest.raises(PackageError, match="between 1 and 250"):
        prepare_import_base(source(251), "NORTH", forms())
