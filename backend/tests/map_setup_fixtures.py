import json
from base64 import b64encode
from io import BytesIO
from typing import Literal, assert_never
from xml.sax.saxutils import escape
from zipfile import ZipFile

from fieldmaps_api.domain.project_import import ProjectImportRequest

type Scenario = Literal[
    "outline-no-zones", "references-only", "complete", "missing-source", "remote-only"
]


def qgz_request(scenario: Scenario) -> ProjectImportRequest:
    outline = {
        "type": "Feature",
        "properties": {"kind": "site"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-76.49, 42.44],
                    [-76.48, 42.44],
                    [-76.48, 42.45],
                    [-76.49, 42.45],
                    [-76.49, 42.44],
                ]
            ],
        },
    }
    tree = {
        "type": "Feature",
        "properties": {"label": "Tree"},
        "geometry": {"type": "Point", "coordinates": [-76.485, 42.445]},
    }
    zone = {
        "type": "Feature",
        "properties": {"id": "A", "label": "Zone A"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-76.489, 42.441],
                    [-76.481, 42.441],
                    [-76.481, 42.449],
                    [-76.489, 42.449],
                    [-76.489, 42.441],
                ]
            ],
        },
    }
    match scenario:
        case "outline-no-zones" | "missing-source":
            sources = {"ground": outline}
        case "references-only":
            sources = {"trees": tree}
        case "complete":
            sources = {"ground": outline, "zones": zone, "trees": tree}
        case "remote-only":
            sources = {}
        case _:
            assert_never(scenario)
    entries = {
        f"{name}.geojson": json.dumps({"type": "FeatureCollection", "features": [feature]}).encode()
        for name, feature in sources.items()
    }
    layer_sources = [(name, f"{name}.geojson", "ogr") for name in sources]
    if scenario == "missing-source":
        layer_sources.append(("trees", "trees.geojson", "ogr"))
    if scenario == "remote-only":
        layer_sources.append(
            ("Background", "type=xyz&url=https://example.invalid/{z}/{x}/{y}.png", "wms")
        )
    layers = "".join(
        f'<maplayer type="{"raster" if provider == "wms" else "vector"}">'
        f"<id>fixture-{name}</id><layername>{name}</layername>"
        f"<provider>{provider}</provider><datasource>{escape(source)}</datasource></maplayer>"
        for name, source, provider in layer_sources
    )
    entries["site.qgs"] = f"<qgis><projectlayers>{layers}</projectlayers></qgis>".encode()
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return ProjectImportRequest.model_validate(
        {
            "files": [
                {"file_name": f"{scenario}.qgz", "content": b64encode(output.getvalue()).decode()}
            ]
        }
    )
