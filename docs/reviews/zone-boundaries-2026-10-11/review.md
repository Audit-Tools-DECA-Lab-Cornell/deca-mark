# Zone boundaries: principal engineering review

**Recommendation: continue with adjustments. Reopen DB-16 and BE-18 for focused corrections; keep publication disabled. Preserve the architecture.**

Review date: 2026-10-11. Comparison baseline: `1c8a5eb`. Reviewed HEAD: `6a9028e880f586ee7b9d7a8fc1d4573ebf446f1b`, plus the modified and untracked working tree. This is an assessment, not release approval. No implementation, canonical plan, migration, hosted service, or Git history was changed. This report and synthetic audit evidence are the only new deliverables.

## A. Executive assessment

The architecture is appropriate for this product: immutable map packages, stable zone identities, package-specific snapshots, PostGIS validation, explicit activation, and the existing SQLite outbox. Replacing it with another sync engine, map platform, or separate zone-version system would add cost without fixing the identified problems.

The database and authoring API have substantial working local implementation. The audit reran **505 backend tests**, **417 SQL/Auth-hook assertions**, six SQL concurrency scenarios, 2,545 coordinate serialization comparisons, **105 focused mobile tests**, and **241 web unit tests**. These passes support the implemented foundation, not delivery of the full feature.

Two P1 findings require correction before publication rollout:

1. **A manager demoted to viewer while finalization waits for a site lock can still publish.** A signed HTTP publication returned 201 after a second signed HTTP request committed the demotion with 204. The publication was persisted.
2. **Adoption permanently freezes the site's form choices without a supported successor path.** Retiring a pinned form blocks subsequent map publication; neither draft creation nor managed import can select its replacement. Adopting without an inventory form similarly has no supported later opt-in.

Two P2 implementation findings concern exact import identity typing and repeated archive extraction during site discovery. The remaining plan also needs a short contract reconciliation before frontend integration, not wholesale redesign.

Historical package and observation preservation is well represented in local SQL tests. End-to-end preservation on the observer's device is still unimplemented: MOB-28 and MOB-29 are correctly todo. BE-19 and BE-20 remain essential missing infrastructure. The editor, complete historical review/export, and QGIS story are also unfinished. None should be described as working merely because generated types or request schemas exist.

**Do not stop all development.** Serialize the DB-16 authorization fix and contract decisions. MOB-28 storage work, BE-19 implementation against the existing observation contract, and WEB-30/31 preparation can continue with disjoint ownership. Do not enable publication until the repaired foundation and the client/history acceptance gates pass.

## Review scope and evidence

### Repository reconstruction

There are 11 commits after the planning baseline, principally product renaming, landing-page changes, and screenshot tooling. The zone implementation itself is in the working tree: six new SQL migrations, new backend modules/tests, authored contracts, generated client declarations, and small client adapters. At the initial snapshot there were 49 modified tracked files and 71 untracked entries/files reported by Git. Unrelated branding, dependency, and development changes were preserved.

The six zone migrations are:

| Migration | Responsibility |
|---|---|
| [20261010120000_zone_foundation.sql](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261010120000_zone_foundation.sql:1) | Identities, snapshots, drafts, publication audit, site state, bindings, RLS, immutability |
| [20261011120000_zone_geometry.sql](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011120000_zone_geometry.sql:1) | Geometry validation, normalization, coordinate serialization/digests |
| [20261011121000_zone_drafts.sql](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011121000_zone_drafts.sql:1) | Draft lifecycle, site serialization, validation |
| [20261011122000_zone_publication.sql](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011122000_zone_publication.sql:1) | Atomic publication, managed imports, replay, legacy-write guards |
| [20261011123000_zone_observation_binding.sql](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011123000_zone_observation_binding.sql:1) | Server-side v2 binding, point coverage, inventory anchors |
| [20261011124000_zone_api_validation.sql](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011124000_zone_api_validation.sql:1) | API-facing validation and capability helpers |

The original plan is a useful design baseline, not evidence that any of these files are deployed. Hosted migration state and deployed publication settings were not inspected.

### Checks actually executed

| Check | Result and meaning |
|---|---|
| `sh database/zone-rehearsal.sh` | Passed on a new disposable PostgreSQL 17/PostGIS container; 417 logged assertions, six observed-lock races, 2,545 number comparisons. Existing databases untouched. [SQL evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/sql.log) |
| `sh database/zone-api-rehearsal.sh -q` | 505 passed in 150.09 seconds. Includes restricted-role DB tests and real loopback Uvicorn/signed-JWT tests. [Backend evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/backend.log) |
| Three additional audit probes | Retired-form dead end, numeric source-ID acceptance, repeated managed archive extraction reproduced; 3 passed means the probes confirmed current defects/behavior. [Evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/probes.log) |
| Additional coordinated authorization probe | Actual HTTP demotion 204 followed by publication 201; one durable publication. [Evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/demotion-http.log) |
| Python checks | Ruff passed; BasedPyright: 0 errors, 0 warnings, 0 notes |
| Focused mobile regression tests | 9 files, 105 tests passed: hosted packages, sync, storage, geometry, error handling. Existing behavior only. [Evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/mobile.log) |
| Web unit tests | 241 passed. [Evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/web.log) |
| Both client TypeScript checks | Passed with `--noEmit --incremental false` |
| Plan validation | Passed: 152 tasks across 13 files. This validates task/link structure, not product correctness. |

