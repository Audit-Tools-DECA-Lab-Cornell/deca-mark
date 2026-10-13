import argparse
import json
from pathlib import Path

from qgis.core import Qgis, QgsApplication, QgsProject


def main() -> None:
    parser = argparse.ArgumentParser(description="Reopen the saved GIS-09 QGIS project")
    parser.add_argument("directory", type=Path)
    parser.add_argument("--prefix", type=Path, required=True)
    args = parser.parse_args()
    directory = args.directory.resolve()
    checks = json.loads((directory / "projection-checks.json").read_text())
    expected = {
        "point-events.geojson": checks["point_event_count"],
        "inventory-records.geojson": checks["inventory_record_count"],
        "historical-zones.geojson": checks["historical_snapshot_count"],
        "legacy-records.geojson": checks["legacy_record_count"],
    }
    application = QgsApplication([], False)
    application.setPrefixPath(str(args.prefix), True)
    application.initQgis()
    project = QgsProject.instance()
    try:
        if not project.read(str(directory / "gis09-synthetic.qgs")):
            raise ValueError("Saved QGIS project cannot reopen")
        actual = {}
        for layer in project.mapLayers().values():
            if not layer.isValid() or not layer.readOnly():
                raise ValueError("Saved layer must reopen valid and read-only")
            source = Path(layer.source())
            if source.parent.resolve() != directory:
                raise ValueError("Saved project sources must stay beside the project")
            actual[source.name] = layer.featureCount()
        if actual != expected or len(project.mapLayers()) != 4:
            raise ValueError("Reopened QGIS counts disagree with export projections")
        report = {
            "qgis_version": Qgis.QGIS_VERSION,
            "mode": "separate installed QGIS process reopening saved project",
            "saved_project_reopens": True,
            "all_layers_read_only": True,
            "counts": actual,
            "sources_beside_project": True,
        }
        (directory / "project-checks.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        print(json.dumps(report, indent=2))
    finally:
        project.clear()
        application.exitQgis()


if __name__ == "__main__":
    main()
