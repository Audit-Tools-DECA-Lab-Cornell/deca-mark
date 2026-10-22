# Operations: hosted settings, CI, deploys, monitoring, releases

This file is part of the [DECA Mark production plan](README.md) and defines the `OPS-*` tasks.

Most tasks here change hosted services, and **every one of those needs the user's explicit authorization**. The steps below say `Needs user:` for those. An agent may prepare files, checklists and scripts, but must not apply dashboard changes, deploy, or buy anything on its own.

Environments are described in [architecture.md](architecture.md#environments). Running costs are in [decisions.md](decisions.md#running-cost).

## Context (reconciled 2026-10-15)

Render and Vercel services exist; the October 14 [diagnosis](../reviews/ci-and-hosted-data-2026-10-14.md) recorded a hosted schema mismatch, not an absent API deployment. Service existence or `/health` success does not complete OPS-04/09 acceptance. No hosted state was refreshed during this documentation pass.

GitHub Actions and contract generation are implemented (OPS-06, CON-03); exact-revision CI green remains separate. Brevo SMTP/Auth templates and the transactional invitation outbox are documented in [Brevo-Email.md](../Brevo-Email.md). This supersedes the original Resend setup choice below. Real-inbox delivery, current Auth dashboard settings, monitoring, restore and internal distribution acceptance must stay open until evidenced. Mobile build profiles exist; a build is not store submission or physical-device acceptance.

See [current position](current-state.md) before choosing the next operational gate. Original week/size estimates have not been re-baselined.

## Tasks

### OPS-01: Staging Auth settings for public sign-up
Status: todo · Phase 0 · Size S · Depends: none · Blocks: OPS-09
Needs user: apply the settings in the Supabase dashboard for project `lezmqhuucfwqknspgcdy`.
Read first: `docs/Supabase-Setup.md`; <https://supabase.com/docs/guides/deployment/going-into-prod>.
Do:
1. Prepare this checklist for the user:
   - "Confirm email" ON;
   - email OTP length 6, expiry 3600 s;
   - minimum password length 8;
   - Site URL is the staging web origin;
   - Redirect URLs: the web origins plus `decamark://auth/callback`;
   - anonymous sign-ins OFF.
2. After the user applies it, update `docs/Supabase-Setup.md`: sign-up is ON, the settings above, and the date.

Done when:
- the doc states the real settings, dated;
- no stale "sign-up is off" remains (`grep -n "sign-up" docs/Supabase-Setup.md`).

Verify: check the dashboard values. A sign-up on staging returns "confirmation required".

### OPS-02: Custom SMTP delivery acceptance (Brevo)
Status: doing (2026-10-15 reconciliation: Brevo setup documented; real-inbox SMTP acceptance remains) · Phase 0 · Size S · Depends: none · Blocks: OPS-03, OPS-09
Needs user: verify the sender/domain and Supabase SMTP dashboard configuration, then authorize a real-inbox acceptance check.
Read first: [Brevo email setup](../Brevo-Email.md). Brevo supersedes the original Resend recipe; transactional invitation delivery uses the API outbox separately from Auth SMTP.
Do: finish the documented sender/domain setup and verify a sign-up email reaches a non-team inbox. Do not infer delivery from a provider sandbox response, a queued outbox row or local Mailpit.

Done when: the actual sign-up code reaches a non-team recipient and the date/provider is recorded without secrets.
Verify: an authorized sign-up to the designated inbox receives its six-digit code within 1 minute.

### OPS-03: Email templates with 6-digit codes
Status: doing (2026-10-15: tracked templates and local code flows exist; hosted template acceptance remains) · Phase 0 · Size S · Depends: OPS-02 · Blocks: OPS-09
Needs user: paste the templates into the Supabase dashboard (staging, and later production).
Read first: <https://supabase.com/docs/guides/auth/auth-email-templates>.
Do:
1. Verify the existing generated `supabase/templates/` templates against the Contour contract; do not recreate a second template set. The local code flows are recorded under WEB-04.
   - Each shows `{{ .Token }}` prominently: "Your DECA Mark code is 123456".
   - They carry **codes only**, with no link (decision D3). A `{{ .TokenHash }}` link would need a confirm route the web does not have, and would put a one-time token in a URL.
   - Use plain HTML in Contour's Day colours (`DESIGN.md`), with inline styles and no tracking pixels.
2. Reconcile the explicitly authorized hosted template settings with those files, then record real-inbox evidence. Local Mailpit does not establish hosted template installation.

Done when: local Mailpit and staging both show the 6-digit code.

Verify: `supabase start`; sign up locally; the Mailpit message shows the code.

### OPS-04: Render staging service for the API
Status: doing (2026-10-15: Render deployment recorded; matching-schema readiness/auth acceptance remains) · Phase 0 · Size M · Depends: BE-01, BE-02 · Blocks: OPS-09, SYNC-01
Needs user: approve the exact hosted schema/runtime reconciliation and matching API deployment when ready. Administrative account-deletion configuration is separate BE-08 acceptance.
Read first: [backend deployment instructions](../../backend/README.md), [dated hosted diagnosis](../reviews/ci-and-hosted-data-2026-10-14.md).
Do: verify the existing Render deployment runs the matching contract against the intended database. Resolve the recorded helper/schema mismatch through the approved target procedure; preserve required browser origins and confirm `/ready` and authenticated API behavior. A new Blueprint is not required just to recreate an existing service.

Done when: the staging API answers `/ready` 200 over HTTPS, and rejects a request with no token with 401 and the error envelope.

Verify: `curl -s https://<staging-api>/ready` and `curl -s -o /dev/null -w '%{http_code}' https://<staging-api>/v1/projects` (expect 401).

### OPS-05: Vercel environment for web auth
Status: doing (2026-10-15: Vercel deployment exists; intended hosted sign-in/workspace acceptance remains) · Phase 1 · Size S · Depends: WEB-03 · Blocks: none
Needs user: the Vercel project settings (Root Directory `web`) and the environment variables.
Do:
1. Document these in `web/README.md`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `DECAMARK_API_URL` (server reads) and `NEXT_PUBLIC_DECAMARK_API_URL` (browser-direct archive/import/draft operations)
   - `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser). A DSN is public; the `NEXT_PUBLIC_` one is fixed at build time
2. The user sets them for Preview (staging) and Production.

Done when: a preview deployment can sign in against staging.

Verify: sign in on a preview URL.

### OPS-06: GitHub Actions CI
Status: done (2026-09-26) · Phase 0 · Size M · Depends: DB-02 · Blocks: DB-03, OPS-09
Evidence: [all five jobs passed on PR 10](https://github.com/Audit-Tools-DECA-Lab-Cornell/Field-Maps/actions/runs/36273492260). CON-03 subsequently added contract generation and drift checking; this run remains historical evidence, not latest-revision CI status.
Read first: the root `package.json` scripts; `Makefile`; `docs/Workspace.md` ("Development and checks").
Do:
1. Create `.github/workflows/ci.yml` with these jobs:
   - `web`: install, check, build;
   - `mobile`: install, typecheck, lint, test;
   - `backend`: uv sync, ruff, basedpyright, then pytest against `supabase start` using the Supabase CLI setup action;
   - `database`: SQL assertions against the same stack;
   - `contracts`: `pnpm contracts:generate`, then `git diff --exit-code`. Add it here if CON-03 is already done; otherwise CON-03 adds it;
   - `plan`: `node docs/plan/check-plan.mjs`.
2. Use Node 24 and pnpm 10.17.1. Cache pnpm and uv.
3. CI never touches hosted services.

Done when: CI is green on a pull request.

Verify: the Actions run on the next pull request.

### OPS-07: Sentry projects
Status: todo · Phase 0 · Size S · Depends: none · Blocks: MOB-20, OPS-09, QA-06, WEB-16
Needs user: a Sentry account and three projects (api, web, mobile). The DSNs are set as runtime environment variables only.
Do:
1. Document the DSN variable names per app.
2. Set the scrubbing rules: no request bodies, no `answers`, no emails in breadcrumbs.

Done when: each app sends a test event (verified later in QA-06).

### OPS-08: PowerSync staging instance
Status: todo · Phase 2 · Size S · Depends: DB-11, OPS-15, SYNC-01 · Blocks: MOB-09, OPS-09, SYNC-02
Needs user: a PowerSync Cloud account, a US-region instance, and the `powersync_role` password.
Read first: [sync-powersync.md](sync-powersync.md#source-database).
Do:
1. Connect the instance to the staging **direct** connection (`db.<ref>.supabase.co:5432`, IPv6), as `powersync_role`.
2. Client Auth: "Use Supabase Auth", with the JWT secret blank.
3. Set `max_slot_wal_keep_size` on staging. Document how to monitor `pg_replication_slots`.
4. Record the instance URL (public) in `mobile/config/staging.json` (MOB-01).

Done when:
- the instance shows "replicating";
- a staging row change reaches the PowerSync diagnostics app;
- SYNC-02 can deploy.

### OPS-09: Production environment
Status: todo · Phase 4 · Size L · Depends: OPS-01, OPS-02, OPS-03, OPS-04, OPS-06, OPS-07, OPS-08, OPS-17, QA-01, QA-02 · Blocks: OPS-10, OPS-11, OPS-12, QA-05
Needs user: Q5, budget approval (week 10).
Needs user: every step. The new Supabase project is on Pro, and PowerSync on Pro.
Do:
1. Write `docs/Production-Runbook.md` covering these, in order:
   - create the project in us-east-1;
   - apply `supabase/migrations` in order;
   - set the role passwords;
   - Auth settings (OPS-01), SMTP (OPS-02), templates (OPS-03), leaked-password protection (OPS-13), the Before-User-Created hook (DB-08);
   - enable pg_cron (DB-07);
   - **Pending account deletions.** `SELECT user_id, deleted_at FROM fieldmaps.profiles WHERE deleted_at IS NOT NULL`. Each row is an account whose Auth deletion must still be finished, with the Admin API or the dashboard (BE-08);
   - **Upload the Training site package** through BE-13, as a temporary Training manager (DB-07 step 6; [Training runbook](../Training-Runbook.md));
   - **Create the pilot project's QGIS reader login** with `grant-gis-reader.sql` (GIS-02);
   - the Render production service;
   - the PowerSync production instance;
   - Vercel production environment variables;
   - EAS `production` config.
2. The user executes it. Record each step as done, with the date.

Done when: the production health checks are green and QA-01/QA-02 pass against production with synthetic accounts, which are then deleted.

### OPS-10: Backups and restore drill
Status: todo · Phase 4 · Size M · Depends: OPS-09 · Blocks: QA-06
Needs user: restore into a scratch project.
Do:
1. Confirm that daily backups are active on Pro.
2. Write `docs/Restore-Runbook.md`.
   - Storage objects are not in database backups. Package archives can be recreated from the manager's QGIS source, so document re-upload as their recovery path until photos exist.
3. Run one restore drill and record the times: target recovery point 24 h (daily backup), target recovery time 4 h.

Done when: the drill is recorded with its measured times.

### OPS-11: Store listings and submission
Status: todo · Phase 4 · Size L · Depends: BE-08, MOB-07, MOB-20, OPS-09, WEB-14 · Blocks: QA-05
Needs user: Q1 (app name and bundle ID).
Needs user: the Apple Developer and Google Play accounts, the listings, and review submission.
Do:
1. Prepare `docs/Store-Submission.md`:
   - Privacy nutrition labels: email, user ID, precise location of observations, user content, all linked to the user.
   - Play Data safety.
   - The account deletion paths: in the app (MOB-07) and the web link `/privacy/delete-data` (WEB-14).
   - The test account for reviewers, including a join code.
   - Screenshots.
2. Submit a TestFlight internal build and a Play internal-testing build.

Done when: both internal tracks install on the pilot devices.

### OPS-12: Monitoring and alerts
Status: todo · Phase 4 · Size S · Depends: OPS-09 · Blocks: QA-06
Do:
1. Render health alerts.
2. An uptime monitor on `/ready`.
3. A weekly Supabase advisors run, with results noted.
4. PowerSync: replication lag and upload errors in its dashboard, and an alert when `pg_replication_slots` retained WAL exceeds 512 MB.
5. Sentry alert rules for new issues.
6. A daily check that alerts when a profile has had `deleted_at` set for more than 24 hours. That is a pending account deletion (BE-08).

Done when: `docs/Production-Runbook.md` lists each alert and who receives it.

### OPS-13: Auth hardening switches
Status: todo · Phase 1 · Size S · Depends: DB-08, OPS-14 · Blocks: none
Needs user: dashboard changes.
Do:
1. Enable the Before User Created hook, pointing at `fieldmaps_auth_hooks.before_user_created` (DB-08). This needs the function on staging (OPS-14). For production, OPS-09 repeats these switches.
2. Enable leaked-password protection on Pro.
3. Record that CAPTCHA is deferred (decision D9), and why.

Done when: `docs/Supabase-Setup.md` states each switch and its date.

### OPS-14: Apply the Phase 0–1 migrations to staging
Status: todo · Phase 1 · Size S · Depends: DB-04, DB-05, DB-06, DB-07, DB-08 · Blocks: OPS-13
Needs user: every step. Staging is the current project, `lezmqhuucfwqknspgcdy`.
Do:
1. `supabase link --project-ref lezmqhuucfwqknspgcdy`, then `supabase migration list`, then `supabase db push`.
   - Apply migrations in order through the CLI. Never paste single files into the SQL editor: a later file can reference objects an earlier one creates, and the editor records no CLI history.
   - `db push` applies **every** pending file. The list must show exactly the files this task names; if a later phase's file is present, stop and push from a checkout without it.
   - Enable pg_cron in the dashboard first (DB-07).
2. Run `database/hosted/verify.sql` with stop-on-error.
3. Record the applied versions (`TABLE fieldmaps_meta.schema_migrations`) and the verify output, with the date, in `docs/Supabase-Setup.md`.

Done when: staging's ledger lists every migration from DB-04 to DB-08, and `verify.sql` passes there.

### OPS-15: Apply the Phase 2 migrations to staging
Status: todo · Phase 2 · Size S · Depends: BE-13, DB-09, DB-10, DB-11, DB-12, DB-14 · Blocks: OPS-08
Needs user: every step, including Q7: DB-14 discards the pre-Storage test archives.
Do:
The order is expand, deploy, contract. Each step must finish before the next.
1. **Expand.** Push DB-09, DB-10 and DB-12, using the OPS-14 procedure.
   - `db push` applies every pending file, so push from a checkout whose newest migration is DB-12's (for example a `git worktree` at that commit).
   - The running API keeps working: DB-12 only adds columns and makes `archive` nullable.
2. **Deploy.** Deploy BE-13's API code to Render staging. It needs DB-12's `storage_path` and `archive_bytes`, which now exist.
3. **Contract.** From the current checkout, confirm DB-14's list of pre-Storage test packages, then push DB-14 and DB-11 (in file order).
   - `supabase migration list` must show only these two as pending.
   - DB-14 drops `archive`, which only the old API code wrote.
4. Set the `powersync_role` password out-of-band.
5. Check `SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync'` against DB-11.

Done when:
- staging's ledger lists these migrations;
- `verify.sql` passes;
- the publication matches DB-11;
- a package prepared on staging after this has a `storage_path`.

### OPS-16: Apply the Phase 3 migrations to staging
Status: todo · Phase 3 · Size S · Depends: GIS-01 · Blocks: GIS-02
Needs user: every step.
Do: the same procedure as OPS-14, for GIS-01.

Done when: staging's ledger lists GIS-01's migration, and `verify.sql` passes, including the GIS reader assertions.

### OPS-17: Apply the Phase 3–4 migrations to staging
Status: todo · Phase 4 · Size S · Depends: DB-13, GIS-03 · Blocks: OPS-09
Needs user: every step.
Do: the same procedure as OPS-14, for GIS-03 and DB-13.
- Before GIS-03, confirm that nothing still reads the sample view.

Done when: staging's ledger lists every migration in `supabase/migrations/`, and `verify.sql` passes. Production (OPS-09) is created only from a migration set proven here.

### OPS-18: CI runs every guard the docs promise
Status: todo · Phase 4 · Size S · Depends: none · Blocks: QA-08, QA-09
Added 2026-10-22 (frontend audit C13). CI's web job runs 84 of 477 web node tests: the 393-test unit suite (4.55 s), `forms:parity` (0.44 s, the only check tying the web's copy of the form engine to the shared cases) and the token drift/contrast check (1.0 s) never run, while `docs/Workspace.md:67` says CI runs the same checks. The real collector-to-API acceptance drivers `database/tests/test_mobile_bound_upload_api.py` and `test_mobile_package_api.py` sit outside every runner.
Read first: `.github/workflows/ci.yml`; root `package.json` scripts; `docs/Workspace.md:67`; `backend/pyproject.toml` test paths.
Do: add `pnpm --dir web test:unit`, `pnpm forms:parity` and `node scripts/contour-tokens.mjs --check` to the web job; move the two Python drivers under `backend/tests` (pre-pull their Docker image as the backend job already does); add `test:unit` to the root `pnpm test` or correct `Workspace.md`. Playwright stays out of PR CI (nightly or by hand).
Done when: a branch that flips one web unit assertion fails CI; editing the web engine copy without the mobile source fails parity; the backend job lists `test_mobile_bound_upload_api`.
Verify: a CI run on the PR.