Python was 3.13.7. Explicit Node 24.18.0 was used for the mobile/web checks, typechecks, and final plan check. The SQL rehearsal's number adapter and backend subprocess client-parity adapter inherited the host's Node 26.9.0; their results are not represented as Node 24 execution. Existing backend tests verified current OpenAPI equals the exporter; generators were not run over the working tree.

An initial backend run lost its process handle during session interruption and was not counted; the logged complete rerun is the evidence above. The first custom-probe harness failed to import its plugin and was corrected outside application source. An exploratory retired-form assertion expected 409 for republishing the legacy fixture, but the actual response was 422 because that old definition is not publishable by the modern form editor; the primary retirement/publication block was already reproduced. The final probe records the observed 422. An initial authorization probe held the site longer than the 3-second lock timeout; the final probe releases within that limit and uses the real role-change API.

Parallel read-only reviews supplied useful source leads, but were interrupted before complete final verdicts. They are not counted as independent approvals. The findings below were checked directly, and the important defects were reproduced by the primary reviewer.

No feature browser walkthrough, simulator, physical-device, hosted deployment, or QGIS desktop acceptance was performed. The matching client feature is not implemented. Backup/restore and production-sized deployment rehearsal remain pending.

## B. Implementation status matrix

“Verified” below is limited to the surfaces actually exercised. Confidence is confidence in the stated status, not a security certification. Status authority remains the existing owning PLAN.md files; these are review recommendations, not a new progress board.

### Foundation and services

| Task | Claimed status | Verified status | Confidence | Remaining work |
|---|---|---|---|---|
| CON-05 | Done | Contract/schema/case implementation locally verified; requires targeted amendment | High | Resolve form succession, client contract decisions, extra edge cases; retain v1 goldens |
| DB-15 | Done, local only | Implemented and locally verified within its foundation scope | High | Preserve additive rollout/restore gate; no hosted claim |
| DB-16 | Done, local only | Implemented, but completion must reopen for confirmed defects | High | F1 authorization ordering, F2 form lifecycle, F3 source typing; add missing races |
| BE-18 | Done, local only | Working authoring/API slice; completion must reopen for corrections | High | F1 HTTP regression, F2 successor contract, F3 mapping behavior, F4 discovery cost; minimal client metadata |
| BE-19 | Todo | Not started as an integrated upload service; schema and SQL prerequisites exist | High | Actual strict v2 HTTP upload, general JCS fingerprint, answer validation, replay/protocol conflict, bound receipts |
| BE-20 | Todo | Not started as historical read/export endpoints | High | Authorized filters, cursor, consistent count/page, summary, detail, complete bounded exports |

### Collector, analysis and acceptance

| Task | Claimed status | Verified status | Confidence | Remaining work |
|---|---|---|---|---|
| MOB-28 | Todo | Not started; present client still uses legacy storage/install behavior | High | Protocol migration, catalog, references, atomic install/recovery, issuer/account fences, exact restore |
| MOB-29 | Todo | Not started; blocked on BE-19/MOB-28 and UI integration | High | Freeze binding/forms, v2 upload/receipt checks, physical-device story |
| MOB-30 | Todo | UI plan only; blocked on catalog | High | Available vs installed versions, update/removal/readiness UI |
| MOB-31 | Todo | UI/geometry plan only | High | All-covering-zones predicate and shared-edge parity, bound placement/save checks |
| MOB-32 | Todo | UI plan only | High | Exact draft recovery states, missing-package recovery, overwrite protection |
| GIS-09 | Todo | Specification only; blocked for integrated bound readback | High | Scoped historical projections, inventory distinction, SQL/export/QGIS evidence |
| QA-07 | Todo | Not started as the complete story; some component checks exercised | High | Browser + physical device + >500 rows + GIS + recovery/rollout evidence |

### Web tasks

