"""Canonical package request helpers shared by API integration tests."""

from base64 import b64encode
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

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


def submission(**overrides: object) -> Json:
    payload: Json = {
        "site_id": "10000000-0000-4000-8000-000000000003",
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
        "form_version": "shell-v1",
        "change_note": "Initial zone package",
        "layers": {
            "ground": {
                "type": "FeatureCollection",
                "features": [polygon(-76.4865, 42.447, -76.4835, 42.449, kind="site")],
            },
            "zones": {
                "type": "FeatureCollection",
                "features": [
                    polygon(-76.4864, 42.4478, -76.485, 42.4489, id="A", name="Lawn")
                ],
            },
        },
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
