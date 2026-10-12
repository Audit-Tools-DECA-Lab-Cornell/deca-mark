import argparse
import json
from pathlib import Path

from qgis.core import (
    Qgis,
    QgsApplication,
    QgsCategorizedSymbolRenderer,
    QgsCoordinateReferenceSystem,
    QgsFillSymbol,
    QgsLayoutExporter,
    QgsLayoutItemLabel,
    QgsLayoutItemMap,
    QgsLayoutPoint,
    QgsLayoutSize,
    QgsMarkerSymbol,
    QgsPalLayerSettings,
    QgsPrintLayout,
    QgsProject,
    QgsReferencedRectangle,
    QgsRendererCategory,
    QgsSingleSymbolRenderer,
    QgsTextFormat,
    QgsVariantUtils,
    QgsVectorLayer,
    QgsVectorLayerSimpleLabeling,
)
from qgis.PyQt.QtGui import QFont


def attribution(value: QgsVectorLayer) -> list[dict]:
    fields = (
        "observation_id",
        "package_id",
        "map_version",
        "zone_id",
        "zone_code",
        "zone_label_at_capture",
        "assignment_basis",
        "spatial_support",
        "round_type",
    )
    return [
        {
            name: None if QgsVariantUtils.isNull(feature[name]) else feature[name]
            for name in fields
        }
        for feature in value.getFeatures()
    ]


def compare_readback(records: list[dict], path: Path) -> None:
    expected = {row["observation_id"]: row for row in json.loads(path.read_text())}
    if len(records) != len(expected) or {
        row["observation_id"] for row in records
    } != set(expected):
        raise ValueError("QGIS record IDs/counts disagree with SQL readback")
    for row in records:
        for name, value in row.items():
            sql_name = "package_version" if name == "map_version" else name
            if value != expected[row["observation_id"]][sql_name]:
                raise ValueError(
                    f"QGIS attribution disagrees with SQL readback: {name}"
                )


def layer(
    directory: Path, filename: str, title: str, expected_count: int
) -> QgsVectorLayer:
    result = QgsVectorLayer(str(directory / filename), title, "ogr")
    if not result.isValid() or result.featureCount() != expected_count:
        raise ValueError(
            f"QGIS provider failed to load {filename} with {expected_count} records"
        )
    result.setReadOnly(True)
    return result


def label_layer(value: QgsVectorLayer, expression: str) -> None:
    settings = QgsPalLayerSettings()
    settings.fieldName = expression
    settings.isExpression = True
    text = QgsTextFormat()
    text.setFont(QFont("Helvetica", 10))
    text.setSize(10)
    settings.setFormat(text)
    value.setLabeling(QgsVectorLayerSimpleLabeling(settings))
    value.setLabelsEnabled(True)


