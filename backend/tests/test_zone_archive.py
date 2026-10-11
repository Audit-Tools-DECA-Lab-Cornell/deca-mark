from dataclasses import replace

import pytest

from fieldmaps_api.domain.geojson import LineStringGeometry, PolygonGeometry
from fieldmaps_api.domain.packages import PackageError
from fieldmaps_api.domain.zone_archive import prepare_import_base
from fieldmaps_api.domain.zone_package_schemas import GroundPolygon
from fieldmaps_api.domain.zone_packages import prepare_zone_package
from tests.test_zone_packages import forms, identity, source, validation


def test_ground_has_no_zone_position_cap_when_retaining_an_import() -> None:
    supplied = source()
    site_feature = supplied.layers["ground"].features[0]
    geometry = PolygonGeometry(
        type="Polygon",
        coordinates=[[[0.0, 0.0], [0.8, 0.0], [0.8, 0.8], [0.0, 0.8], *([[0.0, 0.0]] * 1_997)]],
    )
    supplied = supplied.model_copy(
        update={
            "layers": {
                **supplied.layers,
                "ground": supplied.layers["ground"].model_copy(
                    update={"features": [site_feature.model_copy(update={"geometry": geometry})]}
                ),
            }
        }
    )
    base = prepare_import_base(supplied)
    assert isinstance(base.ground, GroundPolygon)
    assert len(base.ground.coordinates[0]) == 2_001


def test_refuses_unsupported_ground_extent_when_building_a_new_publication() -> None:
    base = prepare_import_base(source())
    broad_ground = GroundPolygon(
        type="Polygon", coordinates=(((0.0, 0.0), (1.1, 0.0), (1.1, 0.8), (0.0, 0.8), (0.0, 0.0)),)
    )
    with pytest.raises(PackageError, match="publication extent"):
        prepare_zone_package(replace(base, ground=broad_ground), identity(), forms(), validation())


def test_navigation_extent_contains_retained_reference_positions_when_zones_change() -> None:
    supplied = source()
    path = (
        supplied.layers["paths"]
        .features[0]
        .model_copy(
            update={
                "geometry": LineStringGeometry(type="LineString", coordinates=[[0, 0], [1.2, 0.2]])
            }
        )
    )
    supplied = supplied.model_copy(
        update={
            "layers": {
                **supplied.layers,
                "paths": supplied.layers["paths"].model_copy(update={"features": [path]}),
            }
        }
    )
    base = prepare_import_base(supplied)
    result = prepare_zone_package(base, identity(), forms(), validation())
    assert result.manifest.extent.east == 1.2004


@pytest.mark.parametrize("latitude", [-85.0000001, 85.0000001])
def test_refuses_polar_ground_when_new_publication_is_prepared(latitude: float) -> None:
    base = prepare_import_base(source())
    south = latitude if latitude < 0 else latitude - 0.1
    north = latitude + 0.1 if latitude < 0 else latitude
    ground = GroundPolygon(
        type="Polygon",
        coordinates=(((0.0, south), (0.8, south), (0.8, north), (0.0, north), (0.0, south)),),
    )
    with pytest.raises(PackageError, match="publication extent"):
        prepare_zone_package(replace(base, ground=ground), identity(), forms(), validation())
