"""Online background maps (D35): what the archive worker and preparation say about them."""

import anyio
import pytest
from pydantic import ValidationError

from fieldmaps_api.domain.packages import InvalidShapeError, OnlineBasemapError, PackageError
from fieldmaps_api.domain.zone_archive import prepare_import_base
from fieldmaps_api.services import zone_archives
from fieldmaps_api.services.zone_publication import request_body
from fieldmaps_api.zone_import_schemas import PackageRequest
from tests.package_fixtures import (
    collection_of,
    line,
    online_basemap,
    point,
    qgis_document,
)
from tests.test_zone_packages import forms, source
from tests.zone_archive_fixtures import import_job, unclosed_ground, with_layer, with_project

SATELLITE = online_basemap("Satellite", "https://mt1.google.com/vt")
STREETS = online_basemap("Streets", "https://tile.example.org/{z}/{x}/{y}.png")
OSM_URL = "https://[abc].tile.openstreetmap.org/{z}/{x}/{y}.png"
OSM_SUBDOMAINS = online_basemap("OpenStreetMap", OSM_URL)
PROJECTED_PATHS = collection_of(line([500000, 4700000], [500010, 4700010]))


def test_a_shape_the_worker_cannot_read_stays_the_ring_refusal() -> None:
    with pytest.raises(InvalidShapeError, match="not a valid publication source"):
        anyio.run(zone_archives.prepare, import_job(unclosed_ground()))


def test_an_online_background_map_is_reported_by_layer_and_host_from_the_worker() -> None:
    request = with_project(qgis_document(SATELLITE, STREETS), "Satellite")
    with pytest.raises(OnlineBasemapError) as refused:
        anyio.run(zone_archives.prepare, import_job(request))
    assert [(layer.name, layer.host) for layer in refused.value.layers] == [
        ("Satellite", "mt1.google.com"),
        ("Streets", "tile.example.org"),
    ]
    assert str(refused.value) == (
        "Satellite (mt1.google.com), Streets (tile.example.org) are online background maps. "
        "Observers see the vector layers only. Upload without them, "
        "or remove them from the project in QGIS."
    )


def test_naming_every_online_background_map_prepares_the_archive_with_a_warning() -> None:
    request = with_project(qgis_document(SATELLITE, STREETS), "Satellite", "Streets")
    result = anyio.run(zone_archives.prepare, import_job(request))
    imagery = [check for check in result.checks if check.step == "imagery-licence"]
    assert [check.state for check in imagery] == ["warning"]
    assert imagery[0].detail == (
        "Satellite (mt1.google.com) is an online background map. "
        "It was not uploaded; observers see the vector layers only. "
        "Streets (tile.example.org) is an online background map. "
        "It was not uploaded; observers see the vector layers only."
    )


def test_preparation_names_the_layer_and_host_of_an_unconfirmed_map() -> None:
    request = with_project(qgis_document(SATELLITE))
    with pytest.raises(OnlineBasemapError, match=r"Satellite \(mt1\.google\.com\) is an online"):
        prepare_import_base(request, "NORTH", forms())


def test_a_problem_that_confirmation_cannot_fix_is_refused_with_its_own_detail() -> None:
    request = with_project(qgis_document(SATELLITE))
    zones = request.layers["zones"]
    assert isinstance(zones, dict)
    declared = request.model_copy(
        update={
            "layers": {
                **request.layers,
                "zones": {**zones, "crs": {"type": "name", "properties": {"name": "EPSG:3857"}}},
            }
        }
    )
    with pytest.raises(PackageError, match="declares a CRS that is not WGS 84") as refused:
        prepare_import_base(declared, "NORTH", forms())
    assert type(refused.value) is PackageError


def test_the_idempotency_record_keeps_a_request_made_before_the_field_existed() -> None:
    before = source().model_dump_json(
        exclude={"inventory_form_version", "leave_out_online_basemaps"}
    )
    assert request_body(source()) == before
    assert "leave_out_online_basemaps" not in request_body(source())
    named = source().model_copy(update={"leave_out_online_basemaps": ("Satellite",)})
    assert '"leave_out_online_basemaps":["Satellite"]' in request_body(named)


def test_the_confirmation_is_a_bounded_list_of_layer_names() -> None:
    plain = source().model_dump(mode="json")
    parsed = PackageRequest.model_validate({**plain, "leave_out_online_basemaps": ["  Satellite "]})
    assert parsed.leave_out_online_basemaps == ("Satellite",)
    assert PackageRequest.model_validate(plain).leave_out_online_basemaps == ()
    for refused in ([""], ["   "], ["layer"] * 65, "Satellite", [1]):
        with pytest.raises(ValidationError):
            PackageRequest.model_validate({**plain, "leave_out_online_basemaps": refused})


def test_a_tile_url_urlparse_rejects_still_asks_the_question_with_no_host() -> None:
    request = with_project(qgis_document(OSM_SUBDOMAINS))
    with pytest.raises(OnlineBasemapError) as refused:
        anyio.run(zone_archives.prepare, import_job(request))
    assert [(layer.name, layer.host) for layer in refused.value.layers] == [
        ("OpenStreetMap", None)
    ]
    assert str(refused.value).startswith("OpenStreetMap is an online background map.")


def test_naming_a_tile_url_urlparse_rejects_leaves_it_out_with_a_warning() -> None:
    request = with_project(qgis_document(OSM_SUBDOMAINS), "OpenStreetMap")
    result = anyio.run(zone_archives.prepare, import_job(request))
    imagery = next(check for check in result.checks if check.step == "imagery-licence")
    assert imagery.state == "warning"
    assert imagery.detail == (
        "OpenStreetMap is an online background map. "
        "It was not uploaded; observers see the vector layers only."
    )


def test_a_layer_that_is_not_in_longitude_and_latitude_is_refused_by_name() -> None:
    request = with_layer("paths", PROJECTED_PATHS)
    with pytest.raises(PackageError, match="paths layer has coordinates") as refused:
        anyio.run(zone_archives.prepare, import_job(request))
    assert type(refused.value) is PackageError
    assert "EPSG:4326" in str(refused.value)


@pytest.mark.parametrize(
    ("layer", "collection", "fragment"),
    [
        ("trees", collection_of(point(-1.5)), "Feature 1 of the trees layer"),
        ("trees", collection_of(point(0.1, 0.1), None), "Feature 2 of the trees layer"),
        ("paths", {"type": "Feature"}, "The paths layer is not a GeoJSON feature collection"),
    ],
    ids=["one coordinate", "no geometry", "not a collection"],
)
def test_a_layer_with_a_shape_that_cannot_be_read_is_refused_by_name(
    layer: str, collection: object, fragment: str
) -> None:
    with pytest.raises(PackageError, match=fragment) as refused:
        prepare_import_base(with_layer(layer, collection), "NORTH", forms())
    assert type(refused.value) is PackageError
    assert "nothing was uploaded" in str(refused.value)
