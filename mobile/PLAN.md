# Mobile collector plan (`mobile/`)

Reconciled 2026-10-15: the [current roadmap](../docs/plan/current-state.md) distinguishes local implementation from simulator, physical-device and hosted acceptance. MOB-29’s bound foreground upload path is implemented with local automated/disposable API/QGIS acceptance; MOB-30 to MOB-33 do not prove the complete mobile pilot flow.
This file is part of the [DECA Mark production plan](../docs/plan/README.md) and defines the `MOB-*` tasks. Related plan files:
- The sync design is in [sync-powersync.md](../docs/plan/sync-powersync.md). Its tasks here are MOB-09 to MOB-12.
- The API shapes are in [contracts.md](../docs/plan/contracts.md).
- The user journeys are J2 and J4 in [product.md](../docs/plan/product.md#journeys-the-pilot-must-support).
- The API side of each flow is in [backend/PLAN.md](../backend/PLAN.md).
- The hosted setup (SMTP, templates, EAS, stores) is in [operations.md](../docs/plan/operations.md).

**Skills to load** when working here: `mobile-design`, `react-native-architecture`, `expo-best-practices`, `offline-sync-designer`, and `mobile-version-bump` at the end of a task that changes the app.

## Original baseline (verified 2026-09-22)

Current changes verified 2026-10-04: MOB-01 selects public per-build configuration and freezes legacy SQLite scope identifiers. MOB-04 adds authenticated `/me` reads, an account/issuer-scoped cache and active-project selection. Deleted accounts retain their local identity and records while uploads pause, including after restart; broader session-loss behavior remains MOB-08. The suite now passes 193 tests. Device acceptance for this batch remains unverified. The baseline below records the starting point, not current behavior.

**Stack**
- Expo SDK 57.0.23, expo-router 57, RN 0.86.3, React 19.2.3, supabase-js 2.116, MapLibre RN 11.3.10, expo-sqlite, zod 4.
- 94 Vitest cases. Nothing in the current redesign has run on a device yet (`mobile/README.md:152`).

**Shell**
- One flat `Stack` (`app/_layout.tsx:43-49`), with no auth gate.
- Routes: `index` (assignments), `brief`, `field`, `review`, `saved`, `records`, `account`.

**Auth**
- The only call is `signInWithPassword` in `app/account.tsx:43`. Every error shows the same message.
- The whole session is kept in SecureStore (`src/auth/client.ts:14-18`), which risks the 2048-byte limit.
- On `SIGNED_OUT`, records disappear from view (`src/auth/provider.tsx:56` plus `src/storage/use-observations.ts:49`).
- Sign-up, verification, password reset, deep links and account deletion do not exist.

**Configuration** (`app.config.ts`, `config/*.json`)
- Public per-build config selects the API/Auth endpoints; production remains a placeholder.
- Legacy SQLite scope values are frozen in `src/data/legacy/scope.ts`; uploads use the configured destination independently.

**Fixtures**
- `src/packages/bundled.ts` holds 4 studies, 2 of them fake.
- `src/maps/sample-site.ts` holds hand-drawn geometry.
- `src/forms/fixtures/*` holds `shell-v1` and `janet-test-v1` (draft).
- The site ID is hard-coded as `"sample-garden"` (`src/domain/observation.ts:30`).
- The queue only accepts `shell-v1` (`src/storage/sync-store.ts:29`).

**Worth keeping.** Reuse these as they are:
- the form engine (`src/forms/engine.ts`, `definition.ts`);
- the draft ownership rules (`src/session/ownership.ts`);
- `PackageProvider` (`src/packages/site-package.ts:60-63`);
- the Nocturne chrome (`src/components/chrome.tsx`), only until MOB-23 to MOB-27 replace it with Contour (D19);
- clustering and orientation policy;
- the idempotent upload-receipt ideas.

## Target structure

```
mobile/
  app.config.ts                 reads config/<APP_ENV>.json (MOB-01)
  config/{development,staging,production}.json   public values only
  app/
    _layout.tsx                 providers + Stack.Protected gates (MOB-03, MOB-24)
    (auth)/  welcome, sign-in, create-account, verify, forgot-password, reset-password
    (onboarding)/  profile, join, invitation/[code]
    (app)/(tabs)/               Projects · Observations · Account in the floating tab dock; tablets use the same dock
      (projects)/  index, [project], [project]/[site], [project]/[site]/brief
      observations/  index, [id]
      account/  index, preferences, field-guide, sign-out, delete-account
    (app)/collect               one route: place → answer → review → saved; outside the tabs, so the dock hides
    (app)/explain/[question]    "Explain this question" sheet
    (app)/(dev)/  gallery, states   development only
    +not-found
  src/
    ui/                         Contour tokens, theme, preferences and primitives (MOB-23)
    features/<area>/            screens' logic and components
    domain/                     forms engine, record builder (pure)
    data/                       powersync/{schema,connector,db}.ts, api/{client,schema.d.ts,errors}.ts, files/
    platform/                   auth-storage (LargeSecureStore), network, location (later)
```

## Tasks

### MOB-01: Environment configuration per build profile
Status: done · Phase 0 · Size S · Depends: none · Blocks: MOB-02, MOB-03, MOB-04, MOB-09, MOB-20
Read first: `config/staging.json`, `src/platform/config.ts`, `app.config.ts`, `eas.json`, `package.json` scripts (`EXPO_NO_DOTENV=1`).
Do:
1. Convert `app.json` to `app.config.ts`, with the same values. It reads `APP_ENV` (`development`, `staging` or `production`; default `development`) and loads `config/<APP_ENV>.json`.
2. Each config file holds public values only:
   - `apiUrl`
   - `supabaseUrl`
   - `publishableKey`
   - `powersyncUrl` (null until OPS-08)
   - `bundleIdSuffix`
3. Drop `projectId` from the config. New code takes the project from `/v1/me` (MOB-04).
   - **Keep the old store's scope key frozen until MOB-11 has migrated it.** The existing SQLite store keys every record, draft and upload by `JSON.stringify([apiUrl, issuer, userId, projectId])` (`src/sync/contracts.ts:12-14`), and uploads only rows whose key equals the current one.
   - Add `src/data/legacy/scope.ts`, which builds that **key** from constants equal to today's values: `http://127.0.0.1:8000`, the lezmq issuer, and project `10000000-0000-4000-8000-000000000002`. Use it only to read and write `owner_scope`.
   - **Split the key from the upload destination.** Today `uploadObservation` builds its request URL from `scope.apiUrl` (`src/sync/upload.ts:13`), so a frozen scope would send uploads to the device's own localhost.
     - Pass the old coordinator a separate `destination`: `{apiUrl: config.apiUrl, projectId: '10000000-0000-4000-8000-000000000002'}`.
     - `uploadObservation` builds its URL from `destination`, never from the key.
     - Receipt checks compare against `destination.projectId` and the user id.
   - Without this, `useAccount()` fails `syncScopeSchema` and falls back to `"local"`. Every new record would then be saved as local-only, and existing records would vanish from view.
4. Expose the config through `expo-constants` `extra`, and keep the zod validation now in `src/sync/config.ts`, moved to `src/platform/config.ts`. Keep the rule that plain HTTP is allowed only for localhost.
5. Set `APP_ENV` per profile in `eas.json` `env`. Keep `EXPO_NO_DOTENV=1`.
6. Bundle identifiers (decision D15):
   - `preview`/staging keeps `com.fieldmaps.collector.dev` and the lezmq Auth project during the transition. Existing test installs then upgrade in place, keeping their SQLite file and session, which MOB-02 and MOB-11 migrate.
   - `development`, the local stack, becomes `com.fieldmaps.collector.local`.
   - `production` uses a placeholder until Q1 is answered ([decisions.md](../docs/plan/decisions.md#open-questions)).

Done when:
- `APP_ENV=staging pnpm exec expo config --type public` shows the staging values;
- a record saved before this change still lists after it, and uploads **to the configured `apiUrl`** (test with a fake HTTP client that asserts the request host);
- typecheck and tests pass.

Evidence (2026-10-04): staging public Expo config, iOS Metro export, mobile TypeScript/Biome and 193 tests passed; old-scope SQLite visibility and configured upload destination/receipt checks covered. No native run claimed.

Development Auth correction (2026-10-15): `config/development.json` now uses `http://127.0.0.1:54321`. This session's live `GET /auth/v1/health` returned 200 there and 404 on Studio's port 54323. Both development Expo platform exports pass with dotenv loading disabled. Simulator sign-in/sign-up/recovery remain pending (user).

### MOB-02: Session storage that fits (LargeSecureStore)
Status: done · Phase 1 · Size M · Depends: MOB-01 · Blocks: MOB-05, MOB-08, MOB-09
Read first: `src/auth/client.ts`, `src/auth/cached-account.ts`; <https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native>.
Do:
1. Add `src/platform/auth-storage.ts`, which implements supabase-js `storage` like this:
   - a random 256-bit key, kept in SecureStore under `fieldmaps-auth-key`;
   - the AES-encrypted session JSON, written to `documentDirectory/auth/<storageKey>` with `expo-file-system`.
   - Use `expo-crypto` for random bytes and a small audited AES library, and pin its version.
2. **Migration.** On first run, look up the old SecureStore entry by its exact key, `fieldmaps-auth-lezmqhuucfwqknspgcdy.supabase.co`, rather than a recomputed one.
   - If it exists, move it into the new store and delete the old entry.
   - It exists only in builds that keep the legacy bundle ID (D15).
3. **Keep a separate account record.** Write `documentDirectory/auth/last-account.json` (`{userId, email, issuer}`) on `SIGNED_IN`.
   - Remove it only on deliberate sign-out or account deletion, never through the supabase-js storage adapter.
   - supabase-js deletes its session on any non-retryable refresh failure (revoked token, global sign-out, deleted user). The cached account must survive that, or a restart loses sight of unsent records (MOB-08).
   - `cachedAccount` reads this file.
4. Add unit tests with mocked SecureStore and file system: round trip, migration, a missing key, and a corrupt file (which counts as signed out, not a crash).

Done when: the tests pass, and a real session larger than 2 KB persists across restarts on the simulator.

Evidence (2026-10-04): AES-256-GCM adapter, exact staging migration and independent issuer-checked account identity implemented; 212 mobile tests, TypeScript and Biome pass. A fresh development build (`com.fieldmaps.collector.local`) on the iPad Pro 11-inch (M5), iOS 26.3 simulator persisted a real 24,404-byte local Supabase Auth session. After process termination and relaunch, plaintext SHA-256 comparison and retained account identity both matched. The temporary QA entry was removed and the Router entry restored. This verifies native session persistence; it does not claim hosted sign-in, full product flows or standalone Release acceptance.

### MOB-03: Route groups and auth gates
Status: done (2026-10-15; landing on welcome and on Projects in a simulator is pending (user)) · Phase 1 · Size M · Depends: MOB-01, MOB-04 · Blocks: MOB-05, MOB-06, MOB-16
Read first: `app/_layout.tsx`, every file in `app/`, `src/auth/provider.tsx`, `src/session/provider.tsx`.
Do:
1. Create the groups `(auth)`, `(onboarding)` and `(app)`. Move the existing screens under `(app)`, unchanged in behaviour.
2. In `_layout.tsx`, use `Stack.Protected guard={…}`, declaring `(app)` before `(auth)`:
   - `(app)`: `session || cachedAccount` (`last-account.json`, MOB-02);
   - `(auth)`: `!session`, so sign-in stays reachable whenever there is no live session;
   - `(onboarding)`: signed in, but the profile has no display name or initials (from MOB-04's cached `/v1/me`).
3. **Offline rule.**
   - A cached account whose session was lost **without** a deliberate sign-out stays in `(app)` while sign-in remains reachable above it. A known `403 account_deleted` opens welcome with the retained deleted-account notice and records; it cannot collect/upload as that account.
   - A deliberate sign-out (MOB-07) removes `last-account.json`, so the gate routes to `(auth)`. The records wait on the device for that account, and `(auth)/welcome` shows their counts (MOB-05).
4. Add a `+not-found` route.

Done when:
- a fresh install lands on the welcome screen;
- a signed-in user with a profile lands on Projects;
- the gate-selection tests pass, including:
  - no session, no cached account, but A's queued records present → `(auth)`;
  - no session, cached account → `(app)`;
  - session, no profile → `(onboarding)`.

Verified 2026-10-15: the groups, `Stack.Protected` gates, offline rule and `+not-found` were already on master (MOB-24's screens, `app/_layout.tsx`, `src/features/auth/gate.tsx`). Missing was step 2's `(auth)` guard: it opened only with no session **and** no cached account, so an account whose session was lost could sign in again only through the legacy Nocturne Account form, and the "Sign in to resume uploads" banner appeared only on legacy screens. Now `GateDecision.authOpen` is `!session` (sign-in opens over the app, which is declared first), `ResumeUploadsNote` on Projects (and Account, MOB-07) opens `/sign-in` with the cached email, and the legacy banner does the same. `gate.test.ts` 20 (the three Done-when cases by name, plus sign-in open over a cached account and closed during a live session), `ResumeUploadsNote.test.tsx` 2. Checks: `pnpm mobile:check` (TypeScript clean; Biome 12 infos, the baseline) and `pnpm mobile:test` (704 passed, 2 skipped) under Node 24.18.0. **Pending (user):** a fresh install landing on welcome, and a signed-in account with a profile landing on Projects, in a simulator ([device checklist](../docs/qa/device-checklist-2026-10.md)).

### MOB-04: API client and the current user (`/v1/me`)
Status: done · Phase 1 · Size M · Depends: BE-06, CON-03, CON-04, MOB-01 · Blocks: MOB-03, MOB-06, MOB-07, MOB-08
Do:
1. Create `src/data/api/client.ts`: ky with the base URL from config, a Bearer token from the current session, typed with the generated `schema.d.ts`, and errors mapped by `errors.ts` (CON-04).
2. Create a `useMe()` hook:
   - fetch `/v1/me` on sign-in and on resume;
   - cache the last response in the file store for offline starts;
   - expose `profile`, `projects` and `activeProjectId`. The active project is persisted, and defaults to the first project that is not Training, otherwise Training.
3. New code uses `activeProjectId`.
   - The legacy SQLite store keeps its frozen key from MOB-01 until MOB-11 migrates it. Never rebuild that key from `activeProjectId`.
   - Switching projects must not hide or stall the other project's records.
4. Map `403 account_deleted` (CON-04) to a signed-out state that keeps local records visible for the MOB-07 and MOB-11 paths.

Done when: an offline start shows the last known projects; the tests cover cache hit, cache miss and a stale-cache refresh.

Evidence (2026-10-04): generated Identity type and runtime parser, account-scoped file cache/provider, active project persistence, deleted-account local sign-out with retained identity. Cache hit/miss/stale selection and typed API errors covered by Vitest; mobile type/lint pass. No native run claimed.

### MOB-05: Authentication screens
Status: done (2026-10-15; the auth calls ran against local Supabase Auth and Mailpit; the simulator run is pending (user)) · Phase 1 · Size L · Depends: DB-02, MOB-02, MOB-03 · Blocks: MOB-06, MOB-21
Read first: [product.md](../docs/plan/product.md) J2; `app/account.tsx` (current form styles); `DESIGN.md`; the Mobile collector designs, pp. 23–28. MOB-24 supplies the Contour layout; MOB-05’s real Auth calls and MOB-06’s real profile/join paths now wire these screens; preserve that layout, with a single primary action at the bottom (thumb zone).
Do:
1. `(auth)/welcome`: app name, "Create account", "Sign in".
   - For each signed-out account with queued or held records, show "N records waiting on this device for {email}". They upload when that account signs in again.
   - Before MOB-09, derive counts from current account/issuer-scoped storage and local practice; after the transition, derive the same counts from the new store. Do not introduce an old `owner_scope` migration adapter.
   - After MOB-09 they come from a per-account summary that MOB-07 writes at sign-out. Never open another user's database without that user's session.
2. `(auth)/sign-in`:
   - email and password, with autofill hints;
   - a distinct message for each case: wrong credentials, email not confirmed (with a button that resends the code and goes to verify), rate limited, offline;
   - a "Forgot password" link.
3. `(auth)/create-account`:
   - email, password (at least 8 characters, with a show/hide toggle);
   - `supabase.auth.signUp`, then go to verify.
4. `(auth)/verify`:
   - 6 digits, using a one-time-code autofill input;
   - `verifyOtp({email, token, type: 'email'})`;
   - "Resend code" with a 60-second cooldown (`auth.resend`);
   - a clear error for an expired code.
5. `(auth)/forgot-password`, then `(auth)/reset-password`:
   - `resetPasswordForEmail`, then `verifyOtp({type: 'recovery'})`, then `updateUser({password})`.
6. Every screen:
   - `KeyboardAvoidingView`;
   - a heading with `accessibilityRole="header"`;
   - errors announced to screen readers;
   - tap targets of at least 44 pt.

Done when:
- every flow works against the local stack, with codes read from Mailpit;
- unit tests cover the mapping from errors to messages.

Real email on staging needs OPS-01 to OPS-03. It is checked in QA-04, not here.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile test`, plus a manual simulator run recorded in the task notes.

Verified 2026-10-15: sign-up (`signUp`), the code (`verifyOtp` email at the sixth digit), a new code (`resend`, once a minute as on the web), recovery (`resetPasswordForEmail`, `verifyOtp` recovery, `updateUser`) and sign-in's "Send a new code" for an unverified address are wired in `src/features/auth/auth-calls.ts`; `AUTH_WIRED`, the `000000` demo code and every "Preview ·" line are gone. A recovery code signs the account in before the password is saved, so the reset screen holds the gate (`gate-hold.ts`) until "Password changed" → Continue, and a password refused as the current one is retried without a new code. Welcome names each account that signed out with work left ("5 records waiting on this device for {email}", from `src/auth/account-summaries.ts`, written at sign-out by MOB-07). Errors to words: `authFailure` (13 cases; a 5xx is the server, not the connection). Tests: `rules.test.ts`, `auth-calls.test.ts` 4, `auth-screens.test.tsx` 7, `ResetPasswordScreen.test.tsx` 5, `account-summaries.test.ts` 5. **Local stack:** `auth-calls.acceptance.test.ts` (skipped unless `DECAMARK_AUTH_LOCAL_TEST=1`) passed against local Supabase Auth with the codes read from Mailpit: sign-up, sign-in refused as unverified, a resend, a wrong code refused, the right code signs in, a wrong password refused, recovery code, a wrong recovery code refused, the current password refused, a new password saved, the old one refused and the new one accepted. On the way, local sign-up answered 500 "Error sending confirmation email": the stack started on 2026-10-13 served a truncated `confirmation.html` (257 of 1918 bytes) to Auth; `pnpm db:stop` then `pnpm db:start` fixed it. **Pending (user):** the simulator run of every screen ([device checklist](../docs/qa/device-checklist-2026-10.md)).

### MOB-06: Onboarding: profile and join
Status: done (2026-10-15; the phone path ran on the local stack; the simulator run is pending (user)) · Phase 1 · Size M · Depends: BE-06, BE-07, DB-07, MOB-03, MOB-04, MOB-05 · Blocks: MOB-21
Do:
1. `(onboarding)/profile`:
   - display name and initials (uppercase, at most 10 characters), saved with `PATCH /v1/me`;
   - the initials become the observer code on every record. Remove the initials question from the form flow once MOB-13 lands.
2. `(onboarding)/join`:
   - an 8-character code input (auto-uppercase, dashes ignored);
   - `POST /v1/invitations/preview` first, then a confirm screen ("Join {project} ({org}) as {role}?"), then `POST /v1/invitations/redeem`;
   - the explanation "You're already in Training — you can practise now";
   - "Skip for now".
3. Deep link `decamark://join?code=XXXX` opens join with the code filled in (use `expo-linking`).
   - It needs no session exchange.
   - It never redeems without the confirm screen: a link from someone else must not silently enrol the user.
4. After a join succeeds, refresh `/v1/me` and set the active project to the one joined.

Done when: a newly signed-up user reaches Projects with Training, and after entering a valid code they also see the joined project.

Verified 2026-10-15: the screens were already wired on master (profile → `PATCH /v1/me` with an offline queue; join → `POST /v1/invitations/preview` → "Join … as …?" → `POST /v1/invitations/redeem` → `/v1/me` refresh → the joined project made active; `decamark://join` through `+native-intent` without redeeming). Removed here: the "Scan a QR invitation" button, which only explained that it did nothing; the web no longer makes QR codes (WEB-07). **Local stack, phone path:** `src/features/onboarding/join.acceptance.test.ts` (skipped unless `DECAMARK_JOIN_LOCAL_TEST=1`) passed against local Supabase Auth, Mailpit and the API on :8001 with the collector's own auth calls, API client, gate and project logic: a new account verified by its Mailpit code has only Training and the gate sends it to onboarding; after `PATCH /v1/me` (initials MO) the gate opens the app and Projects lists Training; a single-use observer code made by the seed's manager (the Team page's endpoint) is typed in lower case with a dash, previews as observer and redeems; `/v1/me` then lists the joined project beside Training and it is the active one; a second redemption is refused. **Pending (user):** the same walk through the screens in a simulator ([device checklist](../docs/qa/device-checklist-2026-10.md)).

### MOB-07: Account tab: profile, sync status, sign out, delete account
Status: doing (2026-10-15: account removal and last-acknowledgment reads implemented and locally verified; UI integration and simulator flows pending (user); [handoff](MOB-07-HANDOFF.md)) · Phase 1 · Size M · Depends: BE-08, MOB-04 · Blocks: MOB-21, OPS-11
Do:
1. **The Account screen shows:**
   - profile editing;
   - the active project switcher;
   - sync status (pending count, held records, open drafts, last successful sync).
2. **Sign out:**
   - If unsent records, held records or an open draft exist, show a confirm dialog that names each count. Explain that they wait on this device for this account. Before MOB-09 derive counts from current scoped stores; after transition use the new queue statistics and local-only tables, preserving the same account boundary.
   - Use `signOut({scope: 'local'})`, and clear the local session **even when offline**.
   - After MOB-09, sign-out closes the user's database (`disconnect()` then `close()`). It never calls `disconnectAndClear()`, which by default also empties local-only tables.
3. **Delete account:**
   - A two-step confirm that names the consequences.
   - Before calling `DELETE /v1/me`, require an empty upload queue. Offer "Upload N records first". Offline with pending work, block unless the user confirms a dialog naming the N records that will be destroyed. Observations already uploaded stay with the organization as research data (J4).
   - Handle `sole_owner` with a message pointing to the web.
   - On 202, retry `DELETE /v1/me` up to 3 times over about 30 seconds **while the session is still valid**, then treat it as done. The server keeps the durable record (BE-08). Treat 204 as done at once.
   - Then sign out and remove **this user's** data only (the shared "remove this account's data" routine below).
4. **"Remove account from this device"** (without deleting the account) runs the same routine after sign-out, behind a confirm dialog that names any unsent records it destroys. The routine:
   - removes only this issuer/account’s current rows, active/parked drafts and grants; a shared database or immutable content file must not be removed while another account references it;
   - records completed current-store cleanup in the transition state if MOB-11’s transition is active; no obsolete experimental-file ledger is required;
   - after MOB-09, closes and deletes `decamark-{userId}.db`, its per-account summary and `last-account.json`;
   - drops this user's package references (MOB-14). A package directory is deleted only when no account references it.
5. At sign-out, write the per-account summary (`documentDirectory/accounts/{userId}.json`: email and counts) that MOB-05 shows.
6. Remove the developer copy from this screen (`app/account.tsx:142-146`).

Done when:
- the flows work on the simulator against the local stack;
- a test with two issuer/account scopes in the current store shows that removing one account leaves the other’s records and package references intact.

Progress 2026-10-15 (UI owner):
- **Account** (`app/(app)/(tabs)/account/index.tsx`, Contour, replacing the Nocturne screen and its developer copy): the profile (name, observer code, email) with Edit profile (`account/profile.tsx`: saved here first, then `PATCH /v1/me`, queued offline); what is on this device by queue state (On device, Needs attention, Held, Uploaded) and unfinished observations; the newly merged Account UI still says "This version does not upload yet." and offers no "Upload now", but that UI copy/action wiring is stale after MOB-29’s locally verified foreground uploader and must be reconciled; screen orientation, moved from the old screen; the field guide; "Sign in to resume uploads" when the session is lost (MOB-03).
- **Sign out?** (`account/sign-out.tsx`): names what waits ("Your unsent work needs a clear owner. 5 observations have not been uploaded. They remain on this device for {email}. Another account cannot upload them."), writes the per-account summary welcome shows (step 5, `src/auth/account-summaries.ts`), then `signOut({scope: "local"})`. Offline, Supabase still removes the session and only reports the server unreachable; the provider now counts that as signed out.
- **Delete account** (`account/delete-account.tsx`): the consequences listed, DELETE typed, then `DELETE /v1/me` (`deleteMe` in `src/data/api/client.ts`). Every try names the account that confirmed and goes out only while it is the one signed in (as the web does since 8cb55be); a 202 is tried again after 5, 10 and 15 seconds, then counts as recorded; 503 says deletion is not available yet; `sole_owner` points to the web. With records not uploaded, a dialog names them first. Afterwards the device treats the account as deleted (its records stay and cannot upload; welcome says so).
- Tests: `deletion.test.ts` 11, `account-screens.test.tsx` 9, `account-summaries.test.ts` 5. **Local stack:** `deletion.acceptance.test.ts` (skipped unless `DECAMARK_DELETE_LOCAL_TEST=1`) runs the collector's deletion on its API client for a new account: the local API, which has no Auth Admin key (BE-08), answers 503 and the run says "unavailable"; the profile and Training membership are intact afterwards. 204 and 202 were not answered by a real server here.
- **UI integration remains:** the data-agent routines and tests below are ready; wire cleanup, its confirm dialog, auth-owned summaries/markers and the last-acknowledgment label through [MOB-07-HANDOFF.md](MOB-07-HANDOFF.md). "Upload N records first" needs wiring to MOB-29’s implemented foreground drain; observe queue completion before leaving. Step 1's active project switcher is not built: no screen reads the active project yet, so it would change nothing (a question for the lead). **Pending (user):** the flows in a simulator ([device checklist](../docs/qa/device-checklist-2026-10.md)).

Data verification (2026-10-15, this session on `master` after PR #28 merged): `removeAccountData(db, issuer, userId): Promise<RemovedAccountData>` removes only that issuer/account from all seven current owner-scoped tables, across API/project scopes. Three real SQLite tests cover other accounts/issuers/practice, shared content, no-op repeat and transaction rollback. `lastReceivedAt(db, scope): Promise<string | null>` reads only that exact scope's synced receipts; four tests cover no acknowledgment, timestamp order versus record order/UTC offset, other-scope and unsynced exclusion, and server microsecond precision. A separate Node 24 SQLite driver acknowledged A, removed A, reopened the file and verified B's record and shared content survived. No MOB-11 ledger is invented before its transition exists; file garbage collection is deferred to a reference/lease-checked retention pass. Checks under Node 24.18.0 / pnpm 10.17.1: `pnpm mobile:check` passes (TypeScript clean; Biome **23 infos**, all in files unchanged from `HEAD`, zero added; the prior 12-info note predates merged MOB-29); `pnpm mobile:test` **782 passed, 5 skipped**; `EXPO_NO_DOTENV=1 pnpm --dir mobile exec expo export --platform all` exports Android (4156 modules) and iOS (4159 modules). `pnpm plan:check` passes (158 tasks); the TypeScript no-excuse audit reports no violations in the six changed code/test files. UI wiring, simulator and physical-device checks remain pending (user). Verification covers local behavior; no deployment or hosted acceptance claimed.

Moved 2026-10-22 (frontend audit C02): the stale "does not upload yet" copy and the "Upload N records first" wiring (it must call `sync.retry()`, not `wake()`) are MOB-37's scope; the remaining cleanup routine and simulator flows stay here.

### MOB-08: Never hide records on session loss
Status: done · Phase 1 · Size S · Depends: MOB-02, MOB-04 · Blocks: none
Read first: `src/auth/provider.tsx:48-58`; `src/storage/use-observations.ts:49`.
Do:
1. Distinguish a user-initiated sign-out from a failed refresh. On a failed refresh, keep the cached account and show the banner "Sign in to resume uploads", with a button that opens sign-in pre-filled with the email.
2. Records stay visible under the cached account in every case except a deliberate sign-out.

Done when: tests simulate `SIGNED_OUT` from a failed refresh, **followed by an app restart**, and confirm the records stay visible under the cached account.

Evidence (2026-10-04): failed-refresh `SIGNED_OUT` preserves cached identity and account-scoped records through real SQLite and account-file close/reopen with account A/B isolation. Deliberate sign-out hides records until matching sign-in, including a token refresh during sign-out; a concurrent new account's cache is preserved. Failed identity-cache writes keep their warning across session loss until a durable retry. The shared banner opens Account with cached email prefilled and excludes deleted accounts. Mobile TypeScript, Biome and 217 tests pass; native recovery UI acceptance remains unverified.

iOS UI check (2026-10-04): the normal iOS entry bundled, but the simulator UI check did not reach the Account screen; recovery-banner and email-prefill UI acceptance remains unverified.

### MOB-09: PowerSync foundation (database, schema, provider)
Status: todo · Phase 2 · Size L · Depends: MOB-01, MOB-02, OPS-08, SYNC-01, SYNC-02 · Blocks: MOB-10, MOB-11, MOB-12, MOB-13, MOB-14
Read first: [sync-powersync.md](../docs/plan/sync-powersync.md) (client design); `src/storage/*`; `app/_layout.tsx`.
Do:
1. Select compatible PowerSync and native SQLite dependencies against the supported Expo/RN build. Record the required native rebuild and verify the actual installed versions before changing the storage writer.
2. Define the supported **current-schema** transition boundary with MOB-11 before deleting any store. Capture real SQLite/WAL/filesystem fixtures containing account/issuer-scoped bound observations, accepted receipts, active/parked drafts, exact package/form references, grants and selections. Do not create a frozen v3 module, duplicate old practice serializers or an experimental-schema compatibility ladder.
3. Port each current SQLite consumer together with its behavior, including preferences/session identity where relevant. The active writer must remain usable until the current-schema transition is implemented and verified; removing an import is not evidence that its retained data is no longer needed.
4. Define synced tables against SYNC-02’s current UUID-bound schema and local-only tables for drafts, held practice, package catalogs/grants/references and transition state. Reuse MOB-28/MOB-33 retention, exact-form recovery and package-readiness semantics rather than creating a second package index or selection policy.
5. Scope each database and connector to its exact issuer/account identity. Refuse credentials/uploads for a different current account; disconnect and close before switching. Replace the provider/writer only when MOB-10/MOB-11/MOB-12 integration preserves valid current records and references, with restart-safe acknowledgment and no duplicate uploads.

Done when: the native app builds and typechecks with the selected database adapter; a staging simulator reads the authorized streams; current-schema fixtures survive the writer transition with exact package/draft/receipt references; account-switch tests prove no record uploads with another account’s token. Delete superseded storage modules only after these consumers and acceptance gates pass. Pre-launch incompatible-schema reset remains MOB-28’s explicit policy, not an instruction to migrate obsolete experiments.

### MOB-10: Upload connector and record states
Status: todo · Phase 2 · Size M · Depends: BE-12, MOB-09 · Blocks: MOB-11, MOB-21, QA-03
Read first: [sync-powersync.md](../docs/plan/sync-powersync.md) (connector and record states).
Do:
1. **`uploadData()`:**
   - Take `getCrudBatch(n)` and map each operation to the observation envelope. Size `n` so that the body stays under BE-09's 4 MB limit (start at 25).
   - `POST /v1/sync/upload`.
   - **Call `.complete()` only after a 200** whose JSON parses against the generated response schema, has exactly one result per operation id sent, and whose `user_id` equals the database owner.
   - **Throw on everything else**, so PowerSync retries: 400, 401, 403, 404, 408, 409, 422, 429, 5xx, network errors, and an unparseable 200 (a captive portal on park Wi-Fi answers 200 with HTML).
   - On 413, halve `n` and retry.
   - Completing on any other response would drop the batch, and PowerSync would then revert those local rows: silent data loss.
2. **Record states** for the Observations tab, as defined in sync-powersync.md: on device, uploading, uploaded, needs attention, held.
   - The list draws on `observations`, unresolved `upload_rejections` and `held_observations`, as **one entry per observation id**. When an id appears in several, the precedence is: local queue, then rejection, then held, then uploaded.
   - A rejected record is rendered from `operation`, because PowerSync removes the local row after the checkpoint.
   - Show the rejection's `code` and `message`.
3. **"Send again"** on a rejected record inserts a fresh PUT with the same id and the data from `operation`. The server accepts it once the cause is fixed (for example, after the user is added to the project), and marks the rejection resolved.
4. Remove the old coordinator and upload code (`src/sync/*`) once the tests are ported.

Done when the tests, with a fake database and fake HTTP, cover:
- the accepted, replayed, rejected and transient cases;
- 413 then success with a smaller batch;
- an HTML 200 and a 422 that leave the queue intact;
- a result for another user that is not completed;
- a rejected record that stays visible **after a simulated checkpoint revert**, and can be sent again;
- a re-sent record appears once, not twice, while it is queued.

### MOB-11: Transition current-schema local work to PowerSync
Status: todo · Phase 2 · Size L · Depends: MOB-09, MOB-10, MOB-12 · Blocks: QA-03
Reconciled scope (2026-10-15): the pre-launch reset policy and MOB-28 supersede the original v1–v3 experimental-database migration ladder. Do not rebuild that ladder, a flat `shell-v1` uploader or protocol-discriminator columns. No transition is implemented by this task yet; PowerSync itself remains MOB-09/10/12 and SYNC-01/02.
Read first: [pre-launch policy](../docs/plan/README.md#pre-launch-compatibility-policy-2026-10-11), [current package lifecycle](PACKAGE-LIFECYCLE.md) and [sync design](../docs/plan/sync-powersync.md).
Do:
1. Before switching writers, specify how the **current-schema** account/issuer-scoped records, drafts, parked drafts, exact package/form bindings, receipts and references move together into the PowerSync store.
2. Retain current-schema unfinished/unsent/needs-attention work; migration must be atomic, restart-safe and must not enqueue accepted records again or reassign records to another account/project.
3. Exercise real SQLite/WAL restart and account isolation, exact missing-map recovery, reference retention and lost-receipt replay before replacing the current writer. A schema reset must not be silently repurposed as an auth repair or ordinary start command.

Done when: the selected transition is verified against real current-schema SQLite/filesystem fixtures and a simulator upgrade is recorded in QA-03. Any future incompatible-schema reset remains an explicit pre-launch policy action, not a promise to recover obsolete experiments.

### MOB-12: Drafts on PowerSync local-only tables
Status: todo · Phase 2 · Size M · Depends: MOB-09 · Blocks: MOB-11, MOB-13
Do:
1. Port `src/storage/draft-store.ts` and the ownership rules (`src/session/ownership.ts`) to the local-only `drafts` table.
2. Key drafts by `(user, project, id)`, so more than one project can have an open draft.
3. Keep every existing draft test, adapted.
4. A draft that fails to parse, or whose owner does not match, moves to a quarantine table. It is never deleted: the current recovery behavior preserves unreadable drafts; the new store must retain that boundary.

Done when: the draft tests pass, and a force-quit mid-observation offers Resume or Discard.

### MOB-13: Forms from the server, and a generic observation record
Status: doing (2026-10-15 reconciliation: exact package-bound forms and records exist locally; PowerSync integration remains and bound foreground upload is implemented under MOB-29 with local automated/disposable API/QGIS acceptance) · Phase 2 · Size L · Depends: CON-02, DB-09, MOB-09, MOB-12 · Blocks: MOB-15
Read first: `src/forms/registry.ts`, `src/domain/observation.ts`, `src/domain/build-observation.ts`, `src/session/provider.tsx:340-360`; the envelope in [contracts.md](../docs/plan/contracts.md#current-bound-observation-envelope).
Remaining work:
1. Integrate exact package-bound play/Inventory form definitions with PowerSync’s authorized form streams. Current MOB-33 recovery uses the retained package and accepts its exact retired binding; no current published-form lookup may replace an unfinished observation’s form.
2. Preserve generic question-ID answers, JSON numbers, observer identity, round/first-round context, spatial support and immutable site/package/zone/form bindings in the target observation model. Inventory’s display anchor stays separate from event geometry.
3. Consolidate any remaining fixture wrappers only when the current canonical definitions and explicit local practice remain available to their tests and product paths. No frozen experimental payload module is required.
4. Keep local practice held with export/discard choices. Never relabel an existing held record with a user-selected published version or silently convert practice into research data. Any supported new research observation must be created through the normal exact-bound collection path.

Done when: brief, collect, review and recovery render exact bound forms from the selected synced/retained sources; shared cases pass; PowerSync preserves existing current-schema answers and bindings without substituting a form. MOB-29 independently owns the present foreground bound-upload integration.

Superseded in part 2026-10-22 (D32): steps 3–4 (explicit local practice, practice kept held) are replaced by MOB-43, which brings Training and every form from the server. Step 1 (PowerSync form streams) and step 2 remain.

### MOB-14: Hosted site packages
Status: doing (2026-10-15 reconciliation: current package discovery, verified installs, references and recovery accepted locally under MOB-28/MOB-33; Storage-backed delivery, cellular policy and PowerSync integration remain) · Phase 2 · Size L · Depends: BE-13, MOB-09 · Blocks: MOB-15
Read first: `src/packages/site-package.ts`, `src/packages/bundled.ts`, `src/maps/field-map.tsx`; the manifest format in `backend/src/fieldmaps_api/domain/packages.py` (moved there by BE-03).
Remaining work:
1. Integrate server discovery/Storage delivery with the existing MOB-28/MOB-33 catalog and read models. Keep available current metadata separate from verified installed selection and a pinned visit; a stream refresh must not replace current work.
2. Adapt signed Storage downloads when BE-13 supplies them, preserving staged archive/manifest/layer/form verification, full zone geometry, authoritative display anchors, immutable digest-addressed content and atomic catalog selection.
3. Implement the cellular policy with displayed size and explicit confirmation on an expensive connection. Failed/cancelled downloads retain the last verified version and exact missing-map recovery.
4. Keep current account grants and SQL references for drafts, parked drafts, active leases and retained observations. Do not add a competing `packages/index.json`, infer authorization from file existence or delete shared bytes while another reference exists.
5. Replace bundled research-source fallbacks with real authorized packages while retaining deliberate local Training/practice behavior. Package lifecycle and account switching must remain correct before and after the PowerSync writer transition.

Done when: a staging Storage-backed package downloads/verifies/opens through the existing lifecycle; mismatch/cancellation/account-switch and reference-removal scenarios pass; exact historical packages reopen without new geometry or form substitution. MOB-28/MOB-33’s current local acceptance is already recorded; simulator/physical-device and Storage acceptance remain distinct.

### MOB-15: Remove the remaining fixtures and developer copy
Status: todo · Phase 2 · Size M · Depends: MOB-13, MOB-14 · Blocks: MOB-16, QA-05
Do:
1. Walk the mobile rows of the [fixture inventory](../docs/plan/architecture.md#fixture-and-practice-data-inventory-current-boundaries). Delete `src/maps/sample-site.ts` if it is unused, and the `"sample-garden"` literal.
2. Replace developer copy aimed at builders with copy for field users:
   - `app/index.tsx:134-152`
   - `brief.tsx:144`
   - `review.tsx:180-183`
   - `saved.tsx:32-55`
   - `records.tsx:153-157`
   - `src/session/provider.tsx:136,271-273`
   - `src/auth/provider.tsx:99-100`
   - `src/sync/provider.tsx:87`
3. Show protocol notes for Janet only to managers.

Done when: `grep -rn "fixture\|stub\|not built\|sample-garden\|Protocol question" mobile/app mobile/src` finds no hits outside tests.

Moved 2026-10-22 (D32): deleting the bundled `sample-garden` practice package and its form fixtures is MOB-43's scope; the developer-copy and protocol-note steps stay here.

### MOB-16: Navigation and information architecture overhaul
Status: todo · Phase 4 · Size L · Depends: MOB-03, MOB-15 · Blocks: MOB-17, MOB-18
Changed 2026-10-03: MOB-25 and MOB-26 build these screens in Contour on preview data. This task wires them to real navigation data (projects, sites, packages, records) without changing their layout.
Read first: `DESIGN.md`; the Mobile collector designs, pp. 1–16; `designs/Handoff.dc.html` (behaviour spec only); `src/layout/*`.
Do:
1. Tabs: Projects, Observations (with a badge for pending and needs-attention counts), Account, in the floating tab dock. Tablets use the same dock, centred; there is no side rail.
2. Collect is one route, `(app)/collect`, outside the tabs, so the dock hides there. Place, answer, review and saved are internal states of that route, not separate routes. No screen locks orientation; the observer's app-wide choice (`src/layout/orientation.ts`) applies.
3. On a phone, Review is a panel step and Saved is a full card. On a tablet, Saved is a "Last saved on this device" card in the Place panel. Use no transition between repeated observations, as Handoff specifies.
4. Primary actions ("Start collection", "Save on this device") sit at the bottom, in the thumb zone. Pushed screens keep the designs' round back button, and system back works everywhere.
5. Observations rows open `observations/[id]`, which shows the state, the answers and any rejection.
6. Replace the MOB-23 preview data source with real data: projects from MOB-04, sites and packages from MOB-14, records from MOB-10.

Done when: every route from the target structure exists and reads real data, and the orientation tests still pass.

### MOB-17: A state for every screen
Status: todo · Phase 4 · Size M · Depends: MOB-16 · Blocks: QA-05
Do:
1. Give each screen these states: loading, empty, error with retry, offline, signed-out, no membership (only Training), and expired session (the banner from MOB-08).
2. Add a connectivity indicator in the chrome.
3. Projects must not show its empty state while it is still loading (today's `app/index.tsx:36,109` shows "No studies waiting").

Done when: every screen has a snapshot or unit test for each state, or a documented manual check.

### MOB-18: Accessibility
Status: todo · Phase 4 · Size M · Depends: MOB-16 · Blocks: none
Do:
1. Placing a point: add "crosshair + Place here", so a screen-reader or motor-impaired user can place without tapping an arbitrary map position.
2. Tap targets of at least 44 pt. Today these are smaller:
   - the panel toggle (22×54), `app/field.tsx:201-203`;
   - the cluster marker (36), `src/maps/field-map.tsx:173`;
   - the callout close button (36);
   - the layer rows (42).
3. Headings get `accessibilityRole="header"`.
4. Announce status-line messages with `AccessibilityInfo.announceForAccessibility`.
5. Raise neutral-600 text and placeholders to at least 4.5:1 contrast, and set `maxFontSizeMultiplier` sensibly.

Done when: a VoiceOver pass through J2 is recorded in the task notes.

Moved 2026-10-22 (frontend audit C22): the collect-map announcements, Reduce Motion on the camera, the cluster target, password label-in-name and disabled reasons are MOB-45's scope, because the pilot cannot wait for MOB-16. The VoiceOver J2 pass and the remaining items stay here.

### MOB-19: Design-system cleanup (Nocturne), together with web
Status: dropped (superseded by MOB-23) · Phase 4 · Size M · Depends: none · Blocks: none
Do:
1. Remove the hard-coded hex values (`src/components/chrome.tsx:229,231`, `src/maps/field-map.tsx:317,453,471,481`).
2. Align chips, ghost buttons, pressed states and input focus with `designs/_ds/nocturne-*/styles.css`.
3. Adopt Phosphor icons (`phosphor-react-native`).
4. Make any token change in `web/src/app/globals.css` in the same change (the `web/AGENTS.md` rule).

Done when: no hex literal remains outside `src/theme.ts`.

### MOB-20: Release engineering
Status: todo · Phase 4 · Size M · Depends: MOB-01, OPS-07 · Blocks: OPS-11
Needs user: Q1 (app name and bundle ID) answered.
Do:
1. EAS profiles `development`, `preview` (staging) and `production`, each with `APP_ENV`.
2. `runtimeVersion: {policy: "fingerprint"}` and `updates.url`, with channels per profile.
3. An iOS submit config. Set the final bundle IDs. Add the Sentry SDK for React Native with the DSN from the environment (OPS-07).
4. Document the release checklist in `mobile/README.md`: version bump through the `mobile-version-bump` skill, then `eas build`, then internal track, then `eas update` rules.

Done when: `eas build --profile preview` succeeds (**Needs user** for credentials), and the app reports to Sentry.

### MOB-21: End-to-end flows with Maestro
Status: todo · Phase 4 · Size M · Depends: DB-02, MOB-05, MOB-06, MOB-07, MOB-10 · Blocks: QA-04
Do: create `mobile/maestro/` with the flows below.
- The auth flows run against the local stack. OTP codes are read from the Mailpit API through a helper script.
- The collect-and-upload flow needs PowerSync, which the local stack does not run. It runs against **staging**, with a dedicated test account, and says so in its file header.
- sign-up, verify, profile, join
- sign in with a wrong password, then the correct one
- reset password
- collect offline, reconnect, uploaded
- sign out with unsent work (the warning appears)
- delete account

Done when: every flow passes on the iOS simulator, and the run command is in `mobile/README.md`.

Added 2026-10-22: the current-queue flows the pilot needs (keyboard layout, kill and resume, account isolation, double tap) are MOB-49; this task keeps the PowerSync-era collect-and-upload flow.

### MOB-22: Map palettes on the field map (Day, Night, Aerial)
Status: doing (code and tests in place 2026-10-01; not yet run on a device) · Phase 1 · Size S · Depends: none · Blocks: none
Added 2026-10-01 after Janet found the QGIS layers hard to read on the dark plan (decision D18 in [decisions.md](../docs/plan/decisions.md)).
Do: read `contracts/map-palettes.json` in `src/maps/palette.ts`; build every plan base and layer paint from a palette; replace the Plan/Aerial toggle with a Day · Night · Aerial control, Day by default, remembered for the app session.
Done when: the field map opens in Day on a simulator or device, the QGIS surfaces read clearly, and Night and Aerial still match today's look.
Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test` (142 tests passed on 2026-10-01), plus a recorded device or simulator check.

### MOB-23: Contour foundation (mobile)
Status: doing (2026-10-15 source reconciliation: Contour tokens, theme, primitives, preferences and gallery exist; complete native foundation acceptance remains) · Phase 1 · Size L · Depends: none · Blocks: MOB-24, MOB-25
Added 2026-10-03 (D19, D22). It builds no product screen. The screens built on it (MOB-24 to MOB-27) run in `preview` mode on the designed fixtures, or in `device` mode on the real local packages, records and queue; the wiring tasks (MOB-03 to MOB-17) later connect them to the API and PowerSync without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`, `contracts/contour.json`, `contracts/map-palettes.json`; designs: Contour system pp. 1–7 and 11; `app/_layout.tsx`, `src/theme.ts`, `src/maps/palette.ts`.
Do:
1. Add every new dependency in this task, so the dev client is rebuilt once: `@expo-google-fonts/geologica`, `@expo-google-fonts/spline-sans-mono` and `lucide-react-native` (JavaScript only), and `react-native-svg` and `expo-haptics` (native). Put `GestureHandlerRootView` at the root.
2. `src/ui/tokens.ts` parses `contracts/contour.json` with zod. `src/ui/theme.tsx` provides `ThemeProvider`, `useTheme()` and `useStyles(factory)`, memoised per scheme. A Day-mapped legacy `theme.ts` keeps old screens compiling until MOB-27 removes it.
3. `src/ui/preferences.tsx` keeps the screen theme (Day · Dusk), the map palette (through the existing `setMapBase`), the preferred hand, haptics and larger question text in `expo-sqlite/kv-store`, read synchronously so the first frame never flashes. `Appearance.setColorScheme()` makes native alerts and pickers follow the theme. In `app.config.ts`: `userInterfaceStyle: "automatic"` and the Contour ground colour as the root background.
4. Primitives in `src/ui/*`, with the same names as `web/src/components/contour/*`. `Text` sets `maxFontSizeMultiplier` per role and the larger-question-text step, and never sets `numberOfLines`. `Icon` maps the Lucide names in the state vocabulary and adds the custom two-bar held glyph. Collector buttons are 56 or 60 tall. `haptics.ts` honours the preference.
5. Rebuild the bundled Riverside from `contracts/fixtures/sites/riverside.json`. `features/preview/DataSourceProvider` has a `preview` mode (the designed fixtures, including Uploading and a 60 of 126 MB download) and a `device` mode that wraps the real `bundledPackages`, `useObservations` and `useSync` (local-only → Held, pending → On device, synced → Uploaded, needs attention → Needs attention). Collect always uses the real engine and SQLite.
6. `(dev)/gallery` (every primitive in Day and Dusk, with one Reanimated worklet so a misconfigured build shows on first launch) and `(dev)/states` (gate, data source and screen state). Dev builds open signed in on Projects through a gate override allowed only when `__DEV__` or `extra.preview` is set.

Done when: typecheck, lint and test pass; `expo export` bundles for iOS and Android; the gallery shows every primitive in both themes.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test`, `pnpm tokens:check`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`, plus the simulator checklist in the PR (rebuild the dev client, fonts load, both themes, the largest text size wraps). Record only the device checks actually made.

### MOB-24: Identity screens and gates
Status: doing (2026-10-15 source reconciliation: identity screens and protected gates exist; native Day/Dusk/VoiceOver acceptance remains) · Phase 1 · Size L · Depends: MOB-23 · Blocks: none
Added 2026-10-03. MOB-03/05/06 now wire real gates, Auth, profile and join behavior, with local Auth/Mailpit/API acceptance recorded above. Native Day/Dusk/VoiceOver acceptance remains under this UI task.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Mobile collector pp. 23–31; `app/account.tsx`, `src/auth/*`.
Do:
1. `(auth)`: welcome ("Fieldwork starts here."), sign-in, create-account, verify, forgot-password and reset-password.
2. `(onboarding)`: profile (1 of 2, "Your observer identity"), join (2 of 2; nonfunctional Scan QR removed) and `invitation/[code]` ("Join Play Study?"), which the join deep link opens with the code filled in.
3. `Stack.Protected` gates in `_layout.tsx` over `(auth)`, `(onboarding)` and `(app)`, with MOB-23's dev-only override.
4. Codes are one wide mono field with a counter: a paste is cleaned, the field submits by itself at the 6th digit, a wrong code reselects it, and the resend countdown is mono. Join codes are uppercased as you type. Password checks update live, "Does not match yet" appears only after blur, and a disabled button always carries its reason.
5. Every screen: a heading with `accessibilityRole="header"`, errors announced, keyboard avoidance, targets of 48 pt or more, and every error state in the designs, in Contour wording.

Done when: each screen matches its design page on a phone in Day and Dusk; codes paste and submit by themselves; unit tests cover the gate selection and the code-field cleaning.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test`, `pnpm tokens:check`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`, plus the simulator checklist in the PR (VoiceOver from sign-in to join).

### MOB-25: Shell, projects, sites and the session brief
Status: doing (2026-10-15 source reconciliation: tabs, projects, sites and pinned brief exist; full simulator/native shell acceptance remains) · Phase 1 · Size L · Depends: MOB-23 · Blocks: MOB-26, MOB-27
Added 2026-10-03. These screens run on preview data, or in device mode on the real bundled packages. MOB-04 (projects from `/v1/me`), MOB-14 (hosted packages) and MOB-16 (navigation data) later wire them without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Contour system p. 11, Mobile collector pp. 10–14 and 22; `src/packages/*`, `src/session/provider.tsx`.
Do:
1. `(app)/(tabs)` with expo-router `Tabs` and a custom `tabBar`: the floating ink TabDock (Projects · Observations · Account), also on tablets, centred, at most 420 wide. Its badge counts records that need attention. Each tab has its own stack. Collect sits outside `(tabs)`, so the dock hides only there.
2. Projects (home), with the Unfinished observation card wired to `recovered` and `inProgress` (Resume, Discard draft).
3. Project (its sites with download state), and Site in three states: not downloaded, downloading and ready offline. Progress is linear, and each asset row moves Waiting → Downloading → Verified. "Ready offline" appears only when all four package parts verify, and "Set up this session" enables only then.
4. Before you begin (`[site]/brief`), wired to `openPackage`, `chooseZone` and `chooseRound`, with the observer code and the locked map and form versions.
5. The Online indicator, and `+not-found` with the "Nothing was lost" note and the dock.
6. Delete the old `index` and `brief` routes once their logic has moved.

Done when: the dock hides only in collect; preview and device modes both render every screen.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test`, `pnpm tokens:check`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`, plus the simulator checklist in the PR (download preview, both themes, a tablet).

### MOB-26: Collect flow on phone and tablet
Status: doing (code in place 2026-10-07; not yet run on a device or simulator) · Phase 1 · Size L · Depends: MOB-25 · Blocks: none
2026-10-07: `app/(app)/collect.tsx` and `src/features/collect/` replace the `field`, `review` and `saved` routes. Placement follows Janet's iPhone Maps request instead of step 2's armed tap: a fixed × at the exact coordinate with the pin floating above it, the map moving under it, "Place point here" reading the map's exact centre, the in-zone check, the precision line and a half-metre nudge pad. The Standard, Reliability and Inventory rounds (D26) add a Zone step for inventories; `session.save` gained the placement source and the session's list of saves, and is otherwise unchanged. Verified by types, Biome, 395 tests and both Metro exports only; the simulator checklist is still owed.
Added 2026-10-03. Collect always runs the real form engine, drafts and SQLite queue. MOB-13 (forms from the server) and MOB-16 later change where its form and site come from, without changing its layout. The save path (`session.save`) is unchanged.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Contour system p. 7, Mobile collector pp. 1–9; `src/maps/field-map.tsx`, `src/components/question-panel.tsx`, `src/session/provider.tsx`, `src/layout/orientation.ts`.
Do:
1. `app/(app)/collect.tsx` and `features/collect/*`: one route with internal states (Place, idle and armed → Answer → Review → Saved), driven by `useFieldSession` and a local `reviewing` flag. X and Android back confirm "Leave? Your draft stays on this device"; back also steps through the states. The header shows the real form id.
2. Restyle `field-map.tsx`: controls of 44 or more, the label island, the scale chip, the hatched zone through `fill-pattern`, and violet markers, all from the palette. Arming gives the map island a 3 px magenta border and the banner "Tap where the play happened", and stops panning. The point drops in with a light haptic. "Place at map centre" places at the camera centre (MOB-18's crosshair request); "Adjust point" re-arms with a nudge pad of 44 pt or more. MapLibre stays mounted across the states.
3. Rebuild `QuestionPanel` on `AnswerTile`. A single choice fills the tile, then advances after 160 ms; the next question fades in and focus moves to its heading; a revealed follow-up appears below the current question. "Explain this question" is the `explain/[question]` sheet.
4. Phone: the map island above the panel; Review is a panel step; Saved replaces the panel with a full card, whose check scales in with a success haptic, and the save is announced. "Place the next observation" returns with no transition.
5. Tablet: a 58/42 split with the panel on the preferred hand's side; Saved becomes a "Last saved on this device" card in the Place panel. No screen sets its own orientation lock; the app-wide choice (PR 14) applies.
6. Delete the old `field`, `review` and `saved` routes.

Done when: the orientation and logic tests pass; `session.save` is unchanged; the engine files are untouched.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test`, `pnpm tokens:check`, `pnpm forms:parity`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`, plus the simulator checklist in the PR (arming blocks panning, place at centre, no transition between observations, landscape with each hand, VoiceOver through place, answer, review and save).

### MOB-27: Observations, account, preferences, field guide and leaving
Status: doing (2026-10-15 integration: Contour account/profile/sign-out/deletion screens and field guide exist; observations still redirect to legacy records, current upload UI wiring/account cleanup and native acceptance remain) · Phase 1 · Size L · Depends: MOB-25 · Blocks: none
Added 2026-10-03. These screens run on preview data, or in device mode on the real records and sync. MOB-07 (account, sign out, delete account), MOB-10 (record states) and MOB-17 (every state) later wire them without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Mobile collector pp. 15–21; `src/storage/use-observations.ts`, `src/sync/*`.
Do:
1. Observations: one FlatList, zone chips, each queue state as a glyph, a word and a colour, and pull to refresh calling the real `wake()`.
2. Record (`observations/[id]`): the answers, the state, and for a record that needs attention, the reason and "Correct and send again".
3. Account: profile, the queue breakdown, and "Upload now" calling `wake()`.
4. Preferences: preferred hand, map palette (Day · Night), haptics, larger question text, and "Screen: Day · Dusk", which the design lacks (D19).
5. Field guide: search and 140 ms accordions, readable offline.
6. Sign out? and Delete account, each saying what stays on this device. Confirmations the designs do not cover use `Alert.alert`. No control claims a deletion it does not perform.
7. Remove the legacy `theme.ts`, `chrome.tsx`, `expo-blur` and Inter, and the old `records` and `account` routes.

Done when: no hex literal remains outside `src/ui/tokens.ts`; all tests pass.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test`, `pnpm tokens:check`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`, plus the simulator checklist in the PR (airplane mode shows the offline states, haptics only when the switch is on, the gallery in both themes).

Moved 2026-10-22 (frontend audit C02, C24): step 1 and the `records` route of step 7 are MOB-38; step 4 (Preferences) is MOB-46; step 6's copy is MOB-37. The Nocturne theme stays only where `screen-message.tsx` and the auth splash use it until they move.

### MOB-28: Retain exact offline package versions safely
Status: done (2026-10-13: actual current /v1 package installation and SQLite/filesystem restart pass; current mobile checks and retention tests pass; [evidence](../docs/reviews/zone-boundaries-2026-10-13/mob28-mob33.md)) · Phase 3 · Size L · Depends: CON-05 · Blocks: MOB-33
Owner: Mobile data agent.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md) and [component specification](ZONE-BOUNDARIES.md).
Do: Replace the SQLite migration ladder with one current schema: on any `user_version` mismatch, drop every table and recreate. Keep no v1 rows or v1 uploader path, no `upload_protocol` or `canonicalization_version` columns, no `server_capabilities` table and no legacy-database fixtures or upgrade tests. Add catalog/reference retention and atomic verified installation, fence async account work and remove bound-draft zone fallback.
Done when: Incompatible schemas reset transactionally; current-schema restart/download/removal cannot lose referenced maps or unfinished observations.
Verify: pnpm mobile:check, mobile:test and real SQLite/filesystem restart/failure drivers.
Evidence: [local implementation and final review](../docs/reviews/zone-boundaries-2026-10-11/mob28.md): 506 mobile tests, typecheck/lint and independent local review pass.
Acceptance: Current-contract installation/restart was rerun after DB-19 and BE-22 against a disposable live loopback API. Physical-device collection/upload remains MOB-29 and QA-07.

### MOB-29: Collect and upload pinned zone observations
Status: doing (2026-10-15: immutable bound upload, full receipt checks, structured rejections and foreground reconnect/resume/retry implemented with local automated/disposable API/QGIS acceptance, physical iPad/Android collector acceptance pending) · Phase 3 · Size L · Depends: MOB-33, BE-22, MOB-30, MOB-31, MOB-32 · Blocks: QA-07
Owner: Mobile data agent with Claude UI owner.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md), [component specification](ZONE-BOUNDARIES.md) and [UI plan](ZONE-BOUNDARIES-UI.md) sections 4.5, 6, 7 and 9.
Do: Freeze session forms/package/zone, apply geometry parity (reusing MOB-31's `coveringZones`) and the sole `/v1` upload/receipt validation; store structured rejection codes for the needs-attention copy in UI plan 4.5; run the physical-device scenario.
Done when: Physical-device draft survives newer publication and restart, uploads with original attribution; inventory is whole-zone.
Verify: Mobile checks/tests and physical-device acceptance matrix; missing evidence remains pending.
Data decision (2026-10-14): retain the historical Depends/Blocks links to completed UI prerequisites; they do not block starting this task. Exact closed coverage is shared through `zoneCovers` and now has the sloping-edge regression checks. The sole bound uploader, receipt/rejection integration and foreground drain are now implemented in source. Exact bodies are persisted on save; old held current-schema bound records activate from their own saved bindings. Receipt checks fence transport and acknowledgment, and account changes abort/fence token access and late writes. [Current acceptance evidence](../docs/reviews/mob29-2026-10-15/README.md) records passing mobile checks/full suite, disposable real package install/save/restart/v2 publication, byte-identical replay, conflicting-body 409, point/Inventory export and native QGIS demo/live-export readback. These local results do not establish physical collector or hosted acceptance. Physical iPad/Android collector acceptance remains pending, so this task stays doing.

UI handoff refresh (2026-10-15): this session reran the provider/transport/coordinator tests (34 passed) and confirmed `useSync().wake(): void` invokes the real bound foreground drain. `retry(): Promise<void>` clears eligible pending/needs-attention backoff and wakes the drain; neither API promises queue completion. [MOB-07-HANDOFF.md](MOB-07-HANDOFF.md) now requests the three upload actions and removal of the stale "This version does not upload yet." copy. No UI-owned code was edited and no new device/hosted/QGIS acceptance is claimed.

### MOB-30: Show map versions, updates and safe removal
Status: done (2026-10-14; component tests on device data; simulator screenshots pending (user)) · Phase 3 · Size L · Depends: MOB-33 · Blocks: MOB-29
Owner: Claude mobile UI owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) MUI-1, MUI-2, MUI-5, MUI-6, MUI-8, MUI-10, 4.1 to 4.3 and 6; `app/(app)/(tabs)/(projects)/**`; `src/features/projects/*`; `src/features/preview/hosted-sites.ts`.
Do: Drive readiness and labels from MOB-33's read models over MOB-28's verified catalog; show available versus installed versions, update Notes, per-part download progress, older maps with reference-checked removal, last check and "Check for updates"; open the newest verified installed package for a session; reset visible state on account change.
Done when: With map v1 installed and map v2 published, every screen in UI plan 4.1 to 4.3 shows the documented state in device mode; removing a referenced map is refused with its reason.
Verify: `pnpm mobile:check`, `pnpm mobile:test` (label and state mapping tests), simulator screenshots of each state.
Verified 2026-10-14: hosted sites read MOB-33's `useSiteVersions` and `siteVersionSnapshot` (`src/features/projects/{versions.ts,HostedPackageIsland.tsx}`); readiness is ready offline while any verified map is here; "Set up this session" opens `nextSessionPackageId`; the account fence is the data layer's (each read model is keyed by the signed-in account). With map v1 verified and v2 published, the real screens render on device data in component tests: Projects "1 site ready offline · map update for 1 site", the Project row "3 zones · map v1 · v2 available · 12.0 MB" and Ready offline, the Site island's v2 Note and "Download v2 · 12.0 MB" beside v1 ("Set up this session" opens v1), "Downloading · part 2 of 4" with Cancel, older maps with "Used by 1 unfinished observation and 3 records not uploaded yet." and Remove off, a removal the data layer refuses at the last moment ("Map v1 was not removed: something on this device still uses it."), and the Brief's version Note. Tests: `versions.test.ts` 12, `readiness.test.ts` 8, `HostedPackageIsland.test.tsx` 4, `device-screens.test.tsx` 4. Checks: `pnpm mobile:check` (TypeScript clean; Biome 12 infos, the baseline) and `pnpm mobile:test` (640 passed, 1 skipped, 80 files) under Node 24.21.0; `EXPO_NO_DOTENV=1 pnpm exec expo export --platform all` bundled iOS (4140 modules) and Android (4223 modules), exit 0. **Pending (user):** simulator screenshots of each state (no simulator in this environment).

### MOB-31: Make placement boundary-aware
Status: done (2026-10-14; the simulator walkthrough with VoiceOver is pending (user)) · Phase 3 · Size L · Depends: MOB-33 · Blocks: MOB-29
Owner: Claude mobile UI owner; the mobile data agent reviews geometry parity.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) MUI-3, MUI-4, MUI-5, MUI-9 and 4.4; [contract](../docs/plan/zone-boundaries/contract.md) "Point attribution"; `src/maps/geometry.ts`; `src/features/collect/*`; `contracts/zones/geometry.cases.json` (`coverage_cases`).
Do: Add `coveringZones` and `nearEdge` with a Vitest adapter over every coverage case; replace the PlaceStep readout with the five placement states, the edge choice and the disabled reasons; add the ReviewStep save re-check, inventory tap candidates, the spotlight hole fix, and version labels in the collect header and Saved card.
Done when: Every coverage case passes as an unordered set; each placement state renders in component tests.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, simulator walkthrough of the five states on phone and tablet with VoiceOver.
Exception (2026-10-14, user): the pure geometry (`coveringZones`, `nearEdge` and the coverage adapter) started before MOB-33 was done. MOB-33 was done before the screens started and before this task closed.
Verified 2026-10-14: `coveringZones` and `nearEdge` (`src/maps/geometry.ts`) build on the data agent's `zoneCovers` (`src/maps/zone-boundaries.ts`), as the user asked, so collect and the save gate share one predicate; a zone without a drawn boundary covers nothing. `coverage.test.ts` 25: all 16 `coverage_cases` as unordered sets with the accepted rule, plus vertices, open and closed rings, hole edges and the 8-point near-edge threshold at zoom 18, 20.5 and 22. `placement.test.ts` 15. Component tests: `PlaceStep.test.tsx` 6 renders inside, edge (Segmented with the session zone chosen; choosing switches zone), other ("Switch to Slide"), between (RadioRows, nothing chosen) and outside every zone on map v3 from the real geometry, with "Place point here" off and its reason on a bound map and on for the practice map; `ReviewStep.test.tsx` 2 shows "Not saved yet." with Adjust point and Save off. The spotlight dims holes (`geometry.test.ts` 11); the collect header, review summary and Saved card show the map version. Checks: `pnpm mobile:check` (TypeScript clean; Biome 12 infos, the baseline) and `pnpm mobile:test` (640 passed, 1 skipped, 80 files) under Node 24.21.0; `EXPO_NO_DOTENV=1 pnpm exec expo export --platform all` bundled iOS (4140 modules) and Android (4223 modules), exit 0. **Pending:** the simulator walkthrough on phone and tablet with VoiceOver (user), plus integrated physical-device/server attribution under MOB-29/QA-07. The three sloping-edge exactness failures were repaired by `d529134`; the recorded 5,295 exact-side comparisons and underflow regression pass. See [the resolved handoff](MOB-31-HANDOFF.md) and [local follow-up verification](MOB-33-HANDOFF.md#local-follow-up-verification-2026-10-14).

### MOB-32: Resume exact drafts and explain recovery
Status: done (2026-10-14; the simulator resume and missing-map checks are pending (user)) · Phase 3 · Size M · Depends: MOB-33 · Blocks: MOB-29
Owner: Claude mobile UI owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) MUI-7, 4.3 and 4.6; `src/features/projects/UnfinishedCard.tsx`; `app/(app)/(tabs)/(projects)/[project]/[site]/brief.tsx`.
Do: Render every unfinished-observation status with its actions, block "Start collection" while an unfinished observation would be overwritten, and add the field guide sections on map versions, zone edges and outside-zone points.
Done when: Each status in UI plan MUI-7 renders with its actions in component tests; no path substitutes a zone or a newer map.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, simulator check of a resume after force quit and of a missing-map recovery.
Verified 2026-10-14: the unfinished card reads MOB-33's `useRecoveredDraft` (`src/features/projects/{recovery.ts,UnfinishedCard.tsx}`). `UnfinishedCard.test.tsx` 9 renders each MUI-7 status with its actions: ready (Resume opens collect through the data layer's exact resume), map missing ("Download map v1 again · 12.0 MB", "Keep for later"), map missing offline ("Connect to download map v1 again.", no download), no access and form missing with nothing to download ("Keep for your coordinator"), zone missing (names NM and map v1); Discard asks first. Parked drafts resume once nothing else is unfinished and say why they wait. Re-download asks for the draft's own map; nothing offers another zone or a newer map. On the Brief, an unfinished observation at the site comes first and "Start collection" is off with "Resume or discard the unfinished observation at Fall Creek (map v1)." (`device-screens.test.tsx`). `recovery.test.ts` 9; the field guide's map-versions, zone-edges and outside-zones sections (`content.test.ts` 5). Checks: `pnpm mobile:check` (TypeScript clean; Biome 12 infos, the baseline) and `pnpm mobile:test` (640 passed, 1 skipped, 80 files) under Node 24.21.0; `EXPO_NO_DOTENV=1 pnpm exec expo export --platform all` bundled iOS (4140 modules) and Android (4223 modules), exit 0. **Pending (user):** the simulator resume after a force quit and a missing-map recovery.
Updated 2026-10-15: the form-missing card names the draft's own form from MOB-33's `Recovered.formVersion` ("Form janet-test-v1 for this observation is not on this device. Your point and answers are kept."), never one from a newer map (`recovery.ts`; `recovery.test.ts` and `UnfinishedCard.test.tsx`, 27 of 27).

### MOB-33: Provide bound session and package read models
Status: done (2026-10-14: data implementation and local acceptance complete; the Claude UI owner acknowledged the interface; [handoff](MOB-33-HANDOFF.md)) · Phase 3 · Size L · Depends: MOB-28, BE-22 · Blocks: MOB-29, MOB-30, MOB-31, MOB-32
Owner: Mobile data agent; the Claude mobile UI owner acknowledges the interface.
UI-owner acknowledgment (2026-10-14, Claude mobile UI owner): `src/packages/zone-read-models.ts` is accepted as the MOB-30 to MOB-32 interface. `SiteVersions`, `Pinned` and `Recovered` carry the meanings of [UI plan](ZONE-BOUNDARIES-UI.md) section 6, with two documented additions taken as they are: `references.retained` (synced records that still need local detail, so removal is never enabled from unsent counts alone) and the action name `downloadPackage`. The screens read `useSiteVersions(siteId)`, `useRecoveredDraft()` and `useFieldSession()` (`pinned`, `parked`, `beginVisit`/`endVisit`, `chooseZone`), and MOB-31 builds its placement candidates on `zoneCovers` (`src/maps/zone-boundaries.ts`). Checked on `4eaf103`: `pnpm mobile:check` (TypeScript and Biome, 12 infos) and `pnpm mobile:test` (554 passed, 1 skipped) under Node 24.21.0.
Read first: [component specification](ZONE-BOUNDARIES.md) MOB-29; [UI plan](ZONE-BOUNDARIES-UI.md) MUI-1, MUI-4, MUI-7, MUI-11 and section 6.
Do: Add site discovery on the single site API (MUI-11); package readiness with no box fallback; the frozen bound session context with zone UUIDs; exact-version form loading; parked drafts; persist a zone change on an open observation in the same handler; and write `src/packages/zone-read-models.ts` (SiteVersions, Pinned, Recovered, hooks and an in-memory fake), extending `SiteZone` with `zoneId` and `displayAnchor` and removing the box fallback. A local schema change resets local data instead of migrating it (pre-launch rule).
Done when: The read models are populated from real stores in unit tests; a 404 shows as no access; switching zone on a shared edge then killing the app restores the chosen zone; the UI owner has acknowledged the interface file.
Verify: `pnpm mobile:check`, `pnpm mobile:test` with site-list failure, parking and zone-persistence cases.
Data follow-up (2026-10-14): `Recovered.formVersion` now names the retained draft's exact form in all bound recovery states; `isStored(site)` counts any account-authorized verified install independently of the current published pointer. Exact `zoneCovers` uses a filtered orientation with BigInt fallback and winding coverage, including a subnormal-bound guard. Decisions and UI-owner follow-ups are recorded in [MOB-33-HANDOFF.md](MOB-33-HANDOFF.md). With explicit user approval, the three UI-owned typed fixtures now include the required form field; `pnpm mobile:check` passes with clean TypeScript and Biome's 12-info baseline. Card text and other UI fixes remain with the UI owner. The user chose local commits only; no push or hosted change.

Follow-up verification (2026-10-15): `dbbc92e` and current `src/features/projects/recovery.ts` confirm the form-missing card already uses `Recovered.formVersion`; the handoff marks that request done. The hosted provider flake was reproduced by advancing only Date four seconds between site metadata and archive generation: expected verified v8, received `[]`. `boundFixture` generated different ZIP timestamps/digests from the same inputs. Its ZIP mtime is now fixed; the same clock-crossing regression and 11 adjacent package tests pass (13 total), as does the full mobile suite recorded under MOB-07 above. No timeout increase or production download change. Simulator recovery and physical-device checks remain pending (user).

## Pilot readiness from the frontend audit (added 2026-10-22)

These tasks come from the [frontend audit](../docs/reviews/frontend-audit-2026-10-17/REPORT.md) (C-numbers are its clusters) and the owner decisions D31–D34. They run on the current upload queue (D27) and do not wait for PowerSync. [docs/plan/pilot-readiness.md](../docs/plan/pilot-readiness.md) orders them into waves and lanes. Every collector layout check uses the D33 device matrix: an iPhone SE-size and a large iPhone, an Android phone emulator (edge-to-edge), a Samsung or 10–11" Android tablet, and an iPad, in portrait and landscape.

### MOB-34: Keep the answer field and Continue above the keyboard on every pilot device
Status: done (2026-10-24; render and unit tests, mobile:check and mobile:test; device check pending (owner)) · Phase 4 · Size M · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C01, the highest-ranked finding). On an iPhone 17 Pro simulator the keyboard top sat at 539 pt while the answer field (529–579) and Back/Continue (592–648) were behind it; at rest the field is clipped to a sliver under the sticky footer. The panel `KeyboardAvoidingView` pads about 119 pt where 301 pt is needed, because RN 0.86.3 compares its parent-relative frame with the keyboard's window coordinate. Android has no avoidance at all (`behavior` is `undefined`; edge-to-edge is mandatory in Expo 57).
Read first: `src/features/collect/CollectScreen.tsx:476-499` (panel KAV, `Platform` branch at :479, map slot 46% at :499); `QuestionStep.tsx:141-145,198-207,241-257`; `SavedStep.tsx:145-152`; `CollectMap.tsx:247-253,762-809`; both `useKeyboardVisible` copies (`features/auth/use-keyboard.ts`, `features/onboarding/use-keyboard-visible.ts`); `node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:97-130`; the C01 evidence (`docs/reviews/frontend-audit-2026-10-17/runtime/native/PROGRESS.md` step 16d, `cloud/w3/skeptic-C01/kav-repro.mjs`; the screenshot `runtime/native/16d-keyboard-covers-answer-field.png` is in the audit's asset bundle, outside git).
Do:
1. Move one `useKeyboardVisible` into `src/ui/` and delete the other copy.
2. Measure the body's window y with `onLayout` and pass `keyboardVerticalOffset={bodyY}` with `behavior="padding"` on both platforms; delete the `Platform` branch.
3. On phones while the keyboard is up: give the map slot height 0 by style (keep it mounted; never `display:none`, which unmounts on Fabric) and hide the status row. In phone landscape also hide the header, the mode strip and the links row.
4. Add `keyboardDismissMode="on-drag"` to the QuestionStep ScrollView (it already has `keyboardShouldPersistTaps`).
5. Check two frames as the keyboard rises: if the KAV's `LayoutAnimation` animates the map slot (DESIGN forbids it), replace the panel KAV with `paddingBottom = max(0, keyboardHeight - insets.bottom)`.
6. Pin SavedStep's "Place the next observation" outside its ScrollView, like Place, Question and Review. Lay the map controls in two columns when the map frame is under about 340 pt.
Done when: on every D33 device in portrait and landscape, while typing the 4-row `play_event_summary` of `janet-test-v1`, the field and Continue frames end above the keyboard frame (`maxY ≤ keyboard.minY`, read from frames, not a visibility assertion); a drag dismisses the keyboard and the camera is unchanged; Saved's forward action is visible without scrolling; the map is never remounted.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, and the frame check on the simulators/emulators of D33 (Accessibility Inspector, `uiautomator dump` or a MOB-49 flow), screenshots in the PR.
Done 2026-10-24: the panel no longer uses `KeyboardAvoidingView` (step 5, taken at once because, read from its source, the stock component would animate the map slot (`LayoutAnimation.configureNext`) and compares frames in two coordinate systems; the two-frame check is pending): `CollectScreen` pads the panel's bottom edge by `keyboardLift` (the keyboard's reported height less the iOS home-indicator inset) from the one `useKeyboardVisible`/`useKeyboardHeight` module in `src/ui/use-keyboard-visible.ts`, on both platforms. While the keyboard is up a stacked layout (phones and tablets in portrait) shuts the map slot to height 0 by style, the map stays mounted at its old size inside it, and the status row goes; a phone in landscape also drops the header, the mode strip and the links row. `QuestionStep` drags to dismiss and scrolls the typed field into view; `SavedStep` pins its forward action; the map controls take two columns in a frame under 340 pt. `CollectScreen.keyboard.test.tsx` models the frames of the D33 families in both orientations (panel `maxY` equals the keyboard's top) and fails on the base (its 16 keyboard and map-slot cases fail on `origin/master`; 36 tests fail across the three new collect test files there); `mobile:test` 907 passed, 5 skipped. Review round 1 fixes: with the keyboard up on a phone in landscape the text field shows two rows and no counter (the 4-row field plus counter is taller than the 81 to 89 pt left; the two-row field with typed text is 80 pt with its border; an empty one is taller, see round 4), the map slot shuts only on the Answer step and once the map has been measured (arriving with the keyboard up no longer mounts the GL view at height 0), and the Layers menu offset reads one `MAP_CONTROL` constant. Review round 2 fix: the scroll follows the field's height. While the text box is at its rows' minimum height the field keeps its top in view, so on an iPhone SE in portrait (about 114 pt of scrolling area against a 151 pt field) a re-focus after a drag-dismiss, Back, an edit from Review or a resumed draft no longer scrolls the typed line out above the area; once the text outgrows the rows the foot is kept, so the newest line shows. The answer inputs also ask Android for no fullscreen extract editor (`disableFullscreenUI`). Review round 4 fix: an empty input is measured by its placeholder (React Native sizes an empty `TextInput` by it), which can wrap past the rows (the janet-test-v1 summary placeholder wraps to 4 lines in a two-row field, making the empty field 124 pt, and an SE at 1.24x text 141 pt for the input), so the field counts as grown only when it holds text and its box is taller than its rows; an empty field always keeps its top, where the caret and the first line sit. **Pending (owner):** the frame check on the simulators and emulators of D33, including (the caret not at the end of a grown answer is covered by MOB-35) that the first typed line is visible on a phone in portrait (iPhone SE) and in landscape, that no fullscreen extract editor opens on an Android phone in landscape, large text sizes (iOS Larger Text, Android font scale), the emoji keyboard, an undocked iPad keyboard, an iPad in Stage Manager or a non-full-height window, and that no frame of the rise animates the map slot.

### MOB-35: Rotation keeps the field map and the step mounted
Status: done (2026-10-24; render and unit tests, mobile:check and mobile:test; device check pending (owner)) · Phase 4 · Size S · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C21). Rotating swaps between two layout trees in `CollectScreen.tsx`, so MapLibre and the step panel remount: the camera and the aim go back to the zone centre, which breaks the screen's own "map stays mounted" rule. Tablets rotate constantly in the field (D33).
Read first: `src/features/collect/CollectScreen.tsx` (the portrait and landscape branches); `src/layout/use-layout.ts`.
Do: render one tree and switch the arrangement (column or row, slot sizes) by style only, keeping the map and panel element identities stable. Do this in the same lane as MOB-34 (same file).
Done when: on the iPad and Samsung-tablet simulators, rotating during Place and during Answer keeps the camera, the aim and the typed answer; a unit or render test asserts the map component is not unmounted on a layout change.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, simulator rotation on two tablets.
Done 2026-10-24: `CollectScreen` renders one tree, and the arrangement (a row or a column, the slot's width or height, the panel's width, the status row's place) changes by style only, so rotating no longer swaps two trees. The map slot, the panel and the answer field keep their element identities and the typed answer through a rotation and back; the Layers menu, the keyboard lift and the shut-slot rule of MOB-34 are unchanged. `CollectScreen.keyboard.test.tsx` gains a rotation block for an iPad, a Samsung tablet and two phones (the map mounts once and is never unmounted, the map slot, the panel and the answer field are the same instances, the typed answer stays, in Answer and in Place, and a rotation with the keyboard up opens or shuts the slot without remounting the map); its 8 identity cases fail on the MOB-34 `CollectScreen` (the panel and field are new instances after a rotation) and pass now. `mobile:test` 923 passed, 5 skipped; `mobile:check` exit 0. The status row is the one element that changes parent on a rotation (under the map beside the panel, above the panel when stacked), so it mounts again. Verified 2026-10-25 after merging master (MOB-34's final version and #42's schema 2 kept as they are): `QuestionStep` now tracks the caret (`onSelectionChange`) and, for a grown answer with the caret before its end, keeps the caret's row inside the scrolling area instead of the foot, so a rotation with the keyboard open no longer pushes an earlier edited line off screen, and typing at the end still follows the foot; the new `QuestionStep.test.tsx` cases (a caret on line 1 and on line 3 of a 6-line answer stay inside the area after a layout change, the caret at the end follows the foot) fail on the merged base and pass, every collect test file passes, `mobile:check` exits 0 and `mobile:test` passes (1101 passed, 5 skipped). **Pending (owner):** rotate the iPad and Samsung-tablet simulators during Place and during Answer and read that the camera, the aim and the typed answer stay, on both tablets, and that TalkBack and VoiceOver do not read the status line again after a rotation. Also on the rotation check: with a long answer and the caret on an earlier line (tap line 1), rotate with the keyboard open and read that the caret's line is still visible; a caret at the end still shows the newest line. The row is estimated from line breaks, or from the characters when lines wrap, so check a wrapped paragraph too.

### MOB-36: A second tap cannot answer an unread question
Status: done (2026-10-25; hook tests with fake timers, mobile:check and mobile:test; device check pending (owner)) · Phase 4 · Size S · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C05). Single-choice questions auto-advance after `AUTO_ADVANCE_MS = 160`. Reproduced with the real `QuestionStep`, `reduceSession` and `janet-test-v1`: a second tap 250 ms later answers the next question (Q1 → Q2 gives `play_type_1: exploratory`), and on Q2 it answers the optional subtype and lands on "A second play type, if there is one", which looks natural and which Review never flags. A re-tap at 120 ms clears the answer; that un-choose is intended and stays.
Read first: `src/features/collect/CollectScreen.tsx:42,98-105,205-218,352`; `src/forms/session.ts:83-89` and its un-choose test; `cloud/w3/skeptic-C05/double-tap.test.ts`.
Do: in `dispatchStep` (not QuestionStep, which is not keyed per question): (a) a `choose` of the option whose advance is pending returns early without cancelling the advance; (b) stamp `advancedAt` when the timeout fires and ignore `choose`/`toggle` for about 350 ms after it. Extract the timer and guard into `useAutoAdvance(dispatch)` so it can be tested without MapLibre.
Done when: a hook test with fake timers proves: re-tap at 120 ms keeps Q1 and still advances; a tap 250 ms later on Q2 leaves Q2 unanswered; a different option within 160 ms still replaces the first; un-choose after Back still clears.
Verify: `pnpm mobile:test`; a manual double-tap check on one phone and one tablet.
Done 2026-10-25: the beat and the guard live in `useAutoAdvance(dispatch, onDestination)` in `src/features/collect/use-auto-advance.ts`, and `CollectScreen` takes its `dispatchStep` and `cancelAdvance` from it (the 160 ms constant moved with it). A `choose` of the option whose move is pending returns early and neither un-chooses nor restarts the beat; a `choose` or `toggle` within 350 ms after the move fires is ignored; a different option within the beat still replaces the first; Back, Continue, a write, a jump and the mode strip still cancel a pending move; a re-tap long after the move (or after Back) still un-chooses. `use-auto-advance.test.tsx` drives the real reducer and `janet-test-v1` with fake timers (13 cases: single tap, 120 ms re-tap, 250 ms tap on Q2, the Q2 to subtype case, a replacing option, the 349 and 350 ms edge, a toggle in the window, a wall clock stepped back, a tap right after Back, un-choose after Back, cancel, unmount, destination); with the guard removed 5 of them fail (the re-tap clears Q1, the 250 ms tap answers Q2, the Q2 tap answers the optional subtype), and they pass now. The guard times with `performance.now()` (monotonic), so a phone that corrects its clock after an offline stretch cannot freeze the tiles; Back and `cancelAdvance` also end the guard window. Review round 1 note: janet-test-v1 has no multi-select question, so the toggle guard is tested on a synthetic toggle; a form that ends in a single choice would put a second tap on Review, which the guard does not cover (not in the pilot form). `mobile:check` exit 0, `mobile:test` 1114 passed, 5 skipped. **Pending (owner):** on one phone and one tablet, double-tap an option on Q1 and read that Q1 keeps its answer and the form moves to Q2 unanswered; double-tap an option on Q2 and read that Q3 (the optional subtype) is unanswered; tap a different option quickly after the first and read that it replaces the first; tap Back and then the same option again and read that the answer clears.

### MOB-37: Say what the uploader really does at sign-out, deletion and Saved
Status: todo · Phase 4 · Size S · Depends: none · Blocks: MOB-38, QA-08
Added 2026-10-22 (audit C02). Takes over the copy and "Upload N records first" wiring that MOB-07's progress note lists as remaining, and step 6 of MOB-27. The uploader is live (MOB-29), yet Account (`account/index.tsx:135-138`, comment :36-41) and Sign out (`sign-out.tsx:125-131`) say "This version does not upload yet", Delete account (`delete-account.tsx:186-191`) says "This version cannot upload them first … can never upload", and practice records are called "held for the project" (`leaving.ts:35-40`, `SavedStep.tsx:115-120`, `guide/content.ts:84`), which is the contract word for "waiting on the project".
Read first: the files above; `src/features/account/leaving.ts:83` (`uploadFirstLabel`, unused); `src/sync/provider.tsx` (`retry`, `wake`); `src/features/preview/queue.ts:9-14`; `account-screens.test.tsx:144` (pins the false copy); [MOB-07-HANDOFF.md](MOB-07-HANDOFF.md).
Do:
1. Delete both "does not upload yet" notes and the doc comment. Sign out says: "Signing out pauses their upload until {email} signs in again on this device."
2. Delete account with unsent records offers "Upload N first" wired to `sync.retry()` (which clears `next_attempt_at`), never `wake()` (which waits out the retry delay; 0 calls in 240 s in the reproduction), and keeps the observer on the screen while the counts update; "Delete anyway" proceeds. The Alert stops saying uploading first is impossible.
3. Count unsent from bound rows only (`onDevice + uploading + attention`). Decide practice by `!isBoundObservation`, not `isShellObservation` (that misses Practice-garden inventory rows). Until MOB-43 lands, word practice as "Practice record: stays on this device and is never uploaded".
4. Remap `local-only` in `queue.ts STATUS_TO_STATE` away from "held" before any screen shares the map. (The `bundled.ts:107,180` meta strings that say "uploads to the API" are deleted with the file in MOB-43.)
Done when: seeding one bound pending row with 7 attempts and a future `next_attempt_at`, one `shell-v1` practice row and one unbound `janet-inventory-v1` row: "Upload 1 first" uploads at once and the row reaches Uploaded only through a receipt; Account, Sign out and Delete account count 1 unsent and describe the two practice rows as never uploaded; a grep finds neither "does not upload yet" nor "cannot upload them first"; `account-screens.test.tsx:144` asserts the new copy.
Verify: `pnpm mobile:check`, `pnpm mobile:test`.

### MOB-38: Observations: one Contour list inside the app shell
Status: todo · Phase 4 · Size M · Depends: MOB-37 · Blocks: QA-08
Added 2026-10-22 (audit C02, A11Y-01). Takes over MOB-27 step 1 and the `records` route of step 7. The Observations tab is `<Redirect href="/records">` to a root-stack sibling, so it replaces the whole `(app)` group: the dock disappears and the dark Nocturne screen shows "Held" for pending and "Synced" for uploaded, with an 11.5 pt text-only state chip, no heading and five screen-reader stops per record.
Read first: `app/(app)/(tabs)/observations/index.tsx`; `app/records.tsx:31-153`; `app/_layout.tsx:212-213`; `src/components/screen.tsx`; MOB-27 step 1; `src/ui/` ListRow and StateBadge.
Do: build the Observations list inside the tab stack with Contour primitives (`FlatList`, one row = one accessibility element with state glyph + word + colour from MOB-37's map, a header role, zone chips); keep "Retry these uploads" for needs-attention rows calling `sync.retry()`, with copy that says retrying sends the same record again and does not change it; delete `app/records.tsx` and `PageScreen`. Keep the Nocturne theme only where `screen-message.tsx` and the auth splash still use it, and record that remainder in MOB-27.
Done when: tapping Observations keeps the dock (a router-level test with expo-router's `renderRouter`); the list uses On device, Uploading, Uploaded, Needs attention; VoiceOver reads one stop per record on the iPad simulator.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, `pnpm tokens:check`, simulator check in Day and Dusk.

### MOB-39: Uploads resume as soon as the observer is back online, and idle ticks do nothing
Status: done (2026-10-24; coordinator, store, provider and screen tests; device check pending (owner)) · Phase 4 · Size M · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C09, C15). Reproduced with the real coordinator: retry delays (5, 10, 20, 40, 80, 160, 300 s) never reset, so ten seconds after the 7th failure a reconnect plus foreground wake made 0 upload calls and the upload went out about 305 s later. Separately, every 5 s drain calls `changed()` even when nothing changed, so every focused `useObservations` re-reads and zod-parses all rows, Account and Sign out flash "Reading records from this device…", Sign out ignores taps for a moment, and the collect map rebuilds its sources.
Read first: `src/sync/coordinator.ts:65-82`; `src/sync/bound-upload.ts:45-56`; `src/storage/sync-store.ts:31-40,108-130`; `src/sync/provider.tsx:50,100,117-129`; `src/sync/foreground.ts:18-21`; `src/storage/use-observations.ts:18-47`.
Do:
1. On connectivity regained and on foreground, one UPDATE sets `next_attempt_at = 0` for pending rows (not needs-attention), then wake.
2. The coordinator (and `activateHeldObservations` until MOB-42 deletes it) reports whether a row changed; call `changed()` only then.
3. `useObservations` sets `loading` only on the first read for a key and keeps the previous rows during re-reads.
4. Replace the fixed 5 s interval with one timeout to the earliest `next_attempt_at`.
Done when: coordinator tests: after 7 failures a connectivity wake uploads at once; an empty drain calls no `changed()`; a screen test shows Account without the loading text on a no-change bump; retries still fire without any user action.
Verify: `pnpm mobile:test`; on a simulator with a failing API, toggle offline/online and see the upload within seconds.
Verified 2026-10-24: a reconnect or a foreground resume makes pending rows still inside a retry delay due at once (`releaseBackoff`, one UPDATE; needs-attention rows untouched), spaced 5 s from the last upload attempt, and never before a server's `Retry-After` (kept on the device per account, so neither a token refresh nor an app restart forgets it); a coordinator made at a sign-in starts with no memory of the last one, so a flap during sign-out never delays the first upload after the next sign-in. The 5 s spacing does not hold in two cases that are left as they were: a new coordinator right after an attempt (a token refresh, a sign-in or an app restart starts one with no memory of the last attempt) (the new coordinator starts with no last attempt, so a record inside its delay is released and sent at once), and a flap that aborts an upload in flight (the record was never deferred, so the next reconnect sends it again without waiting). `acknowledge`, `deferObservation` and `activateHeldObservations` report whether a stored record changed, the drain passes that on, and `changed()` runs only then; `useObservations` shows `loading` only for an account's first read. The 5 s interval is one timeout to the earliest remaining `next_attempt_at` (plus a 5 s retry after a pass that threw). Tests (real coordinator, store and `SyncProvider` over SQLite with fake timers; fail on base, pass after): after 7 failures a reconnect and a resume upload at once (0 calls on base), an idle queue makes no upload and no revision bump for a minute, an Account screen keeps its counts on a no-change bump, retries still fire with no user action. Review fixes 2026-10-24 (each with a test that fails on the first commit): a record already due when a pass ends is woken at once (one more look after 5 s if nothing could send it), a reconnect is spaced 5 s from the last upload attempt rather than the last release, the server's `Retry-After` deadline is stored on the device and read back at every release, and a pass that stores a change and then throws still refreshes the screens. Second review round 2026-10-24: after a 401, or when a due record is still due, at the same moment, after its wake, it is left alone (a save, reconnect, resume or new token wakes the queue) and no timer is set for it alone, so an idle or paused queue runs no pass and no query (the test counts database statements; 13 `earliestRetry` queries in 60 s on the first review commit), and a timer delay is capped at 2^31-1 ms (a `Retry-After` of 2500000 s made 1000 queries in 1 s of fake time). `pnpm mobile:check` and `pnpm mobile:test` (906 passed after the second review round) pass. Third review round 2026-10-25: the provider remembers per coordinator which records it already woke once and found unsendable (by id and due moment) and skips only those, so a stuck record never hides the retry of a failed record that became overdue during a slow upload (a test with a stuck, a failing and a slow record fails on f57d4b9 and passes now; `earliestRetry` became `pendingRetries`, 907 passed). Fourth review round 2026-10-25: `pendingObservations` skips records that cannot be sent before it counts a page of 25, so a stuck record in front no longer ends the drain a record early (a test with one stuck and 49 sendable records, all 49 synced with no user action, sent 48 on 1327e5e and sends 49 now; a store test covers the page). Left as is: the sync effect is still keyed on the access token, because a rebuilt coordinator is how a 401 pause ends after the token refreshes. The simulator check with a failing API and an offline/online toggle is pending (owner).

### MOB-40: A token refresh keeps downloads and installed packages
Status: done (2026-10-23; provider and MeProvider tests; device check pending (owner)) · Phase 4 · Size S · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C10). Every `TOKEN_REFRESHED` (about hourly, and on resume near expiry) gives a new session object; `api` and `PackageOperations` are rebuilt, the effect clears `downloads` and `installed`, disposal aborts the running download with a suppressed error, sites flash "Not downloaded · needs a connection" until the catalog re-hashes every retained version, and MeProvider re-fetches `/v1/me` and every project's sites.
Read first: `src/auth/provider.tsx:160-201`; `src/packages/hosted/provider.tsx:50-104,129,134`; `src/packages/hosted/operations.ts:51-55`; `src/data/api/me-provider.tsx:174` (the audit wrote `auth/`).
Do: key `api`, `operations` and the MeProvider effect on `client`, `userId` and `session !== null` instead of the session object (the token getter already reads the current session per request); hold `markAccountDeleted` in a ref. Keep every generation/`current()` fence and the catalog run at start.
Done when: a provider test replaces the session object for the same user mid-download: the download completes, `installed` is unchanged and the catalog does not run again; sign-out still disposes operations.
Verify: `pnpm mobile:test`; on a simulator, a short local JWT expiry during a large download.
Verified 2026-10-23: `HostedSitesProvider` and `MeProvider` key `api`, `operations` and the `/v1/me` effect on `client`, `userId` and `session !== null`; `MeProvider` holds `markAccountDeleted` in a ref. `provider-download.test.tsx` (real provider, SQLite and package files) replaces the session object for the same user while version 9 downloads over an installed version 8: the download keeps running and completes, `installed` is the same array, `operations` is not rebuilt, the catalog runs 0 more times, nothing is disposed (on master the progress vanished, `installed` was replaced, the catalog ran again and version 9 never installed); a request after a refresh sends the new access token; sign-out, losing the session and a different user each dispose the running operations and clear downloads and `installed`. `me-provider.test.tsx` (new, 6): a same-user session replacement reads `/v1/me` once in total (twice on master), the newest `markAccountDeleted` is the one called, a different account hides the first account's profile at once and reads again, sign-out reads nothing, and a regained session reads again. `pnpm mobile:check` (TypeScript and Biome clean; infos only) and `pnpm mobile:test` (847 passed, 5 skipped) under Node 24.22.1. **Device check pending (owner):** on a simulator, set the local stack's `jwt_expiry` to 150 s (it must stay above supabase-js's 90 s refresh margin), download the largest package on a throttled connection and stay in the foreground through two token refreshes: the progress continues to "Ready offline", other sites never read "Not downloaded", and the API log shows no `/v1/me` or `/sites` read at a refresh.

### MOB-41: Draft writes are honest, and an unreadable draft can be discarded
Status: done (2026-10-28; real-store session tests, screen tests, `pnpm mobile:check`, `pnpm mobile:test` 1138 passed, 5 skipped, after merging master with MOB-36 and the start timestamps; device check pending (owner)) · Phase 4 · Size M · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C08). Reproduced with the real stores: a Review-row tap while "Saving on this device…" re-inserts a draft carrying the committed id, so the next observation's `saveDraft` throws `DraftConflictError` (that observation then lives only in memory) and recovery fails with a UNIQUE error. Any draft-write failure only sets `session.status`, which no Collect screen shows, while `CollectScreen.tsx:423-437` keeps saying "Draft kept on this device as you answer". An unreadable draft blocks every "Set up this session" with no card to discard it.
Read first: `src/features/collect/CollectScreen.tsx:423-437`; `ReviewStep.tsx:171-177,229-232`; `src/session/draft-persistence.ts:29-38,88-95`; `src/session/observation-actions.ts:82-85,128-138,191,221`; `src/session/session-controls.ts` (`chooseZone`); `src/session/recovered-drafts.ts:63`; `src/features/projects/UnfinishedCard.tsx:63-101`.
Do: drive the Collect status line from the last draft-write result ("Not kept: this observation is only in memory. Save it now." on failure); disable Review rows and the "Keep answering"/"Discard observation" links while saving; add an UnfinishedCard variant for an unreadable draft with a confirmed Discard through the existing `discardRecovered`.
Done when: unit tests show no ghost draft when a commit and a queued save race; a forced `saveDraft` failure renders the "Not kept" line; a screen test shows an unreadable draft's card with Discard, after which "Set up this session" works.
Verify: `pnpm mobile:check`, `pnpm mobile:test`.
Verified 2026-10-25: while a save commits, a Review-row tap, a nudge, an edit and a second save are refused and no draft write is queued, so no ghost draft carries the committed id and the next observation's draft is kept (`draft-honesty.test.tsx`, real SQLite stores; on the base the ghost draft was there and the next `saveDraft` threw `DraftConflictError`). `persistDraft` now returns the write's result; the session keeps the newest write's outcome as `draftWriteFailed` (cleared by the next good write, by a new observation and by discard), and Collect's status line says "Not kept: this observation is only in memory. Save it now." instead of "Draft kept on this device as you answer", also while a phone keyboard hides the status row, and the Leave alert says the same. Review rows, "Keep answering" and "Discard observation" are disabled while the record is stored. A new "A draft this app cannot read" card (Projects and the site screen) offers a confirmed Discard through `discardRecovered`; after it a map opens again. The #42 draft pruning and the single-transaction commit are unchanged. **Device check pending (owner):** on an iPhone, an Android phone, a Samsung Galaxy tablet and an iPad, portrait and landscape: place a point, answer, open Review and tap Save, then at once a row and "Discard observation" (nothing happens until Saved shows); collect a second observation and force-quit: Resume offers it. With a debug build holding a corrupted draft payload: Projects shows the card, Discard asks first, and "Set up this session" then opens the map.

Verified 2026-10-28 (review round 1): `chooseZone` was the one session action that still changed memory while a save commits; the case above chose the zone that was already open, so it could not tell. With a second zone, Place in the step strip, a cross moved into it and "Switch to" during a pending save moved the screen's zone and the observation's binding while the draft write was dropped, so after a failed save the screen showed zone B, the stored draft still held zone A, and `draftWriteFailed` stayed false (a restart before the next edit would have lost the change). `chooseZone` now returns without changing anything while a commit is in flight, as nudge, edit and save do (`session-controls.ts`), and works again once the save has failed. `draft-honesty.test.tsx` drives the real stores on a practice map and on a managed map (whose binding pins the zone): chosen during a failed save, the zone, the binding and the stored draft all stay as they were, and the choice then goes through; it fails on the unguarded code (2 failed) and passes with the guard. A second case shows that placing, starting a zone inventory, choosing the round type, toggling the fresh period and discarding in the same window change nothing; those were already refused (the round and the fresh period by the open-observation rule, the others by MOB-41's guards). The start-timestamp harness `observation-timestamps.test.ts` gains the `committing` input. Check: targeted vitest for `src/session`, `src/features/collect` and `src/features/projects`, `mobile:check`, `mobile:test` 1138 passed, 5 skipped, `forms:parity`, `tokens:check`, `plan:check`. Not fixed, out of scope: the screen still announces "Zone changed to ..." or "Point moved." for a tap the session refused in that window.

### MOB-42: Delete pre-launch compatibility and write-only persistence
Status: done (2026-10-24; `pnpm mobile:check`, `pnpm mobile:test`, `EXPO_NO_DOTENV=1 npx expo export` for iOS and Android, `pnpm forms:parity`, `pnpm tokens:check`, `pnpm plan:check`; no device step) · Phase 4 · Size M · Depends: none · Blocks: MOB-44
Added 2026-10-22 (audit C19, D31). The pre-launch policy makes these plain deletions, and they must land before the last sanctioned reset (MOB-44).
Read first: `src/data/legacy/scope.ts` (a constant API URL `127.0.0.1:8000`, the hosted issuer and a fixed project id); `src/auth/session-retention.ts:27-31`; `src/storage/session-store.ts`; `src/storage/database-migrations.ts:48-50`; `src/packages/package-references.ts:20-24`; `package-catalog-read.ts:70`; `packages/hosted/operations.ts:216` (`operations.selected`); `src/sync/provider.tsx:100` (`activateHeldObservations` every drain); `src/platform/auth-storage.ts:9,81-95` (`legacyStorageKey`, `migrateLegacySession`); `app.config.ts:18` (three URI schemes; expo-linking ignores two).
Do: replace the frozen legacy owner scope with one built from the configured connection and the user id; delete `session-store`, `active_sessions`, `package_selections`, `readSelected`, `selectPackage`, `operations.selected`, `activateHeldObservations`, `migrateLegacySession`, `legacyStorageKey` and the `DECAMark`/`fieldmaps` schemes (keep `decamark`); delete the tests that pin them (the four `migrateLegacySession` tests; rename other uses of the key to a local test constant). Do not bump `SCHEMA_VERSION` here; MOB-44 bumps it once.
Done when: account-isolation and outbox tests pass with the new scope; `grep -rn "legacy" mobile/src mobile/app` finds only test names that describe removed behaviour, or nothing; the bundle still exports for iOS and Android.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`.
Verified 2026-10-24: the owner scope is built by `accountWorkspace(account, connection)` from the configured API URL, the Supabase URL (the issuer) and the user id (a test fails on the old frozen constants, passes now); `src/data/legacy`, `session-store`, `active_sessions`, `package_selections`, `readSelected`, `selectPackage`, `operations.selected`, `migrateLegacySession`, `legacyStorageKey`, the `DECAMark`/`fieldmaps` schemes and the `activateHeldObservations` call in `SyncProvider` are gone, and `installPackage` lost its `select` argument. `SCHEMA_VERSION` is unchanged (MOB-44 bumps it); the two retired tables are no longer created and a reset test shows they are dropped. Left for MOB-43: `activateHeldObservations` itself and its tests (`sync-store.test.ts`, `bound-upload-store.test.ts`) stay, uncalled; MOB-43's Do now lists them. The `legacy` grep over `mobile/src` and `mobile/app` is empty: the orchestrator approved three comment rewordings in lane B's `sync/receipt.ts` and `app/_layout.tsx` and the `installedFor` test-helper swap in `sync/bound-upload-api.acceptance.test.ts` (listed in pilot-readiness.md). A test (`src/auth/account-workspace-upload.test.ts`) pins the new scope through save, install, upload, receipt and account removal; the scope's fixed placeholder project id (`workspaceProjectId`) goes when lane B's `SyncScope` stops requiring a project, before MOB-44 freezes the key.

Merged with master on 2026-10-25 (after MOB-39 and #42): the sync files take MOB-39's final version with the `activateHeldObservations` call removed again, and #42's `package-actions.test.ts` drops the removed `sessions` reference count; `pnpm mobile:test` 1084 pass, 5 skipped. `grep -rn legacy mobile/src mobile/app` now also finds three test files #42 added for the schema 1 to 2 upgrade (`observer-role.test.ts`, `packages/hosted/schema-upgrade.test.ts`, `storage/capture-upgrade.test.ts`); that upgrade is live behaviour the owner chose in #42, not pre-launch compatibility, so it is left as it is.
### MOB-43: Training and every form come from the server
Status: todo · Phase 4 · Size L · Depends: BE-24, DB-20 · Blocks: MOB-44
Added 2026-10-22 (D32, D4). Supersedes MOB-13 steps 3–4 ("explicit local practice", "keep local practice held") and the `sample-garden` part of MOB-15 step 1. Hosted sites already download their forms with the package (D27); only the bundled practice and Fall Creek packages and their compiled forms remain hard-coded.
Read first: CON-07 (`contracts/README.md` "Form schema version"); `src/forms/registry.ts` and `src/forms/fixtures/*` (compiled from `contracts/forms`); `src/packages/bundled.ts` (Practice garden, bundled Fall Creek); `src/session/round-forms.ts`; `src/domain/observation.ts:33-143` (`shellObservationSchema`, `isShellObservation`) and `build-observation.ts:51`; `src/storage/observation-store.ts:27-31` (local-only); the device-projects mapping of `is_training`; DB-20's Training seed.
Do: the Training project's practice site downloads like any hosted site with its package and forms; practice records are ordinary bound observations of the Training project and upload to it (exports and analysis exclude `is_training`); delete the bundled packages, the form fixtures and registry entries, the `shell-v1` record shape and the `local-only` state; delete `activateHeldObservations` (it promotes `local-only` rows) and its tests in `sync-store.test.ts` and `bound-upload-store.test.ts`; `formForRound` reads only package forms; the field guide and Saved stop describing practice as never uploaded (MOB-37's interim copy goes). Keep the form engine (code) byte-identical with the web copy (`pnpm forms:parity`). Package install and every form read go through `parseServedDefinition(schema_version, definition)` with the number BE-24 serves; a site whose form carries a schema version the app does not know is refused with "Update DECA Mark to use this form" and nothing of it is installed.
Done when: a fresh account on the local stack joins Training, downloads Practice garden, collects in Standard, Reliability and Inventory rounds and uploads to the Training project; `grep -rn "contracts/forms" mobile/src` finds only tests; no screen shows "held" for practice. A unit test installs a package whose form is served with schema version 2 (and one with none) and the site is refused with that sentence.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, `pnpm forms:parity`, a simulator run on the local stack.

### MOB-44: The last sanctioned reset, then forward-only collector migrations
Status: todo · Phase 4 · Size M · Depends: MOB-42, MOB-43 · Blocks: QA-08
Added 2026-10-22 (D31, audit C20). Today any `SCHEMA_VERSION` mismatch drops every table, unsent observations and drafts included (`database-migrations.ts:61-80`); that is allowed only until the pilot starts.
Read first: `src/storage/database-migrations.ts`; `src/storage/initialize-collector.ts` (`package_files_need_reset`); `database-migrations.test.ts`; D31.
Do:
1. Bump `SCHEMA_VERSION` once, after MOB-42 and MOB-43, as the last sanctioned reset; this is the schema the pilot build ships with.
2. Replace drop-all with an ordered list of forward migrations (`user_version` N → N+1 steps, each in a transaction), starting empty at the pilot schema.
3. From now on, a version the app cannot migrate refuses to start collection and says why ("This version cannot read the records on this device. Update DECA Mark; nothing was deleted."); it never drops a table that holds unsent observations or drafts.
4. Rewrite the reset test: it now asserts the guard and a sample migration, not the wipe (audit TEST-04).
Done when: tests prove a forward migration keeps pending rows and drafts byte-identical, an unknown future version refuses without deleting, and the pilot schema is created fresh on install; `mobile/README.md` states the rule.
Verify: `pnpm mobile:check`, `pnpm mobile:test`; a simulator install over the previous build.

### MOB-45: Collect map and controls work with VoiceOver, TalkBack and Reduce Motion
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C22, the native half of C23, A11Y-08). Moves the pilot-relevant parts of MOB-18 ahead of MOB-16. Three live regions are Android-only (`accessibilityLiveRegion`), so VoiceOver hears nothing when the cross leaves its zone; two messages are announced twice; the map camera ignores Reduce Motion although PRODUCT promises map moves jump; the cluster marker is a 36 pt target with no hitSlop; the password Show/Hide control fails label-in-name; disabled reasons exist only as `accessibilityHint`, which RN 0.86.3 maps to an Android tooltip.
Read first: `src/ui/Note.tsx`, `StatusLine.tsx` (the iOS announce helper), `src/features/collect/CollectMap.tsx` (camera moves, cluster marker), `src/ui/PasswordInput.tsx`, `src/ui/Button.tsx:183-233`; MOB-18.
Do: announce placement and zone changes on iOS through the existing helper, once per change; pass `animationDuration: 0` (or the jump equivalent) to every camera move when Reduce Motion is on; give the cluster marker at least a 44 pt target; make the password control's accessible name contain its visible label; expose disabled reasons as visible text or in the accessibility label.
Done when: unit tests cover single announcements and the reduce-motion camera path; a VoiceOver pass on the iPad simulator and a TalkBack pass on the Android emulator through Place → Answer → Review are recorded in this task.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, the two screen-reader passes.

### MOB-46: Collector preferences in release builds
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C24). Takes over MOB-27 step 4. PRODUCT.md:166 and DESIGN.md promise preferred hand, haptics, larger question text, Dusk and the map palette; today they can be set only in `app/(dev)/` screens.
Read first: `src/ui/preferences.tsx`; `app/(dev)/gallery.tsx`, `states.tsx`; `app/(app)/(tabs)/account/`; PRODUCT.md:166; D19.
Do: a Preferences screen under Account with the five settings, stored per device as today, applied immediately, readable offline; keep the dev gallery for design review only.
Done when: each preference changes the collect screen on the simulator in a release-mode build; tests cover persistence and defaults (Day, haptics on, standard text, palette Day).
Verify: `pnpm mobile:check`, `pnpm mobile:test`, `pnpm tokens:check`.

### MOB-47: A failed site download names the step that failed
Status: todo · Phase 4 · Size S · Depends: none · Blocks: none
Added 2026-10-22 (audit C25). On the simulator the map archive downloaded, `getFormVersion` failed, and the site said "Map v49 did not finish downloading. Nothing was kept; you can try again." Only package and verify errors are classified.
Read first: `src/packages/hosted/prepare.ts`; `operations.ts`; `src/features/projects/HostedPackageIsland.tsx`; `src/data/api/errors.ts`.
Do: classify the failing step (archive, form version, zones, verify, storage) and name it in the message, keeping "Nothing was kept; you can try again."; map no-access and not-found to their existing copy.
Done when: a unit test per failing step shows its own message.
Verify: `pnpm mobile:test`.

### MOB-48: Measure and bound the collector's runtime and bundle cost on pilot devices
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C35, C37). Unmeasured on Hermes: the Observations list and collect map load every record ever kept; the map re-serializes its style on every render; installs keep several whole-package copies and re-verify every version at start. Measured: the lucide icon barrel is about a quarter of the 6.7 MiB iOS Hermes bundle; `expo-font` is used but not declared.
Read first: `src/storage/use-observations.ts`; `src/features/collect/CollectMap.tsx`; `src/packages/hosted/package-catalog.ts`; `src/ui/Icon.tsx:1-86`; `docs/reviews/frontend-audit-2026-10-17/runtime/mobile-checks/bundle-attribution.txt`.
Do: switch `Icon` to per-icon imports (pin the exact lucide version) and declare `expo-font`; then, on a release build on the pilot Android tablet and an iPhone, time `listObservations`, the catalog run and a collect-map render with 50 / 500 / 2,000 records and 1 / 5 / 20 retained versions; bound or page only what the numbers show is slow (for example a `WHERE` and `LIMIT` for the collect map's prior records, pre-stringified style).
Done when: the bundle report shows the icon saving; a dated table of device timings is recorded here with the changes it justified (or "none needed").
Verify: `pnpm mobile:check`, `pnpm mobile:test`, an iOS export bundle report.

### MOB-49: Native flows on the current upload queue (Maestro)
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C14). MOB-21's flows wait for PowerSync (MOB-10); the pilot runs on the current queue (D27), and the audit's highest collector defects (C01, C05, C02) were found only by hand. This task covers the queue-era flows; MOB-21 keeps the PowerSync-era ones.
Read first: MOB-21; `mobile/README.md` (simulator and local stack); `docs/qa/device-checklist-2026-10.md`; `scripts/e2e-local.sh` (local stack).
Do: create `mobile/maestro/` with flows against the local stack: (1) Training → place → answer two questions with the keyboard up (assert the field and Continue sit above the keyboard by frame, MOB-34) → kill → relaunch → Unfinished card → Resume restores the answers; (2) account A saves offline and signs out (the warning names the pause), B signs in and sees none of A's records, A signs back in and the record uploads exactly once; (3) a double tap on a single-choice answer leaves the next question unanswered. Run them on the iOS and Android simulators/emulators of D33.
Done when: the three flows pass on iOS and Android and fail when MOB-34 or MOB-36 is reverted; the run command is in `mobile/README.md`.
Verify: the flows on both platforms, output in the PR.
