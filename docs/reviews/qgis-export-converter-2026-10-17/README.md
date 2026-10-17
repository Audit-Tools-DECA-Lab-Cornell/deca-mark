# QGIS export-converter remediation — October 17, 2026

This is fresh remediation evidence, separate from the original engineering audit and
from the earlier form-revision evidence. The previous claimed QGIS repair did not
exist. No dated audit, form-validation source, authorization policy or form-revision
implementation was changed by this repair.

## Baseline and integration

The inspected checkout is `/workspace/deca-mark`, branch `master`, HEAD
`7f12470c6dfc17aa2542a1b7402f33287cff42a7`. Initial tracked, staged and untracked status
was clean. This checkout did not contain the local canonical-form changes.

The user subsequently identified canonical-validation commit
`9928f536f12bee59dd245c75ee53779b0f5683a4`, whose parent is the recorded HEAD. That object
was fetched for inspection; no branch was switched or merged. An isolated archive at
`/workspace/work/deca-mark-qgis-repair-20261017` contains that commit plus only this GIS
patch. All disposable integration results below use that combined source. Canonical
validation files in the working checkout remain untouched; this is a focused patch
for integration with that commit.

## Reproduction and correction

First the incomplete acceptance fixture was repaired to publish a synthetic Inventory
form using the draft's returned `If-Match` ETag and bind it before package v1. On the
unmodified production converter, actual signed current CSV/GeoJSON exports then reached
`ValueError: Unknown assignment basis`: **1 failed in 3.80 seconds** ([log](before.txt)).
This proves the converter defect independently of the original missing Inventory binding.

The current export fields are recorded from those signed synthetic ZIPs in
[export-contract.json](export-contract.json). Every observation has recorded package and
zone IDs, map version, code/label and spatial support. The API does not supply
`assignment_basis` or `display_anchor_basis`; neither field is synthesized by the fix.

`prepare.py` now joins all current observations to exact package+zone snapshots,
checks recorded metadata, project/count/version scope, and keeps Standard/Reliability
points separate from whole-zone Inventory. Source event bytes are unchanged; Inventory
has null event geometry there and receives its entire MultiPolygon only in the separate
analysis layer. Unsupported unbound legacy records are rejected, not assigned to today's
boundaries. Current output no longer adds a legacy layer or legacy counters.

Exact ZIP member allowlists, duplicate/path rejection, compressed/uncompressed ceilings,
unique event/snapshot IDs and exact referenced-snapshot checks remain. Matching CSV ZIPs
are checked for scope, identity, historical attribution, coordinates, display anchors and
identical historical snapshots. Separate generation timestamps are allowed; separate
requests still do not share a transaction.

The database-side wrapper exposes the required backend fixtures directly. Registering
the whole backend conftest initially passed standalone but collided when backend and
wrapper tests were collected together; direct fixture imports pass both forms of collection.
The scenario is retained and strengthened; it was not deleted as an obsolete duplicate.

## Changed files

- `qgis/zone-boundaries/prepare.py`: current-contract projection and CSV agreement.
- `qgis/zone-boundaries/test_prepare.py`: current-field fixtures and rejection regressions.
- `qgis/zone-boundaries/render.py`, `render.sh`, `verify_project.py`: current layers and
  attribution, installed Linux/macOS runtime selection, temporary profiles and saved-project checks.
- `backend/tests/gis_current_acceptance.py`: revision-aware synthetic Inventory publication,
  old/new package scenario, restricted GIS/export comparisons and production converter CLI.
- `database/tests/test_gis09_api.py`: expose required backend fixtures for standalone and combined runs.
- `qgis/README.md`, `qgis/ZONE-BOUNDARIES.md`, `qgis/zone-boundaries/README.md`,
  `database/README.md`: current commands, contract and verification boundaries.
- This evidence directory: fresh logs, actual export field inventory and provider check reports.

## Commands and results

Commands and harnesses were inspected before execution. Node **v24.19.0**, pinned
pnpm **10.17.1**, uv and the repository Python **3.13** environment were used. Python
commands used `--frozen --no-sync --offline`; no dependency change was needed.

The API harness creates an independent `fieldmaps-zone-api-<pid>` container, initializes
PostgreSQL in its own `/tmp`, applies current migrations/seeds and exposes only an
ephemeral loopback port. It supplies both explicit disposable test overrides. GIS setup
checks that selection **before** requesting `api_client`. Running without those overrides
fails at that guard before API initialization ([expected refusal](isolation-guard.txt));
an integration marker alone is never used to establish isolation. No existing database
or volume is reset, and only the harness's own container is stopped.

The cached fallback image was `decamark-form-tests:17`, image ID
`sha256:71a038b27411fd00ed56710728d042e43e77d570a342b70f9dd32e0853c118e9`:
PostgreSQL 17/PostGIS 3.5 plus pg_cron. It uses synthetic Auth tables and generated
signing keys, not real Auth/email providers or a complete Supabase Auth/Storage stack.
`DATABASE_PASSWORD`, `DATABASE_URL`, `DECAMARK_API_URL`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` were removed for integration commands and
`EMAIL_ENABLED=false` was set. Those environment values were never printed or read.

From the isolated combined-source root:

```sh
DECAMARK_REHEARSAL_IMAGE=decamark-form-tests:17 EMAIL_ENABLED=false \
  sh database/gis09-api-rehearsal.sh -q \
  --basetemp=/workspace/work/deca-mark-qgis-standalone-artifacts