def text_item(
    layout: QgsPrintLayout, value: str, x: int, y: int, width: int, height: int
) -> None:
    label = QgsLayoutItemLabel(layout)
    label.setText(value)
    text = QgsTextFormat()
    text.setFont(QFont("Helvetica", 10))
    text.setSize(10)
    label.setTextFormat(text)
    layout.addLayoutItem(label)
    label.attemptMove(QgsLayoutPoint(x, y))
    label.attemptResize(QgsLayoutSize(width, height))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render synthetic GIS-09 analysis in the installed QGIS runtime"
    )
    parser.add_argument("directory", type=Path)
    parser.add_argument("--delayed-point", required=True)
    parser.add_argument("--historical-version", type=int, default=7)
    parser.add_argument("--current-version", type=int, default=8)
    parser.add_argument("--prefix", type=Path, required=True)
    parser.add_argument("--sql-readback", type=Path)
    args = parser.parse_args()
    args.directory = args.directory.resolve()
    application = QgsApplication([], False)
    application.setPrefixPath(str(args.prefix), True)
    application.initQgis()
    project = QgsProject.instance()
    try:
        checks = json.loads((args.directory / "projection-checks.json").read_text())
        zones = layer(
            args.directory,
            "historical-zones.geojson",
            "Synthetic recorded zones: v7 and v8",
            checks["historical_snapshot_count"],
        )
        points = layer(
            args.directory,
            "point-events.geojson",
            "Synthetic point events; inventory excluded",
            checks["point_event_count"],
        )
        inventories = layer(
            args.directory,
            "inventory-records.geojson",
            "Synthetic whole-zone inventories; legacy geometry unknown",
            checks["inventory_record_count"],
        )
        legacy = layer(
            args.directory,
            "legacy-records.geojson",
            "Synthetic legacy records; no inferred version",
            checks["legacy_record_count"],
        )
        for value in (zones, points, inventories, legacy):
            if value.isSpatial() and value.crs().authid() not in {
                "EPSG:4326",
                "OGC:CRS84",
            }:
                raise ValueError("QGIS layers must retain WGS84 longitude/latitude")
            project.addMapLayer(value)
        colors = {
            args.historical_version: "37,110,179,255",
            args.current_version: "202,107,28,255",
        }
        categories = []
        for version, color in colors.items():
            symbol = QgsFillSymbol.createSimple(
                {
                    "color": "255,255,255,0",
                    "outline_color": color,
                    "outline_width": "0.9",
                }
            )
            categories.append(
                QgsRendererCategory(version, symbol, f"Synthetic v{version}")
            )
        zones.setRenderer(QgsCategorizedSymbolRenderer("map_version", categories))
        label_layer(
            zones, "\"zone_label_at_capture\" || ' (v' || \"map_version\" || ')'"
        )
        points.setRenderer(
            QgsSingleSymbolRenderer(
                QgsMarkerSymbol.createSimple(
                    {
                        "name": "circle",
                        "color": "25,25,25,255",
                        "outline_color": "255,255,255,255",
                        "size": "3.5",
                    }
                )
            )
        )
        label_layer(
            points,
            'CASE WHEN "observation_id" = \''
            + args.delayed_point
            + "' THEN 'Delayed v7 point' ELSE 'Point event' END",
        )
        inventories.setRenderer(
            QgsSingleSymbolRenderer(
                QgsFillSymbol.createSimple(
                    {
                        "color": "142,99,179,100",
                        "outline_color": "105,61,145,255",
                        "outline_width": "0.8",
                    }
                )
            )
        )
        label_layer(inventories, "'Whole-zone inventory v' || \"map_version\"")
        delayed = [
            feature
            for feature in points.getFeatures()
            if feature["observation_id"] == args.delayed_point
        ]
        if len(delayed) != 1 or delayed[0]["map_version"] != args.historical_version:
            raise ValueError(
                "Delayed point does not retain the historical package version"
            )
        matching = [
            feature
            for feature in zones.getFeatures()
            if feature["package_id"] == delayed[0]["package_id"]
            and feature["zone_id"] == delayed[0]["zone_id"]
        ]
        current = [
            feature
            for feature in zones.getFeatures()
            if feature["map_version"] == args.current_version
            and feature["zone_id"] == delayed[0]["zone_id"]
        ]
        if len(matching) != 1 or len(current) != 1:
            raise ValueError(
                "Expected one historical and one current snapshot for the retained identity"
            )
        if not matching[0].geometry().intersects(delayed[0].geometry()) or current[
            0
        ].geometry().intersects(delayed[0].geometry()):
            raise ValueError("Synthetic delayed point must be inside v7 and outside v8")
        if matching[0]["zone_label_at_capture"] == current[0]["zone_label_at_capture"]:
            raise ValueError("Synthetic successor must change its recorded label")
        inventory_geometries = 0
        for feature in inventories.getFeatures():
            if feature["assignment_basis"] == "recorded_package":
                key = f"{feature['package_id']}:{feature['zone_id']}"
                snapshot = [row for row in zones.getFeatures() if str(row["id"]) == key]
                if (
                    len(snapshot) != 1
                    or feature.geometry().asWkb() != snapshot[0].geometry().asWkb()
                ):
                    raise ValueError(
                        "Inventory does not render its exact historical MultiPolygon"
                    )
                inventory_geometries += 1
            elif not feature.geometry().isNull():
                raise ValueError(
                    "Legacy inventory cannot receive a contemporary polygon"
                )
        if inventory_geometries != checks["inventory_polygon_count"]:
            raise ValueError(
                "QGIS inventory polygon count disagrees with export projection"
            )
        loaded_attribution = {
            "point_events": attribution(points),
            "inventory_records": attribution(inventories),
            "legacy_records": attribution(legacy),
        }
        if args.sql_readback is not None:
            compare_readback(
                loaded_attribution["point_events"]
                + loaded_attribution["inventory_records"],
                args.sql_readback,
            )
        project.setCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
        extent = zones.extent()
        extent.scale(1.2)
        root = project.layerTreeRoot()
        root.findLayer(inventories.id()).setItemVisibilityChecked(False)
        root.findLayer(legacy.id()).setItemVisibilityChecked(False)
        project.viewSettings().setDefaultViewExtent(
            QgsReferencedRectangle(extent, project.crs())
        )
        project.setFileName(str(args.directory / "gis09-synthetic.qgs"))
        if not project.write():
            raise ValueError("QGIS failed to save its project")
        layout = QgsPrintLayout(project)
        layout.initializeDefaults()
        layout.pageCollection().page(0).setPageSize(QgsLayoutSize(297, 210))
        text_item(
            layout,
            "GIS-09: SYNTHETIC acceptance data only — QGIS " + Qgis.QGIS_VERSION,
            8,
            3,
            282,
            12,
        )
        text_item(
            layout,
            "Recorded point events: v7 blue; successor v8 orange",
            8,
            16,
            138,
            12,
        )
        text_item(
            layout,
            "Whole-zone inventory: one polygon feature per record",
            153,
            16,
            138,
            12,
        )
        for x, layers in ((8, [points, zones]), (153, [inventories, zones])):
            item = QgsLayoutItemMap(layout)
            layout.addLayoutItem(item)
            item.attemptMove(QgsLayoutPoint(x, 31))
            item.attemptResize(QgsLayoutSize(136, 145))
            item.setLayers(layers)
            item.setKeepLayerSet(True)
            item.zoomToExtent(extent)
        text_item(
            layout,
            f"{checks['point_event_count']} point events; all inventory anchors excluded.\n"
            "Delayed v7 point lies inside its recorded v7 and outside v8.",
            8,
            180,
            138,
            22,
        )
        text_item(
            layout,
            f"{inventory_geometries} bound inventory polygon; "
            f"{checks['inventory_record_count'] - inventory_geometries} legacy inventory has unknown boundary.\n"
            "Legacy records retain null package and zone identity.",
            153,
            180,
            138,
            22,
        )
        exporter = QgsLayoutExporter(layout)
        settings = QgsLayoutExporter.ImageExportSettings()
        settings.dpi = 150
        image_path = args.directory / "gis09-qgis-render.png"
        if (
            exporter.exportToImage(str(image_path), settings)
            != QgsLayoutExporter.ExportResult.Success
        ):
            raise ValueError("QGIS layout export failed")
        report = {
            "qgis_version": Qgis.QGIS_VERSION,
            "provider": "ogr",
            "crs": "EPSG:4326",
            "mode": "installed PyQGIS offscreen provider and layout rendering",
            "delayed_point": args.delayed_point,
            "delayed_point_version": args.historical_version,
            "inside_recorded_v7": True,
            "outside_successor_v8": True,
            "point_events": points.featureCount(),
            "inventory_records": inventories.featureCount(),
            "inventory_polygons": inventory_geometries,
            "zone_snapshots": zones.featureCount(),
            "legacy_records": legacy.featureCount(),
            "all_layers_read_only": all(
                value.readOnly() for value in (zones, points, inventories, legacy)
            ),
            "loaded_attribution": loaded_attribution,
            "snapshot_labels": [
                {
                    "snapshot_key": feature["id"],
                    "map_version": feature["map_version"],
                    "zone_label_at_capture": feature["zone_label_at_capture"],
                }
                for feature in zones.getFeatures()
            ],
            "inventory_polygon_parts": {
                feature["observation_id"]: len(feature.geometry().asMultiPolygon())
                for feature in inventories.getFeatures()
                if not feature.geometry().isNull()
            },
            "sql_readback_agrees": args.sql_readback is not None,
            "desktop_interaction": "not evaluated by this script; see separate Desktop evidence",
            "hosted_or_live_database": "not accessed",
        }
        (args.directory / "qgis-checks.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        print(json.dumps(report, indent=2))
    finally:
        project.clear()
        application.exitQgis()


if __name__ == "__main__":
    main()