| Task | Claimed status | Verified status | Confidence | Remaining work |
|---|---|---|---|---|
| WEB-28 | Todo | Acceptance gate only; editor not built | High | Real authoring browser flow, conflict/replay, managed import, accessibility/device checks |
| WEB-29 | Todo | Acceptance gate only; historical review not built | High | Cross-version map/table/export agreement |
| WEB-30 | Todo | Not started | High | Time-box drawing-surface spike; record measured decision |
| WEB-31 | Todo | Not started | High | Lossless multipart/hole model and format-2 reader |
| WEB-32 | Todo | Not started; dependent on WEB-30/31 | High | Pure editor operations and save-queue state |
| WEB-33 | Todo | Not started; dependent on editor core | High | Canvas, keyboard/touch interaction, panels |
| WEB-34 | Todo | Not started | High | Drawing and exact shared-edge tools; optional tracing may be deferred |
| WEB-35 | Todo | Not started; API exists locally but handoff unresolved | High | Conditional autosave, runtime responses, ETags, conflicts, validation |
| WEB-36 | Todo | Not started; API exists locally | High | Current-pointer discovery and format-aware history; coordinate consumers |
| WEB-37 | Todo | Not started | High | Zones entry, history, adoption and draft pages |
| WEB-38 | Todo | Not started | High | Review/publish/discard, lost-response handling |
| WEB-39 | Todo | Not started; blocked on BE-20 | High | Server-filtered observations and paging |
| WEB-40 | Todo | Not started | High | Historical maps/detail and separate inventories |
| WEB-41 | Todo | Not started | High | Server summaries, scoped full exports and zones GeoJSON |
| WEB-42 | Todo | Not started | High | Explicit managed-import identity mapping and conflicts |

No task needs wholesale elimination. WEB-28/29 now serving as acceptance gates is a reasonable decomposition. Their done criteria must remain distinct from their implementation subtasks. No zone task is superseded merely by the unrelated product rename.

## C. Prioritized technical findings

### F1 — P1: authorization becomes stale while publication waits for its site lock

**Evidence: execution-confirmed with signed HTTP requests and a committed database result.** A synthetic manager begins publication. After archive preparation, another transaction holds the site row. The finalizer checks manager permission, then waits on that row. A separate authorized admin request changes the manager to viewer and returns 204. After the site lock is released, publication returns 201 and a publication row exists.

The critical order is in [lock_zone_site](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011121000_zone_drafts.sql:68): `assert_active_user` and `has_project_role` precede `SELECT … FOR UPDATE`. [finalize_zone_package](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011122000_zone_publication.sql:52) uses that helper, then mutates as SECURITY DEFINER. Successful [backend finalization](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/services/zone_publication.py:58) reads the resulting package, which a viewer is allowed to read; that read does not restore manager authorization.

**Root cause:** membership mutations and zone finalization do not share an authorization serialization boundary. The existing membership function takes an organization advisory lock, while publication only takes the site lock. See [change_project_member](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20260926210846_tenancy_functions.sql:237).

**Impact:** removing mutation authority does not reliably stop an in-flight map publication. This violates the intended commit-boundary/defined-ordering requirement. No cross-tenant leak or historical observation corruption was demonstrated. Publication defaults off, which limits current rollout exposure; it does not repair the underlying function.

**Correction:** define the ordering between membership changes and publication. At minimum, authorize again after acquiring the site lock. For a complete guarantee, serialize authorization-changing operations and finalization using compatible transaction locks, then check current role/account state under those locks. Reuse the existing membership locking convention where practical; establish one lock order and keep archive work outside it. Cover inherited org permissions and account deletion rather than protecting only explicit project memberships.

**Owner/tests:** reopen DB-16 and BE-18. Add two-order coordinated races for demotion, revocation, inherited admin loss, and account deletion, with draft/current/audit/archive counts unchanged on rejection. Existing races cover competing publications/saves/imports, and existing authorization tests cover pre-revoked users; neither proves this interleaving. The supplied [audit probe](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/test_review_probes.py:51) confirms the defective path; convert it into a regression expecting refusal or a documented serial ordering.

### F2 — P1: the form-binding lifecycle has no successor operation after adoption

**Evidence: execution-confirmed retirement block plus source-confirmed absence of a replacement path.** The probe adopts a site, retires its play form through the public API (200), creates another draft (201), then validates it as not ready and receives `form_not_in_package` on publication (422).

[Draft cloning](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011121000_zone_drafts.sql:117) inherits the exact bindings. [Validation](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011121000_zone_drafts.sql:209) requires those versions to be published. [Managed finalization](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011122000_zone_publication.sql:88) inherits inventory from the base and rejects a different play form. The existing [retirement operation](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/services/forms.py:177) has no current-package replacement requirement. Published/retired form immutability is intentional and should remain.

