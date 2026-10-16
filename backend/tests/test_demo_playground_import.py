from base64 import b64encode
from pathlib import Path
from typing import Final
from zipfile import ZipFile

import anyio
import pytest

from fieldmaps_api.domain import qgis_project
from fieldmaps_api.domain.geojson import PolygonGeometry, positions
from fieldmaps_api.domain.project_import import ProjectImportRequest, ProjectImportResult
from fieldmaps_api.services.project_import import import_project

DEMO: Final = Path(__file__).resolve().parents[2] / "qgis" / "demo-playground-2026-10-15"


def imported(filename: str) -> ProjectImportResult:
    artifact = DEMO / filename
    assert artifact.is_file(), f"Janet's uploadable sample is missing: {artifact.name}"
    request = ProjectImportRequest.model_validate(
        {"files": [{"file_name": filename, "content": b64encode(artifact.read_bytes()).decode()}]}
    )
    return anyio.run(import_project, request)


@pytest.mark.parametrize(
    "filename", ["janet-synthetic-playground.qgz", "janet-desktop-project.zip"]
)
def test_demo_archives_import_four_complete_synthetic_layers(filename: str) -> None:
    # Given: the complete single-file website upload or portable Desktop folder.
    # When: the production importer resolves the archive's own vector sources.
    result = imported(filename)
    # Then: no sidecar selection, network request, or missing-source workaround is required.
    assert not result.issues, result.issues
    assert {layer.name for layer in result.layers} == {"ground", "zones", "paths", "trees"}
    assert all(layer.collection.features for layer in result.layers)
    for layer in result.layers:
        for feature in layer.collection.features:
            assert feature.properties["synthetic"] is True
            assert feature.properties["provenance"] == "Invented Janet demonstration 2026-10-15"
            assert str(feature.properties["id"]).startswith("demo-")


def test_starter_zones_fit_the_outline_leave_a_third_zone_and_do_not_overlap() -> None:
    # Given: the sample's two rectangular starter zones.
    # When: importing the delivered QGZ.
    result = imported("janet-synthetic-playground.qgz")
    # Then: valid unique identifiers, site coverage, no interior overlap, and a free north lawn.
    layers = {layer.name: layer.collection for layer in result.layers}
    outlines = [f for f in layers["ground"].features if f.properties.get("kind") == "site"]
    assert len(outlines) == 1
    outline = outlines[0].geometry
    assert isinstance(outline, PolygonGeometry)
    west = min(p[0] for p in positions(outline))
    east = max(p[0] for p in positions(outline))
    south = min(p[1] for p in positions(outline))
    north = max(p[1] for p in positions(outline))
    zones = layers["zones"].features
    assert {z.properties["id"] for z in zones} == {"demo-zone-a", "demo-zone-b"}
    bounds: list[tuple[float, float, float, float]] = []
    for zone in zones:
        assert isinstance(zone.geometry, PolygonGeometry)
        ring = zone.geometry.coordinates[0]
        assert ring[0] == ring[-1]
        assert all(west < p[0] < east and south < p[1] < north for p in ring)
        bounds.append(
            (
                min(p[0] for p in ring),
                min(p[1] for p in ring),
                max(p[0] for p in ring),
                max(p[1] for p in ring),
            )
        )
    a, b = bounds
    assert a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1]
    assert max(a[3], b[3]) < north - 0.0002


def test_desktop_project_sources_resolve_inside_its_portable_archive() -> None:
    # Given: the ordinary QGS delivery rather than QGZ-specific attachment assumptions.
    artifact = DEMO / "janet-desktop-project.zip"
    assert artifact.is_file(), "The portable QGIS Desktop folder is missing"
    # When: resolving the QGS layer references relative to its directory.
    with ZipFile(artifact) as archive:
        document = next(name for name in archive.namelist() if name.endswith(".qgs"))
        root = qgis_project.parse(archive.read(document).decode())
        directory = Path(document).parent
        sources = [node.text for node in root.findall(".//projectlayers/maplayer/datasource")]
        # Then: all four references resolve; no absolute path or network dependency is present.
        assert len(sources) == 4
        for source in sources:
            assert source is not None
            assert source.startswith("./data/")
            assert (directory / source).as_posix() in archive.namelist()


def test_desktop_project_declares_native_crs_and_explicit_draw_order() -> None:
    # Given: a QGIS Desktop project whose ground must render beneath reference layers.
    path = DEMO / "desktop" / "janet-synthetic-playground.qgs"
    # When: reading the native project settings.
    root = qgis_project.parse(path.read_text())
    # Then: the native CRS includes WKT and the explicit order matches the visible layer tree.
    assert root.findtext("projectCrs/spatialrefsys/wkt")
    identifiers = {
        layer.findtext("layername"): layer.findtext("id")
        for layer in root.findall("projectlayers/maplayer")
    }
    expected = [identifiers[name] for name in ("trees", "paths", "zones", "ground")]
    assert [layer.attrib["id"] for layer in root.findall("layerorder/layer")] == expected
    assert [
        layer.attrib["id"] for layer in root.findall("layer-tree-group/layer-tree-layer")
    ] == expected
