# Recorded boundaries in QGIS

This read-only analysis path consumes complete authorized `/v1` CSV/GeoJSON exports.
It preserves recorded package/zone identities, labels and geometry. It never reads
current boundaries to fill missing history. Each source ZIP must contain all five
export assets; a paginated response is not a substitute.

## Current export contract

The current baseline supplies request-scoped `fieldmaps_api` GIS views:

| View | One row represents | Geometry and attribution |
| --- | --- | --- |
| `gis.recorded_observations` | One visible, undeleted observation | Recorded package/zone metadata, answers and point/zone spatial support |
| `gis.point_events` | One Standard/Reliability point event | Real Point; Inventory excluded |
| `gis.zone_snapshots` | One permitted package+zone snapshot | Full MultiPolygon and recorded version/code/label |
| `gis.inventory_records` | One whole-zone Inventory | Exact historical MultiPolygon and observation answers |

SQL uses `package_version`; exports name that field `map_version` and use
`zone_label_at_capture` for the recorded label. Every current observation has an
explicit package and zone. `assignment_basis` and `display_anchor_basis` are not
current export fields and are neither required nor synthesized by the converter.
Join on **both** `package_id` and `zone_id` (`package_id:zone_id`), never a label or
today's package. Multipart zones remain one feature. Count observation IDs, not
polygon parts or display anchors.

## Prepare and open an export

1. As an authorized research viewer or manager, download
   `/v1/projects/{project_id}/observations/export?format=geojson` and optionally
   `format=csv` with identical filters. Each ZIP is one complete snapshot; two
   separate requests during concurrent writes do not share one transaction.
2. Prepare the GeoJSON ZIP and check the matching CSV ZIP:

   ```sh
   backend/.venv/bin/python qgis/zone-boundaries/prepare.py /path/to/geojson.zip /path/to/analysis --csv-zip /path/to/csv.zip
   ```

3. Open `point-events.geojson`, `historical-zones.geojson` and
   `inventory-records.geojson` in QGIS. Inventory gets its complete recorded
   MultiPolygon in its separate analysis layer. Its original event geometry stays
   null in `all-events.geojson`; display anchors are never point events.
4. Keep `projection-checks.json`, `metadata.json`, `codebook.csv`, `forms.json` and
   the original event bytes together with the layers. With a CSV input,
   `observations.csv` and a successful agreement check are also retained.

The converter reads exact allowlisted ZIP members, enforces compressed and total
uncompressed 32 MiB byte ceilings, and never extracts member paths. It checks
unique observation/snapshot identities, project/count/version scope, exact recorded
snapshot metadata and references, and point-versus-Inventory geometry. A supplied
CSV must agree on scope, IDs, historical attributes, coordinates, display anchors
and historical snapshots. Different generation timestamps are allowed. Matching
scope/identities do not establish transactional equality of two separate downloads.

Old `/v2` exports with unbound legacy records are outside this current converter's
contract. Dated artifacts remain under `acceptance/`; the
[October 11 report](../../docs/reviews/zone-boundaries-2026-10-11/gis09.md) describes
only that earlier implementation. New remediation evidence is recorded
[separately](../../docs/reviews/qgis-export-converter-2026-10-17/README.md).

## Reproduce signed export and converter acceptance

From the product root with Node 24, pnpm 10.17.1, repository Python dependencies and
Docker available:

```sh
sh database/gis09-api-rehearsal.sh -q --basetemp=/tmp/decamark-gis-acceptance
```

The command creates a new disposable PostgreSQL/PostGIS database, applies current
migrations, and uses synthetic signing keys and the restricted API role. It never
uses an existing database or contacts Auth/email providers. The wrapper exposes the
backend fixtures; no extra fixture-plugin flag is needed. Pytest owns/replaces the
specified `--basetemp`, so choose a dedicated scratch directory.

The scenario publishes an Inventory form using its returned revision ETag and binds
it before creating package v1. It publishes a smaller, renamed v2; delayed v1 point
and Inventory uploads then retain exact v1 attribution. Restricted SQL reads and
actual signed CSV/GeoJSON ZIPs must agree. The production converter CLI consumes both
ZIPs and verifies two point events, one multipart whole-zone Inventory, two exact
snapshots and null source Inventory event geometry.

If the pinned Supabase image is unavailable, `DECAMARK_REHEARSAL_IMAGE` may select an
explicit cached PostgreSQL 17/PostGIS image containing pg_cron. Such runs use
synthetic Auth tables and do not prove full Supabase Auth/Storage compatibility.

## Installed QGIS provider and saved-project acceptance

The acceptance command leaves the ZIPs, `analysis/`, `sql-readback.json` and
`acceptance-context.json` under its pytest test directory. Obtain the generated
`delayed_point` ID from that context and run:

```sh
sh qgis/zone-boundaries/render.sh /path/to/test-directory/analysis \
  --delayed-point THE_SYNTHETIC_OBSERVATION_UUID \
  --sql-readback /path/to/test-directory/sql-readback.json
```

The script uses the installed Linux PyQGIS runtime or QGIS's bundled macOS Python
(`QGIS_APP` selects the app). For another installation, set `QGIS_PYTHON` and
`QGIS_PREFIX_PATH`. It uses temporary QGIS/settings profiles and no saved database
connection. Offscreen providers check WGS84, exact source/projected attribution,
null Inventory event geometry, whole multipart polygons, and that the delayed v1
point lies inside its recorded snapshot but outside v2. Defaults are package versions
1/2; `--historical-version` and `--current-version` select other synthetic fixtures.

It saves `gis09-synthetic.qgs`, `gis09-qgis-render.png` and `qgis-checks.json`, then a
separate QGIS process reopens the project and writes `project-checks.json`, checking
counts, read-only layers and adjacent source paths. Keep that directory together.
These are installed-provider/layout/reopen checks; they do not establish interactive
Desktop acceptance, a live database reader or hosted compatibility.

## Focused static and converter checks

```sh
uv run --project backend --frozen --no-sync --offline python -m unittest discover -s qgis/zone-boundaries -p 'test_*.py'
uv run --project backend --frozen --no-sync --offline ruff check qgis/zone-boundaries
uv run --project backend --frozen --no-sync --offline ruff format --check qgis/zone-boundaries
sh -n qgis/zone-boundaries/render.sh
```

General scoped Desktop logins remain independent GIS-01/GIS-02 work. This repair
changes no API contract, database schema, permissions or hosted services.
