# GIS-09 local acceptance

> Historical evidence for the date/revision below. It is not a current task board or hosted-health check. See [current position and next work](../../plan/current-state.md) and the owning plans for later implementation and remaining acceptance.

Implementation baseline: `33faa58` plus the uncommitted GIS-09 changes in this session.
All acceptance data is synthetic. No secret, hosted database, reader grant or deployment
is involved. The owning task status remains in [qgis/PLAN.md](../../../qgis/PLAN.md).

## Later pre-launch contract rewrite

The evidence below verifies the BE-18–20 dual-contract baseline before the owner's single-path rewrite. DB-19 must remove legacy projections when creating the new baseline, and BE-22 must supply the single-format export contract. QA-07 must repeat the signed export/QGIS comparison against that baseline. The saved earlier artifacts remain evidence of the tested historical joins and Inventory geometry, not current single-contract acceptance.

## Scope and review

The [projection/export guide](../../../qgis/zone-boundaries/README.md) defines separate
recorded observations, point events, historical zone snapshots, inventories and legacy
records. Companion views invoke existing API request RLS; the old sample view and reader
privileges stay intact. Exact package+zone joins preserve old labels and geometry.
Whole-zone inventories use one full MultiPolygon per record, including multipart zones;
legacy inventory has no inferred historical polygon. The exported event file keeps
inventory geometry null and display anchors separate.

The file converter checks complete ZIP asset membership and byte ceilings, unique IDs,
scope counts, exact historical metadata, null inventory event geometry, and CSV/GeoJSON
identity/scope agreement. Its QGIS project uses local files, read-only layers and no
database connection. Specification review finds no contract change; source quality
review focuses on bounded ZIP reads, no member-path extraction and explicit missing-history
failure rather than a current-boundary fallback.

## Checks actually executed

| Check | Result and limit |
| --- | --- |
| Python projection regressions | Six tests passed: multipart inventory counted once, cross-package identity rejected, no invented legacy binding/point anchor, duplicate IDs/count mismatch rejected, CSV null geometry agreement, exact ZIP allowlist |
| Installed QGIS runtime | QGIS `4.2.2-Belém do Pará` bundled Python/PyQGIS loads successfully with its PROJ data |
| Headless integration smoke | QGIS OGR loaded and rendered the synthetic smoke project; point-v7 intersects its historical snapshot and not v8; whole inventory polygon equals snapshot; output image/project saved. This smoke is hand-authored and does not replace actual database/API export acceptance |
| Signed database/API fixture | Passed: 445 SQL assertions, 2,545 coordinate comparisons, six publication races and one signed API/export scenario; see [database evidence](gis09-db.md) |
| Installed QGIS signed-export acceptance | Passed against the saved real signed synthetic exports: all five loaded record IDs, package IDs, versions, zone UUIDs/codes, recorded labels, assignment basis, round type and support agree with SQL readback. Three points, two inventories, two historical snapshots and two legacy records; the single bound inventory retains both v7 polygon parts as one feature. All four layers report read-only; a separate installed QGIS process reopens the saved project with the same counts and adjacent sources |
| QGIS Desktop interaction | Passed: opened the signed-export project; actual map canvas shows delayed v7 point inside blue v7 and outside orange v8 with three point markers. Attribute tables display the three exact point IDs and two legacy IDs. Screenshots retained below. A later native Qt accessibility/capture timeout prevented an additional manual Inventory attribute-table screenshot; installed QGIS provider/layout rendering separately proves Inventory geometry/counts |

Reproduce the converter regressions with:

```sh
backend/.venv/bin/python -m unittest discover -s qgis/zone-boundaries -p 'test_*.py'
backend/.venv/bin/ruff check qgis/zone-boundaries
backend/.venv/bin/ruff format --check qgis/zone-boundaries
sh -n qgis/zone-boundaries/render.sh
```

## Required signed fixture and expected counts

