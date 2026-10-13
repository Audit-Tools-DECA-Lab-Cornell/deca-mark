# Zone boundaries: current-contract acceptance matrix

[Master plan](README.md) · [Canonical contract](contract.md) · [QA-07 task status](../verification.md)

These are required checks for CON-06's current contract, not test results. Complete DB-19's fresh baseline before BE-22's canonical API acceptance. Earlier implementation reports do not establish compliance with this rewrite.

Map versions v1 and v2 are successive packages for one site. Every operation below uses the only API prefix, `/v1`, and the single zone-aware package archive.

## Evidence and dependency gates

Use synthetic sites, accounts and observations. Automated tests target local services. Record commit, baseline/schema level, client build/platform, fixture IDs, expected/actual behavior and command output or screenshots. Keep secrets and real research answers out of artifacts.

| Gate | Required evidence |
| --- | --- |
| CON-06 | One consistent contract and shared cases; component handoffs and dependency graph agree |
| DB-19 | Fresh local baseline and seeds pass current SQL checks; first package versions start at 1 |
| BE-22 | Live local current-API workflow passes against DB-19; generated contracts are stable on a second run |
| Client dependencies | Runtime parsing, package retention, session/recovery, geometry and current-envelope upload checks pass |
| QA-07 | Browser, physical-device, server/export and QGIS evidence for the complete story |

Distinguish unit, SQL, live API, browser, simulator, physical device and QGIS results. A green suite does not replace a missing platform acceptance run. Hosted resets and deployments need explicit approval of the exact target.

## Baseline and collector reset cases

| Case | Required result |
| --- | --- |
| Fresh local server baseline | Only the current schema and fresh synthetic seeds; first map is v1 |
| Incompatible collector schema | Transactional reset of the collector database and package-file cleanup before collection opens |
| Collector reset creation fails | Prior tables/schema version restored; collection does not open partially initialized |
| Crash or file-cleanup failure during reset | Durable cleanup requirement resumes; collection stays blocked until cleanup completes |
| Current-schema close/reopen | Records, answers, owners, upload state, exact bindings and package references remain unchanged |
| Current-schema sign-out/session loss | Account-gated local work remains available for authorized recovery; authentication does not reset storage |

## Shared geometry cases

| Case | Required result |
| --- | --- |
| Convex and concave polygons | Valid shapes round-trip with unchanged coverage |
| Polygon with hole | Hole interior excluded; ring boundary included by coverage |
| Disjoint MultiPolygon parts | One zone identity, full shape retained, no duplicated event count |
| Inside/outside, exact edge or vertex | Mobile, API and SQL agree on every shared case |
| Shared edge and nearby points | Explicit covering-zone choice; no iteration-order assignment, tolerance or snap |
| Gap between zones | Invalid attribution blocks completion and keeps the draft |
| Structurally valid bow-tie or invalid topology | Draft retains edits; publication blocks with coded issues |
| Empty/null/zero-area/unclosed/short geometry | Refused at the documented boundary, never a box fallback |
| Duplicate vertices/segments and multipart contacts | Canonical outcome and digest agree across implementations |
| Interior overlap, containment or identical polygons | Publication blocked; boundary-only touching allowed |
| Zone outside concave site or inside its hole | Publication blocked despite bounding-box containment |
| Duplicate code/UUID or wrong-site identity | Refused without changing current state |
| Reversed/projected/out-of-range coordinates, NaN, infinity, Z/M | Detectable invalid inputs rejected; plausible coordinate reversal still needs map review |
| Canonical winding/ring ordering | Deterministic output/digest with unchanged coverage |
| Unsupported extent or maximum/one-over limits | Bounded documented error without damaged draft/current state |
| Malformed installed full geometry | Package not ready; last verified package and unfinished work retained |

## Manager, database and API cases

| Case | Required result |
| --- | --- |
| First layer upload with null current precondition | Ready map v1 with explicit identities and form bindings |
| Concurrent first uploads or successor publications | One current-state winner; competing stale request conflicts |
| Missing/duplicate/unused feature identity mapping | `identity_conflict`, no implicit name/code continuity |
| Create/save/reopen manager draft | Persisted edits, current package metadata, actor names and exact ETag |
| Two saves using one revision | One update, one 412; no lost edits |
| Missing or malformed write precondition | 428 or documented structural rejection; no mutation |
| Validation followed by an edit before publish | Exact revision revalidated or stale request refused |
| Lost publication response and identical replay | Same package, `replayed: true`, no duplicated version |
| Replay after a newer success | Original package returned alongside actual current pointer; pointer never moves back |
| Request UUID reused with changed content | 409; original result preserved |
| Failure after archive preparation or during commit | No partial current package, snapshot set or successful receipt |
| Direct writes/appends to immutable artifacts | Restricted roles denied |
| Observer/viewer mutation, forged role or cross-tenant IDs | API and database deny without existence disclosure |
| Inherited organization manager | Authorized access and recorded display names work |
| Rename/remove/split/merge or corrective publication | Earlier snapshots unchanged; new identities where required; restoration creates a new version |
| Form retirement while bound by current package | Conflict requiring a successor package |
| Authorization revoked while waiting on locks | Commit/replay rechecks current authority and has no unauthorized side effect |