DECAMARK_REHEARSAL_IMAGE=decamark-form-tests:17 EMAIL_ENABLED=false \
  sh database/gis09-api-rehearsal.sh \
  tests/test_form_validation_api.py tests/test_form_revisions.py \
  tests/test_observation_authorization.py tests/test_workspace_concurrency.py \
  tests/test_observation_analysis_exports.py \
  --basetemp=/workspace/work/deca-mark-qgis-final-artifacts -q
```

The dedicated `--basetemp` is pytest-owned scratch, not an existing data directory.
The test writes actual `geojson.zip`, `csv.zip`, prepared layers, `sql-readback.json`
and `acceptance-context.json` for provider verification. Actual results:

- Standalone documented command: **1 passed, 2 warnings in 3.46 seconds**
  ([log](standalone.txt)). Fixture discovery works without an extra plugin flag.
- Combined converter, canonical-validation API, form-revision, authorization, workspace
  concurrency and export regressions: **116 passed, 9 warnings in 165.95 seconds**
  ([log](regressions.txt)). This includes the repaired GIS scenario.

Warnings are existing Starlette/SQLAlchemy deprecations plus an assertion-rewrite warning
when the existing export-fixture plugin is imported by the combined collection.

Converter-only and relevant static commands:

```sh
uv run --project backend --frozen --no-sync --offline python -m unittest discover -s qgis/zone-boundaries -p 'test_*.py'
uv run --project backend --frozen --no-sync --offline ruff check qgis/zone-boundaries
uv run --project backend --frozen --no-sync --offline ruff format --check qgis/zone-boundaries
sh -n qgis/zone-boundaries/render.sh
# From the combined source's backend/ directory:
uv run --frozen --no-sync --offline ruff check .
uv run --frozen --no-sync --offline basedpyright
```

- Converter regressions: **12 passed** ([log](converter-unit.txt)); includes exact historical
  matching, multipart Inventory semantics, project/scope/ID rejection, CSV geometry and
  anchor agreement, formula-protected labels, path/duplicate/byte-limit archive rejection.
- QGIS Ruff/format, shell syntax and source diff checks: passed ([log](qgis-static.txt)).
- Complete backend Ruff: passed; complete BasedPyright: **0 errors, 0 warnings, 0 notes**
  on canonical-validation commit plus the GIS acceptance changes.
- Wrapper collection: **1 test** standalone and **39 tests** when combined with form revisions.

## Patch delivery

The focused patch is `/workspace/work/deca-mark-qgis-export-converter.patch`.
It applies to a fresh archive of canonical-validation commit `9928f53` without conflicts;
no file changed by that canonical-validation commit overlaps this patch. At the initial
patch handoff, the working checkout remained at its original HEAD without staging or
committing. The user subsequently authorized committing and pushing to `master`.
For that delivery, `master` was fast-forwarded to `9928f53` without conflicts; the
converter and acceptance source match the verified combined archive exactly, and
canonical validators remain unchanged. The commit adds only the focused GIS changes
and this separate remediation evidence. No branch switch or history rewrite is used.

Evidence text captures normalize trailing whitespace for a clean patch. Original captures
remain under `/workspace/work/deca-mark-qgis-*.txt`. The original dated audit and acceptance
artifacts remain untouched.

## Installed QGIS acceptance and limits

An installed Linux runtime is available: **QGIS 3.40.6-Bratislava**, OGR provider.
The repaired renderer uses temporary QGIS and XDG profiles and loads only the prepared
local files. It adds no database or network layers. QGIS provider/layout references
are released before runtime teardown; an initial Linux teardown segmentation fault
was corrected before the successful provider and separate-process reopen runs.

The final provider command used the combined suite's generated artifact and exited 0:

```sh
sh qgis/zone-boundaries/render.sh \
  /workspace/work/deca-mark-qgis-final-artifacts/test_v1_v2_gis_readback_matche0/analysis \
  --delayed-point ce709fad-8da9-4955-9792-0151117a79cd \
  --sql-readback /workspace/work/deca-mark-qgis-final-artifacts/test_v1_v2_gis_readback_matche0/sql-readback.json
```

[Provider log](qgis-provider.txt), [projection checks](projection-checks.json),
[QGIS checks](qgis-checks.json) and [separate-process reopen checks](project-checks.json)
record the actual result. The render PNG and project remain beside the generated local
artifact; no dated acceptance artifact was overwritten. The runtime emitted sandbox
socket warnings and a PNG metadata update warning, with successful rendering and exit 0.

Provider acceptance checks source/projected IDs and recorded labels, two point events,
null Inventory event geometry, the full two-part historical Inventory polygon, two
package snapshots, WGS84 and SQL attribution. It verifies the delayed v1 point lies
inside v1 and outside v2 after the boundary/label change. The saved project reopens in
a separate installed QGIS process with valid read-only layers and adjacent data sources.

This is converter acceptance and installed-provider/layout/reopen acceptance. It is
**not** interactive QGIS Desktop acceptance, a scoped live-reader pilot, full Supabase
service acceptance or hosted compatibility. No hosted migration/deployment is required
by this code-only repair. No secrets were read, real Auth/email providers contacted,
existing databases reset, hosted services changed, branches switched or manual
deployments attempted. The implementation and verification phase made no commits or
pushes; the later user instruction separately authorized Git delivery as described above.
