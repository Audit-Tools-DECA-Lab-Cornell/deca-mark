# QGIS current-export repair — local remediation, October 17, 2026

> **Source superseded by the supplied upstream repair:** Commit
> `49caa05f2c00a6511da482319505bf002935614d` contains the completed QGIS repair and
> evidence. That source has now been adopted, including stronger validation, fixture
> isolation and installed-QGIS consumer fixes. This report and its artifacts retain the
> earlier independently implemented local snapshot; do not treat them as final-source
> verification. See [current reconciliation evidence](../final-cleanup-2026-10-17/upstream-qgis-reconciliation.md)
> and the [upstream report](../qgis-export-converter-2026-10-17/README.md).

The converter and retained GIS scenario now work with current signed `/v1` exports.
This is separate evidence from the [final audit cleanup](../final-cleanup-2026-10-17/implementation.md).
No entire-audit, hosted compatibility, QGIS provider/Desktop or rollout closure is claimed.

## Baseline and reproduced failure

HEAD is `9928f536f12bee59dd245c75ee53779b0f5683a4`; the initial worktree was clean.
The user explicitly clarified that the earlier QGIS repair claim was incorrect and
that no repair commit, patch or local work existed. The October 16 validation report
correctly recorded the remaining Inventory assertion and converter defect; it is unchanged.
The user then authorized this focused converter/acceptance repair.

The original converter requires assignment_basis and compares display_anchor_basis,
both absent from current exports. Its synthetic unit fixture manufactured those fields.
The GIS scenario used a package with no Inventory binding and its external wrapper did
not discover api_client. These were substantive defects, not obsolete duplicate tests.

After completing the fixture, its actual signed CSV/GeoJSON ZIPs were fed to a source
copy of the HEAD converter. It failed with **ValueError: Unknown assignment basis**;
see [before-result](gis-before.txt). The repaired converter accepts those exact current
exports. No expected bytes or runtime records were fabricated to satisfy it.

## Focused change and safety

- prepare.py uses every event’s exact package_id + zone_id to require the historical
  snapshot, then checks version, zone code and recorded label. It never substitutes the
  current package or guesses continuity from a label. Current records missing their
  binding, mismatched metadata and extra/unreferenced snapshots are rejected.
- Standard/Reliability remain Point events. Inventory retains null event geometry in
  all-events.geojson and becomes exactly its whole recorded MultiPolygon in the separate
  analysis layer. Multipart geometry is one observation, not multiple counted events.
  Display anchors remain attributes, never capture locations.
- CSV comparison retains IDs/counts, scope and attribution checks, removes the two absent
  basis fields, and checks form_version plus actual display-anchor coordinates. The
  original export bytes, frozen forms, codebook and historical zones are retained.
- Exact ZIP asset names, duplicate-entry refusal, archive/expanded byte limits, unique
  feature IDs and scope counts remain. Unsupported unversioned/unknown-support records
  are refused under the current contract; no legacy binding framework was added.
- render.py and verify_project.py follow the current three-layer output and no longer
  require removed basis fields or a legacy layer. Their exact historical polygon and
  read-only checks remain; version labels use the supplied version arguments. They were
  checked statically and for syntax, not executed with an installed QGIS runtime here.

## Retained acceptance scenario

The original test_v1_v2_gis_readback_matches_signed_exports name and its Inventory
binding, delayed-record, recorded-label, SQL/API and exact snapshot assertions remain.
A dedicated fixture publishes a canonical Inventory form with real revision/ETag
preconditions before its first package, so both roles are explicitly bound at map v1.
The external wrapper loads backend fixtures through pytest’s supported plugin discovery.
No global test fixture now creates extra Inventory forms or changes other scenarios.

The signed observer uploads a delayed v1 point and v1 Inventory after a smaller,
renamed v2 package publishes, plus a v2 point. A signed viewer exports both formats.
Restricted fieldmaps_api GIS reads agree with the recorded API attribution. Both
actual ZIPs are then passed to the production converter CLI in a subprocess with no
inherited environment. The output is checked against the recorded API rows and exact
historical snapshot; frozen forms/codebook bytes are preserved.

## Actual results and artifacts

- Documented disposable GIS wrapper: **1 passed**, 11.79 seconds; [log](gis-api.txt).
- Production converter unit suite: **8 passed**; [log](qgis-unit.txt). Covers multipart
  inventories, wrong-package reuse, missing binding, historical-attribute mismatch,
  unsupported support/null-point geometry, duplicate IDs, wrong counts, extra snapshots,
  CSV form/anchor mismatches and null-geometry consistency and ZIP duplicate/path refusal.
- Ruff, changed-file formatting and syntax compilation passed. Backend BasedPyright
  reports zero errors, warnings or notes. Full backend/client/SQL regression results
  are recorded in the separate cleanup report.
- Actual synthetic [GeoJSON export ZIP](synthetic/geojson.zip), [CSV export ZIP](synthetic/csv.zip)
  and [projection checks](synthetic/prepared/projection-checks.json) are retained. These
  contain fictional records and form definitions, without credentials or signing tokens.
  The output has **3 events, 2 points, 1 Inventory polygon and 2 historical snapshots**.

Reproduce conversion without a database:

```sh
python3 qgis/zone-boundaries/prepare.py \
  docs/reviews/qgis-repair-2026-10-17/synthetic/geojson.zip \
  work/qgis-replay \
  --csv-zip docs/reviews/qgis-repair-2026-10-17/synthetic/csv.zip
```

Reproduce signed acceptance with a cached disposable database image containing pg_cron:

```sh
EMAIL_ENABLED=false DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh database/gis09-api-rehearsal.sh -q
```

Node 24.19.0, pnpm 10.17.1 and repository Python 3.13.5 were used. This run uses
smaller disposable PostgreSQL/PostGIS + pg_cron with synthetic Auth/JWT fixtures,
not hosted Supabase or the pinned full Supabase image. It does not launch installed
PyQGIS, render a fresh provider project, drive Desktop, exercise a physical collector
or provision a live reader. Those acceptance/rollout gates remain explicit.

No earlier dated acceptance files were overwritten. No secrets were read, real
application providers contacted, existing databases reset, hosted services changed,
branches switched, commits made, pushes performed or deployments run.
