import json
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZipInfo

import anyio
import fiona
import pytest

from fieldmaps_api.domain import qgis_project
from fieldmaps_api.domain.project_import import ProjectImportRequest
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.services.project_import import import_project

type Json = dict[str, object]


def collection(*features: Json) -> Json:
    return {"type": "FeatureCollection", "features": list(features)}


def polygon(west: float, south: float, east: float, north: float, **properties: object) -> Json:
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[west, south], [east, south], [east, north], [west, north], [west, south]]
            ],
        },
    }


def ground_layer() -> Json:
    return collection(
        polygon(-76.4865, 42.447, -76.4835, 42.449, kind="site"),
        polygon(-76.4861, 42.4481, -76.4852, 42.4487, kind="structure"),
    )


def zones_layer() -> Json:
    return collection(
        polygon(-76.4864, 42.4478, -76.485, 42.4489, id="A", label="Zone A · West lawn"),
        polygon(-76.485, 42.448, -76.4836, 42.4489, id="B"),
    )


def packed(files: dict[str, bytes]) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def document(source: str = "ground.geojson", provider: str = "ogr") -> bytes:
    return (
        '<!DOCTYPE qgis PUBLIC "http://mrcc.com/qgis.dtd" "SYSTEM">'
        "<qgis><title>Test site</title><projectlayers>"
        f'<maplayer type="vector"><layername>ground</layername><provider>{provider}</provider>'
        f"<datasource>{source}</datasource></maplayer>"
        '<maplayer type="vector"><layername>zones</layername><provider>ogr</provider>'
        "<datasource>zones.geojson</datasource></maplayer></projectlayers></qgis>"
    ).encode()


def request(files: dict[str, bytes]) -> ProjectImportRequest:
    return ProjectImportRequest.model_validate(
        {
            "files": [
                {"file_name": name, "content": b64encode(data).decode()}
                for name, data in files.items()
            ],
        }
    )


def test_normal_qgis_doctype_is_accepted_without_allowing_entities() -> None:
    assert qgis_project.title(qgis_project.parse(document().decode())) == "Test site"


def test_qgz_with_embedded_layers_converts_without_geojson_uploads() -> None:
    uploaded = request(
        {
            "site.qgz": packed(
                {
                    "site.qgs": document(),
                    "ground.geojson": json.dumps(ground_layer()).encode(),
                    "zones.geojson": json.dumps(zones_layer()).encode(),
                }
            )
        }
    )
    result = anyio.run(import_project, uploaded)
    assert [layer.name for layer in result.layers] == ["ground", "zones"]
    assert len(result.layers[1].collection.features) == 2
    assert not result.issues


def test_missing_local_sources_are_named_and_never_read_from_the_host() -> None:
    uploaded = request({"site.qgz": packed({"site.qgs": document("/etc/passwd")})})
    result = anyio.run(import_project, uploaded)
    assert not result.layers
    assert len(result.issues) == 2
    assert "passwd" in result.issues[0].message


@pytest.mark.parametrize("filename", ["../escape.geojson", "/outside/escape.geojson"])
def test_archive_paths_cannot_escape_the_import(filename: str) -> None:
    uploaded = request({"site.zip": packed({"site.qgs": document(), filename: b"{}"})})
    with pytest.raises(ValidationFailedError, match="path"):
        anyio.run(import_project, uploaded)


def test_remote_sources_are_reported_without_fetching_them() -> None:
    uploaded = request({"site.qgs": document("http://127.0.0.1/private.geojson")})
    result = anyio.run(import_project, uploaded)
    assert not result.layers
    assert "remote" in result.issues[0].message.lower()


@pytest.mark.parametrize(("driver", "suffix"), [("GPKG", ".gpkg"), ("ESRI Shapefile", ".shp")])
def test_project_sources_are_reprojected_from_web_mercator(
    tmp_path: Path,
    driver: str,
    suffix: str,
) -> None:
    source = tmp_path / f"boundary{suffix}"
    with fiona.open(
        source,
        "w",
        driver=driver,
        crs="EPSG:3857",
        schema={
            "geometry": "Polygon",
            "properties": {"kind": "str"},
        },
    ) as dataset:
        dataset.write(
            {
                "type": "Feature",
                "properties": {"kind": "site"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [0, 0],
                            [111319.490793, 0],
                            [111319.490793, 111325.142866],
                            [0, 0],
                        ]
                    ],
                },
            }
        )
    uploaded = request(
        {
            "project.zip": packed(
                {
                    "Drawings/site.qgz": packed(
                        {"site.qgs": document(f"../Data/boundary{suffix}")}
                    ),
                    **{f"Data/{path.name}": path.read_bytes() for path in tmp_path.iterdir()},
                    "Drawings/zones.geojson": json.dumps(zones_layer()).encode(),
                }
            )
        }
    )
    result = anyio.run(import_project, uploaded)
    assert not result.issues
    shape = result.layers[0].collection.features[0].geometry
    assert shape.type == "Polygon"
    assert max(point[0] for point in shape.coordinates[0]) == pytest.approx(1)
    assert max(point[1] for point in shape.coordinates[0]) == pytest.approx(1)


