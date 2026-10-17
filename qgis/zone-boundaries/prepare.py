import argparse
import csv
import json
from io import StringIO
from pathlib import Path
from zipfile import ZipFile

BYTE_LIMIT = 32 * 1024 * 1024
COMMON_ASSETS = {
    "codebook.csv",
    "metadata.json",
    "forms.json",
    "historical-zones.geojson",
}


def read_archive(path: Path, observation_file: str) -> dict[str, bytes]:
    if path.stat().st_size > BYTE_LIMIT:
        raise ValueError("Export archive exceeds the BE-20 byte limit")
    with ZipFile(path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)) or set(names) != COMMON_ASSETS | {
            observation_file
        }:
            raise ValueError("Expected the five exact BE-20 export assets")
        if (
            any(entry.is_dir() for entry in entries)
            or sum(entry.file_size for entry in entries) > BYTE_LIMIT
        ):
            raise ValueError("Export assets exceed the BE-20 byte limit")
        return {name: archive.read(name) for name in names}


def features(document: dict) -> list[dict]:
    if document.get("type") != "FeatureCollection" or not isinstance(
        document.get("features"), list
    ):
        raise ValueError("Expected a GeoJSON FeatureCollection")
    entries = document["features"]
    ids = []
    for feature in entries:
        if feature.get("type") != "Feature" or not isinstance(
            feature.get("properties"), dict
        ):
            raise ValueError("Expected GeoJSON features with properties")
        ids.append(feature.get("id"))
    if any(not isinstance(value, str) or not value for value in ids) or len(ids) != len(
        set(ids)
    ):
        raise ValueError("Feature IDs must be unique nonempty strings")
    return entries


def collection(entries: list[dict]) -> bytes:
    return (
        json.dumps(
            {"type": "FeatureCollection", "features": entries},
            ensure_ascii=False,
            indent=2,
        ).encode()
        + b"\n"
    )


def project_layers(assets: dict[str, bytes]) -> tuple[dict[str, bytes], dict]:
    events = features(json.loads(assets["observations.geojson"]))
    zones = features(json.loads(assets["historical-zones.geojson"]))
    metadata = json.loads(assets["metadata.json"])
    if metadata.get("total_matching") != len(events) or len(events) > 10_000:
        raise ValueError("Export scope count does not match the observation file")
    project_id = metadata.get("project_id")
    if not isinstance(project_id, str) or not project_id:
        raise ValueError("Export scope requires its project identity")
    snapshots = {}
    for feature in zones:
        props = feature["properties"]
        if (
            any(
                not isinstance(props.get(field), str) or not props[field]
                for field in (
                    "package_id",
                    "zone_id",
                    "zone_code",
                    "zone_label_at_capture",
                )
            )
            or type(props.get("map_version")) is not int
            or props["map_version"] < 1
        ):
            raise ValueError("Historical zones require recorded identity and metadata")
        key = f"{props['package_id']}:{props['zone_id']}"
        if (
            feature["id"] != key
            or (feature.get("geometry") or {}).get("type") != "MultiPolygon"
        ):
            raise ValueError(
                "Historical zones require exact package:zone IDs and MultiPolygon geometry"
            )
        snapshots[key] = feature
    point_events, inventories = [], []
    for event in events:
        props = event["properties"]
        if props.get("observation_id") != event["id"]:
            raise ValueError("Event feature ID disagrees with observation_id")
        if props.get("project_id") != project_id:
            raise ValueError("Event project identity disagrees with export scope")
        package, zone = props.get("package_id"), props.get("zone_id")
        snapshot = snapshots.get(f"{package}:{zone}")
        if package is None or zone is None or snapshot is None:
            raise ValueError("Bound record is missing its exact historical zone")
        for field in (
            "package_id",
            "zone_id",
            "map_version",
            "zone_code",
            "zone_label_at_capture",
        ):
            if props.get(field) != snapshot["properties"][field]:
                raise ValueError(f"Bound record disagrees with historical {field}")
        geometry = event.get("geometry")
        support = props.get("spatial_support")
        if props.get("round_type") == "inventory":
            if geometry is not None or support != "zone":
                raise ValueError(
                    "Inventory event geometry must be null with whole-zone support"
                )
            inventories.append(
                {
                    **event,
                    "geometry": snapshot["geometry"],
                    "properties": {
                        **props,
                        "analysis_layer": "whole_zone_inventory",
                        "snapshot_key": snapshot["id"],
                    },
                }
            )
        elif support == "point":
            if props.get("round_type") not in {"standard", "reliability"}:
                raise ValueError(
                    "Point support requires a proven Standard/Reliability round"
                )
            if (geometry or {}).get("type") != "Point":
                raise ValueError("Point support requires Point event geometry")
            point_events.append(event)
        else:
            raise ValueError("Event must have point or whole-zone Inventory support")
    referenced = {
        f"{event['properties']['package_id']}:{event['properties']['zone_id']}"
        for event in events
    }
    if referenced != set(snapshots):
        raise ValueError(
            "Historical zone file must have exactly the snapshots referenced by this scope"
        )
    if metadata.get("versions") != sorted(
        {event["properties"]["map_version"] for event in events}
    ):
        raise ValueError("Export scope versions disagree with recorded observations")
    files = {
        name: data for name, data in assets.items() if name != "observations.geojson"
    }
    files.update(
        {
            "all-events.geojson": assets["observations.geojson"],
            "point-events.geojson": collection(point_events),
            "inventory-records.geojson": collection(inventories),
        }
    )
    report = {
        "total_matching": len(events),
        "point_event_count": len(point_events),
        "inventory_record_count": len(inventories),
        "inventory_polygon_count": sum(
            row["geometry"] is not None for row in inventories
        ),
        "historical_snapshot_count": len(snapshots),
        "inventory_event_geometry": "null",
        "snapshot_join": "package_id + zone_id",
        "source": "authorized BE-20 export; no database credentials",
    }
    return files, report


