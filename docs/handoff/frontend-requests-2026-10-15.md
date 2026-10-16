# Requests from the Claude web and mobile UI owner (2026-10-15)

From branch `claude/frontend-pending`. Each request names its owner and the evidence behind it. Statuses stay in the owning `PLAN.md` files; nothing here changes another owner's file. Delete this file once every request is answered.

## Mobile data agent

1. **Remove one account's data from the device** (MOB-07 step 4 and its Done-when). A tested patch for `src/storage/account-removal.ts` is in [mobile/MOB-07-HANDOFF.md](../../mobile/MOB-07-HANDOFF.md), with two smaller requests: the time of the last acknowledged upload (MOB-07 step 1), and a note when MOB-29 makes `wake()` upload.
2. **The development build cannot sign in against local Auth.** `mobile/config/development.json` sets `supabaseUrl` to `http://127.0.0.1:54323` (changed from 54321 in a86a1ee). 54323 is Supabase Studio: `GET /auth/v1/health` answers 404 there and 200 on 54321. Every simulator check of sign-in, sign-up and recovery ([device checklist](../qa/device-checklist-2026-10.md) section 1) waits for `"supabaseUrl": "http://127.0.0.1:54321"`, unless 54323 was meant for something I could not find.
3. **MOB-33 follow-up done on the UI side.** The form-missing card now reads `Recovered.formVersion` ("Form janet-test-v1 for this observation is not on this device."). [MOB-33-HANDOFF.md](../../mobile/MOB-33-HANDOFF.md) still says the UI owner should do it; please mark it done there.

## CI owner (OPS-06)

1. **Run the WEB-15 suite in CI.** WEB-15's Done-when is "passes locally and in CI"; CI has no Playwright job. Proposed job for `.github/workflows/ci.yml`, after `backend` (not run on a GitHub runner by me; the same script and specs pass locally, 38 of 38):

   ```yaml
   web-e2e:
     runs-on: ubuntu-latest
     timeout-minutes: 45
     steps:
       - uses: actions/checkout@v4
       - uses: pnpm/action-setup@v4
         with:
           version: 10.17.1
       - uses: actions/setup-node@v4
         with:
           node-version: 24
           cache: pnpm
           cache-dependency-path: web/pnpm-lock.yaml
       - uses: astral-sh/setup-uv@v6
         with:
           enable-cache: true
           cache-dependency-glob: backend/uv.lock
           python-version: '3.13'
       - run: pnpm backend:setup
       - run: pnpm --dir web install --frozen-lockfile
       - run: pnpm --dir web exec playwright install --with-deps chromium
       - run: >-
           sh scripts/e2e-local.sh --prod --stop-web --project=desktop-1440 --project=phone-390
           e2e/auth-flows.spec.ts e2e/sign-in.spec.ts e2e/org.spec.ts e2e/invite-viewer.spec.ts
           e2e/team.spec.ts e2e/join-observer.spec.ts e2e/account-deletion.spec.ts
       - if: always()
         run: pnpm db:stop
   ```

2. **Web unit tests are not in CI.** The `web` job runs `test:api-errors`, `test:auth` and `test:account`, but not `test:unit` (356 tests). Add `- run: pnpm --dir web test:unit`.

## Backend owner

1. **BE-14's status line is stale.** It says "cursor, summary and exports remain", but `contracts/openapi.json` has `GET …/observations?cursor=…`, `…/observations/summary` and `…/observations/export` (BE-20's subset), and the web reads all three (WEB-39, WEB-41). What remains of BE-14 is the viewport (bbox) filter and its tests. WEB-10 waits only for that; WEB-11 needed only the summary and is now done.
2. **Email turns on wherever provider settings are in the environment.** Since 529e81b, `EmailSettings.from_environment` enables delivery when `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are set. `scripts/e2e-local.sh` started the local API with the caller's environment, so on 2026-10-15 three invitations made by `team.spec.ts` (to `invitee-…@fieldmaps.test` addresses, which cannot receive mail) were handed to the provider: `fieldmaps_private.email_outbox` shows 3 rows `sent`. The script now starts the local API with `EMAIL_ENABLED=false` and without those two variables. Consider making `config.auth-local.json` and `config.local.json` refuse delivery, so no local run can send.
3. **BE-08** stays the user's step (the Auth Admin key). Locally `DELETE /v1/me` answers 503 before changing anything, which the mobile deletion now handles and tests.

## Database owner

1. **`pnpm db:start` first-try failure, fixed in `database/local-supabase.sh` under the user's exception.** The Docker daemon restarts the stack's containers itself (`restart: unless-stopped`); right after it starts, `supabase start` finds the database container running but "starting" and exits 1 with `StatusDbNotReadyError`, which the script sent to `/dev/null`. The script now waits on the container's health check while it is starting (at most two minutes) and prints the CLI's error when start fails. Please review the change.
2. **Local databases created before 2026-10-12 lack `fieldmaps_private.email_outbox`.** The API then fails at startup (`UndefinedTableError`). `pnpm dlx supabase@2.118.0 migration up --local` applies the one pending migration without a reset; a note in `database/README.md` would save the next person the search.

## GIS owner

Nothing new. WEB-12 still waits for BE-15, GIS-01 and GIS-04 (the QGIS connection panel and the typed layers).

## Lead

The decisions are in the PR description ("Decisions for the lead"). Plan facts that need a lead's edit, because they sit in shared plan files:

1. `docs/plan/product.md` J1 step 2 predates D30: organizations come from `scripts/bootstrap-study.mjs`.
2. WEB-08 and WEB-09 are delivered as built (WEB-27 notes, `sites.spec.ts`, `packages.spec.ts`, `forms.spec.ts`); their remaining Depends are obsolete or hosted (WEB-01's staging upload is a user step; WEB-09's WEB-10 dependency was about moving `FilterRail`, which WEB-27 deleted).
3. MOB-07 step 1's active project switcher would change nothing: no screen reads the active project (`useActiveProject` has no callers). Drop it, or say what it should change.
