# DECA Mark mobile collector

Current checkpoint, 2026-10-15: offline package retention, bound sessions/recovery and zone-aware screens are implemented locally. **MOB-29’s bound foreground uploader is implemented and locally verified through automated and disposable API/QGIS acceptance.** Exact immutable upload bodies, full receipt identity checks, structured rejections and reconnect/resume/retry are wired through the existing outbox. See [current acceptance evidence](../docs/reviews/mob29-2026-10-15/README.md) for mobile checks, actual disposable HTTP/SQLite replay/export and native QGIS readback. Simulator/VoiceOver and the physical iPad/Android collector scenario remain pending. Newly merged MOB-03/05/06 provide real gate/Auth/profile/join behavior with local Supabase Auth/Mailpit/API acceptance; the simulator walkthrough remains pending. MOB-07 adds Contour account/profile/sign-out/deletion screens, while account cleanup and upload-action/copy integration remain open. Use [the current roadmap](../docs/plan/current-state.md) and [mobile task status](PLAN.md) for the next sequence; older results below retain their original dates and scope.

A native iOS/Android collector for observational play research: a researcher on a playground
marks a child on a site map and answers a conditional questionnaire, usually offline, often
one-handed, often in sun. This app is independent of the Next.js prototype in `../web/`. The
[product workspace](../docs/Workspace.md) provides root command aliases while preserving this
app's dependencies and lockfile.

The interface is moving to **Contour**, the design system it shares with the web workspace
([`DESIGN.md`](../DESIGN.md)). Its tokens live in [`../contracts/contour.json`](../contracts/contour.json),
which this app reads in `src/ui/tokens.ts`; the primitives live in `src/ui/`, and
`app/(dev)/gallery` shows them in both themes. Day is the default; Dusk is a preference
("Screen: Day · Dusk" in Preferences). The map keeps its own palette (Day, Night) from
[`../contracts/map-palettes.json`](../contracts/map-palettes.json), and UI state colours never
appear on it. Words are Geologica; IDs, versions, codes and counts are Spline Sans Mono. Icons are
Lucide (`lucide-react-native`) plus a two-bar held glyph. MOB-23 to MOB-27 carry the move; until a
screen moves, it follows `../designs/Riverside Collector v2.dc.html` and the previous design
system in `../designs/_ds/nocturne-0f5393a7-e60a-4d31-be24-f93ea06f52be/`. On the field map,
tablet landscape (1024×768) is the primary target, then phone landscape (844×390); in portrait the
map stacks over the panel. Every screen, the field map included, runs in portrait or landscape on
both, and its content spans the full window width — a deliberate departure from the design file's
600px reading column.

## What is implemented

- **Offline package lifecycle (MOB-28).** Verified immutable installs, account grants, selected versus available versions, exact recovery and reference-checked removal. Pre-launch schema changes reset incompatible collection data and package caches; same-schema restarts preserve current work. See [the data handoff](PACKAGE-LIFECYCLE.md). MOB-33 now provides bound collection/read models and parked recovery; bound uploads remain MOB-29. See [the UI handoff](MOB-33-HANDOFF.md).

- **Collect on Contour (MOB-26), one route with internal steps.** `app/(app)/collect.tsx` and
  `src/features/collect/` run Place → Answer → Review → Saved for play events, and Zone → Answer →
  Review → Saved for an Inventory round. MapLibre stays mounted across every step. Phones stack the
  map over the panel; tablets and landscape put them side by side with the panel on the preferred
  hand. X and Android back ask "Leave? Your draft stays on this device"; back also steps back.
- **Placing a point works like iPhone Maps' "choose a point" (Janet, 2026-10-07).** An × marks the
  exact coordinate at the centre of the map and the pin floats above it with a clear gap, so the
  spot is never covered; the pin's head is open, so the plan shows through it. The map moves under
  the cross: the pin lifts while it moves and drops, with a light haptic, when it settles. A tap
  brings the tapped spot under the cross. Nothing is placed until "Place point here", which reads
  the map's exact centre. The panel shows the coordinate, the ground one screen point covers
  ("1 pt ≈ 6 cm"), whether the cross is inside the session's zone (and which zone it is in if not,
  with "Switch to Zone C"), a "Zoom in to place" hint when the zoom is too coarse, and a half-metre
  nudge pad as the gesture-free alternative. "Adjust point" re-enters placement on the point and
  keeps every answer.