def compare_csv(csv_assets: dict[str, bytes], geojson_assets: dict[str, bytes]) -> None:
    csv_metadata = json.loads(csv_assets["metadata.json"])
    geojson_metadata = json.loads(geojson_assets["metadata.json"])
    # Separate downloads have distinct generated_at values; their scope and identities must agree.
    for field in (
        "project_id",
        "total_matching",
        "project_timezone",
        "filters",
        "versions",
    ):
        if csv_metadata.get(field) != geojson_metadata.get(field):
            raise ValueError(f"CSV and GeoJSON export scopes disagree on {field}")
    csv_zones = features(json.loads(csv_assets["historical-zones.geojson"]))
    geojson_zones = features(json.loads(geojson_assets["historical-zones.geojson"]))
    if {zone["id"]: zone for zone in csv_zones} != {
        zone["id"]: zone for zone in geojson_zones
    }:
        raise ValueError("CSV and GeoJSON historical snapshots disagree")
    records = list(
        csv.DictReader(StringIO(csv_assets["observations.csv"].decode("utf-8-sig")))
    )
    events = features(json.loads(geojson_assets["observations.geojson"]))
    rows = {row["observation_id"]: row for row in records}
    if len(rows) != len(records) or set(rows) != {event["id"] for event in events}:
        raise ValueError("CSV and GeoJSON observation IDs/counts disagree")
    for event in events:
        props, row = event["properties"], rows[event["id"]]
        for field in (
            "project_id",
            "site_id",
            "form_version",
            "revision",
            "package_id",
            "map_version",
            "zone_id",
            "zone_code",
            "zone_label_at_capture",
            "spatial_support",
            "round_type",
        ):
            expected = "" if props.get(field) is None else str(props[field])
            if expected.lstrip().startswith(
                ("=", "+", "-", "@")
            ) or expected.startswith(("\t", "\r", "\n")):
                expected = "'" + expected
            if row.get(field) != expected:
                raise ValueError(
                    f"CSV and GeoJSON disagree on observation {event['id']} {field}"
                )
        for field in ("display_anchor_longitude", "display_anchor_latitude"):
            coordinate = props.get(field)
            if coordinate is None:
                agrees = row.get(field) == ""
            else:
                agrees = bool(row.get(field)) and float(row[field]) == coordinate
            if not agrees:
                raise ValueError(
                    f"CSV and GeoJSON disagree on observation {event['id']} {field}"
                )
        if event.get("geometry") is None and (
            row.get("longitude") or row.get("latitude")
        ):
            raise ValueError("CSV cannot turn a null event geometry into a point")
        if event.get("geometry") is not None:
            for field, coordinate in zip(
                ("longitude", "latitude"), event["geometry"]["coordinates"], strict=True
            ):
                if not row.get(field) or float(row[field]) != coordinate:
                    raise ValueError(
                        f"CSV and GeoJSON disagree on observation {event['id']} {field}"
                    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare read-only QGIS layers from a complete BE-20 export"
    )
    parser.add_argument("geojson_zip", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--csv-zip", type=Path)
    args = parser.parse_args()
    assets = read_archive(args.geojson_zip, "observations.geojson")
    files, report = project_layers(assets)
    if args.csv_zip is not None:
        csv_assets = read_archive(args.csv_zip, "observations.csv")
        compare_csv(csv_assets, assets)
        files["observations.csv"] = csv_assets["observations.csv"]
        report["csv_geojson_scope_and_identity_agree"] = True
    args.output.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (args.output / name).write_bytes(data)
    (args.output / "projection-checks.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
