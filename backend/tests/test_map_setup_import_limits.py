import json
from base64 import b64encode
from xml.etree.ElementTree import fromstring, tostring

import anyio
import pytest

from fieldmaps_api.domain.geojson import FeatureCollection
from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.services import map_setup_imports
from tests.test_project_import import document, ground_layer, packed, request, zones_layer


def source(name: str = "trees.geojson", coordinates: list[float] | None = None) -> ProjectFile:
    body = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "Point", "coordinates": coordinates or [-76.48, 42.44]},
            }
        ],
    }
    return ProjectFile(file_name=name, content=b64encode(json.dumps(body).encode()))


def test_geojson_point_is_a_usable_reference() -> None:
    # Given a supported point reference in WGS84.
    file = source()
    # When imported without an outline or zone.
    imported = anyio.run(map_setup_imports.convert, [file], "geojson")
    # Then its actual geography is preserved for subsequent boundary drawing.
    assert imported.layers[0].features[0].feature.geometry.coordinates == [-76.48, 42.44]


@pytest.mark.parametrize(
    "name", ["../trees.geojson", "/absolute/trees.geojson", "C:\\trees.geojson"]
)
def test_unsafe_source_paths_are_refused(name: str) -> None:
    # Given an unsafe file path.
    file = source(name)
    # When supplied through the advanced GeoJSON route.
    with pytest.raises(ValidationFailedError):
        anyio.run(map_setup_imports.convert, [file], "geojson")


def test_duplicate_normalized_paths_are_refused() -> None:
    # Given two files whose names normalize to one source.
    files = [source("folder/trees.geojson"), source("folder\\trees.geojson")]
    # When importing them together.
    with pytest.raises(ValidationFailedError):
        anyio.run(map_setup_imports.convert, files, "geojson")


def test_dateline_crossing_geography_is_refused() -> None:
    # Given points on opposite sides of the unsupported dateline.
    body = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "LineString", "coordinates": [[179, 0], [-179, 1]]},
            }
        ],
    }
    file = ProjectFile(file_name="path.geojson", content=b64encode(json.dumps(body).encode()))
    # When importing a map the local projection would draw across the world.
    with pytest.raises(ValidationFailedError):
        anyio.run(map_setup_imports.convert, [file], "geojson")


def test_malformed_geojson_has_a_domain_error() -> None:
    # Given an invalid JSON document.
    file = ProjectFile(file_name="bad.geojson", content=b64encode(b"{broken"))
    # When reading it through setup conversion.
    with pytest.raises(ValidationFailedError):
        anyio.run(map_setup_imports.convert, [file], "geojson")


def test_duplicate_qgis_layer_ids_cannot_silently_share_review_assignments() -> None:
    # Given two QGIS layers with the same explicit identity.
    collection = FeatureCollection.model_validate_json(source().content)
    layer = map_setup_imports.review_layer("same-id", "Trees", collection)
    imported = map_setup_imports.ImportData(layers=[layer, layer], issues=[], project_file=None)
    # When preparing the durable review response.
    with pytest.raises(ValidationFailedError):
        map_setup_imports.checked_result(imported)


def test_project_attachment_limit_is_checked_before_drawing() -> None:
    # Given a converted project larger than the canonical package attachment limit.
    project = ProjectFile(file_name="large.qgs", content=b64encode(b"x" * (8 * 1024 * 1024 + 1)))
    imported = map_setup_imports.ImportData(layers=[], issues=[], project_file=project)
    # When preparing durable setup review.
    with pytest.raises(ValidationFailedError, match="8 MB"):
        map_setup_imports.checked_result(imported)


def test_normalized_response_limit_counts_review_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a normalized response larger than the configured conversion response ceiling.
    monkeypatch.setattr(map_setup_imports, "MAX_CONVERTED_BYTES", 1)
    # When preparing durable setup review.
    with pytest.raises(ValidationFailedError, match="16 MB"):
        anyio.run(map_setup_imports.convert, [source()], "geojson")


def test_project_layer_reordering_preserves_source_review_identity() -> None:

    original = fromstring(document())  # noqa: S314 - fixed synthetic XML only
    reordered = fromstring(document())  # noqa: S314 - fixed synthetic XML only
    container = reordered.find("projectlayers")
    assert container is not None
    container[:] = list(reversed(list(container)))

    def uploaded(xml: bytes) -> list[ProjectFile]:
        return request(
            {
                "map.qgz": packed(
                    {
                        "map.qgs": xml,
                        "ground.geojson": json.dumps(ground_layer()).encode(),
                        "zones.geojson": json.dumps(zones_layer()).encode(),
                    }
                )
            }
        ).files

    first = anyio.run(map_setup_imports.convert, uploaded(tostring(original)), "project")
    second = anyio.run(map_setup_imports.convert, uploaded(tostring(reordered)), "project")
    assert sorted(layer.source_id for layer in first.layers) == sorted(
        layer.source_id for layer in second.layers
    )


def test_long_qgis_layer_identifier_is_bounded_for_setup_storage() -> None:
    long_id = "layer-" + ("x" * 500)
    xml = document().replace(
        b'<maplayer type="vector">',
        f'<maplayer type="vector"><id>{long_id}</id>'.encode(),
        1,
    )
    uploaded = request(
        {
            "map.qgz": packed(
                {
                    "map.qgs": xml,
                    "ground.geojson": json.dumps(ground_layer()).encode(),
                    "zones.geojson": json.dumps(zones_layer()).encode(),
                }
            )
        }
    ).files

    imported = anyio.run(map_setup_imports.convert, uploaded, "project")

    assert imported.layers
    assert all(len(layer.source_id) <= 300 for layer in imported.layers)