- **Three rounds for every project: Standard, Reliability and Inventory** (`src/domain/rounds.ts`).
  They replace the numbered rounds. Standard and Reliability collect play events (reliability
  records are marked for comparison); an Inventory round records `janet-inventory-v1` — weather,
  wind, shade and the seven loose-parts quantities with their item lists, from workbook rows 13–32 —
  once per zone, with the zone chosen from a list or by tapping it on the map. An inventory record
  belongs to its whole zone: it is stored at the zone's centre with `placement.source = "zone"` and
  is never drawn as a play event. Drafts and records saved with a round number read as Standard.
- **The map**: the session's zone outlined with the rest of the site dimmed; zone names in pills,
  with a check once a zone's inventory is saved; prior observations drawn on the GPU (this
  session's at full strength), clustered into counts below zoom 18 and opening a callout; zoom,
  "Frame this zone", Layers (Day plan, Night plan, aerial; each site layer; all, this session's or
  no observations) and a full-map toggle, all 44 pt with 48 pt targets; an honest scale bar
  ("0–10 m · north ↑") computed for MapLibre's 512-point tiles.
- **One question per screen.** A single choice moves on by itself after 160 ms; multi-select and
  text wait for Continue, which reads "Skip for now" until something is answered. The next
  question fades in and the screen reader moves to its heading; the progress bar has one segment
  per act the form actually asks.
- **A reusable form engine** (`src/forms/`) built from versioned definitions: stable question and
  option identifiers, a restricted declarative condition format, dynamic option sets, and
  validation of duplicate export columns, dangling references and dependency cycles. Workbook
  rule text is carried as provenance and never executed.
- **Shared JSON contracts** in [`../contracts/`](../contracts/README.md). The fixture modules import the canonical definitions; `pnpm contracts:forms` generates their input JSON Schema. Python and mobile tests share cases for visibility, hidden-answer pruning, types, duplicate selections, options, numeric ranges, text limits and Unicode whitespace. Numeric answers remain numbers in session state, drafts, exports and stored observations. BE-10's local database upload/readback acceptance passed on 2026-10-03.
- **Generated API types and typed errors.** `pnpm api:types` reads the backend OpenAPI contract. The shared client maps coded failures through `src/data/api/errors.ts`; MOB-29’s bound receipt/rejection integration is implemented with local automated/disposable API/QGIS acceptance. Unknown or malformed errors remain retryable with the local record preserved.
- **Two form versions side by side.** The original practice form is now the `shell-v1`
  definition for local practice; bundled practice records do not upload. `janet-test-v1` implements the
  candidate subset in [the Janet scope](../docs/Janet-Test-Form-Scope.md) — timestamp and
  initials, play event summary, child age range, both play type slots with their subtypes, CARS
  intensity, and the wildlife branch — excluding all 16 hidden workbook rows.
- **Hidden answers are dropped and reported.** Changing a parent answer removes the answers below
  it, names them and says why, so nothing is saved that the observer can no longer see.
- **Drafts survive a force quit.** Every answer is written to its own SQLite table as it is
  tapped. A draft left behind is offered back as Resume or Discard above the assignments list.
  Drafts are account-scoped and never enter the upload queue.
- **Validation only at review.** The review sheet is act-ordered, jumps back to any question, and
  blocks the save while naming how many required answers are still empty.
- **An offline field guide** (`app/(app)/(tabs)/account/field-guide.tsx`): placing a point, the
  three rounds, zones, answering, saving and uploading, the map controls and what to do when
  something goes wrong, with search and sections that open in place.
