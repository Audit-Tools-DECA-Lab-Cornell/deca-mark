# Reconciliation with the completed QGIS repair — October 17, 2026

The completed QGIS repair is **49caa05f2c00a6511da482319505bf002935614d**, whose parent
is **9928f536f12bee59dd245c75ee53779b0f5683a4**. The worktree now preserves that repair
alongside the final audit cleanup. This corrects the source baseline used for the
previous local QGIS implementation and its code-count summary.

## Source and preservation

The current environment's checkout remained at 9928f53 and initially lacked both the
49caa05 object and the supplied fallback patch path. The exact public commit was fetched
with --no-write-fetch-head/--no-tags; no branch/ref was moved. All 93 initially changed
or untracked paths were backed up under ignored work/final-cleanup before reconciliation.

The authoritative converter, renderer, launcher and saved-project checker now match
49caa05 **byte-for-byte**, as do its current QGIS instructions and all twelve upstream
evidence files. See [the preserved-file hashes](qgis-reconciliation/qgis-preserved-upstream.sha256)
and [the unchanged upstream report](../qgis-export-converter-2026-10-17/README.md).
That report's earlier verification and authorized Git delivery are historical evidence.
The reconciliation checks below preceded the subsequently authorized Git delivery
recorded at the end of this report.

The supplied repair includes safeguards absent from the independently implemented local
version: project and version scope validation, comparison of CSV historical snapshots,
stronger multipart/geometry agreement, a disposable-selection check before requesting
api_client, direct fixture discovery for standalone and combined collection, Linux/macOS
runtime selection, isolated QGIS profiles and safe provider/layout teardown. These are
preserved rather than replaced by another repair.

Only these cleanup-specific adaptations remain on supplied repair paths:

- database/tests/test_gis09_api.py explicitly marks the database-backed wrapper integration,
  as required by the cleanup's api_client guard and database-free selection.
- The production-converter acceptance subprocess retains the local test's empty inherited
  environment and ten-second timeout. All upstream scenario assertions remain.
- The existing local negative CSV form_version case is retained as one additional authored
  case in the upstream unit test. It is not a duplicate validator.
- The upstream database README paragraph is merged with the cleanup's canonical-form
  transition instructions, preserving both sets of instructions.

Outside those supplied paths, **79 pre-existing changed/untracked paths are unchanged**.
Only four local provenance/navigation documents received notices pointing to this
reconciliation and the authoritative repair. All backend cleanup implementation, synthetic
initialization, authorization/form-validation/revision fixes, golden contracts and prior
regression tests remain preserved. The earlier local QGIS report and artifacts remain
under qgis-repair-2026-10-17 with a source-superseded notice; they were not overwritten.

At completion of reconciliation, HEAD remained 9928f53 and the real Git index was unchanged. A temporary index in ignored
work/ was used solely to compare the cleanup against 49caa05; there was no staging in
the real index, branch switch, merge, commit or push.

## Fresh verification on the reconciled source

| Check | Result |
| --- | --- |
| Signed GIS plus canonical shell lifecycle, form validation/revision, authorization, workspace concurrency and exports | [130 passed](qgis-reconciliation/qgis-reconciled-api.txt), 7 warnings, 193.96 seconds. Includes the retained Inventory-bound scenario and actual signed CSV/GeoJSON through the production converter. |
| Documented standalone GIS wrapper | [1 passed](qgis-reconciliation/qgis-reconciled-standalone.txt), 2 warnings, 4.03 seconds. Fixture discovery is verified independently of combined collection. |
| Converter unit cases | [12 passed](qgis-reconciliation/qgis-reconciled-unit.txt), including scope/project/snapshot/ZIP/coordinate/anchor/form-attribution rejection. |
| Refusal without explicit disposable database selection | [Expected guard failure](qgis-reconciliation/qgis-reconciled-isolation.txt) at disposable_database_selected before requesting api_client. It does not fall back to a local password file or database. |
| Database-free selection, explicitly including the GIS wrapper in collection | [510 passed, 308 deselected](qgis-reconciliation/qgis-reconciled-pure-selection.txt), 64.46 seconds, with audit guards against private configuration, actual TCP connections and Docker access. The added deselection is the database-backed GIS wrapper. |
| Installed QGIS rendering and separate-process project reopen | [Passed, both exit 0](qgis-reconciliation/qgis-reconciled-provider.txt), Linux QGIS 3.40.6-Bratislava, OGR provider. |
| Backend/QGIS lint, Python typing, changed QGIS/fixture formatting and plan checks | Ruff passes; [zero type errors/warnings/notes](qgis-reconciliation/qgis-reconciled-types.txt); formatting, shell syntax and plan checks pass. |

