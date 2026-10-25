# Verification: cross-cutting suites and acceptance runs

This file is part of the [DECA Mark production plan](README.md) and defines the `QA-*` tasks. Component-level tests belong to their own tasks (every task has a `Verify:` line). This file owns the suites that cross components, and the manual acceptance runs.

"Pilot-ready" is defined in [product.md](product.md#pilot-ready-means). Each item there is proved by one task below.

## Baseline checks: changes to application behavior

- `pnpm check`, which covers web and mobile types and lint, plus Ruff and BasedPyright for Python.
- `pnpm test`, which runs mobile Vitest plus the API and SQL suites. After DB-02 these run against the local Supabase stack.
- `node docs/plan/check-plan.mjs` whenever a plan file changes.
- `supabase db advisors` after every migration (DB-*).
- `pnpm contracts:generate && git diff --exit-code` after any API or schema change (CON-03).

For documentation-only changes, run the plan graph, relative-link/content checks and `git diff --check`; cite application results with their original date rather than rerunning services to validate prose.

Never report a device, hosted or production check as passed unless it was actually run. The standing rule is in `AGENTS.md`.

## Tasks

### QA-01: API tenant-isolation suite
Status: done (2026-10-04) · Phase 1 · Size M · Depends: BE-06, BE-07, DB-04, DB-05 · Blocks: OPS-09
Verified locally on 2026-10-04: all 214 backend tests and the SQL/RLS suite pass. No hosted or production isolation run is claimed.
It grows every phase: each new endpoint task adds its rows.
Identity coverage is in `backend/tests/test_identity.py`: first-call Training enrollment, repeat-call idempotence, caller-scoped memberships (including inherited admin access), self-only profile edits, and rejection after profile forgetting or Auth deletion. The full matrix is now implemented in `backend/tests/test_tenant_isolation.py`, using generated two-organization fixtures and every role. It covers existing tenancy, membership, invitation, observation and package routes, plus Training observation/profile/membership privacy. A live unbound invitation deliberately permits joining another organization; email-bound redemption by the wrong account is rejected without consuming a use. Future form, export and sync endpoints must extend this matrix when implemented. The existing CI backend job includes these tests.
Read first: `backend/tests/test_project_access.py`; `backend/tests/conftest.py`; the endpoint catalog in [contracts.md](contracts.md#api-endpoint-catalog-v1).
Do:
1. Create `backend/tests/test_tenant_isolation.py`. Fixtures:
   - two orgs (A and B), each with a project and a site;
   - users with every role in each org;
   - a Training observation from two different trainees.
2. For every endpoint in the catalog, B gets 404 or 403 on everything of A's. Cover read, write, list, export, invitation redemption across orgs, and member edits across orgs.
3. A trainee cannot read another trainee's observation, profile or Training membership.
   - A manager of org B publishing org A's form version id gets 404.
   - A viewer in a project that has a manager cannot upload or prepare a package.
4. A SQL test (DB-04) fails if any `fieldmaps` table lacks RLS or has an `anon` or `authenticated` grant.
5. Each new endpoint task adds its rows here; this is part of that task's `Done when`.

Done when: the suite covers every catalog row that exists, and runs in CI (OPS-06).

Verify: `pnpm backend:test`.

### QA-02: PowerSync stream isolation check
Status: todo · Phase 2 · Size M · Depends: SYNC-02 · Blocks: OPS-09
Read first: [sync-powersync.md](sync-powersync.md#streams-edition-3).
Do:
1. Write `powersync/tests/isolation.ts` (or a documented manual script, if no headless client is practical). It:
   - signs in as staging users A, B and a trainee;
   - connects a PowerSync client for each;
   - asserts the exact set of row ids each receives against a seeded fixture.
2. Seed the fixture with `database/hosted/seed-isolation.sql`: synthetic users and rows, with a matching cleanup script.
3. Any stream change must update the expected sets (the editing rule in sync-powersync.md). The fixture includes each user's own profile row, synced with its `id` alias.

Done when: A, B and the trainee each receive only their expected rows on staging.

Verify: run the script and attach its output to the task notes.

### QA-03: Sync correctness scenarios
Status: todo · Phase 2 · Size M · Depends: BE-12, MOB-10, MOB-11 · Blocks: QA-05
Do: automate what is possible in Vitest and pytest, and run the rest on the simulator or emulator with results written down:
1. Save offline, force-quit, relaunch, reconnect: exactly one row in PostGIS.
2. The response is lost and retried: no duplicate. Current bound PUT replay has BE-22 evidence; BE-12 must preserve that canonical identity when batching. No legacy flat-envelope bridge is required.
3. The server returns 200 with a `rejected` result (for example `validation_failed`).
   - An `upload_rejections` row is created.
   - After the checkpoint, the device still shows "needs attention" with the payload intact.
   - "Send again" succeeds once the cause is fixed, and the rejection is resolved.
   - Separately, an HTML 200, a 413 and a real 422 all leave the queue intact.
4. The token expires while offline: collection continues; after signing in again the upload resumes.
5. Transition from the supported current-schema outbox to the selected transport with pending/needs-attention records and unfinished/parked drafts for two accounts, including committed WAL content.
   - Each immutable record uploads once under its own issuer/account, preserving exact map/zone/form attribution and receipts.
   - Rejected records keep payloads and reasons; retained packages remain available until their references are released.
   - Retire the old supported store only after each owner is reconciled (MOB-11). Experimental pre-baseline v3/shell-v1 compatibility is not required.
6. Account switch:
   - data stays separate;
   - signing out with pending work warns first;
   - A's pending batch never goes out with B's token.
7. A missing package asset shows a clear state and never crashes.
8. A manager retires a form version while an observer has an open draft on it offline. The draft still renders and saves, and the record uploads.

Done when: each scenario is recorded as pass or fail, with how it was run (automated or simulator).

### QA-04: Auth end-to-end suites
Status: todo · Phase 4 · Size S · Depends: MOB-21, WEB-15 · Blocks: QA-05
Do: make sure the Maestro (MOB-21) and Playwright (WEB-15) suites together cover sign-up, a wrong code, resend, sign-in, reset, join by code or invite link, sign-out with unsent work, and account deletion. Run both against the local stack in CI where possible; otherwise record a manual run.

Done when: coverage is listed in this task's notes, and both suites pass.

### QA-05: Device acceptance and pilot walkthrough
Status: todo · Phase 5 · Size M · Depends: GIS-01, MOB-15, MOB-17, OPS-09, OPS-11, QA-03, QA-04, QA-08 · Blocks: none
Needs user: the devices, and Janet's time.
Do: on a real iPad and a real Android tablet, using production internal builds:
1. Fresh install, sign-up, code, profile, join.
2. Download a real QGIS package on Wi-Fi.
3. Airplane mode: collect at least 10 observations of Janet's form, including branch changes.
4. Force-quit, reboot, reconnect: all upload.
5. Check the rows in PostGIS and in a refreshed QGIS typed layer.
6. Walk every mobile and web screen: no fixture data, no developer copy.
7. Force one permanent rejection, and check it is visible and preserved.

Done when: a dated report exists at `docs/Pilot-Acceptance-<date>.md`.

### QA-06: Operational readiness
Status: todo · Phase 5 · Size S · Depends: OPS-07, OPS-10, OPS-12, WEB-16 · Blocks: none
Do:
1. Confirm a Sentry test event from mobile, web and API.
2. Confirm `/ready` fails when the database is unreachable (in staging).
3. Confirm the restore drill (OPS-10) is recorded.
4. Confirm the alerts (OPS-12) fire on a test.

Done when: each item is checked, with its date.

### QA-07: Verify the complete zone-boundary feature
Status: todo · Phase 4 · Size L · Depends: BE-20, MOB-29, WEB-28, WEB-29, GIS-09 · Blocks: none
Current evidence boundary (2026-10-15): the owner plans record local implementation through BE-22, WEB-28/29 and MOB-28/30–33. MOB-29 remains the upload/receipt prerequisite. Pending mobile simulator/VoiceOver, physical iPad/editor and integrated device/API/GIS evidence are not closed by these statuses. Check the [current sequence](current-state.md). The [hosted mismatch diagnosis](../reviews/ci-and-hosted-data-2026-10-14.md) is historical and requires exact-target approval before reset/deployment. Verify the current-contract QGIS acceptance tools before using older GIS-09 recipes.

Owner: Integration lead and reviewers.
Read first: [Master plan](zone-boundaries/README.md) and [component specification](zone-boundaries/verification.md).
Do: Run geometry/security/migration/concurrency/offline/readback matrix with two managers, old queue, physical device and more than 500 rows.
Done when: Actual evidence supports historical binding and data survival; unresolved browser/device/security/migration checks block completion.
Verify: Component checks plus live local HTTP/browser/device/GIS story; spec review then quality review.

### QA-08: Pilot launch gate on the four device families
Status: todo · Phase 4 · Size M · Depends: BE-23, MOB-34, MOB-35, MOB-36, MOB-37, MOB-38, MOB-39, MOB-40, MOB-41, MOB-44, OPS-18, OPS-19, OPS-20, WEB-44, WEB-45, WEB-46, WEB-47, WEB-60 · Blocks: QA-05
Added 2026-10-22 (D31, D33, frontend audit). The pilot starts on the current upload queue (D27) when this gate passes, not on a fixed date; QA-05 stays the full walkthrough. This gate repeats the audit's failing scenarios on physical devices with the build the pilot ships.
Needs user: the devices (an iPhone, an Android phone, a Samsung Galaxy tablet, an iPad), installable builds (MOB-20 or an internal-distribution build), and the hosted target from OPS-19.
Do: on each device, portrait and landscape where it rotates:
1. Fresh install, sign-up, code, profile, join; Training downloads from the server and its practice records upload to the Training project.
2. Download Janet's site; airplane mode; collect 10 observations including the 4-row play-event summary (field and Continue visible while typing), deliberate double taps on single-choice answers (no unread answer recorded), a rotation mid-observation (camera and answers kept), a force quit mid-observation (Resume restores it).
3. Reconnect after repeated failures: uploads start within seconds; Account, Sign out and Delete account say what really happens.
4. Web: a form edit with the network cut keeps the wording; a web sign-out leaves the phone uploading; a QGIS project with an online background map asks before uploading (D35): Cancel uploads nothing, and confirming publishes with a warning that names the layer; the Forms list and Overview name the version each site collects with.
5. Read the uploaded rows back in the web Data page and an export.
Done when: every step passes on all four device families, recorded with device, OS, build and result per step in this task; any failure reopens its task.
Verify: the recorded run.

### QA-09: Test-suite hygiene from the frontend audit
Status: todo · Phase 4 · Size S · Depends: OPS-18 · Blocks: none
Added 2026-10-22 (audit §7). Keep the suites honest and cheap.
Read first: `docs/reviews/frontend-audit-2026-10-17/REPORT.md` §7; `web/playwright.config.ts`; `web/e2e/overview.spec.ts`, `overview-sql.spec.ts:41`; `web/tests/auth-local.test.mjs:90-125`; `mobile/src/ui/brand-artwork.test.ts`; `web/e2e/support/scan.ts`.
Do: tag `screenshots.spec` `@screenshots` and exclude it from the default `test:e2e` (`scripts/screenshots-web.sh` passes `--grep @screenshots`); merge the overview coverage test into `overview-sql.spec.ts`; port `auth-local`'s three recovery-cookie tamper cases to `auth-flows.spec.ts` with `context.addCookies`, then delete `auth-local.test.mjs` and `test:auth:local`; delete `brand-artwork.test.ts` (keep at most two colour-set checks); rename the honesty scan to what it is (a copy and layout lint) in its file header and README; shrink `database-migrations.test.ts`'s version loop.
Done when: the default e2e run no longer produces screenshots; the recovery-cookie refusals run in the e2e suite; the suites pass.
Verify: `pnpm --dir web test:unit`, `pnpm mobile:test`, the e2e suite through `scripts/e2e-local.sh`.
