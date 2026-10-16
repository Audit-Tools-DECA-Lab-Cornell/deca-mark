# GIS-09 database and API/export acceptance

> Historical evidence for the date/revision below. It is not a current task board or hosted-health check. See [current position and next work](../../plan/current-state.md) and the owning plans for later implementation and remaining acceptance.

Date: 2026-10-11. Scope: additive source migration and disposable local acceptance.
No hosted migration, persistent database change, credential provisioning or commit/push
was performed by this work.

## Implementation

Migration `20261011134000_gis_recorded_zone_context.sql` adds five read-only views granted
only to the existing restricted `fieldmaps_api` runtime role. Every view uses
`security_invoker=true` and `security_barrier=true`, preserving underlying caller identity,
account/project RLS and Training creator isolation. The unchanged sample reader receives
no new view grants. The new runtime schema usage grant does not grant access to the old
sample view or raw tables beyond its existing API permissions.

| View                        | Behavior                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `gis.recorded_observations` | Nonspatial live observation metadata, answers and exact package+zone binding                                             |
| `gis.point_events`          | Proven event Points; Inventory anchors and unknown legacy support excluded                                               |
| `gis.zone_snapshots`        | One MultiPolygon per package+zone key, recorded label, area and existing publication metadata                            |
| `gis.inventory_records`     | One record per Inventory observation; exact recorded MultiPolygon or null for legacy, display anchor explicitly labelled |
| `gis.legacy_records`        | Original stored Point retained; unknown binding and compatibility-anchor role explicit, separate nullable event geometry |

SQL `package_version` equals API JSON `package_version` and export `map_version`.
No view joins the mutable current-package pointer or explodes multipart polygons.
Training snapshots require an owner-visible live observation, so a Training manager cannot
infer another creator's recorded activity from snapshot presence.

## Reproduction and results

Use Node 24 and the cached PostgreSQL 17/PostGIS image:

```sh
pnpm db:test ZONE_REHEARSAL=1
sh database/gis09-api-rehearsal.sh -q
```

The SQL rehearsal passed **445 assertions**, including 19 new GIS scope/geometry checks
and one exact legacy view preservation check. All existing SQL, Auth-hook and verification
script suites passed. The rehearsal also passed **2,545 Node 24 coordinate comparisons**
and **six publication/concurrency races**. The legacy GIS view's definition, column names,
types, feature identity, options and view ACLs were compared before/after and remained exact.

The signed loopback HTTP fixture passed **one integrated test in 8.59 seconds** on the final
run. It uses real API draft/publication and restricted SQL reads against its own disposable
database. It compares every record's ID, package version, zone UUID/code/recorded label,
assignment basis and spatial support across SQL, API JSON, CSV and GeoJSON. The two exports
retain all five records and two historical snapshots; Inventory event coordinates are absent.
The final test runs the direct property comparisons, while the separately saved first-run
fixture also passed that same comparison helper against its captured SQL/export artifacts.

| Synthetic acceptance surface |                                      Exact count |
| ---------------------------- | -----------------------------------------------: |
| Recorded observations        |                                                5 |
| Proven point events          |                                                3 |
| Inventory records            | 2: one recorded polygon, one legacy null polygon |
| Legacy records               |                                                2 |
| Historical zone snapshots    |                                     2: v7 and v8 |

The fixture creates a two-part v7 zone, publishes a smaller v8 zone under the same identity
with a changed label, then uploads the v7 point. PostGIS confirms that delayed point is
covered by v7 and outside v8. Its v7 Inventory polygon equals the exact old snapshot in EWKB;
multipart geometry produces one Inventory row. The legacy point and Inventory retain null
package/version/zone UUID/recorded label and their original stored coordinates.

The first-run synthetic archives, expected IDs and SQL readback used for QGIS rendering are
retained under [`qgis/zone-boundaries/acceptance`](../../../qgis/zone-boundaries/acceptance/).
The disposable runner refreshes `/tmp/gis09-exports` with new synthetic UUIDs on each run.
The concise database evidence is in [`gis09-db-checks.txt`](gis09-db-checks.txt).

Shell syntax, Ruff formatting/lint for the standalone acceptance test and `git diff --check`
passed. Existing Starlette and SQLAlchemy deprecation warnings remain; no runtime error or
assertion failure remains in the final run.

## Evidence boundary

This verifies SQL security, historical readback and API/export agreement locally. The QGIS
owner records actual rendering and Desktop acceptance separately. General scoped live GIS
reader setup remains GIS-01/GIS-02, and hosted application plus QA-07 acceptance remain
separate gates. GIS-09 status is owned only by `qgis/PLAN.md`.
