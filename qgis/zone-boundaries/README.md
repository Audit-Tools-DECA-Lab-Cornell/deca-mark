# Recorded boundaries in QGIS

This read-only analysis path consumes a complete authorized [BE-20 export](../../backend/README.md).
It preserves recorded package/zone identities, labels and geometry. It never reads today's
boundaries to fill missing history. A source export must contain all five ZIP assets; a
paginated response is not a substitute. CSV and GeoJSON downloads must have the same filters.

## Current baseline and manual export workflow (2026-10-15)

DB-19’s `supabase/migrations/20261012120000_current_baseline.sql` supplies four current views with request-scoped `fieldmaps_api` RLS. The old incremental GIS migration and `gis.legacy_records` are superseded. New current-schema observations always have exact recorded package/zone bindings.

| View | One row represents | Geometry and attribution |
| --- | --- | --- |
| `gis.recorded_observations` | One visible, undeleted observation | Common historical metadata, answers, `snapshot_key`, point/zone `spatial_support`; Inventory display anchor is separate from event geometry |
| `gis.point_events` | One Standard/Reliability point event | Real Point; Inventory excluded |
| `gis.zone_snapshots` | One permitted package+zone snapshot | Full MultiPolygon, `package_version`, recorded `zone_label_at_capture`, anchor, digest, area and stored publication metadata |
| `gis.inventory_records` | One whole-zone Inventory | Exact recorded MultiPolygon and observation answers |

SQL reads use `package_version`; the export code deliberately names that field `map_version` and the recorded label `zone_label_at_capture`. Join on `package_id` **and** `zone_id` (`package_id:zone_id`), never today’s package or a matching label. Multipart zones stay one MultiPolygon and point/Inventory counts remain separate. Neither the views nor exports provision a new Desktop reader; GIS-01/GIS-02 still own scoped live-reader infrastructure.

1. Download `/v1/projects/{project_id}/observations/export?format=geojson` using authorized filters; optionally download `format=csv` with the same filters. Each ZIP is one complete snapshot; two separate requests during concurrent writes are not one transaction.
2. Open the ZIP’s `observations.geojson` and `historical-zones.geojson` in QGIS. Retain `metadata.json`, `forms.json` and `codebook.csv` with them. Filter point events by `spatial_support = point`; Inventory event geometry is null, so view those rows as a table.
3. For Inventory polygon analysis, join each Inventory observation to its exact historical package+zone MultiPolygon and retain one output row per observation. Do not count anchor points or polygon parts as events. Review counts/IDs against the API/CSV, then save the QGIS project beside the extracted sources.

The generic export-loading steps above use the current contract. **`prepare.py` and `render.py` still expect the removed `assignment_basis` metadata** (`prepare.py` rejects its absence), so their recipe below is historical and must not be used unchanged with a current export. Align those adapters and repeat QGIS provider/Desktop acceptance under [QA-07](../../docs/plan/verification.md). Current SQL/API agreement can be rehearsed with `sh database/gis09-api-rehearsal.sh -q`; that fixture does not exercise these Desktop adapters.

See [the current roadmap](../../docs/plan/current-state.md), [GIS task ownership](../PLAN.md) and [the current GIS specification](../ZONE-BOUNDARIES.md). GIS-09’s recorded 2026-10-11 QGIS rendering remains evidence only for that earlier contract.

## Historical preparation recipe (2026-10-11; adapter alignment required)

The remainder records the old `/v2` export, legacy-record and map-v7/v8 adapter fixture. It is retained to explain existing tooling and dated screenshots; it is not the current API contract or current acceptance evidence.

### Earlier prepare/open recipe

1. Download `format=geojson` and, for count/identity agreement, `format=csv` from the same
   authorized `/v2/projects/{project_id}/observations/export` filters. Save both ZIPs.
2. Prepare their layers:

   ```sh
   python3 qgis/zone-boundaries/prepare.py /path/to/geojson.zip /path/to/analysis --csv-zip /path/to/csv.zip
   ```

3. In QGIS add `point-events.geojson` and `historical-zones.geojson`. Join on exact
   `package_id` plus `zone_id`, or use `package_id:zone_id` as the composite key. For
   inventories add `inventory-records.geojson` separately. Null legacy inventory rows
   remain in its attribute table; they acquire no polygon. Filter counts by record IDs,
   never by multipart geometry parts or drawn anchors.
4. Read `projection-checks.json`, `metadata.json`, `codebook.csv` and `forms.json` with the
   layers. The original observation bytes remain in `all-events.geojson`; inventory
   event geometry stays null there. `legacy-records.geojson` preserves API legacy event
   semantics and separate anchor fields, not the SQL compatibility geometry.

The converter reads only exact allowlisted ZIP members, limits archive/uncompressed
asset bytes to the existing 32 MiB ceiling, and never extracts member paths. It checks
unique observation and snapshot IDs, scope counts, exact snapshot metadata and null
inventory event geometry. A supplied CSV must agree on IDs, version/zone/basis/support
and scope. Separate export requests may have different generation timestamps; the
converter checks matching scope and identities but does not claim transactional equality
between two downloads made while data changes.

### Earlier synthetic QGIS acceptance

The reproducible disposable database/API fixture has five records: a delayed v7 point
received after v8, a v7 whole-zone inventory, a v8 point, a legacy point and a legacy
inventory. The v7 zone has two polygon parts; v8 changes its label and shrinks its boundary.
The delayed v7 point lies inside v7 and outside v8. Both package snapshots appear because
the actual export includes records from both versions. No artifact represents real research.

With the installed QGIS 4.2.2 runtime on this Mac, render the prepared fixture:

```sh
sh qgis/zone-boundaries/render.sh /path/to/analysis --delayed-point THE_SYNTHETIC_OBSERVATION_UUID
```

`QGIS_APP` may select another compatible installed application. The script uses its bundled
Python and QGIS providers, checks that the delayed point intersects exactly the v7 snapshot,
checks that each bound inventory equals its whole recorded MultiPolygon, and saves a
read-only `gis09-synthetic.qgs`, `gis09-qgis-render.png` and `qgis-checks.json`. A separate
installed QGIS process reopens that saved project and writes `project-checks.json`, checking
its counts, read-only state and adjacent source paths. The layout
separates point events from inventories and labels all data synthetic. This is actual
installed QGIS provider/layout rendering; it is not evidence of Desktop interaction or
a live/hosted database connection. See the [acceptance report](../../docs/reviews/zone-boundaries-2026-10-11/gis09.md)
for the completed signed-export provider checks and separate actual Desktop screenshots.
For the saved synthetic fixture, add `--sql-readback /path/to/sql-readback.json` to compare
every loaded event/Inventory ID and historical attribute with its SQL source.

The project stores file sources beside itself and no inline database credentials. Keep
the prepared directory together when moving the project.

## Adapter regression commands

```sh
backend/.venv/bin/python -m unittest discover -s qgis/zone-boundaries -p 'test_*.py'
backend/.venv/bin/ruff check qgis/zone-boundaries
backend/.venv/bin/ruff format --check qgis/zone-boundaries
sh -n qgis/zone-boundaries/render.sh
```

Hosted migration/deployment and a scoped live QGIS reader remain explicit release work.
Neither this tool nor its fixture expands import formats, grants or historical attribution.
