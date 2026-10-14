# Mobile collector plan (`mobile/`)

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
Status: todo · Phase 1 · Size M · Depends: MOB-01, MOB-04 · Blocks: MOB-05, MOB-06, MOB-16
Read first: `app/_layout.tsx`, every file in `app/`, `src/auth/provider.tsx`, `src/session/provider.tsx`.
Do:
1. Create the groups `(auth)`, `(onboarding)` and `(app)`. Move the existing screens under `(app)`, unchanged in behaviour.
2. In `_layout.tsx`, use `Stack.Protected guard={…}`, declaring `(app)` before `(auth)`:
   - `(app)`: `session || cachedAccount` (`last-account.json`, MOB-02);
   - `(auth)`: `!session`, so sign-in stays reachable whenever there is no live session;
   - `(onboarding)`: signed in, but the profile has no display name or initials (from MOB-04's cached `/v1/me`).
3. **Offline rule.**
   - A cached account whose session was lost **without** a deliberate sign-out stays in `(app)`. That covers a failed refresh (MOB-08) and `403 account_deleted` before its cleanup (MOB-04).
   - A deliberate sign-out (MOB-07) removes `last-account.json`, so the gate routes to `(auth)`. The records wait on the device for that account, and `(auth)/welcome` shows their counts (MOB-05).
4. Add a `+not-found` route.

Done when:
- a fresh install lands on the welcome screen;
- a signed-in user with a profile lands on Projects;
- the gate-selection tests pass, including:
  - no session, no cached account, but A's queued records present → `(auth)`;
  - no session, cached account → `(app)`;
  - session, no profile → `(onboarding)`.

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
Status: todo · Phase 1 · Size L · Depends: DB-02, MOB-02, MOB-03 · Blocks: MOB-06, MOB-21
Read first: [product.md](../docs/plan/product.md) J2; `app/account.tsx` (current form styles); `DESIGN.md`; the Mobile collector designs, pp. 23–28. MOB-24 builds these screens in Contour on preview data; wire them and keep their layout, with a single primary action at the bottom (thumb zone).
Do:
1. `(auth)/welcome`: app name, "Create account", "Sign in".
   - For each signed-out account with queued or held records, show "N records waiting on this device for {email}". They upload when that account signs in again.
   - Before MOB-09 the counts come from the legacy store, grouped by the `owner_scope` userId (plus `'local'`).
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

### MOB-06: Onboarding: profile and join
Status: todo · Phase 1 · Size M · Depends: BE-06, BE-07, DB-07, MOB-03, MOB-04, MOB-05 · Blocks: MOB-21
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

### MOB-07: Account tab: profile, sync status, sign out, delete account
Status: todo · Phase 1 · Size M · Depends: BE-08, MOB-04 · Blocks: MOB-21, OPS-11
Do:
1. **The Account screen shows:**
   - profile editing;
   - the active project switcher;
   - sync status (pending count, held records, open drafts, last successful sync).
2. **Sign out:**
   - If unsent records, held records or an open draft exist, show a confirm dialog that names each count. Explain that they wait on this device for this account. Before MOB-09 the count comes from the legacy store; after it, from `getUploadQueueStats()` plus the local-only tables.
   - Use `signOut({scope: 'local'})`, and clear the local session **even when offline**.
   - After MOB-09, sign-out closes the user's database (`disconnect()` then `close()`). It never calls `disconnectAndClear()`, which by default also empties local-only tables.
3. **Delete account:**
   - A two-step confirm that names the consequences.
   - Before calling `DELETE /v1/me`, require an empty upload queue. Offer "Upload N records first". Offline with pending work, block unless the user confirms a dialog naming the N records that will be destroyed. Observations already uploaded stay with the organization as research data (J4).
   - Handle `sole_owner` with a message pointing to the web.
   - On 202, retry `DELETE /v1/me` up to 3 times over about 30 seconds **while the session is still valid**, then treat it as done. The server keeps the durable record (BE-08). Treat 204 as done at once.
   - Then sign out and remove **this user's** data only (the shared "remove this account's data" routine below).
4. **"Remove account from this device"** (without deleting the account) runs the same routine after sign-out, behind a confirm dialog that names any unsent records it destroys. The routine:
   - deletes this user's rows and drafts from the shared legacy file if it still exists, before and after MOB-09 (every scope whose `userId` matches), never the file itself, which other accounts share;
   - upserts the MOB-11 ledger to `removed`, if the ledger exists;
   - after MOB-09, closes and deletes `decamark-{userId}.db`, its per-account summary and `last-account.json`;
   - drops this user's package references (MOB-14). A package directory is deleted only when no account references it.
5. At sign-out, write the per-account summary (`documentDirectory/accounts/{userId}.json`: email and counts) that MOB-05 shows.
6. Remove the developer copy from this screen (`app/account.tsx:142-146`).

Done when:
- the flows work on the simulator against the local stack;
- a test with two accounts' records in the legacy file shows that deleting one account leaves the other's records intact.

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
1. Install `@powersync/react-native` 2.3.x and `@op-engineering/op-sqlite` (≥17.1, <19) with `pnpm expo install`.
2. **Create the frozen legacy module first** (`src/data/legacy/`), before anything is deleted. It holds its own copies, not imports, of:
   - the v3 DDL and row schema;
   - the `shell-v1` and `janet-test-v1` payload schemas;
   - the draft schema;
   - the `owner_scope` parser;
   - a fixture builder.

   MOB-10, MOB-13 and this task later delete the originals. MOB-11 uses only this module.
3. Remove `expo-sqlite` and its plugin; MOB-11 reads the old file with op-sqlite.
   - **Port or stub every expo-sqlite consumer in this same task** (`grep -rn "expo-sqlite" app src`), so the app still builds. Today that includes `src/session/provider.tsx`, `src/storage/use-observations.ts` and the storage modules.
   - Records and drafts read from the PowerSync tables, with MOB-10 and MOB-12 finishing the behaviour.
4. Add a config plugin that sets `expo.updates.useThirdPartySQLitePod: true`.
5. Create `src/data/powersync/schema.ts` with:
   - synced tables that mirror the SYNC-02 streams;
   - the local-only tables `drafts`, `package_files`, `migration_state`;
   - `held_observations`: records that must stay on the device, with owner, reason and payload. Examples are a form version not yet published, and practice records saved while signed out.
6. Create `src/data/powersync/db.ts`: one database per user (`decamark-{userId}.db`), opened after the account is known.
   - The connector is **bound to that database's owner**.
   - `fetchCredentials` returns `null`, and `uploadData` throws without calling the API, whenever the current session's user is not the owner.
   - On account change, `await disconnect()` and `close()` before the next account's session is used. A pending batch must never go out with another person's token.
7. Add the provider to `_layout.tsx`, replacing `SQLiteProvider` and `SyncProvider`. Read data with `useQuery` and state with `useStatus`.
8. Connector `fetchCredentials` returns `{endpoint: config.powersyncUrl, token: session.access_token}`, when the owner check above passes.
9. Delete `src/storage/*` once nothing imports it. Keep `src/data/legacy/*` for as long as an old file can exist on a device.
10. **Prebuild and a native rebuild are required.** Record the commands in `mobile/README.md`.

Done when:
- the app builds and typechecks with `expo-sqlite` removed;
- signed in on staging, the simulator shows the user's memberships and projects coming from PowerSync;
- a test shows that signing out A with pending work, then signing in B, uploads nothing of A's with B's token.

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

### MOB-11: One-time migration from the old database
Status: todo · Phase 2 · Size L · Depends: MOB-09, MOB-10, MOB-12 · Blocks: QA-03
Read first:
- `src/data/legacy/*` (created by MOB-09 from `src/storage/observation-store.ts`, `src/sync/contracts.ts` and `src/storage/draft-store.ts`)
- [sync-powersync.md](../docs/plan/sync-powersync.md)

Do:
1. **Use only the frozen legacy module** that MOB-09 created in `src/data/legacy/`. MOB-09, MOB-10 and MOB-13 delete the originals.
2. **The old file is shared by every account that used the device.** Each row's `owner_scope` is either `'local'` (saved while signed out) or the JSON array `[apiUrl, issuer, userId, projectId]`.
   - Match rows on `issuer` + `userId` only. `apiUrl` and `projectId` changed between builds, so one user can own several scopes.
   - Take the envelope's `project_id` from the scope's `projectId`: the legacy practice project `…-0002` keeps existing (D13). Map site `sample-garden` to `10000000-0000-4000-8000-000000000003`.
3. **Find the file through the file system, never by opening it.** Opening creates an empty database.
   - The path is `new File(Paths.document, 'SQLite', 'fieldmaps-shell.db')`: expo-sqlite's default directory, `<Documents>/SQLite` on iOS and `<files>/SQLite` on Android.
   - Open it in place with op-sqlite's absolute location constants (`IOS_DOCUMENT_PATH` / `ANDROID_FILES_PATH` + `/SQLite`). op-sqlite resolves relative names against a different directory.
   - Never copy the `.db` without its `-wal` and `-shm`. The last commits before a force-quit may live only in the WAL.
4. **When an account signs in** and its `decamark-{userId}.db` is open, the old file exists, and this user's `migration_state` is not `copied`: in one `writeTransaction` on this user's database, copy only this user's rows, across all of their scopes.
   - `pending` and `needs-attention` rows go into `observations`, as PUTs. Keep each UUID, skip ids already present, map `shell-v1` to its server form version, and convert numbers to JSON numbers.
   - `synced` rows are **never queued**.
     - Their `server_receipt` shows that the server accepted them, and the server copy returns through `my_observations`.
     - The stored `apiUrl` cannot tell where a row went: since MOB-01 every key carries the frozen `http://127.0.0.1:8000`.
     - Copy each one into `held_observations` with reason `legacy_synced`, read-only and never uploaded. The Observations list hides it once the same id is in `observations`.
   - `local-only` rows of this account (for example `janet-test-v1` records held because the form was a draft) go into `held_observations` with reason `unpublished_form` and their legacy form code. MOB-13 defines how they are queued, exported or discarded.
   - Drafts are rewritten to the new draft shape and owner key. An unparseable one goes to a quarantine table; it is never deleted.
   - Write `migration_state = copied` in the same transaction.
5. **`'local'`-scope rows** (signed out, so no owner) are practice records. They are copied into `held_observations` only after an explicit prompt: "Keep N practice records from before you signed in?" Nothing is copied silently to whichever account signs in first.
6. **A device-level ledger inside the old file:**
   - `CREATE TABLE IF NOT EXISTS migration_ledger (owner TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('copied','uploaded','removed','declined')), updated_at TEXT NOT NULL)`, where `owner` is a userId or `'local'`.
   - `'local'` becomes `copied` when an account claims those rows, and `declined` when the prompt is declined. The prompt is then never shown again.
   - Upsert `(userId, 'copied')` after step 4 commits.
   - Upsert `(userId, 'uploaded')` once this user's queue is empty after a completed sync.
   - MOB-07's delete path upserts `(userId, 'removed')`.
7. **Delete the old `.db`, `-wal` and `-shm` together only when:**
   - every owner of a `pending`, `needs-attention` or `local-only` row, or of a draft, has ledger state `uploaded` or `removed`; and
   - the `'local'` owner's state is `copied` or `declined`.

   Until then the file stays for the next account to sign in. Rows from another issuer can never be migrated by this build: they keep the file; log them once.
8. Every step must be safe to repeat after a force-quit.

Done when tests run with a real v3 fixture database, built by the frozen legacy module, that cover:
- two accounts with pending records;
- a `synced` row with a receipt, which produces no upload and no rejection;
- a WAL-resident pending row;
- a `janet-test-v1` record belonging to a signed-in account;
- `'local'` rows;
- a force-quit at each step.

A simulator upgrade run is recorded in QA-03.

### MOB-12: Drafts on PowerSync local-only tables
Status: todo · Phase 2 · Size M · Depends: MOB-09 · Blocks: MOB-11, MOB-13
Do:
1. Port `src/storage/draft-store.ts` and the ownership rules (`src/session/ownership.ts`) to the local-only `drafts` table.
2. Key drafts by `(user, project, id)`, so more than one project can have an open draft.
3. Keep every existing draft test, adapted.
4. A draft that fails to parse, or whose owner does not match, moves to a quarantine table. It is never deleted: the old `readDraft` deletes such drafts, which would destroy every migrated draft on first read.

Done when: the draft tests pass, and a force-quit mid-observation offers Resume or Discard.

### MOB-13: Forms from the server, and a generic observation record
Status: doing (2026-10-08: on the existing upload queue per D27, a hosted site's published forms download with its package and records upload with their project; the PowerSync parts remain) · Phase 2 · Size L · Depends: CON-02, DB-09, MOB-09, MOB-12 · Blocks: MOB-15
Read first: `src/forms/registry.ts`, `src/domain/observation.ts`, `src/domain/build-observation.ts`, `src/session/provider.tsx:340-360`; the envelope in [contracts.md](../docs/plan/contracts.md#observation-envelope-sync-upload-and-storage).
Do:
1. The registry becomes an async repository over synced `form_versions`, published and retired.
   - New observations may start only on a published version.
   - Drafts and records render with their own version, even after it is retired.
   - Every definition passes `parseFormDefinition` before use. One that fails is shown as "form unavailable"; it never crashes the app.
2. Replace the version-literal union in `observation.ts` with the generic envelope:
   - answers keyed by question `id`;
   - numbers as numbers;
   - `observer_code` taken from the profile;
   - the round context (`round`, `context`) and placement (`gps_accuracy_m`) fill the envelope fields that carry them. Test that none are dropped.
3. Move the summary question and carried-forward answers into definition properties, since `janet-test-v1` currently hard-codes them in TS.
4. Delete `src/forms/fixtures/*`. The tests load `contracts/forms/*.json` instead. MOB-11's frozen legacy module keeps its own copies.
5. **Held records (`unpublished_form`) have three actions**, on the record and in bulk:
   - **Upload.** Offered only for a published form version that the **user picks**, among the versions they can collect for, and only if every held answer's question id exists in that version. There is no automatic match: the legacy code `janet-test-v1` names no server version (Training uses `training-v1`, and Janet's own version gets its own id). Accepting converts the records into `observations` inserts against the chosen project, site and version.
   - **Export.** Share a JSON or CSV file through the system share sheet.
   - **Discard**, behind a confirm dialog.

Done when: the brief, field and review screens work against a synced published form. The shared cases pass, and no TypeScript branches on a form version string.

### MOB-14: Hosted site packages
Status: doing (2026-10-08: sites list, archive download checked against its digest, offline storage and removal work on the existing upload path per D27; Storage-backed delivery and the cellular policy remain) · Phase 2 · Size L · Depends: BE-13, MOB-09 · Blocks: MOB-15
Read first: `src/packages/site-package.ts`, `src/packages/bundled.ts`, `src/maps/field-map.tsx`; the manifest format in `backend/src/fieldmaps_api/domain/packages.py` (moved there by BE-03).
Do:
1. Project and Site screens:
   - sites from sync, with `current_package_id`;
   - status "On device", "Download (12 MB)", or "Update available (v4 → v5)".
2. Download:
   - `GET …/packages/{id}/download` returns a signed URL;
   - download to `documentDirectory/packages/{id}/archive.zip.partial` with expo-file-system;
   - verify the sha256 (expo-crypto);
   - unzip with `fflate`;
   - verify each layer's sha256 against the manifest;
   - atomically rename, and record it in `package_files`.
3. **Cellular policy.** When NetInfo reports `isConnectionExpensive`, ask first and show the size. Wi-Fi downloads start without asking.
4. `HostedPackageProvider` implements `PackageProvider` and maps the manifest to `SitePackage`. Bases are built from `ground` as `sample-site.ts` does today; zones come from polygons with their centroids; the style is a client preset.
5. **Retention.**
   - Package directories are device-level (`documentDirectory/packages/{id}`), shared by every account on the device.
   - A device-level `packages/index.json` records which user ids reference which package id.
   - Retention and account deletion (MOB-07) remove a directory only when no account references it, and no draft or pending record of any account uses it.
   - On open, check that a `package_files` entry still exists on disk.
6. Delete `src/packages/bundled.ts`. The Training site comes from the server (BE-13 step 6).

Done when:
- a staging package downloads, verifies and opens in the field map;
- tests cover a sha256 mismatch, a partial download that resumes cleanly, and retention across two accounts.

### MOB-15: Remove the remaining fixtures and developer copy
Status: todo · Phase 2 · Size M · Depends: MOB-13, MOB-14 · Blocks: MOB-16, QA-05
Do:
1. Walk the mobile rows of the [fixture inventory](../docs/plan/architecture.md#fixture-inventory). Delete `src/maps/sample-site.ts` if it is unused, and the `"sample-garden"` literal.
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

### MOB-22: Map palettes on the field map (Day, Night, Aerial)
Status: doing (code and tests in place 2026-10-01; not yet run on a device) · Phase 1 · Size S · Depends: none · Blocks: none
Added 2026-10-01 after Janet found the QGIS layers hard to read on the dark plan (decision D18 in [decisions.md](../docs/plan/decisions.md)).
Do: read `contracts/map-palettes.json` in `src/maps/palette.ts`; build every plan base and layer paint from a palette; replace the Plan/Aerial toggle with a Day · Night · Aerial control, Day by default, remembered for the app session.
Done when: the field map opens in Day on a simulator or device, the QGIS surfaces read clearly, and Night and Aerial still match today's look.
Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test` (142 tests passed on 2026-10-01), plus a recorded device or simulator check.

### MOB-23: Contour foundation (mobile)
Status: todo · Phase 1 · Size L · Depends: none · Blocks: MOB-24, MOB-25
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
Status: todo · Phase 1 · Size L · Depends: MOB-23 · Blocks: none
Added 2026-10-03. These screens run on preview data, except sign-in, which keeps the real `signInWithPassword`. MOB-03 (gates on the real session and profile), MOB-05 (auth calls) and MOB-06 (profile and join) later wire them without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Mobile collector pp. 23–31; `app/account.tsx`, `src/auth/*`.
Do:
1. `(auth)`: welcome ("Fieldwork starts here."), sign-in, create-account, verify, forgot-password and reset-password.
2. `(onboarding)`: profile (1 of 2, "Your observer identity"), join (2 of 2, with Scan QR) and `invitation/[code]` ("Join Play Study?"), which the join deep link opens with the code filled in.
3. `Stack.Protected` gates in `_layout.tsx` over `(auth)`, `(onboarding)` and `(app)`, with MOB-23's dev-only override.
4. Codes are one wide mono field with a counter: a paste is cleaned, the field submits by itself at the 6th digit, a wrong code reselects it, and the resend countdown is mono. Join codes are uppercased as you type. Password checks update live, "Does not match yet" appears only after blur, and a disabled button always carries its reason.
5. Every screen: a heading with `accessibilityRole="header"`, errors announced, keyboard avoidance, targets of 48 pt or more, and every error state in the designs, in Contour wording.

Done when: each screen matches its design page on a phone in Day and Dusk; codes paste and submit by themselves; unit tests cover the gate selection and the code-field cleaning.

Verify: `pnpm --dir mobile typecheck && pnpm --dir mobile lint && pnpm --dir mobile test`, `pnpm tokens:check`, `EXPO_NO_DOTENV=1 npx expo export --platform ios` and `--platform android` from `mobile/`, plus the simulator checklist in the PR (VoiceOver from sign-in to join).

### MOB-25: Shell, projects, sites and the session brief
Status: todo · Phase 1 · Size L · Depends: MOB-23 · Blocks: MOB-26, MOB-27
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
Status: todo · Phase 1 · Size L · Depends: MOB-25 · Blocks: none
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
Status: todo · Phase 3 · Size L · Depends: MOB-33, BE-22, MOB-30, MOB-31, MOB-32 · Blocks: QA-07
Owner: Mobile data agent with Claude UI owner.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md), [component specification](ZONE-BOUNDARIES.md) and [UI plan](ZONE-BOUNDARIES-UI.md) sections 4.5, 6, 7 and 9.
Do: Freeze session forms/package/zone, apply geometry parity (reusing MOB-31's `coveringZones`) and the sole `/v1` upload/receipt validation; store structured rejection codes for the needs-attention copy in UI plan 4.5; run the physical-device scenario.
Done when: Physical-device draft survives newer publication and restart, uploads with original attribution; inventory is whole-zone.
Verify: Mobile checks/tests and physical-device acceptance matrix; missing evidence remains pending.

### MOB-30: Show map versions, updates and safe removal
Status: todo · Phase 3 · Size L · Depends: MOB-33 · Blocks: MOB-29
Owner: Claude mobile UI owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) MUI-1, MUI-2, MUI-5, MUI-6, MUI-8, MUI-10, 4.1 to 4.3 and 6; `app/(app)/(tabs)/(projects)/**`; `src/features/projects/*`; `src/features/preview/hosted-sites.ts`.
Do: Drive readiness and labels from MOB-33's read models over MOB-28's verified catalog; show available versus installed versions, update Notes, per-part download progress, older maps with reference-checked removal, last check and "Check for updates"; open the newest verified installed package for a session; reset visible state on account change.
Done when: With map v1 installed and map v2 published, every screen in UI plan 4.1 to 4.3 shows the documented state in device mode; removing a referenced map is refused with its reason.
Verify: `pnpm mobile:check`, `pnpm mobile:test` (label and state mapping tests), simulator screenshots of each state.

### MOB-31: Make placement boundary-aware
Status: todo · Phase 3 · Size L · Depends: MOB-33 · Blocks: MOB-29
Owner: Claude mobile UI owner; the mobile data agent reviews geometry parity.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) MUI-3, MUI-4, MUI-5, MUI-9 and 4.4; [contract](../docs/plan/zone-boundaries/contract.md) "Point attribution"; `src/maps/geometry.ts`; `src/features/collect/*`; `contracts/zones/geometry.cases.json` (`coverage_cases`).
Do: Add `coveringZones` and `nearEdge` with a Vitest adapter over every coverage case; replace the PlaceStep readout with the five placement states, the edge choice and the disabled reasons; add the ReviewStep save re-check, inventory tap candidates, the spotlight hole fix, and version labels in the collect header and Saved card.
Done when: Every coverage case passes as an unordered set; each placement state renders in component tests.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, simulator walkthrough of the five states on phone and tablet with VoiceOver.

### MOB-32: Resume exact drafts and explain recovery
Status: todo · Phase 3 · Size M · Depends: MOB-33 · Blocks: MOB-29
Owner: Claude mobile UI owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) MUI-7, 4.3 and 4.6; `src/features/projects/UnfinishedCard.tsx`; `app/(app)/(tabs)/(projects)/[project]/[site]/brief.tsx`.
Do: Render every unfinished-observation status with its actions, block "Start collection" while an unfinished observation would be overwritten, and add the field guide sections on map versions, zone edges and outside-zone points.
Done when: Each status in UI plan MUI-7 renders with its actions in component tests; no path substitutes a zone or a newer map.
Verify: `pnpm mobile:check`, `pnpm mobile:test`, simulator check of a resume after force quit and of a missing-map recovery.

### MOB-33: Provide bound session and package read models
Status: done (2026-10-14: data implementation and local acceptance complete; the Claude UI owner acknowledged the interface; [handoff](MOB-33-HANDOFF.md)) · Phase 3 · Size L · Depends: MOB-28, BE-22 · Blocks: MOB-29, MOB-30, MOB-31, MOB-32
Owner: Mobile data agent; the Claude mobile UI owner acknowledges the interface.
UI-owner acknowledgment (2026-10-14, Claude mobile UI owner): `src/packages/zone-read-models.ts` is accepted as the MOB-30 to MOB-32 interface. `SiteVersions`, `Pinned` and `Recovered` carry the meanings of [UI plan](ZONE-BOUNDARIES-UI.md) section 6, with two documented additions taken as they are: `references.retained` (synced records that still need local detail, so removal is never enabled from unsent counts alone) and the action name `downloadPackage`. The screens read `useSiteVersions(siteId)`, `useRecoveredDraft()` and `useFieldSession()` (`pinned`, `parked`, `beginVisit`/`endVisit`, `chooseZone`), and MOB-31 builds its placement candidates on `zoneCovers` (`src/maps/zone-boundaries.ts`). Checked on `4eaf103`: `pnpm mobile:check` (TypeScript and Biome, 12 infos) and `pnpm mobile:test` (554 passed, 1 skipped) under Node 24.21.0.
Read first: [component specification](ZONE-BOUNDARIES.md) MOB-29; [UI plan](ZONE-BOUNDARIES-UI.md) MUI-1, MUI-4, MUI-7, MUI-11 and section 6.
Do: Add site discovery on the single site API (MUI-11); package readiness with no box fallback; the frozen bound session context with zone UUIDs; exact-version form loading; parked drafts; persist a zone change on an open observation in the same handler; and write `src/packages/zone-read-models.ts` (SiteVersions, Pinned, Recovered, hooks and an in-memory fake), extending `SiteZone` with `zoneId` and `displayAnchor` and removing the box fallback. A local schema change resets local data instead of migrating it (pre-launch rule).
Done when: The read models are populated from real stores in unit tests; a 404 shows as no access; switching zone on a shared edge then killing the app restores the chosen zone; the UI owner has acknowledged the interface file.
Verify: `pnpm mobile:check`, `pnpm mobile:test` with site-list failure, parking and zone-persistence cases.
