import copy
import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from prepare import COMMON_ASSETS, compare_csv, project_layers, read_archive


def fixture() -> dict[str, bytes]:
    polygons = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]],
        ],
    }
    zone_props = {
        "package_id": "package-v7",
        "zone_id": "same-zone",
        "map_version": 7,
        "zone_code": "north",
        "zone_label_at_capture": "Synthetic v7",
    }
    common = {
        **zone_props,
        "assignment_basis": "recorded_package",
        "spatial_support": "point",
        "round_type": "standard",
        "display_anchor_basis": None,
    }
    point = {
        "type": "Feature",
        "id": "point",
        "geometry": {"type": "Point", "coordinates": [0.5, 0.5]},
        "properties": {
            **common,
            "observation_id": "point",
            "longitude": 0.5,
            "latitude": 0.5,
        },
    }
    inventory = {
        "type": "Feature",
        "id": "inventory",
        "geometry": None,
        "properties": {
            **common,
            "observation_id": "inventory",
            "round_type": "inventory",
            "spatial_support": "zone",
            "display_anchor_basis": "snapshot",
            "display_anchor_longitude": 0.5,
            "display_anchor_latitude": 0.5,
        },
    }
    legacy = {
        "type": "Feature",
        "id": "legacy-inventory",
        "geometry": None,
        "properties": {
            **inventory["properties"],
            "observation_id": "legacy-inventory",
            "package_id": None,
            "zone_id": None,
            "map_version": None,
            "zone_label_at_capture": None,
            "assignment_basis": "legacy_unversioned",
            "display_anchor_basis": "legacy_compatibility",
        },
    }
    zone = {
        "type": "Feature",
        "id": "package-v7:same-zone",
        "geometry": polygons,
        "properties": zone_props,
    }
    metadata = {
        "total_matching": 3,
        "project_id": "synthetic",
        "filters": {},
        "versions": [7],
        "assignment_basis": ["legacy_unversioned", "recorded_package"],
        "project_timezone": "UTC",
    }
    return {
        "observations.geojson": json.dumps(
            {"type": "FeatureCollection", "features": [point, inventory, legacy]}
        ).encode(),
        "historical-zones.geojson": json.dumps(
            {"type": "FeatureCollection", "features": [zone]}
        ).encode(),
        "metadata.json": json.dumps(metadata).encode(),
        "forms.json": b"{}",
        "codebook.csv": b"header\n",
    }


class ProjectionChecks(unittest.TestCase):
    def test_inventory_is_one_multipart_record_and_never_a_point(self) -> None:
        assets = fixture()
        files, report = project_layers(assets)
        self.assertEqual(report["point_event_count"], 1)
        self.assertEqual(report["inventory_record_count"], 2)
        self.assertEqual(report["inventory_polygon_count"], 1)
        inventories = json.loads(files["inventory-records.geojson"])["features"]
        self.assertEqual(len(inventories), 2)
        self.assertEqual(len(inventories[0]["geometry"]["coordinates"]), 2)
        self.assertIsNone(inventories[1]["geometry"])
        self.assertIsNone(inventories[1]["properties"]["snapshot_key"])
        self.assertEqual(files["all-events.geojson"], assets["observations.geojson"])

    def test_matching_zone_identity_in_another_package_is_rejected(self) -> None:
        assets = fixture()
        zones = json.loads(assets["historical-zones.geojson"])
        zones["features"][0]["id"] = "package-v8:same-zone"
        zones["features"][0]["properties"]["package_id"] = "package-v8"
        assets["historical-zones.geojson"] = json.dumps(zones).encode()
        with self.assertRaisesRegex(ValueError, "exact historical zone"):
            project_layers(assets)

    def test_legacy_binding_and_inventory_point_are_rejected(self) -> None:
        for index, change, message in (
            (2, {"package_id": "package-v7"}, "Legacy records"),
            (
                1,
                {"geometry": {"type": "Point", "coordinates": [0.5, 0.5]}},
                "Inventory event",
            ),
        ):
            with self.subTest(index=index):
                assets = fixture()
                events = json.loads(assets["observations.geojson"])
                if "geometry" in change:
                    events["features"][index].update(change)
                else:
                    events["features"][index]["properties"].update(change)
                assets["observations.geojson"] = json.dumps(events).encode()
                with self.assertRaisesRegex(ValueError, message):
                    project_layers(assets)

    def test_duplicate_ids_or_mismatched_scope_count_are_rejected(self) -> None:
        for kind in ("duplicate", "count"):
            with self.subTest(kind=kind):
                assets = fixture()
                if kind == "duplicate":
                    events = json.loads(assets["observations.geojson"])
                    events["features"].append(copy.deepcopy(events["features"][0]))
                    assets["observations.geojson"] = json.dumps(events).encode()
                else:
                    metadata = json.loads(assets["metadata.json"])
                    metadata["total_matching"] = 4
                    assets["metadata.json"] = json.dumps(metadata).encode()
                with self.assertRaises(ValueError):
                    project_layers(assets)

    def test_csv_compares_identity_scope_and_null_geometry(self) -> None:
        assets = fixture()
        events = json.loads(assets["observations.geojson"])["features"]
        fields = [
            "observation_id",
            "package_id",
            "map_version",
            "zone_id",
            "zone_code",
            "zone_label_at_capture",
            "assignment_basis",
            "spatial_support",
            "round_type",
            "display_anchor_basis",
            "longitude",
            "latitude",
        ]
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fields)
        writer.writeheader()
        for event in events:
            writer.writerow({field: event["properties"].get(field) for field in fields})
        csv_assets = {
            name: data for name, data in assets.items() if name in COMMON_ASSETS
        }
        csv_assets["observations.csv"] = stream.getvalue().encode()
        compare_csv(csv_assets, assets)
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fields)
        writer.writeheader()
        for event in events:
            row = {field: event["properties"].get(field) for field in fields}
            if event["id"] == "inventory":
                row["longitude"] = 0.5
            writer.writerow(row)
        csv_assets["observations.csv"] = stream.getvalue().encode()
        with self.assertRaisesRegex(ValueError, "null event geometry"):
            compare_csv(csv_assets, assets)

    def test_archive_refuses_extra_paths_and_duplicate_entries(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            for extra in ("../outside.json", "metadata.json"):
                with self.subTest(extra=extra):
                    path = Path(directory) / "bad.zip"
                    with ZipFile(path, "w") as archive:
                        for name, data in fixture().items():
                            archive.writestr(name, data)
                        archive.writestr(extra, b"{}")
                    with self.assertRaisesRegex(ValueError, "five exact"):
                        read_archive(path, "observations.geojson")


if __name__ == "__main__":
    unittest.main()