### OPS-19: The final pre-launch reset of hosted data
Status: todo · Phase 4 · Size S · Depends: BE-24, DB-20 · Blocks: QA-08
Added 2026-10-22 (D31, D32). The last sanctioned hosted reset: it removes the fields-only form versions and their observations, applies the current migrations, and rebuilds Janet's organization with canonical forms and the Training seed. From the pilot launch on, hosted migrations preserve data.
Read first: D31, D32; [the October 14 hosted diagnosis](../reviews/ci-and-hosted-data-2026-10-14.md); `database/hosted/verify.sql`; `scripts/bootstrap-study.mjs`; OPS-04, OPS-05.
Do: with the owner, choose the exact hosted target and window; export what Janet wants to keep for reference (CSV/GeoJSON) before the reset; reset, migrate, verify with `verify.sql`, bootstrap the organization, publish the forms and the first maps; deploy the API and web builds that match.
Needs user: the exact target and window, and authorization for the reset and the deploys.
Done when: the hosted API answers `/ready`, every hosted `form_versions` row validates against the canonical schema, Training has its site, and a fresh account can join and download on a device.
Verify: `verify.sql` on the target; a sign-up, join and download on one phone.

### OPS-20: Stable Server Action ids across Vercel deploys
Status: todo · Phase 4 · Size S · Depends: none · Blocks: QA-08
Added 2026-10-22 (D34). The web runs on Vercel's free plan, which has no Skew Protection. In Next 16.2.7 every build salts Server Action ids with an encryption key (`build/webpack-config.js` `serverReferenceHashSalt: encryptionKey`; the Turbopack build passes the same key); without `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` it is a random key cached for 14 days in `.next/cache`, so ids change on rotation or an uncached build, and an open tab's next save then calls an id the server no longer knows (audit C03).
Read first: D34; `web/vercel.json`; OPS-05.
Do: generate a key (`openssl rand -base64 32`) and set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for Production and Preview in the Vercel project (never in a tracked file); note the rule "deploy outside manager editing sessions during the pilot" in `docs/Launch-Runbook.md`.
Needs user: setting the variable in Vercel.
Done when: two consecutive deploys of the same commit produce the same action ids (compare the `Next-Action` header of one save before and after), and the runbook has the rule.
Verify: the header comparison, recorded here.