## Observation and offline cases

| Case | Required result |
| --- | --- |
| Map-v1 draft, map-v2 publication, offline save/reconnect | Accepted with map-v1 package, label and geometry |
| Force quit during draft or after save before receipt | Exact envelope/context restored; replay produces one row |
| Map v1 removed while referenced | Removal refused; session, draft and retained-record references remain usable |
| Map-v2 download interrupted/cancelled/disk full | Map v1 remains verified/selected; partial map v2 is not ready |
| Crash between immutable file write and catalog commit | Reconciliation retains referenced content and rejects incomplete readiness |
| Draft's exact zone/package missing or corrupt | Recoverable state; no replacement zone or newer package |
| Site discovery names map v2 with only map v1 installed | Offline map v1 remains usable and correctly labelled |
| Account/issuer/project changes during async work | Stale completion cannot alter another scope's catalog or visible state |
| Shared content with another account's reference | Safe scoped removal without exposing private records or deleting referenced content |
| Login expiry, temporary server failure or revoked access | Local answers retained; upload pauses/retries or becomes needs attention |
| Wrong site/package/zone/form or point coverage | Typed rejection and retained needs-attention record |
| Identical observation replay | Original receipt and one immutable server row |
| Same observation UUID with changed binding or answers | Conflict without rewriting the original row |
| Invalid JSON, extra envelope fields or invalid answer values | Strict boundary rejection without insertion |
| Receipt observation/account/project/package/zone mismatch | Collector does not acknowledge |
| Inventory envelope | Coordinates and first-round absent; event geometry null; exact whole-zone binding |
| Inventory includes coordinates or first-round, including null/false | Strict rejection; unfinished local work retained |
| Inventory in concave/holed/MultiPolygon zone | Server anchor inside actual snapshot; no activity point fabricated |
| Bound form retired after capture | Authorized late upload still uses its exact package binding |
| Equivalent UUID/time/JSON numeric spelling | Single canonical hash agrees with independently authored current cases |
| Map refresh between placement and save | Frozen package remains the observation's context |
| Explicit shared-edge zone switch then process death | Chosen covering zone restored with its correct answers and context |

## Read, filter, export and GIS cases

| Case | Required result |
| --- | --- |
| Same zone code on two sites | Distinct scoped filters and labels |
| Same zone identity across changed map versions | Recorded labels/versions visible; exact-package filter selects one snapshot |
| More than 500 matching rows | Filtering precedes paging; complete export or explicit documented ceiling error |
| Cursor used with another project/filter | Rejected; no tenant leakage |
| Equal observed timestamps | Correct mixed-direction ID tie-break without duplicate page rows |
| Late offline upload during paging | Documented live-read behavior; refresh exposes the record |
| Export during concurrent writes | One authorized snapshot across all ZIP assets; no partial success |
| Half-open UTC interval across project-local DST | List, summary and export agree |
| Every export row/byte/source/time limit and one-over | Safe narrowing error before successful response starts; cancellation releases resources |
| CSV text beginning with formula prefixes | Safe spreadsheet text |
| Inventory alongside points | Distinct spatial support; null event geometry and separate whole-zone layer/count |
| MultiPolygon inventory | One observation, independent of polygon-part count |
| Empty results or site coverage gaps | Exact zero counts; no invented complete-coverage claim |
| Map/table page or viewport differs | Same filters; visible subset labelled |
| Superseded package in detail/QGIS | Recorded geometry and label loaded using package+zone |
| Training under manager/viewer | Creator-only visibility retained |
| Current-schema backup/restore | Archive, snapshot, binding, receipt and current-pointer associations remain consistent |

## Complete-story release gate

1. On local web, upload map v1 with explicit identities, create a draft, receive and correct a topology issue, then publish map v2. A second manager's stale mutation conflicts without losing edits.
2. On a physical collector, download map v1 and leave a draft offline before map v2 is published. Force quit/reopen, resume map v1, save a point and Inventory, then reconnect.
3. Verify one server row per observation, map-v1 attribution, the original receipt on replay and whole-zone Inventory semantics. Refuse removal while a draft or retained record references map v1.
4. On web and in authorized CSV/GeoJSON/QGIS, filter exact map-v1 zones and verify recorded labels, geometry and counts beyond one page. Start a fresh collector visit on verified map v2.
5. Review actual browser/device/server/GIS evidence and failure cases. Record missing acceptance as pending; do not replace it with local unit results.

## Commands and documentation checks

For this documentation rewrite, run `pnpm plan:check`, validate relative links and task references, scan for superseded contract behavior and inspect `git diff --check`. No application or hosted acceptance is claimed by those checks.

DB-19 runs its explicit reset and SQL suite on the local target. BE-22 then runs `pnpm backend:check`, `pnpm backend:test` and `pnpm db:test`; the coordinator runs `pnpm contracts:generate` twice and checks stability. Client owners run `pnpm mobile:check`, `pnpm mobile:test`, `pnpm web:check` and `pnpm --dir web test:unit`.

Read the existing local browser harness (`sh scripts/e2e-local.sh`) before starting its fixtures. Do not run reset or destructive setup implicitly. Record simulator versus physical-device evidence, and local QGIS exports versus authorized live-reader evidence, separately.
