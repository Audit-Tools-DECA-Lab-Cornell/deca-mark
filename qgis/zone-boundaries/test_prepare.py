import copy
import csv
import io
import json
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

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
        "zone_label_at_capture": "=Synthetic v7",
    }
    common = {
        **zone_props,
        "project_id": "synthetic",
        "site_id": "synthetic-site",
        "form_version": "synthetic-v1",
        "revision": 1,
        "spatial_support": "point",
        "round_type": "standard",
        "display_anchor_longitude": None,
        "display_anchor_latitude": None,
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
            "longitude": None,
            "latitude": None,
            "display_anchor_longitude": 0.5,
            "display_anchor_latitude": 0.5,
        },
    }
    zone = {
        "type": "Feature",
        "id": "package-v7:same-zone",
        "geometry": polygons,
        "properties": zone_props,
    }
    metadata = {
        "total_matching": 2,
        "project_id": "synthetic",
        "filters": {},
        "versions": [7],
        "project_timezone": "UTC",
    }
    return {
        "observations.geojson": json.dumps(
            {"type": "FeatureCollection", "features": [point, inventory]}
        ).encode(),
        "historical-zones.geojson": json.dumps(
            {"type": "FeatureCollection", "features": [zone]}
        ).encode(),
        "metadata.json": json.dumps(metadata).encode(),
        "forms.json": b"{}",
        "codebook.csv": b"header\n",
    }


def csv_fixture(assets: dict[str, bytes]) -> dict[str, bytes]:
    events = json.loads(assets["observations.geojson"])["features"]
    fields = list(events[0]["properties"])
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fields)
    writer.writeheader()
    for event in events:
        row = event["properties"].copy()
        for name, value in row.items():
            if isinstance(value, str) and (
                value.lstrip().startswith(("=", "+", "-", "@"))
                or value.startswith(("\t", "\r", "\n"))
            ):
                row[name] = "'" + value
        writer.writerow(row)
    return {
        **{name: data for name, data in assets.items() if name in COMMON_ASSETS},
        "observations.csv": stream.getvalue().encode("utf-8-sig"),
    }


