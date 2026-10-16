#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
# How to run: uv run qgis/demo-playground-2026-10-15/build.py
from __future__ import annotations

import json
from pathlib import Path
from typing import Final, Literal, TypedDict
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

type Json = bool | int | float | str | list[Json] | dict[str, Json] | None


class Feature(TypedDict):
    type: Literal["Feature"]
    properties: dict[str, Json]
    geometry: dict[str, Json]


ROOT: Final = Path(__file__).resolve().parent
PROVENANCE: Final = "Invented Janet demonstration 2026-10-15"


def feature(identifier: str, kind: str, label: str, geometry: dict[str, Json]) -> Feature:
    return {
        "type": "Feature",
        "properties": {
            "id": f"demo-{identifier}",
            "kind": kind,
            "label": label,
            "name": label,
            "synthetic": True,
            "provenance": PROVENANCE,
        },
        "geometry": geometry,
    }


def box(
    identifier: str, kind: str, label: str, bounds: tuple[float, float, float, float]
) -> Feature:
    west, south, east, north = bounds
    ring: list[Json] = [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
    ]
    return feature(identifier, kind, label, {"type": "Polygon", "coordinates": [ring]})


def datasets() -> dict[str, list[Feature]]:
    return {
        "ground": [
            box(
                "site",
                "site",
                "SYNTHETIC playground",
                (-76.5012, 42.4451, -76.4992, 42.4465),
            ),
            box(
                "lawn",
                "grass",
                "North lawn - draw Zone C here",
                (-76.5011, 42.44604, -76.4993, 42.4464),
            ),
            box("court", "blacktop", "Court", (-76.50105, 42.4453, -76.5003, 42.44593)),
            box("play", "mulch", "Play area", (-76.50012, 42.4453, -76.4994, 42.44593)),
            box(
                "equipment",
                "equipment",
                "Climber",
                (-76.49995, 42.44546, -76.4996, 42.44569),
            ),
            box(
                "shelter",
                "structure",
                "Shelter",
                (-76.50093, 42.44613, -76.50063, 42.44632),
            ),
        ],
        "zones": [
            box(
                "zone-a",
                "zone",
                "A - Court (synthetic)",
                (-76.5011, 42.4452, -76.50022, 42.44598),
            ),
            box(
                "zone-b",
                "zone",
                "B - Play (synthetic)",
                (-76.50018, 42.4452, -76.4993, 42.44598),
            ),
        ],
        "paths": [
            feature(
                "path",
                "path",
                "Entry path (synthetic)",
                {
                    "type": "LineString",
                    "coordinates": [
                        [-76.5002, 42.4451],
                        [-76.5002, 42.44605],
                        [-76.49935, 42.44605],
                    ],
                },
            )
        ],
        "trees": [
            feature(
                f"tree-{i}",
                "tree",
                "Tree (synthetic)",
                {
                    "type": "Point",
                    "coordinates": [x, 42.44632],
                },
            )
            for i, x in enumerate((-76.50045, -76.5001, -76.49975, -76.4994), start=1)
        ],
    }


def write_entry(archive: ZipFile, name: str, payload: bytes) -> None:
    info = ZipInfo(name, date_time=(2026, 10, 15, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload)


def main() -> None:
    data = ROOT / "desktop" / "data"
    data.mkdir(parents=True, exist_ok=True)
    for name, features in datasets().items():
        payload = {
            "type": "FeatureCollection",
            "name": f"SYNTHETIC {name}",
            "features": features,
        }
        (data / f"{name}.geojson").write_text(json.dumps(payload, indent=2) + "\n")
    qgs = ROOT / "desktop" / "janet-synthetic-playground.qgs"
    sources = [qgs, *sorted(data.glob("*.geojson"))]
    with ZipFile(ROOT / "janet-synthetic-playground.qgz", "w") as archive:
        for source in sources:
            write_entry(
                archive,
                source.relative_to(ROOT / "desktop").as_posix(),
                source.read_bytes(),
            )
    with ZipFile(ROOT / "janet-desktop-project.zip", "w") as archive:
        for source in sources:
            write_entry(
                archive,
                "janet-synthetic-playground/" + source.relative_to(ROOT / "desktop").as_posix(),
                source.read_bytes(),
            )


if __name__ == "__main__":
    main()