The guarded disposable PostgreSQL/PostGIS rehearsal creates v7 and v8 for the same zone
identity, changes label and boundary, then uploads a delayed v7 point. It also includes
one v7 inventory, one v8 point, one legacy point and one legacy inventory. The v7 zone
has two polygon parts; the delayed point is outside v8. Signed BE-20 CSV and GeoJSON ZIPs
must preserve five observation IDs and two exact historical zone snapshots.

| Surface | Expected count |
| --- | --- |
| Recorded observation rows / CSV rows / all GeoJSON event features | 5 |
| Proven point events, including one legacy point | 3 |
| Inventory records | 2: one complete v7 MultiPolygon, one legacy null geometry |
| Legacy rows | 2, with null package/version/zone identity/label |
| Historical package+zone snapshots | 2, independent of v7's two polygon parts |

No hosted or live QGIS connection can be inferred from these local exports. QA-07 still
requires its integrated device/browser/readback evidence before feature completion.

## Desktop and installed-runtime evidence

The exact signed database/API artifacts are retained in
[`qgis/zone-boundaries/acceptance`](../../../qgis/zone-boundaries/acceptance/).
They replace the earlier hand-authored smoke as the task's acceptance evidence.

- [Actual Desktop historical-point canvas](../../../qgis/zone-boundaries/acceptance/desktop-historical-points.png): blue v7 includes the delayed point and its separate polygon part; orange v8 excludes it. No Inventory anchor is displayed as a point.
- [Actual Desktop point table](../../../qgis/zone-boundaries/acceptance/desktop-points-table.png): the delayed v7, current v8 and legacy point IDs appear once each; all three are Standard records.
- [Actual Desktop legacy table](../../../qgis/zone-boundaries/acceptance/desktop-legacy-table.png): one legacy Standard and one legacy Inventory record remain distinct.
- [Installed QGIS two-panel render](../../../qgis/zone-boundaries/acceptance/gis09-qgis-render.png) and [provider readback](../../../qgis/zone-boundaries/acceptance/qgis-checks.json): one v7 Inventory feature renders its complete two-part polygon, legacy Inventory remains null, and both historical labels remain intact.

Reproduce the installed-provider and SQL attribution comparison:

```sh
sh qgis/zone-boundaries/render.sh qgis/zone-boundaries/acceptance \
  --delayed-point c9690043-7a47-4b2f-b146-4f3f14170485 \
  --sql-readback qgis/zone-boundaries/acceptance/sql-readback.json
```

The script records actual provider attributes and `readOnly()` values. A separate installed
QGIS process then reopens the saved project and records its valid read-only layers, counts
and adjacent file sources in [project-checks.json](../../../qgis/zone-boundaries/acceptance/project-checks.json). Its optional SQL
comparison is for this synthetic complete-scope fixture; it fails on changed IDs/counts
or historical metadata. The script does not assert that Desktop interaction occurred.
Native Desktop interaction is evidenced separately by the saved screenshots.

## Final specification review, then quality review

Specification review checked GIS-09 and its component specification against the additive
migration, SQL/API tests, converter, project and final evidence. Exact package+zone joins
retain historical attribution; event and Inventory geometry stay separate; legacy bindings
remain unknown; the old sample view and reader permissions remain unchanged. Required
local SQL/export agreement and actual QGIS historical rendering are complete. No material
contract or product-policy change was introduced. GIS-09 can be marked done; QA-07 remains
an independent release gate.

Quality review checked bounded ZIP reads/allowlists, duplicate-ID and count handling,
composite joins and tenant keys, invoker RLS including Training isolation, whole MultiPolygon
retention, read-only local sources and strict SQL/provider metadata comparison. The final portability check caught relative-directory source paths; resolving the output
directory before saving now produces `./file.geojson` sources. A separate-process reopen
check proves the saved project loads without relying on the workspace working directory.
No actionable finding remains. Six projection regressions, Ruff lint/format, shell syntax and diff checks
pass. A repeated PNG-driver update warning when rendering over an existing image did not
prevent the QGIS layout exporter returning success; the resulting image was inspected.
