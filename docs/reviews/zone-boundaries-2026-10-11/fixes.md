# Zone boundary audit corrections — 2026-10-11

All four findings in the [principal review](review.md) have local fixes. These changes preserve immutable packages and historical attribution. Publication remains disabled by default. The source and migrations are uncommitted; hosted migration/deployment and feature browser/device/QGIS acceptance have not occurred.

## What now works

| Finding | Corrected behavior | Implementation |
|---|---|---|
| F1, P1 authorization | Account → organization → site transaction locks serialize publication with manager demotion, removal, inherited admin loss and account forgetting. Authority is checked after waiting and protected through commit. If revocation wins, publication/replay is denied and package, draft, archive, snapshots, audit and observations remain unchanged. If publication wins, revocation waits. | [Authorization migration](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011125000_zone_authorization_lock.sql) |
| F2, P1 form lifecycle | A managed successor import explicitly selects its published play form via required `form_version`. Optional `inventory_form_version` omission inherits the current binding, null disables Inventory, and a code selects a published same-project version. No latest-form inference. Retirement returns actionable 409 while any current managed package references the version. Old packages remain readable and historical retired-form SQL uploads remain eligible. | [Form-succession migration](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011132000_zone_form_succession.sql) |
| F3, P2 import identities | Feature and mapping source IDs must be exact strings of 1–200 Unicode code points. Numeric/boolean/null/container/missing IDs, duplicates and unmatched mappings fail without activation or new artifacts. String `"123"` remains valid. | [Identity migration](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011130000_zone_import_identity.sql) |
| F4, P2 discovery cost | Managed discovery reads database geometry metadata with zero archive reads/extractions. Legacy structure uses a per-app 64-entry LRU keyed by immutable package UUID/checksum; archive extraction runs outside database transactions. Role, current pointer, form states and runtime gate are checked fresh. Reads have their own bounded legacy work and 45-second deadline, leaving publication slots available. | [Discovery migration](/Users/praty/Desktop/StudentJob.nosync/field-ops/supabase/migrations/20261011131000_zone_discovery.sql) |

Draft editing still inherits its exact base forms. The form replacement operation is the existing managed import/publication route, with the optional inventory choice added to generated OpenAPI and both app declarations. WEB-42 remains responsible for its eventual UI; this fix does not claim that screen exists.

## Regression and runtime evidence

Final full backend result: **549 passed, 153 dependency deprecation warnings in 236.94 seconds**. [Backend evidence](fix-evidence/backend.log), [SQL evidence](fix-evidence/sql.log).

The final disposable PostgreSQL 17/PostGIS rehearsal passed **419 SQL/Auth assertions**, six observed-lock concurrency scenarios and **2,545 coordinate serialization comparisons using Node 24.18.0**. Existing archive bytes, observation fields/hashes/revisions/receipts and legacy bindings remained unchanged. The retired-form SQL scenario now first publishes a supported successor with an isolated synthetic play version, then verifies uploads against the superseded retired package; current-package retirement is independently refused.

Focused regressions: **25 authorization/draft/live tests**, **26 identity/existing-import tests**, **8 discovery tests**, and **5 form succession tests** passed. The focused groups overlap the full suite and are not added to its count. Authorization and managed discovery exercise real loopback Uvicorn with signed JWTs and the restricted `fieldmaps_api` database role. External Auth deletion is mocked only for the synthetic account-forgetting scenario. Form tests check actual archives, exact retries and unchanged historical observation snapshots; retirement during archive preparation yields 422 without activation.

Ruff check and changed-file formatting passed. BasedPyright reported **0 errors, 0 warnings, 0 notes**. Both web/mobile TypeScript checks passed with Node 24 and `--noEmit --incremental false`. OpenAPI/types generation passed using a writable temporary uv cache after the ordinary uv cache was sandbox-inaccessible. Plan and diff checks passed. Existing Starlette/SQLAlchemy deprecation warnings remain; no load-scale performance benchmark was performed.

Exact commands from the repository root:

```sh
PATH=/Users/praty/.nvm/versions/node/v24.18.0/bin:$PATH sh database/zone-api-rehearsal.sh -q
PATH=/Users/praty/.nvm/versions/node/v24.18.0/bin:$PATH sh database/zone-rehearsal.sh
```

The harnesses create and remove their own fresh disposable databases. They do not apply migrations to an existing database or read local/hosted database password files.

## Review correction and before/after evidence

A focused independent review found an additional lock inversion introduced by combining the new authorization lock with the API's old preliminary draft-create site lock. An observed **different-manager** race reproduced creator 201 / publisher 503 before correction. Draft creation now calls a narrowly granted definer wrapper to acquire account → organization → site before classifying creation versus replay. The same race succeeds with both responses 201, and concurrent exact creation retains 201/200 behavior. Same-manager requests were already serialized by the account lock; the meaningful new regression uses different actors.

The original audit observed demotion 204 before publication 201. The corrected held-site test observes finalization waiting on the site and demotion waiting on the organization; publication commits 201 before demotion can commit 204. The opposite order refuses publication. All four authorization loss cases are tested in both orders. Form regressions initially failed on the missing replacement field and unguarded retirement, then passed after correction. [Creation lock before](fix-evidence/creation-lock-before.log) / [after](fix-evidence/authorization-drafts-live.log); [form lifecycle before](fix-evidence/forms-before.log) / [after](fix-evidence/forms-after.log); [discovery](fix-evidence/discovery.log). The audit's original probes deliberately assert defective behavior and remain historical evidence rather than green acceptance tests.

## Delivery scope

Four additive migrations replace functions/add narrow helpers and a retirement guard; the existing six zone migrations remain intact. API services, dedicated tests, the SQL test ledger/isolated fixtures, the canonical contract, component handoffs, generated declarations and DB-16/BE-18 evidence were updated. Unrelated working-tree changes were preserved. No commit, push, branch, secret access, hosted migration, publication enablement or deployment was performed.

BE-19 uploads, BE-20 historical reads/exports, complete mobile/web/GIS implementation and QA-07 still have their existing unfinished statuses. Local correction acceptance is not full-feature or production acceptance.