The installed provider checks three original events, two points, one Inventory with null
source event geometry, its full two-part historical MultiPolygon, two snapshots, WGS84,
read-only layers and exact SQL attribution. The delayed point remains inside its recorded
v1 boundary and outside v2. The saved project reopens with its three valid read-only layers
and adjacent sources. The renderer emitted sandbox netlink/socket and PNG update-access
warnings; final provider/export checks and both processes succeeded.

The [fresh artifacts](qgis-reconciliation/acceptance-context.json) include actual signed
[GeoJSON](qgis-reconciliation/geojson.zip) and [CSV](qgis-reconciliation/csv.zip) ZIPs,
[SQL readback](qgis-reconciliation/sql-readback.json),
[projection checks](qgis-reconciliation/analysis/projection-checks.json),
[provider checks](qgis-reconciliation/analysis/qgis-checks.json),
[reopen checks](qgis-reconciliation/analysis/project-checks.json), and the
[rendered project image](qgis-reconciliation/analysis/gis09-qgis-render.png).
All records are synthetic; signing tokens and credentials are absent.

Commands used the existing smaller disposable PostgreSQL/PostGIS + pg_cron image
`decamark-cleanup-tests:local`, repository Python 3.13 tooling and Node 24/pnpm 10.17.1.
Database/provider variables were removed, email delivery disabled, and both explicit
loopback/container test overrides were supplied by the inspected disposable harness.
Each harness cleaned up only its own fresh container. No existing database was reset.
The earlier full backend/SQL/client results remain recorded in implementation.md; they
are not presented as additional full-suite reruns after this source reconciliation.

## Cleanup-only delta and remaining prerequisites

Relative to **49caa05**, excluding already-completed upstream QGIS work and evidence,
production Python is **+32 / −224 = −192 lines** across 12 files; Python tests are
**+320 / −358 = −38 lines** across 26 files. The synthetic initializer and marker
documentation each replace one line. See [the measured delta](qgis-reconciliation/cleanup-versus-49caa05-delta.json).
The earlier −216/+114 summary used the initial 9928f53 snapshot with an independent
QGIS implementation; it is superseded for the final cleanup scope by these numbers.
Correctness and preservation, rather than line reduction, remain the acceptance criteria.

A [cleanup code/test/config patch against 49caa05](qgis-reconciliation/cleanup-code-versus-49caa05.patch) is retained for review. It excludes already-completed QGIS production code and evidence. Application was checked against a separate temporary index at 49caa05; the real index was not changed.

The existing stored-fields transition prerequisite is unchanged. Fresh canonical seeds
do not convert immutable existing definitions or historical package references; targets
with fields-only definitions need explicit preservation/transition assessment before
this canonical-only runtime is rolled out. No records or migration ledgers were rewritten.

This verifies current converter and installed-provider/layout/reopen behavior locally.
It does not establish interactive Desktop, a live-reader pilot, pinned full Supabase,
physical collector or hosted compatibility. Account-deletion recovery and consolidated
rollout verification still require explicit assessment. No secrets were read, real
Auth/email providers contacted, hosted services changed, or deployments attempted.

## Authorized Git delivery

The user subsequently requested "commit and push". Fetching origin/master confirmed
that its tip was exactly 49caa05f2c00a6511da482319505bf002935614d. The existing work
branch was advanced to that commit while retaining all 1,541 working-file hashes;
there was no branch switch or worktree replacement. The cleanup commit is prepared
as its direct descendant, preserving the supplied QGIS repair in history. No force
push, database operation or deployment command is part of this delivery.

The current application source is the reconciled source verified above. The only
subsequent content change is this delivery note. The earlier reports' statements
about no commit or push describe their historical verification snapshots.

Staged source, tests and current instructions pass the whitespace check. Raw evidence
retains CSV CRLF bytes, tool-output trailing spaces and patch context; those evidence
files produce whitespace diagnostics when included in an unfiltered Git check and
have deliberately not been reformatted.