**Root cause:** the [contract's adoption/form paragraph](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/zone-boundaries/contract.md:155) explicitly excludes changing forms, while the product already supports form publication and retirement. The implementation follows this part of the plan; the plan is incomplete.

**Impact:** an adopted site cannot move to a new play/inventory form through any supported package path. Retirement makes all subsequent map publication fail. A first adoption with inventory unavailable also cannot later enable inventory through the current feature. This is a study-lifecycle dead end, not a reason to mutate historical bindings.

**Correction:** add a bounded, explicit form-rebinding choice when creating a successor package, preferably through the existing managed-import publication path or a narrowly extended draft-create operation. Resolve selected published definitions once; retain old packages and permit their historical uploads with retired forms. Do not silently select “latest form.” Until this exists, guard retirement of forms needed by current managed packages with an actionable error; that guard is an interim safeguard, not a complete replacement workflow.

**Owner/tests:** amend CON-05, then DB-16/BE-18; coordinate WEB-37/42. Test replacing play, replacing inventory, null inventory to explicit inventory, retirement before and after successor publication, and upload/restoration of the old package. Keep BE-19's historical retired-form acceptance.

### F3 — P2: managed imports coerce feature identities instead of enforcing exact strings

**Evidence: execution-confirmed.** A zones feature with numeric `properties.id: 123` matched the string mapping `source_feature_id: "123"` and published format 2 with HTTP 201.

[zone_import_input](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011122000_zone_publication.sql:22) validates the mapping ID's type but compares the feature ID with `#>>`, which converts JSON scalar values to text. [PackageRequest.layers](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/zone_import_schemas.py:24) preserves arbitrary JSON, so it does not reject this before SQL. The frozen contract requires exact string feature IDs.

**Impact:** the identity boundary accepts inputs outside its contract. It can conceal malformed imported identities and create inconsistent mapping behavior between clients. The demonstrated case did not corrupt an existing stable UUID or bypass tenant isolation; that is why this is P2 rather than P1.

**Correction:** validate every source feature ID as a string of the allowed length before matching, and enforce uniqueness/mapping coverage using that exact representation. Do not add coercion to clients to imitate the defect. Preserve unmanaged legacy import behavior.

**Owner/tests:** DB-16 and BE-18. Cover string, number, boolean, null, duplicate and unused IDs through real managed-import requests; assert no activation on rejection. Existing tests cover unused mappings, but not this type mismatch.

### F4 — P2: site discovery repeatedly runs heavyweight archive work inside a read transaction

**Evidence: execution-confirmed work duplication; larger-scale outage risk is source-supported, not load-tested.** Two unchanged discovery requests for one managed site caused two complete archive extraction subprocesses. The synthetic archive was only about 1.9 KB; observed request durations were approximately 230–245 ms in that probe.

[zone_discovery.list_sites](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/services/zone_discovery.py:49) fetches and extracts each archive serially while holding the request's database transaction. This includes already managed packages, although [zone_authoring_available](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011124000_zone_api_validation.sql:36) already reads their stored site boundary. The [read route](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/routers/zones.py:44) also uses the same [two-slot, 45-second limiter](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/services/zones.py:45) as publication.

**Impact:** routine discovery cost grows with site count and package processing cost. Read traffic can consume publication capacity; one archive timeout can fail the whole list. It is unnecessary work in the intended manager entry path.

**Correction:** use the stored managed boundary directly. For legacy adoption capability, compute or cache only the immutable structural result by package identity/checksum, with current role/form/gate checks evaluated freshly; alternatively inspect it lazily when opening adoption. Separate inexpensive discovery from the mutation/archive limiter and avoid holding a DB transaction during subprocess work. No new queue or distributed cache is needed for the current single-process scope.

**Owner/tests:** BE-18. Assert zero archive extractions for managed discovery, bounded legacy inspection, and continued observer discovery while publication slots are busy. Benchmark a realistic multi-site fixture before setting a service target.

### Planning risks and existing release blockers, not newly introduced bugs

| Priority | Evidence | Required treatment |
|---|---|---|
| P1 release gate: mobile durability/binding incomplete | [Direct package writes/existence readiness](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/src/packages/hosted/device.ts:44), [unguarded provider refresh](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/src/packages/hosted/provider.tsx:115), [first-zone recovery fallback](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/src/session/provider.tsx:461), [v1-only serializer](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/src/sync/contracts.ts:34) | Finish MOB-28/29 before enabling format-2 collection. These are known pre-existing gaps, not regressions from BE-18. |
| P1 release gate: historical read/export infrastructure absent | [v1 row/query model](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/src/fieldmaps_api/schemas.py:125), [current-site label lookup](/Users/praty/Desktop/StudentJob.nosync/field-ops/web/src/features/data/view.ts:169), existing v1 collection router | BE-20 then WEB-39/40/41 and GIS-09. Do not merely switch Data/Overview to v2 current site geometry while observation rows still lack historical binding. |
| P2 planning gap: frontend contracts are not reconciled | [Web change requests](/Users/praty/Desktop/StudentJob.nosync/field-ops/web/ZONE-BOUNDARIES-UI.md:503), [mobile change requests](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/ZONE-BOUNDARIES-UI.md:280) | Decide the required additions before consumer integration; reject unnecessary new endpoints. See section D. |
| P2 rollout gap: per-site rollout is specified but gate is global | [Master rollout](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/zone-boundaries/README.md:118), `require_enabled` and a single application setting | Either implement a small server-enforced site allowlist or explicitly revise the launch policy to all eligible sites after global acceptance. UI hiding alone is insufficient. |

No P0 data-loss/corruption issue was confirmed. No speculative geometry mismatch, tenant leak, or unsafe ZIP traversal is reported as a confirmed bug.

## D. Architecture decision review

### Keep as designed

| Decision | Why it remains appropriate |
|---|---|
| Package versions as the only published boundary revision | Freezes map, zones and forms together; avoids independent version coordination |
| Stable identity plus immutable package snapshots | Separates longitudinal identity from historical shape/label; composite keys prevent cross-site bindings |
| Explicit current pointer, frozen legacy package, operation-scoped replay | Supports both client generations and prevents an old successful retry from reactivating an old package |
| PostGIS as authority; client geometry as guidance | SQL validates holes, coverage, containment and interior overlap independently of the editor; no silent repair |
| Existing outbox and bytea packages with bounded subprocess preparation | Adequate current scale; hard cancellation/resource boundaries serve a real need, without adding a job platform |

The provisional UUID/bootstrap mapping note is a reasonable improvement over the baseline: it makes adoption possible without inventing historical identity. Freezing inventory selection is also correct; making it impossible to change in a *new* package is the part to revise.

### Must revise

Authorization needs an explicit transaction ordering with role changes. Form immutability must apply to existing packages while permitting explicit successor bindings. CON-05 should receive these narrow amendments, not be reopened as an unrestricted redesign.

The rollout gate needs an executable scope. Keep publication disabled until bound uploads, mobile retention, historical presentation and required acceptance are complete. Retain v2 read/upload capability on operational rollback once devices may hold v2 records.

### Should simplify or clarify

MOB-28 combines several high-risk storage transitions. Keep its ID but execute sequential internal checkpoints: protocol/backward-read migration; verified catalog/install/reconciliation; dependency retention/removal; asynchronous ownership fencing/recovery. Each checkpoint gets focused fault evidence before dependent UI work. Do not invent another status board.

Move the pure geometry candidate predicate and shared-case adapter early within MOB-31, before its UI work; it need not wait for a full catalog implementation. Keep UI integration dependent on the catalog. Add diagonal, non-axis-aligned, shared-vertex and adjacent-representable-coordinate cases. The current 16 coverage cases and mobile legacy tests are not proof of future PostGIS parity.

WEB-36's adoption must be coordinated with WEB-31 and historical observation consumers. Reading current managed shapes while the existing table labels records through today's site zones would misrepresent history. Build adapters independently, but enable each screen only with its matching semantics.

Retain the specialized SQL coordinate serializer for this release, with independent numeric tests. It has real complexity, but changing the digest algorithm now would expand the compatibility problem. BE-19 must implement general observation canonicalization separately; passing coordinate comparisons does not prove UTF-16 key ordering or answer canonicalization.

### Frontend change-request disposition

These are proposed decisions for the lead, not changes already applied.

| Requests | Recommended disposition |
|---|---|
| CR-W1/W2, CR-M3/M6 | Close as supported after updating stale handoff text: CORS/body handling and version/capability semantics exist. |
| CR-M1/M2 | Reuse existing observer-readable package-by-ID/archive and form-version-by-code reads. PackageDetail inherits format fields; exact manifest form IDs can be checked against returned version IDs. Add runtime validation and the retired-bound-form recovery rule; do not invent a second form endpoint solely for UUID lookup. |
| CR-W3/W4/W6 | Document ETag headers consistently, explicitly preserve draft vertex/ring representation until validation/publication, and expose typed safe conflict details. Schema-name cleanup is optional if existing aliases compile. No draft-body ETag duplication is required. |
| CR-W5/W15 | Freeze actual BE-20 models before WEB-39. Require complete filter/summary/export semantics and explicit ceiling details. Extra facets and a second zones-export route should be added only where a concrete screen cannot use the existing historical zone response. |
| CR-W7 | Prefer returning server-normalized digest/change information for truthful publish review over implementing JCS independently in the web. Issue-location geometry is optional; the existing zone IDs and pointers can support the first correction workflow. |
| CR-W8/W10/W11 | Choose a minimal metadata contract for the approved copy: draft creator/time, publication note/actor, site UUID and version. Do not expose private audit request bodies. Resolve display names for authorized people; a second source of mutable “current” state in every history row is unnecessary. |
| CR-W9 | The 200/201 distinction and a refreshed v2 current pointer are sufficient for replay/current truth. Preserve HTTP status in the adapter; add a body discriminator only if the chosen transport requires it. Do not weaken idempotency. |
| CR-W12 | Add bounded capability reasons if the UI promises specific unsupported-site recovery. A v2 detail endpoint is optional. Fix F4 rather than fetching every ZIP to answer a boolean. |
| CR-W13 | Provide authorized identity/version choices in BE-20 if required to include retired zones with no currently loaded observations. Start with existing per-package history for geometry. Batch history and caching are optimizations; any private cache must remain account/tenant scoped. |
| CR-W14 | Keep stale-base publication rejected. Corrective publication starts from current and deliberately copies old geometry/identities into a new draft/version. Add a case; do not bypass the current-pointer precondition. |
| CR-M4/M7/M9 | Freeze error-to-action policy, new-session package selection, and local inventory anchor semantics. Recommend retain-only rejected records for this feature; correction/re-creation needs a separate explicit product decision. Use newest verified installed package for new sessions, exact old package for active work, and no anchor in the inventory upload body. |
| CR-M5 | Accept additional geometry parity fixtures and UI-only near-edge hints; hints never change coverage or stored coordinates. |
| CR-M8, CR-W16/W17 | Keep with the design owner. Token/state vocabulary, nudges and icons should not hold up backend/storage correctness. Update “not built” product copy only when the corresponding feature ships. |

Optional scope reduction: edge tracing, issue-location geometry, batched historical geometry, richer history avatars, and custom export facets can follow the first accepted feature if the manager can still create, edit, validate, publish, recover conflicts and inspect history. Keep holes/multipart preservation, accessible editing and exact stored coordinates mandatory. Do not build two production drawing engines after the spike.

## E. End-to-end integration assessment

| Workflow | Implemented and tested | Missing / risk |
|---|---|---|
| 1. Draw, validate, publish | Local API draft lifecycle, validation, format-2 ZIP/snapshot agreement, activation and history exercised | Drawing UI is only planned; F1/F2/F3/F4 remain; no browser evidence |
| 2. Download, collect offline, upload later | Legacy download/outbox regression tests pass; SQL can bind v2 observations | No integrated v2 uploader, protocol persistence, atomic catalog or device evidence; BE-19/MOB-28/29 required |
| 3. Publish while observer uses old version | SQL historical binding and publication replay/legacy preservation pass | Device package leases, exact restore and old-form redownload absent; publishing alone does not prove offline survival |
| 4. Competing managers | Existing separate-session SQL and live HTTP tests demonstrate one save/publication winner and safe stale conflicts | F1 covers a missing third actor: permission changes during a lock wait; browser local-edit preservation untested |
| 5. Historical filtering/export | Data structures and frozen contract are present | BE-20/WEB-29/GIS-09 absent; current web labels use site summaries and exports are not the new complete scope |
| 6. Legacy clients | Frozen v1 site/package discovery and actual existing runtime parser compatibility exercised; v1 upload/hash preservation tested | No old physical client binary exercised. Ensure retired-form lifecycle does not make fresh legacy recovery impossible without visible guidance. Never upgrade queued v1 bodies. |
| 7. Interruptions/retries/restarts | API replay, rollback/failure, timeout/process handling have local tests | Mobile filesystem/SQLite interruption, disk-full, account-switch completion, device restart and backup/restore remain pending |

### Geometry and data integrity judgment

The database's spatial design is materially stronger than the old code-only attribution. It normalizes Polygon/MultiPolygon without automatic repair, validates topology, uses actual ground coverage and interior-intersection checks, and derives inventory anchors from snapshots. Gaps are warnings. Shared boundaries are covered, not assigned by iteration order. Historical labels and shapes are stored independently of current site selection.

Published package/snapshot immutability includes late insertion guards; same-site/project composite relationships and restricted writes are appropriate. Migration rehearsal preserved old hashes, answers, coordinates, receipts, packages and unversioned status. These are positive results worth retaining.

The API intentionally owns ZIP parsing and byte correspondence while SQL owns snapshot/finalization checks. SQL does not decompress archives. This is a reasonable trusted-service boundary; do not add a PostgreSQL ZIP parser. Test the real archive builder against SQL, as BE-18 already does, and keep direct managed writes unavailable to untrusted callers.

Residual verification needs: combined worst-case geometry/resource limits rather than only individual ceilings; realistic multi-site discovery load; role changes during finalization in both orders; deployed PostgreSQL/PostGIS migration and restore rehearsal; exact mobile predicate parity; v2 form recovery; and >500-row filtered read/export behavior. Existing query-plan evidence for history indexes does not establish the performance of BE-20's not-yet-written filter combinations.

## F. Proposed implementation roadmap

Use existing task IDs and component PLAN.md status ownership. No new task-ID system is needed.

| Order / priority | Task IDs and ownership | Dependencies / objective | Acceptance and verification |
|---|---|---|---|
| 1 — P1 foundation | DB-16 database owner; BE-18 API owner; CON-05 coordinator | Reopen local completion for F1. Decide F2 successor bindings and gate scope before consumers depend on them. Fix F3 in the same bounded import boundary. | Signed two-manager plus role-change races; SQL under restricted role; no unauthorized commit; old archives/rows unchanged; form successor and late old-form upload cases defined. |
| 2 — P1 durable write path | BE-19 API owner; MOB-28 mobile data owner | Parallel, disjoint files after narrow contract agreement. Implement actual v2 upload and durable local protocol/catalog ownership. | Old lost-receipt v1 retry remains byte-equivalent; v2 v7 point/inventory accepted after v8; wrong binding/protocol rejected; filesystem/SQLite crash tests preserve draft/queue and last-good package. |
| 3 — P1 read foundation and early integration | BE-20 read owner; GIS-09 GIS + DB owner; MOB-31 pure geometry; WEB-30/31 web owner | BE-20 after BE-19 schema; GIS projections can be designed earlier. Run an early v7/v8 write/read story before full editor work finishes. | >500 rows, cursor ties, RLS, null inventory geometry, historical labels; readback/export counts; shared edge cases; package parse/serialize fidelity. |
| 4 — client integration | MOB-30/31/32 → MOB-29; WEB-32–38/42 → WEB-28; WEB-36/39–41 → WEB-29 | Use catalog and real APIs. Address F4 before wiring routine v2 discovery. Coordinate WEB-36 activation with historical consumers. | Browser save/validate/publish/replay/conflict; exact draft resume; retained older versions; real physical offline/restart/reconnect; historical tables/maps/exports agree. |
| 5 — release acceptance | QA-07 integration lead | All component acceptance; separately authorized deployment/migration | Complete the seven workflows with evidence, recovery/backup checks and rollout scope. Keep publication disabled on any unresolved durability/security/history gate. |

Safe parallel work now: BE-19 business logic, MOB-28 storage, and WEB-30/31 prototypes/readers. Serialize migration authorship, canonical contract edits and OpenAPI/client regeneration. Allocate session/provider files explicitly between mobile data and UI owners. GIS must not independently write migrations. Keep unrelated DB-17/BE-21 identifier renaming outside this correction sequence.

Add an **early integration checkpoint within existing tasks**, not another large final task: use the actual format-2 ZIP from BE-18; install it with the future MOB-28 catalog; produce a BE-19 point and inventory; publish a successor; upload/read the original. Initially this can be a local driver, but it does not replace the physical-device QA-07 gate.

## G. Specific proposed plan edits

These are recommendations only. None of the listed planning files was edited.

| Document / exact section | Mandatory proposed revision |
|---|---|
| [supabase/PLAN.md — DB-16](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/PLAN.md:645) | Change done to doing/reopened; retain prior SQL evidence. Add “Serialize finalization against permission changes; a demotion committed while waiting cannot authorize a later publication. Verify both transaction orders, inherited roles and account deletion.” Add exact-string import identity acceptance. |
| [backend/PLAN.md — BE-18](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/PLAN.md:400) | Reopen completion for F1–F4 and the agreed minimal client contract. Retain previous tests as prior evidence; add actual demotion/publication HTTP regression and managed discovery extraction-count checks. |
| [docs/plan/contracts.md — CON-05](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/contracts.md:268) | Record a targeted amendment for successor form bindings and the accepted/rejected CR decisions. Do not imply existing generated types cover BE-19/20 routes. Add diagonal/shared-vertex cases. |
| [contract.md — Package format 2 and capabilities](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/zone-boundaries/contract.md:153) | Replace “changing forms is outside this feature” with explicit successor selection semantics: freeze chosen published form IDs in the new package only; old package binding/read/upload remains valid after retirement. Define null-to-inventory upgrade. Specify capability reasons and gate scope if accepted. |
| [supabase/ZONE-BOUNDARIES.md — Publication transaction and immutability](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/ZONE-BOUNDARIES.md) | Specify the authorization/site/draft/resource lock order and its relation to tenancy mutations; add form-succession validation and the no-history-rewrite invariant. |
| [backend/ZONE-BOUNDARIES.md — BE-18](/Users/praty/Desktop/StudentJob.nosync/field-ops/backend/ZONE-BOUNDARIES.md) | Add successor-form operation, exact source-ID type validation, and metadata-only managed discovery. Keep archive preparation outside final transaction. |
| [mobile/PLAN.md — MOB-28/31](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/PLAN.md:612) and [mobile data plan](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/ZONE-BOUNDARIES.md) | Execute catalog/protocol/retention/fencing as explicit internal checkpoints. Pull pure coverage parity ahead of UI; retain device integration dependencies. Explicitly test retired-bound-form recovery and interrupted install catalog reconciliation. |
| [web/PLAN.md — WEB-35/36/39](/Users/praty/Desktop/StudentJob.nosync/field-ops/web/PLAN.md:547) | Gate integration on the reconciled contract. Add WEB-31 coordination to format-2 discovery activation and prevent current-boundary display over unbound historical rows. Allow adapter work before routes are enabled. |
| [web UI plan — sections 1 and 9](/Users/praty/Desktop/StudentJob.nosync/field-ops/web/ZONE-BOUNDARIES-UI.md:503), [mobile UI plan — opening and section 7](/Users/praty/Desktop/StudentJob.nosync/field-ops/mobile/ZONE-BOUNDARIES-UI.md:280) | Replace stale BE-18-todo/PackageDetail claims with current verified state. Apply the CR disposition table; distinguish required infrastructure from optional UI requests. |
| [verification.md — Manager/database/API and offline matrices](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/zone-boundaries/verification.md) | Add the F1 interleaving, form-retirement/successor story, malformed source-ID cases, discovery saturation, and non-axis-aligned client/server parity. Require state assertions, not only response codes. |
| [master README — waves and rollout](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/zone-boundaries/README.md:114) and [plan index](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/README.md) | Record reopened foundation work and the early integration checkpoint. Resolve global vs per-site activation. Continue safe independent tasks; keep final QA-07 gate. |

Optional revisions: reduce WEB-34 tracing scope if it delays the core editor; defer batch geometry/history embellishments; remove duplicate wording rather than adding another roadmap. Keep PRODUCT/DESIGN statements about unavailable functionality until the corresponding acceptance is complete.

## H. Next execution handoff

Copy this into the next implementation request. Estimated first bounded correction: one engineering day, with additional time if the tenancy lock analysis exposes incompatible ordering; do not hide that expansion inside a “small fix.”

```text
Reopen DB-16 and BE-18 for the confirmed zone-publication authorization race.
Read docs/reviews/zone-boundaries-2026-10-11/review.md, finding F1, and its
synthetic evidence/test_review_probes.py before editing.

Scope: fix authorization ordering only. Preserve every unrelated working-tree
change. No commit, push, hosted migration, deployment or publication enablement.
One database owner writes migrations; one API/test owner covers HTTP behavior.

Trace lock_zone_site in supabase/migrations/20261011121000_zone_drafts.sql,
finalize_zone_package in 20261011122000_zone_publication.sql, and the existing
organization advisory-lock convention in 20260926210846_tenancy_functions.sql.
Also inspect account deletion and inherited org-admin authorization before
choosing a consistent lock order. Do not do archive work while holding these locks.

Reproduce: prepare a draft; pause after archive generation; hold its site row;
start finalization; observe the SQL lock wait; have another authorized manager
change the publisher to viewer through PATCH /v1/projects/{p}/members/{u};
release the site lock within the 3-second timeout. Current code commits the
publication and returns 201 after the demotion returned 204.

Define and implement a serial ordering: either publication commits under a
protected valid authorization before demotion can commit, or demotion wins and
publication is rejected without changing current package, draft, snapshots,
archive or audit rows. Recheck authorization after waits; a pre-lock check alone
is insufficient. Cover inherited role loss and account deletion. Keep exact
idempotent replay authorization and existing publication conflict behavior.

Promote the audit probe to a durable regression asserting the corrected behavior.
Run disposable restricted-role SQL/API rehearsals, the two transaction orders,
existing replay/import races, legacy preservation, Ruff and BasedPyright.
Update only DB-16/BE-18 evidence/status and the canonical locking specification
once verified. Run plan:check. Report files, exact evidence, remaining uncertainty,
and whether F1 is fixed. Leave F2 form succession and other findings for the next
bounded task unless a necessary dependency is explicitly identified.
```

## Evidence reproduction notes

The probes deliberately assert the *current defective behavior* to make findings reproducible. They are audit artifacts, not acceptance tests to keep green after a fix. All records are synthetic. The fixture harness uses a freshly created disposable database and cleans up its own fixture data/container only.

From the repository root, the preserved probe bundle can be run through the existing disposable harness:

```sh
sh database/zone-api-rehearsal.sh -q -s -c pyproject.toml \
  ../docs/reviews/zone-boundaries-2026-10-11/evidence/test_review_probes.py
```

The preserved command was rerun after saving these artifacts: **4 probes passed**, reproducing the four findings. [Combined evidence](/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/reviews/zone-boundaries-2026-10-11/evidence/preserved-probes.log).

The adjacent conftest imports the repository's existing synthetic fixtures and uses this checkout's absolute path. Adapt that path if moving the report to another checkout. Do not run these fixtures against hosted or persistent research databases.
