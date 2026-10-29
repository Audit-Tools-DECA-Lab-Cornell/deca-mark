"""Canonical package request helpers shared by API integration tests."""

from base64 import b64encode
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

from pydantic import TypeAdapter

from fieldmaps_api.errors import ErrorDetail, ErrorEnvelope
from fieldmaps_api.zone_response_schemas import ZoneIssue

Json = dict[str, object]


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


def base_layers() -> dict[str, Json]:
    """Build the two required layers of a first package: a site outline and one zone, `A`."""
    return {
        "ground": {
            "type": "FeatureCollection",
            "features": [polygon(-76.4865, 42.447, -76.4835, 42.449, kind="site")],
        },
        "zones": {
            "type": "FeatureCollection",
            "features": [polygon(-76.4864, 42.4478, -76.485, 42.4489, id="A", name="Lawn")],
        },
    }


def submission(**overrides: object) -> Json:
    payload: Json = {
        "site_id": "10000000-0000-4000-8000-000000000003",
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
        "form_version": "shell-v1",
        "change_note": "Initial zone package",
        "layers": base_layers(),
        "zone_identity_map": [
            {
                "source_feature_id": "A",
                "zone_id": str(uuid4()),
                "zone_code": "A",
            }
        ],
    }
    payload.update(overrides)
    return payload


def qgz(document: str) -> str:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("site.qgs", document)
    return b64encode(buffer.getvalue()).decode()


def online_basemap(name: str, url: str, provider: str = "wms") -> str:
    """Write a QGIS raster layer fetched from a tile service on demand (an XYZ or WMS map)."""
    return (
        f'<maplayer type="raster"><layername>{name}</layername><provider>{provider}</provider>'
        f"<datasource>type=xyz&amp;url={url}</datasource></maplayer>"
    )


def qgis_document(*layers: str) -> str:
    return f"<qgis><projectlayers>{''.join(layers)}</projectlayers></qgis>"


def error_of(body: bytes) -> ErrorDetail:
    return ErrorEnvelope.model_validate_json(body).error


def issue_codes(error: ErrorDetail) -> list[str]:
    issues = TypeAdapter(list[ZoneIssue]).validate_python(error.details["issues"])
    return [issue.code for issue in issues]


def open_polygon(
    west: float, south: float, east: float, north: float, **properties: object
) -> Json:
    """Build a polygon whose ring is not closed: its last position never returns to the first."""
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[west, south], [east, south], [east, north], [west, north]]],
        },
    }


def collection_of(*geometries: object) -> Json:
    """Build a feature collection with one featureless-property feature per geometry."""
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {}, "geometry": geometry} for geometry in geometries
        ],
    }


def line(*positions: list[float]) -> Json:
    return {"type": "LineString", "coordinates": list(positions)}


def point(*coordinates: float) -> Json:
    return {"type": "Point", "coordinates": list(coordinates)}