- **A project's own sites (D27).** A joined project lists the sites its managers created
  (`GET /v1/projects/{p}/sites`, kept on the device so the list opens offline). Downloading a site
  fetches its package archive, checks it against the digest the server recorded, and keeps its
  manifest, layers and forms (`src/packages/hosted/`); nothing is kept unless every part checks. The
  map draws it from its own layers in the map palette; hosted packages carry no imagery, so Aerial is
  not offered. Its records freeze the exact project/site/package/zone/form bindings; the locally verified MOB-29 foreground flow persists that body and validates exact receipts, with local automated/disposable API/QGIS acceptance and physical-device acceptance pending. Training keeps the practice sites bundled with the app.
  All builds default to real device/account data. Development and review builds show sample data
  only after explicitly selecting Preview in the developer tools. Hosted package sizes come from
  the API's measured archive bytes, displayed in KB or MB; totals are summed before rounding.
- **Show my location (D28).** Off until the observer turns it on (the map's location button or the
  Layers menu); permission is asked then, foreground only. A dot and an accuracy circle in the map
  palette; the button centres on the observer or, while placing, brings their position under the
  cross. The fix is never stored, uploaded or kept, and placement stays by hand.
- **Real sync, relabelled.** Records show the existing queue states — held, on device only,
  synced, needs attention — with no send button. Records are immutable and there is no
  bidirectional edit sync or contested-record workflow; API receipt revisions do not imply one.
