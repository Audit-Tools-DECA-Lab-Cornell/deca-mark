# Recorded boundaries in QGIS

This read-only analysis path consumes a complete authorized [BE-20 export](../../backend/README.md).
It preserves recorded package/zone identities, labels and geometry. It never reads today's
boundaries to fill missing history. A source export must contain all five ZIP assets; a
paginated response is not a substitute. CSV and GeoJSON downloads must have the same filters.

## SQL projections

The database owner implements the following companion views through
`supabase/migrations/20261011134000_gis_recorded_zone_context.sql`. Each view has
`security_invoker` and `security_barrier`; its existing `fieldmaps_api` caller's RLS scope
applies. No new GIS reader login, membership or project assignment is provisioned.
`gis.sample_observations` and its feature identity/columns/grants remain unchanged.

| View | One row represents | Geometry and attribution |
| --- | --- | --- |
| `gis.recorded_observations` | One visible, undeleted observation | Nonspatial common read-side metadata and answers; explicit point/zone/unknown support and separately identified display anchors |
| `gis.point_events` | One proven Standard/Reliability point event | Point; inventories excluded, including their compatibility anchors |
| `gis.zone_snapshots` | One permitted package+zone snapshot | Full MultiPolygon, stable `snapshot_key`, package version, recorded label/code, geometry digest, canonical anchor, area and actual package preparation metadata |
| `gis.inventory_records` | One whole-zone inventory | Its recorded snapshot's full MultiPolygon, or null for legacy; answers plus separately identified display anchor |
| `gis.legacy_records` | One unversioned observation | Original stored compatibility geometry retained, alongside explicit event/display semantics and null historical IDs/version/label |

Observation projections expose `fid` (`qgis_id`, unchanged per observation),
`observation_id`, project/site identity, site code/name, form version, observer and times,
revision, round type/placement, exact `package_id`, `package_version`, `zone_id`,
`zone_code`, `zone_label_at_capture`, `assignment_basis` and `spatial_support`.
`display_anchor_basis` distinguishes `snapshot` and `legacy_compatibility` aids.
`zone_snapshots.snapshot_key` is the text `package_id:zone_id`; it is unique even when a
stable zone UUID appears in multiple packages. SQL `package_version` and export
`map_version` describe the same recorded package version.

All observation-to-snapshot joins use package **and** zone identity and tenant/site keys.
The snapshot view exposes `prepared_at`/`prepared_by`, which are real stored package
metadata; it does not invent a publication author/name. Multipart polygons remain one
MultiPolygon, never `ST_Dump` rows. Area is in square metres and accompanies the version
so deliberate cross-version analysis can account for changed sampled area.

The API role receives SELECT on these views within its existing request-scoped access.
The old `fieldmaps_sample_reader`/`fieldmaps_qgis_training` receives no new grants and
cannot query them. Until scoped GIS-01/GIS-02 login infrastructure is separately approved,
use the file export path below for QGIS. Do not use the API database login as a Desktop
connection or infer wider permissions from a security-invoker view.

## Prepare and open an export

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

## Synthetic QGIS acceptance

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

## Regression checks

```sh
backend/.venv/bin/python -m unittest discover -s qgis/zone-boundaries -p 'test_*.py'
backend/.venv/bin/ruff check qgis/zone-boundaries
backend/.venv/bin/ruff format --check qgis/zone-boundaries
sh -n qgis/zone-boundaries/render.sh
```

Hosted migration/deployment and a scoped live QGIS reader remain explicit release work.
Neither this tool nor its fixture expands import formats, grants or historical attribution.