class ProjectionChecks(unittest.TestCase):
    def test_current_export_inventory_is_one_multipart_record_and_never_a_point(self):
        assets = fixture()
        files, report = project_layers(assets)
        self.assertEqual(report["point_event_count"], 1)
        self.assertEqual(report["inventory_record_count"], 1)
        self.assertEqual(report["inventory_polygon_count"], 1)
        inventories = json.loads(files["inventory-records.geojson"])["features"]
        self.assertEqual(len(inventories), 1)
        self.assertEqual(len(inventories[0]["geometry"]["coordinates"]), 2)
        self.assertEqual(
            inventories[0]["properties"]["snapshot_key"], "package-v7:same-zone"
        )
        self.assertEqual(files["all-events.geojson"], assets["observations.geojson"])
        self.assertNotIn("legacy-records.geojson", files)
        for name in ("all-events.geojson", "inventory-records.geojson"):
            for event in json.loads(files[name])["features"]:
                self.assertNotIn("assignment_basis", event["properties"])
                self.assertNotIn("display_anchor_basis", event["properties"])
        self.assertIsNone(
            json.loads(files["all-events.geojson"])["features"][1]["geometry"]
        )

    def test_matching_zone_identity_in_another_package_is_rejected(self):
        assets = fixture()
        zones = json.loads(assets["historical-zones.geojson"])
        zones["features"][0]["id"] = "package-v8:same-zone"
        zones["features"][0]["properties"]["package_id"] = "package-v8"
        assets["historical-zones.geojson"] = json.dumps(zones).encode()
        with self.assertRaisesRegex(ValueError, "exact historical zone"):
            project_layers(assets)

    def test_missing_binding_changed_attribution_and_wrong_project_are_rejected(self):
        for field, value in (
            ("package_id", None),
            ("zone_id", None),
            ("map_version", 8),
            ("zone_code", "other"),
            ("zone_label_at_capture", "Current label substituted"),
            ("project_id", "other-project"),
        ):
            with self.subTest(field=field):
                assets = fixture()
                events = json.loads(assets["observations.geojson"])
                events["features"][0]["properties"][field] = value
                assets["observations.geojson"] = json.dumps(events).encode()
                with self.assertRaises(ValueError):
                    project_layers(assets)

    def test_snapshot_requires_nonempty_identity_and_recorded_metadata(self):
        for field in (
            "package_id",
            "zone_id",
            "map_version",
            "zone_code",
            "zone_label_at_capture",
        ):
            with self.subTest(field=field):
                assets = fixture()
                events = json.loads(assets["observations.geojson"])
                zones = json.loads(assets["historical-zones.geojson"])
                zones["features"][0]["properties"][field] = None
                for event in events["features"]:
                    event["properties"][field] = None
                props = zones["features"][0]["properties"]
                zones["features"][0]["id"] = f"{props['package_id']}:{props['zone_id']}"
                assets["observations.geojson"] = json.dumps(events).encode()
                assets["historical-zones.geojson"] = json.dumps(zones).encode()
                with self.assertRaises(ValueError):
                    project_layers(assets)

    def test_inventory_point_and_unknown_round_or_spatial_support_are_rejected(self):
        for index, field, value in (
            (1, "geometry", {"type": "Point", "coordinates": [0.5, 0.5]}),
            (1, "spatial_support", "point"),
            (0, "round_type", "unknown"),
            (0, "spatial_support", "legacy_unknown"),
        ):
            with self.subTest(index=index, field=field):
                assets = fixture()
                events = json.loads(assets["observations.geojson"])
                event = events["features"][index]
                (event if field == "geometry" else event["properties"])[field] = value
                assets["observations.geojson"] = json.dumps(events).encode()
                with self.assertRaises(ValueError):
                    project_layers(assets)

    def test_duplicate_ids_mismatched_count_and_unreferenced_snapshot_are_rejected(
        self,
    ):
        for kind in ("duplicate", "duplicate_snapshot", "count", "extra_snapshot"):
            with self.subTest(kind=kind):
                assets = fixture()
                if kind == "duplicate":
                    events = json.loads(assets["observations.geojson"])
                    events["features"].append(copy.deepcopy(events["features"][0]))
                    assets["observations.geojson"] = json.dumps(events).encode()
                elif kind == "count":
                    metadata = json.loads(assets["metadata.json"])
                    metadata["total_matching"] = 4
                    assets["metadata.json"] = json.dumps(metadata).encode()
                else:
                    zones = json.loads(assets["historical-zones.geojson"])
                    extra = copy.deepcopy(zones["features"][0])
                    if kind == "extra_snapshot":
                        extra["properties"]["package_id"] = "unused"
                        extra["id"] = "unused:same-zone"
                    zones["features"].append(extra)
                    assets["historical-zones.geojson"] = json.dumps(zones).encode()
                with self.assertRaises(ValueError):
                    project_layers(assets)

    def test_matching_csv_with_formula_protected_label_and_distinct_timestamps(self):
        assets = fixture()
        csv_assets = csv_fixture(assets)
        metadata = json.loads(csv_assets["metadata.json"])
        metadata["generated_at"] = "2026-10-17T12:00:00Z"
        csv_assets["metadata.json"] = json.dumps(metadata).encode()
        compare_csv(csv_assets, assets)

    def test_csv_compares_scope_identity_attribution_and_coordinates(self):
        for field, value in (
            ("package_id", "wrong-package"),
            ("map_version", "8"),
            ("zone_label_at_capture", "wrong-label"),
            ("round_type", "reliability"),
            ("display_anchor_longitude", "0.6"),
            ("longitude", "0.6"),
        ):
            with self.subTest(field=field):
                assets = fixture()
                changed = fixture()
                events = json.loads(changed["observations.geojson"])
                index = 1 if field == "display_anchor_longitude" else 0
                events["features"][index]["properties"][field] = value
                changed["observations.geojson"] = json.dumps(events).encode()
                with self.assertRaises(ValueError):
                    compare_csv(csv_fixture(changed), assets)
        assets = fixture()
        csv_assets = csv_fixture(assets)
        metadata = json.loads(csv_assets["metadata.json"])
        metadata["filters"] = {"site_id": "different-site"}
        csv_assets["metadata.json"] = json.dumps(metadata).encode()
        with self.assertRaisesRegex(ValueError, "scopes disagree"):
            compare_csv(csv_assets, assets)

    def test_csv_cannot_assign_coordinates_to_inventory(self):
        assets = fixture()
        changed = fixture()
        events = json.loads(changed["observations.geojson"])
        events["features"][1]["properties"]["longitude"] = 0.5
        changed["observations.geojson"] = json.dumps(events).encode()
        with self.assertRaisesRegex(ValueError, "null event geometry"):
            compare_csv(csv_fixture(changed), assets)

    def test_csv_historical_snapshot_must_agree(self):
        assets = fixture()
        csv_assets = csv_fixture(assets)
        zones = json.loads(csv_assets["historical-zones.geojson"])
        zones["features"][0]["geometry"]["coordinates"][0][0][1] = [0.9, 0]
        csv_assets["historical-zones.geojson"] = json.dumps(zones).encode()
        with self.assertRaisesRegex(ValueError, "historical snapshots"):
            compare_csv(csv_assets, assets)

    def test_archive_refuses_extra_paths_and_duplicate_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            for extra in ("../outside.json", "metadata.json", "folder/"):
                with self.subTest(extra=extra):
                    path = Path(directory) / "bad.zip"
                    with ZipFile(path, "w") as archive:
                        for name, data in fixture().items():
                            archive.writestr(name, data)
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore", UserWarning)
                            archive.writestr(extra, b"{}")
                    with self.assertRaisesRegex(ValueError, "five exact"):
                        read_archive(path, "observations.geojson")

    def test_archive_preserves_zip_and_uncompressed_byte_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "export.zip"
            with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
                for name, data in fixture().items():
                    archive.writestr(name, data)
            with (
                patch("prepare.BYTE_LIMIT", path.stat().st_size - 1),
                self.assertRaisesRegex(ValueError, "archive exceeds"),
            ):
                read_archive(path, "observations.geojson")
            with (
                patch("prepare.BYTE_LIMIT", path.stat().st_size),
                self.assertRaisesRegex(ValueError, "assets exceed"),
            ):
                read_archive(path, "observations.geojson")


if __name__ == "__main__":
    unittest.main()