- Supabase email/password sign-in and secure session storage. MOB-29 connects the foreground scheduler to the immutable bound serializer and exact receipt checks. Save, reconnect, resume and explicit retry wake the current-account drain; bundled practice stays local-only. A reconnect or a resume also makes records waiting out a retry delay due at once (spaced 5 s from the last upload attempt, and never before a server's `Retry-After`; a new coordinator right after an attempt (a token refresh, a sign-in or an app restart starts one with no memory of the last attempt), or a flap that aborts an upload in flight, can send sooner), and the drain sleeps otherwise: one timer waits for the earliest remaining delay, an empty queue does nothing, and a screen re-reads records only when one changed (MOB-39). Local automated and disposable API/QGIS acceptance passes; physical-device acceptance remains pending.

### What is deliberately not done

- The canonical `janet-test-v1` definition remains a **draft research instrument**. The API now validates exact package-bound published forms rather than accepting only `shell-v1`; publishing/reviewing the instrument and accepting the native bound workflow are separate requirements. Real package-form installation is locally accepted; MOB-29’s bound transport is implemented with local automated/disposable API/QGIS acceptance.
- The wildlife branch has **no supplied export columns**, and the interaction type list is not in
  the workbook. Nothing is invented: the columns are empty, the option list is marked as pending
  and the gaps are shown in the app. The same applies to presenting gender (no export column),
  manufactured loose parts (Test E168 and E169 collide on `Nat_LP_Intn_Binary`) and the natural
  materials checklist (Test G171 says "list to be provided") — all three are carried as protocol
  notes on the form and are read from the site brief rather than shipped as if they were settled.
- Option codes are provisional implementation identifiers, distinct from export column names.
- Hosted site packages download over the existing upload path, not PowerSync (D2 remains the
  plan). There is no cellular policy yet: a download runs on any connection, and its size is shown
  first. The Training project keeps the three packages bundled with the app.
- "Show my location" draws the observer's position on the field map only. Permission is asked
  when the observer turns it on, foreground only; background location is blocked in
  `app.config.ts`. The fix is never stored with a record, uploaded or kept, so `gpsAccuracyMetres`
  stays `null`: hand placement is authoritative and is never overwritten.

## Run

Use **Node 24 LTS** and **pnpm 10.17.1**. `.nvmrc` selects Node 24 when using nvm. Node 22.13 or newer is required for the test runner’s real SQLite integration test.

```bash
cd mobile
pnpm install
pnpm ios
```

`pnpm ios` generates the native project, builds a development app, and starts the development server. It needs Xcode and CocoaPods. For Android, use `pnpm android` with an emulator or USB-connected device and the Android SDK configured.

After the first native build, `pnpm start` starts the development server. For an iOS simulator using this computer only, use `pnpm start:simulator` and connect the development client to `http://127.0.0.1:8081`. This pins IPv4 localhost so the server address matches Expo's bundle URL. **Expo Go is not supported** because MapLibre is a native module. A QR code only works with our installed development build.

If the previous server still displays the React Navigation compatibility error, stop it and run `pnpm start --clear`. SDK 56 and newer require Router navigation hooks such as `usePreventRemove` to come from `expo-router/react-navigation`; do not import them from an external `@react-navigation/*` package or disable the compatibility check. See [Expo's migration guide](https://docs.expo.dev/router/migrate/sdk-55-to-56/).

To produce a simulator build with its JavaScript bundled, use:

```bash
pnpm ios --configuration Release
```

This is the appropriate build for testing launch with the development server stopped. A development app normally needs the server to load JavaScript; that is separate from whether map and observation data are local.

This redesign adds native modules — `expo-screen-orientation` for the orientation locks and
`expo-blur` for the map's glass chrome — and loads Inter through `expo-font`. **An existing
development build must be regenerated and rebuilt** before it can open this version:

```bash
EXPO_NO_DOTENV=1 pnpm exec expo prebuild
pnpm ios     # or pnpm android
```

MOB-23 adds the Contour dependencies in one step: `react-native-svg` and `expo-haptics` (native),
and the Geologica and Spline Sans Mono fonts and `lucide-react-native` (JavaScript only). Rebuild
the development app once more after it. MOB-27 removes `expo-blur` and Inter. "Show my location"
adds `expo-location` (native, October 8): rebuild again before running this version.

Orientation is one observer choice for the whole app — **Follow the device** (the default),
**Portrait** or **Landscape** — set under "Screen orientation" on the Account and synchronisation
screen. No screen locks or releases orientation on its own, so choosing a round, placing a point,
answering and saving never turn the screen; the field map lays out side by side in landscape and
stacked in portrait. The choice is applied at the root on launch and kept on the device in
`documentDirectory/preferences/orientation.json`, beside the other on-device JSON; it is not tied to
an account and signing out leaves it. A missing or unreadable file means Follow the device; a choice
that cannot be written still applies until the app closes, and the screen says so
(`src/layout/orientation.ts`, rule, storage format and ordering in `orientation-policy.ts`). An iPad
may also turn upside down when following the device or held in portrait. A screen size change, such
as a foldable opening, is re-evaluated. On iPad a lock needs `ios.requireFullScreen`. The app
launches in the device's orientation (`initialOrientation: "DEFAULT"`, an iOS-only setting) and the
root applies the stored choice as soon as JavaScript loads. If the orientation module is missing from
the build, orientation is left free rather than the app refusing to open.

Rotating never resets work in progress: the answers, the open observation, the package, zone and
round live in the session provider above every screen, and the field screen keeps the same component
tree in both layouts, so the map's camera, layers and selection and a half-typed answer stay put.

Android 16 ignores orientation locks on large screens (smallest width 600dp or more) for apps
targeting API 36, which this build does. `plugins/with-large-screen-orientation.js` declares
Google's documented opt-out, `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`, so
an observer's Portrait or Landscape choice still holds on a tablet; it takes effect after
`expo prebuild` and a rebuild. The opt-out stops applying once the app targets API 37, and then an
Android tablet follows the device whatever is chosen; every screen still works in either
orientation. iPadOS windowed multitasking (Stage Manager) does not rotate a locked app either.

`eas.json` also provides `development`, `simulator`, and `preview` profiles. Cloud builds have not been created; account/project configuration and physical-iOS signing remain setup tasks. The identifier `com.fieldmaps.collector.dev` is a development placeholder.

## Verify

Collect, rounds and the inventory form, October 7, 2026: **395 Vitest tests** pass, including the
`janet-inventory-v1` contract cases (also run by the API's Python engine), round types and the
legacy round-number reading, zone geometry (point in zone, concave zones, zone anchors, the
spotlight, the scale bar) and the throttled aim store. TypeScript, Biome (two existing infos) and
iOS and Android Metro exports pass. **Not run on a device or simulator**: the crosshair, the pin's
lift and drop, haptics, layouts and VoiceOver need the acceptance steps below.

Hosted sites, study uploads and Show my location, October 8, 2026: **429 Vitest tests** pass,
including archive reading, the digest check, form resolution, the hosted map build, study upload
payloads and destinations, and the location geometry. TypeScript, Biome and both iOS and Android
Metro exports pass. Against local Supabase and the API, the collector's own download, form and
upload code ran as an invited manager: a package prepared by `scripts/bootstrap-study.mjs` passed
its digest check, and one Reliability play event and one zone inventory were accepted and listed
with their zone, round type, first-round answer and placement. Nothing has run on a device or
simulator: downloads through `expo-file-system`, the location dot and permission prompts need step
9 of the scenario below.

CON-01/02 verification, September 29, 2026: **137 Vitest tests** pass, including 39 shared contract cases and schema drift checking. TypeScript, full mobile Biome checks and both iOS/Android Metro exports pass. Numeric answers survive SQLite draft close/reopen and observation serialization; practice upload tests remain green. Metro watches `../contracts/` so the native bundles include the canonical JSON. No device run or hosted form publication is claimed.

```bash
pnpm typecheck
pnpm lint
pnpm test
```

The SQLite integration tests use a real temporary database through Node’s SQLite driver and the
same repository functions as the app. They check persistence across connection close/reopen,
duplicate-ID protection, refusal to downgrade a newer schema, and the version 2 to version 3
migration that adds the draft table without touching existing records. They do not substitute for
device testing of Expo’s native SQLite adapter.

Current automated verification, September 22, 2026: **94 Vitest cases** across thirteen files —
the previous 28 for storage, sync and account identity, plus form-definition validation, engine
visibility and pruning, the question-stack reducer, draft persistence and recovery, queueing by
form version, the account and study an observation is bound to, the account a recovered
draft may be resumed under, the atomic save that retires its draft, map clustering, nudging and scale, and
which screens may rotate on which device. TypeScript, Biome on `src/` and the changed routes, and
iOS and Android Metro exports pass.

Orientation change verification, October 7, 2026: the field map no longer holds a tablet in
landscape; one observer choice applies to every screen and is kept on the device. **227 Vitest
cases** pass, including the choice-to-lock mapping on each device, a choice held unchanged across
the workflow's screens, racing choices, restore after relaunch, unreadable storage and a failed
write. TypeScript, Biome and iOS and Android Metro exports pass. Rotation, the locks themselves and
the relocated portrait form toggle have not been run on a device or simulator; step 8 of the
scenario below covers them.

Standing build note, carried forward from the shell: a local Release build previously failed on
Finder metadata attached to a generated `ExpoModulesJSI.framework` in the Desktop workspace. No
successful standalone Release build has been verified.

**The redesigned screens, maps and gestures have not been verified on a device or simulator.**
Native authentication storage was verified separately on October 4, 2026, as described below. The new native modules need a
prebuild and a rebuild first, so the checks above establish types, logic and bundling only — not
rendering, gestures, orientation behaviour, MapLibre markers, native auth, or synchronization
timing. The native acceptance scenario below has not been executed against this version.

Current native acceptance is the [zone UI verification matrix](ZONE-BOUNDARIES-UI.md#9-verification): phone/tablet layouts and VoiceOver, shared-edge choices, exact v1 recovery after v2 publication, removal refusal, account switching and whole-zone Inventory. MOB-29 has local automated/disposable API and native QGIS acceptance for bound upload/receipt handling; no completed physical-device run is claimed here. Earlier tap-to-arm and practice-upload recipes are superseded by the crosshair flow and local-only bundled practice.

## Boundaries

The authenticated upload API and account-scoped queue are implemented. Hosted native sign-in and
two test uploads were exercised before this redesign; the user tested offline save/reconnect, and
both records were independently verified in hosted PostGIS and QGIS Desktop. See
[historical acceptance evidence](../docs/Supabase-Setup.md). Those were pre-zone `shell-v1` records; that result does not establish the current UUID-bound upload path. MOB-28 removed the old serializer and MOB-29 remains open.

There is no PowerSync integration, QGIS project importer, edit/download sync, contested-record
resolution, closed-app background upload, or production variable library. The design's "contested"
state is not implemented or shown: immutable records and receipt revisions do not provide a bidirectional edit-conflict workflow.

Unfinished observations now persist in their own `observation_drafts` table, separate from the
upload queue, and are offered back after a force quit. Uninstalling the app still removes all
local data.

The sample map is hand-authored training geometry and is not a real QGIS export or survey. The
aerial base is a fixture style, not imagery. The Fall Creek Elementary package is the exception:
its bases and layers are the QGIS drawings and drone orthomosaic, generated into
`src/maps/sites/fall-creek/` by `qgis/fall-creek/build.sh` (regenerate, don't edit). It has one
whole-playground zone and collects locally as bundled practice; those records do not enter the bound upload queue. A project's own sites arrive as hosted packages
(`src/packages/hosted/`, D27); `src/packages/open.ts` opens either kind, so the field flow is the
same for both. Nothing on the field screen touches the network.

The current `expo-sqlite` store implements an append-only upload queue, not a full bidirectional
sync protocol. If PowerSync is selected later, migrate the queue rather than adding a second
writer. Session JSON uses AES-256-GCM in `documentDirectory/auth/<storageKey>`; only its random
256-bit encryption key is in SecureStore (`fieldmaps-auth-key`). The cipher dependency is pinned
to `@noble/ciphers` 2.2.0 ([audit history](https://github.com/paulmillr/noble-ciphers#security)).
Each write gets a fresh nonce and authenticates its storage key. Missing or corrupt session/key
data counts as signed out; a fresh sign-in replaces an unusable key, while native keychain errors
abort writes. The adapter serializes operations and never deletes `auth/last-account.json`.
That file stores only `{userId, email, issuer}` and restores account identity for the matching
issuer after session loss. Deliberate sign-out removes it; account deletion first retains the
separate deleted-account marker so local records remain accessible. Staging upgrades alone
migrate the exact old SecureStore entry, after encrypting it and retaining account identity.
Observation data is not encrypted by an app-level SQLite encryption configuration. Use test data for this development slice.

MOB-02 native verification, October 4, 2026: a real 24,404-byte session from the local Supabase
Auth API persisted across app process termination and relaunch on the iPad Pro 11-inch (M5),
iOS 26.3 simulator, using the fresh `com.fieldmaps.collector.local` development build. The
restored plaintext digest and cached account both matched. The temporary verification entry
was removed afterward; this does not establish the rest of the product acceptance flows.

## Structure

| Path | Responsibility |
| --- | --- |
| `app/` | Routes: assignments, site brief, field, review, saved, records, account |
| `src/forms/` | Form definitions, validation, the visibility engine, and the question-stack reducer |
| `src/forms/fixtures/` | Thin imports of the canonical JSON definitions in `../contracts/forms/` |
| `scripts/contracts-forms.mts` | Generates the shared input JSON Schema from the mobile Zod definition |
| `src/packages/` | The site package interface and the bundled fixture provider |
| `src/session/` | The observation period: package, zone, round type, draft persistence, and saving |
| `src/features/collect/` | The collect route's steps, the Contour field map, the crosshair and pin, and the aim store |
| `src/features/guide/` | The offline field guide's content and its search |
| `src/maps/` | Bundled training geometry, the generated Fall Creek site, base styles, clustering and zone geometry |
| `src/domain/` | Observation contracts, round types and the record builder for each form version |
| `src/storage/` | SQLite schema, observation repository, draft store, and focused-screen reads |
| `src/auth/` | Secure session persistence and offline account identity |
| `src/sync/` | Upload protocol, scheduling, and verified receipts |
| `src/layout/` | The observer's orientation choice, its storage, and the tablet/phone layout decisions |
| `src/ui/` | Contour, from MOB-23: tokens read from `../contracts/contour.json`, theme, preferences, and the primitives that share their names with `web/src/components/contour/` |
| `src/components/` | Screen frames and the previous chrome primitives, which MOB-27 removes once every screen uses `src/ui/` |
| `src/theme.ts` | The previous chrome tokens, kept so unmoved screens compile; MOB-27 removes them |
| `assets/` | App icon, Android adaptive and themed layers, Play Store icon; sources in `assets/icon-source/` |
| `plugins/` | Local config plugins: the Android 16 large-screen orientation opt-out |

The collector uses local schema version 6, including exact package references and parked drafts. MOB-28’s pre-launch policy resets incompatible schema data/cache; ordinary same-schema restarts preserve current work. See [the package lifecycle](PACKAGE-LIFECYCLE.md) for retention and recovery boundaries.

Native `ios/` and `android/` directories are generated and ignored. Use `app.config.ts` and config plugins for repeatable native configuration. The mobile package has its own dependency lockfile, TypeScript checks, and Biome checks; Next.js tooling is scoped to the separate `web/` directory.

References: [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).

## Enable the connected development slice

`app.config.ts` selects public `config/development.json`, `config/staging.json` or
`config/production.json` through `APP_ENV` (development by default). EAS profiles set it explicitly
and disable dotenv loading. Local development uses the local Supabase stack and
`com.fieldmaps.collector.local`; staging keeps the lezmq Auth project and
`com.fieldmaps.collector.dev`. The only URI scheme is `decamark`.
Production values are placeholders, not a deployable configuration. `powersyncUrl` stays null.

```bash
EXPO_NO_DOTENV=1 APP_ENV=staging pnpm exec expo config --type public
APP_ENV=staging pnpm ios
```

The loopback API URL is for the iOS simulator. Physical devices need a reachable HTTPS API set
in the appropriate public JSON config. Never include database passwords or service-role keys.
The validator accepts publishable keys and public anon JWTs, including the local stack's anon key.
Expo exposes these values through `extra.connection`.

SQLite `owner_scope` keys are built from the configured connection and the signed-in account: the
API URL, the Supabase URL (the issuer), the user id and a fixed placeholder project
(`accountWorkspace` in `src/auth/session-retention.ts`). A build pointed at another backend, or
another account on the same backend, sees none of those records. Uploads go to the configured API
URL, and receipts must match the destination project, account and record. Changing the active
project never changes this key.

`MeProvider` fetches the typed `/v1/me` response on sign-in and foreground resume. `useMe()` exposes
profile, project memberships, active project and refresh errors. The last verified response and
project selection live in an issuer/account-scoped file for offline starts. The default project is
the first non-Training membership, falling back to Training. Removed memberships reset selection.
A deleted-account response stops authenticated uploads, signs out locally, and retains account
identity and SQLite records for later cleanup/export. Ordinary sign-out still hides account records.

Failed refresh or unexpected session loss retains the cached account and its scoped SQLite
records, including after restart. Uploads pause without a session. The shared screen banner says
"Sign in to resume uploads" and opens the existing Account sign-in form with the cached email
prefilled. Deleted accounts keep their deletion notice rather than offering sign-in recovery.
Deliberate sign-out removes the cached identity and hides its records until that account signs in
again. MOB-08's local tests exercise the provider's auth-event boundary and real SQLite/file
close/reopen with two accounts, token refresh during deliberate sign-out, account switching, and
an identity-cache filesystem failure. A cache-write warning remains visible after session loss
until a successful durable identity write or deliberate sign-out. This recovery screen flow has
not been verified natively.

iOS UI check (2026-10-04): the normal iOS entry bundled, but the simulator UI check did not reach
the Account screen; recovery-banner and email-prefill UI acceptance remains unverified.

Local verification (2026-10-04): mobile TypeScript, Biome and 193 Vitest cases pass. Tests cover
old owner-scope read visibility, a configured upload host distinct from the frozen key, receipt
identity mismatches, typed API errors, cached/missing/stale project selections, deleted-account restart with lingering
credentials, and failed marker writes/sign-out attempts. Staging public
Expo config and an iOS Metro export both pass. No simulator, device, hosted write or release build was tested.

Current upload acceptance remains [MOB-29](PLAN.md#mob-29-collect-and-upload-pinned-zone-observations). The implemented path checks observation/account/project/package/zone receipts before acknowledging, preserves structured permanent rejections and retries the stored UUID/body after a lost response; these behaviors have local automated and disposable API/QGIS acceptance ([evidence](../docs/reviews/mob29-2026-10-15/README.md)). Foreground scheduling does not promise closed-app synchronization. Run the [physical-device matrix](ZONE-BOUNDARIES-UI.md#9-verification), then confirm exact recorded attribution on the server and in QGIS under [QA-07](../docs/plan/verification.md).
