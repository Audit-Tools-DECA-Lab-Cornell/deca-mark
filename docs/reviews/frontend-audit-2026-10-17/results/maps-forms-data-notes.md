# maps-forms-data audit notes (started 2026-10-17)
Status: started. No findings yet.

## Verified facts so far (pass 1)
- Backend caps: MAX_ARCHIVE_BYTES 16 MiB (backend/src/fieldmaps_api/domain/packages.py:30), MAX_EXPANDED_BYTES 80 MiB (zone_archive.py:38), MAX_FEATURES_PER_LAYER 20000 (packages.py:28), MAX_PACKAGE_ZONES 250 (zone_geometry_schemas.py:7) = mobile manifest max(250) (bound-manifest.ts:40). 24 MiB is only web upload request. Realistic pilot data tiny: qgis/demo-playground-2026-10-15/desktop/data/*.geojson ~9 KB total.
- expo-crypto 57.0.3 digest(): sync native Function("digest") (ios/CryptoModule.swift:16) wrapped in Promise -> native speed but blocks JS thread for its duration; device.ts:48-49 and :127 copy bytes (new Uint8Array(bytes)).
- Install pipeline (prepare.ts:13-69, installation.ts:106-159): unzipSync on JS (archive.ts:30) -> strFromU8+JSON.parse -> zod layers (coordinates z.unknown, cheap) -> verifyBoundZones (per zone filter O(Z^2), stringify+sha per zone) -> forms fetch -> installVerifiedPackage: storedPackageSchema.parse AGAIN, validateStored AGAIN (verifyBoundZones again), JSON.stringify whole package, strToU8, sha, files.read(original), files.read(destination), stage, files.read(temporary) compare, move.
- catalog() (operations.ts:75-104) re-reads EVERY installed package file, re-hashes, JSON.parse, zod parse, validateStored for every entry at HostedSitesProvider mount; removal never deletes files/package_contents (package-catalog removal keeps contentRetained) so N grows with every version ever installed.
- MapLibre RN 11.3.10: GeoJSONSource is memo but children (Layer elements) new each render -> re-renders; JSON.stringify(data) every render (GeoJSONSource.tsx:235). Map nativeProps useMemo([props]) -> JSON.stringify(mapStyle) every render (Map.tsx:662-675). iOS native diffs string (MLRNGeoJSONSourceComponentView.mm:86) so native reparse only on change.
- hosted build.ts:160-164: bases day/night/aerial each embed ground layer as geojson source in style object; overlays (paths/trees/zones) as GeoJSONSources; CollectMap adds collect-zones (all zones again), spotlight, focus, singles.
- CollectMap not memoized; CollectScreen passes inline lambdas; every session.dispatch (each keystroke: QuestionStep.tsx:113-123 onWrite per keystroke) re-renders CollectScreen -> CollectMap -> stringify of ground (x1 mapStyle) + paths + trees + zones + all zones + spotlight + focus + singles.
- Web Z-data (520 obs, 500 loaded): 2.27 MB decoded HTML, 15213 DOM nodes, 1 long task 121 ms, LCP 856ms (cold.json). DataTable renders every record twice (table hidden md:block + cards md:hidden) DataTable.tsx:55-131. SitePlan markers 500 role=button tabIndex=0 (SitePlan.tsx:709-731).
- Web table/map/export consistency: map draws `shown` (search-filtered loaded), table `shown`, export uses server filters and says search not applied (ExportObservations.tsx:132-134), counts from server. Justified.

## FINDING F1 (CONFIRMED DEFECT, medium): token refresh rebuilds PackageOperations -> silent abort of package download + full catalog re-verify
- mobile/src/packages/hosted/provider.tsx:51-61 `api` useMemo deps [client, session, userId]; :64-80 `operations` useMemo deps [api,...]; :101-109 effect: cleanup operations.dispose(), then setDownloads({}), setInstalled([]), reconcileStaging, reload()->catalog().
- auth/provider.tsx:160-195 onAuthStateChange -> setState({...identity}) with new session object on every TOKEN_REFRESHED (sessionChange returns {session,...}, session-retention.ts:14-17, cached-account.ts:56-60).
- operations.ts:51-55 dispose aborts every running controller; performDownload catch :196-198 returns false when !alive; provider download :125-129 `if (!operations.runtime.current()) return;` -> no error state; new effect cleared downloads.
- auth-js 2.117.3: refresh tick every 30 s, refresh within 90 s of expiry (constants.js:6,9,13); _startAutoRefresh runs a tick immediately on resume (GoTrueClient.js:4484-4490); auth provider starts auto refresh on AppState active (provider.tsx:196-199).
- Trigger: download in flight when TOKEN_REFRESHED fires: hourly, or first download after resuming an app backgrounded past expiry (download's own getSession/tick refreshes).
- Consequence: download disappears without message (Site screen back to not-downloaded), observer at site without package; plus every refresh re-reads/re-hashes/re-validates all installed package files and empties `installed` briefly.
- Fix: key api on presence/user, not session object: deps [client, Boolean(session), userId] (token getter already reads getSession each call). Keep: account change still rebuilds/aborts (owner/userId deps), dispose on unmount.
- Verify: unit test provider-download: start download with slow source, emit new session object for same user (TOKEN_REFRESHED), assert download completes and catalog() called once; device: set JWT expiry 60 s in local supabase, start download of throttled package.

## FINDING F2 (CONFIRMED behaviour; cost MEASUREMENT NEEDED): 5 s sync tick bumps revision unconditionally -> every focused useObservations re-reads+zod-parses ALL account records, CollectMap re-serializes all layers
- sync/provider.tsx:127-129 setInterval 5000 queue.wake(); foreground.ts:18-22 after every drain `options.changed()` unconditionally; provider.tsx:50 changed -> setRevision+1.
- use-observations.ts:39-47 useFocusEffect deps [refresh, revision] -> refresh(): setLoading(true) + listObservations (observation-store.ts:79-101: SELECT all rows for owner incl synced (never deleted), JSON.parse + observationSchema (3-way z.union) per row).
- Consumers: CollectScreen.tsx:79, records.tsx:45, useQueueForMode (queue.ts:61-62) -> TabsLayout badge, projects home, brief, account, sign-out, delete-account, not-found.
- records.tsx:66-68 header flips to "Reading local records…" every 5 s while online (visible glitch).
- CollectScreen: new records array -> shownRecords (CollectScreen.tsx:122-125) -> CollectMap re-render -> JSON.stringify mapStyle(ground) + every GeoJSONSource (Map.tsx:662-675, GeoJSONSource.tsx:235).
- V8 repro (scratchpad/repro/mfd/bench-list.ts, Node 24, zod 4.6.5): 500 recs/1 MB = 16-37 ms; 2000 recs/4.2 MB = 59-101 ms per refresh. Hermes on mid Android unmeasured (expect several x).
- Fix: drain returns whether any row changed (acknowledge/attempt/activate) and only then changed(); don't setLoading(true) on background refresh. Keep: refresh after real uploads; keep focus refresh.

## FINDING F3 (CONFIRMED DEFECT by code+framework trace, device not run; high): Collect answer panel has no keyboard avoidance on Android
- mobile/src/features/collect/CollectScreen.tsx:476-483 KeyboardAvoidingView behavior={Platform.OS==="ios" ? "padding" : undefined}.
- RN 0.86.3 KeyboardAvoidingView.js:236-290 default branch = plain View (no avoidance).
- RN 0.86.3 WindowUtil.kt:45-68 updateEdgeToEdgeFeatureFlag: targetSdk>=35 -> edge-to-edge on (no opt-out attr in app) -> enableEdgeToEdge :164-165 setDecorFitsSystemWindows(false) => window not resized by IME; RN gradle libs.versions.toml targetSdk = "36"; app.config.ts has no opt-out/softwareKeyboardLayoutMode.
- Project's own src/ui/Screen.tsx:100-103 comment: "Edge-to-edge on both platforms: the window does not resize, so padding lifts the content." -> uses padding on both. CollectScreen contradicts it.
- Janet forms: janet-test-v1 4 text questions (incl observer_initials, play_event_summary); janet-inventory-v1 8 text questions. QuestionStep TextInput/Textarea inside panel ScrollView below the 46% map (CollectScreen.tsx:499) -> keyboard covers input and Back/Continue row on Android phones portrait.
- Fix: behavior="padding" on both platforms (match Screen.tsx). Keep: iOS behaviour unchanged.
- Verify: Android 15/16 emulator, Pixel 7 portrait, open Inventory round, reach inv_nat_surfaces_list text question, tap field: field and Continue must stay above keyboard; screenshot before/after.

## FINDING F4 (MEASUREMENT NEEDED; medium): CollectMap re-serializes whole package GeoJSON on every render
- CollectMap not memoized; CollectScreen re-renders on every session dispatch (per keystroke QuestionStep.tsx:113-123), on records refresh (F2, every 5 s online), GPS fix (CollectMap useMyLocation 1 s/0.5 m when on, use-my-location.ts:101-104), onRegionDidChange setZoom (CollectMap.tsx:540).
- Per render: Map.tsx:662-675 JSON.stringify(mapStyle) (ground layer embedded, build.ts:22-41,160-164) + GeoJSONSource.tsx:235 per source (paths, trees, collect-zones, spotlight, focus, singles, me-accuracy). memo defeated by inline Layer children.
- V8 repro scratchpad/repro/mfd/bench-stringify.mjs: demo 18 KB 0.1 ms; medium park 1.1 MB 6.4 ms; near-cap 9.5 MB 54 ms per render. Hermes unmeasured. Pilot demo package ~9 KB -> negligible today.
- Fix: in hostedSitePackage (build.ts) or a useMemo keyed on sitePackage, pre-stringify static data (style per base, overlay layer data, zoneShapes) and pass strings (both props accept string; library passes the same string natively). Keep CollectMap mounted across steps.
- Experiment: Android release build, package with 2000 trees + 300 ground polys; Perfetto/Hermes sampling while typing 20 chars in a text question; compare JS frame time before/after pre-stringify.

## FINDING F5 (MEASUREMENT NEEDED; medium): Observations tab + collect map read/parse/render every record ever stored, unbounded
- No DELETE FROM observations outside schema reset (grep). listObservations observation-store.ts:79-101 reads all rows incl synced; records.tsx:83-131 `records.map` inside PageScreen ScrollView (components/screen.tsx:35-50) -> every row mounted; no FlatList.
- Docs target: 10,000 local observations (docs/Production-Architecture-Recommendation.md:151). Pilot on iPad + Android tablet (PRODUCT.md:170).
- Combined with F2 every 5 s re-read+re-render of all rows while online.
- V8 parse baseline 2000 recs 59-101 ms (bench-list.ts); Hermes + 2000-row ScrollView mount unmeasured.
- Fix (simplest): Observations tab lists unsent + needs-attention rows in full and only newest N uploaded with a count (query with WHERE/LIMIT), or FlatList (RN core, virtualized-lists already in bundle 48 KB). Collect map: SELECT only rows for the open site (WHERE site), not all-account parse. Keep: records never silently deleted.
- Experiment: seed 2000 / 10000 synthetic records via SQLite in dev build, open Observations tab on mid Android tablet; measure TTI and JS frame drops over 30 s online (F2 tick).

## FINDING F6 (DEMONSTRATED COMPLEXITY; low-medium): web Data renders each loaded record twice (table + card list)
- web/src/features/data/DataTable.tsx:55-100 table (hidden md:block) + :103-131 card list (md:hidden): both always in DOM; Tr client comp with useRouter per row (components/contour/Table.tsx:82-83).
- SitePlan markers: 5 nodes each, role=button tabIndex=0 per marker (SitePlan.tsx:691-731) -> 500 tab stops.
- Measured perf/cold.json Z-data (520 obs, 500 loaded): docDecoded 2,267,926 B, 15,213 DOM nodes, 1 long task 121 ms, TBT 71, LCP 856 ms vs Z-data-observation 293 nodes. "Show next 500" appends unbounded (DataScreen.tsx:186-206) -> 1000+ rows => 30k+ nodes; every row/marker selection re-renders all rows + markers (no memo; DataScreen.tsx:114,302,387-400).
- Fix: render one representation (single table with responsive CSS, or mount cards only below md via matchMedia hook); memo rows on (record, selected). Keep: table/map/export same filters semantics.
- Verify: rerun cold.json harness on Z-data: expect ~halved DOM nodes/docDecoded; add 1000-row interaction trace (click row) under 4x CPU throttle.

## FINDING F7 (DEMONSTRATED COMPLEXITY, low; policy deletion candidate): web keeps a legacy `fields` form-definition path the API can no longer create
- backend/src/fieldmaps_api/services/forms.py:35-49 checked_definition validates every saved definition with FormDefinition (CanonicalDefinition questions min_length=1, domain/form_definition.py:102-111).
- web: forms/versions/[version]/page.tsx:25-28 isCanonical + :85-93 LegacyVersionScreen (features/forms/LegacyVersionScreen.tsx, 94 lines); publish/page.tsx:35-37,105-140 "made before the form editor" branch; lib/observations/answers.ts:180-186 legacy `fields` reader.
- Fix: delete LegacyVersionScreen, both isCanonical branches and the `fields` branch; reset/republish any hosted form whose definition has no questions. Keep: read-only view of published/retired canonical versions.
- Verify: query hosted form_versions for definitions without questions (expect 0 or reset), run forms e2e + unit tests.

## FINDING F8 (MEASUREMENT NEEDED, low): web server re-downloads and re-unzips immutable package archives on every plan view
- web/src/lib/api/workspace.ts:227-255 getPackageArchive/getSitePlan wrapped in React cache (request-scoped only: next/dist/docs/01-app/01-getting-started/06-fetching-data.md:724).
- perf/api-fanout.json: Z-sites 6 downloadPackageArchive per view (thumbnails limit 6), data/site/zones/overview/observation 1 each. Archives ≤16 MiB (packages.py:30).
- Today archives are KB so cost hidden (Z-sites total 177 ms). At 16 MiB: up to 96 MiB transfer + unzip + parse per Sites view.
- Fix: process-level LRU of ProjectedSite keyed by (packageId, archive_sha256) consulted only after the per-request authorized metadata read (listSites/getPackage) returns that sha. Keep: authorization per request.
- Experiment: seed 5 MiB package; time Sites page TTFB and Node RSS over 20 views before/after.

## FINDING F9 (MEASUREMENT NEEDED, low-medium): no device budget for package size — install holds ~6 whole-package copies; every start re-hashes/re-parses/re-validates every installed version
- Install: device.ts:121 bytes (≤16 MiB) + :127 copy; archive.ts:30 unzipSync (≤80 MiB expanded, zone_archive.py:38) ; :18 strFromU8 + JSON.parse; installation.ts:116-117 parse+validate again; :121 JSON.stringify whole; :122 strToU8; :133 read-back compare. Sync native digest blocks JS (expo-crypto CryptoModule.swift:16).
- Start + every token refresh (F1): operations.ts:75-104 catalog -> installation.ts:71-104 per version textSync read, strToU8, sha, JSON.parse, zod, validateStored (verifyBoundZones again).
- Docs target 500 MB package (Production-Architecture-Recommendation.md:151) vs server 16 MiB cap; pilot demo ~9 KB.
- Fix: write the verified text once (drop second validate and read-back compare, or compare hash not text); at catalog verify file sha only, parse on open; cap device-accepted expanded size with a clear refusal message. Keep: sha verification at install and before first open.
- Experiment: 16 MiB archive with 20k trees; Android tablet release build; record Hermes heap peak + wall time for download->verified, and cold start to "verified" with 3 versions installed.
- F3 extra evidence: generated mobile/android/gradle.properties edgeToEdgeEnabled=true (git-ignored prebuild output); AndroidManifest windowSoftInputMode="adjustResize"; RN gradle plugin GenerateEntryPointTask.kt:100-102 calls WindowUtilKt.setEdgeToEdgeFeatureFlagOn() when IS_EDGE_TO_EDGE_ENABLED -> WindowUtil.kt:66-67 enableEdgeToEdge on every Android version; expo prebuild withEdgeToEdge.js says edge-to-edge mandatory. Expo default targetSdk from catalog (ExpoRootProjectPlugin.kt:55; RN catalog 36).

## Status: findings F1-F9 recorded. Next: compose table + justified + keep + final StructuredOutput.

## F7 addendum: write-only package stores (mobile) folded into F7
- available_current_packages: setAvailableCurrent transaction per site per refresh (operations.ts:113-124; available-current.ts:12-42); readAvailableCurrent only in tests.
- package_selections: written on install (package-catalog.ts:41), read only by readSelected via PackageOperations.selected (operations.ts:216-218) which has no production caller.

## Table drafted (see final output). Ranking: F3, F1, F2, F5, F6, F4, F9, F8, F7.
- F7 caution: do NOT bump SCHEMA_VERSION just to drop the dead tables (reset destroys unsent records); stop reading/writing now, drop CREATE TABLE with the next intentional reset.
## Status: composing final StructuredOutput now.