def test_ambiguous_source_names_are_not_guessed() -> None:
    content = json.dumps(ground_layer()).encode()
    uploaded = request(
        {
            "site.zip": packed(
                {
                    "site.qgs": document("/old/folder/ground.geojson"),
                    "one/ground.geojson": content,
                    "two/ground.geojson": content,
                    "zones.geojson": json.dumps(zones_layer()).encode(),
                }
            )
        }
    )
    result = anyio.run(import_project, uploaded)
    assert [layer.name for layer in result.layers] == ["zones"]
    assert "unambiguous" in result.issues[0].message


def test_gdal_cannot_open_a_different_driver_hidden_as_geojson() -> None:
    uploaded = request(
        {
            "site.qgz": packed(
                {
                    "site.qgs": document(),
                    "ground.geojson": b'<OGRVRTDataSource><OGRVRTLayer name="secret">'
                    b"<SrcDataSource>/etc/passwd</SrcDataSource></OGRVRTLayer></OGRVRTDataSource>",
                }
            )
        }
    )
    result = anyio.run(import_project, uploaded)
    assert not result.layers
    assert "could not be read" in result.issues[0].message


def test_project_entities_are_still_rejected() -> None:
    content = b'<!DOCTYPE qgis [<!ENTITY secret SYSTEM "file:///etc/passwd">]><qgis>&secret;</qgis>'
    with pytest.raises(ValidationFailedError, match="entities"):
        anyio.run(import_project, request({"site.qgs": content}))


def test_archive_symlinks_are_rejected_before_native_conversion() -> None:
    output = BytesIO()
    link = ZipInfo("ground.geojson")
    link.create_system = 3
    link.external_attr = 0o120777 << 16
    with ZipFile(output, "w") as archive:
        archive.writestr("site.qgs", document())
        archive.writestr(link, "/etc/passwd")
    with pytest.raises(ValidationFailedError, match="Linked"):
        anyio.run(import_project, request({"site.zip": output.getvalue()}))


def test_duplicate_paths_are_rejected_even_with_different_casing() -> None:
    uploaded = request(
        {
            "site.zip": packed(
                {"site.qgs": document(), "ground.geojson": b"{}", "GROUND.geojson": b"{}"}
            )
        }
    )
    with pytest.raises(ValidationFailedError, match="more than one"):
        anyio.run(import_project, uploaded)


def test_qgis_layer_crs_assignment_is_used_for_conversion(tmp_path: Path) -> None:
    source = tmp_path / "ground.shp"
    with fiona.open(
        source,
        "w",
        driver="ESRI Shapefile",
        schema={
            "geometry": "Point",
            "properties": {"name": "str"},
        },
    ) as dataset:
        dataset.write(
            {
                "type": "Feature",
                "properties": {"name": "Marker"},
                "geometry": {"type": "Point", "coordinates": [111319.490793, 0]},
            }
        )
    project = document("ground.shp").replace(
        b"</maplayer>",
        b"<srs><spatialrefsys><authid>EPSG:3857</authid></spatialrefsys></srs></maplayer>",
        1,
    )
    uploaded = request(
        {"site.qgs": project, **{path.name: path.read_bytes() for path in tmp_path.iterdir()}}
    )
    result = anyio.run(import_project, uploaded)
    assert result.layers[0].collection.features[0].geometry.type == "Point"
    assert result.layers[0].collection.features[0].geometry.coordinates == pytest.approx([1, 0])


def test_filtered_layers_are_not_silently_imported_with_extra_features() -> None:
    project = document().replace(
        b"</maplayer>", b"<subsetstring>kind='site'</subsetstring></maplayer>", 1
    )
    result = anyio.run(
        import_project,
        request(
            {
                "site.qgz": packed(
                    {
                        "site.qgs": project,
                        "ground.geojson": json.dumps(ground_layer()).encode(),
                    }
                )
            }
        ),
    )
    assert not result.layers
    assert "filter" in result.issues[0].message
