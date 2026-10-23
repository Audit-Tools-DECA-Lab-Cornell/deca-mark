# Web rendering/routing/boundaries audit — running notes

Status log (append as work progresses):
- [start] Notes file created. Read web-inventory.md map. Next: perf data (cold.json, api-fanout.json), then verify code.

## Evidence notes
- Lab backend returns 500 for listForms/getFormVersion (forms pages show "Couldn't load"), so forms routes' measurements are failure-path only. Not a frontend defect; note in not_covered.
- cold.json: TTFB 25-57ms all routes (streams after getWorkspace ~20-30ms local), docEnd up to 581ms (Z-data), Z-data doc 54.8KB enc / 2214.8KB decoded, 15,213 DOM nodes, LCP 840, 1 long task 114ms. Z-reports doc 288KB dec LCP 552. CLS 0 everywhere. Z-overview 37 server API calls (30x listPackages for 30 sites), docEnd 527.
- warm-nav: tab switches (new child segment under [project] loading boundary) usable 327-345ms while RSC done 60-117ms; in-section navs (sites->site, site->zones, data->obs) usable RSC+~20ms; back = 12-20ms (router cache). No prefetch requests (prefetch={false} effective).
- React vendored 19.3.0-canary-3f0b9e61-20260317 (next/dist/compiled/react-dom/cjs/react-dom-client.production.js:12006 `globalMostRecentFallbackTime + 300`), retry lanes throttled 300ms after fallback commit (:10707).
- Package archives: backend writes manifest + 4 GeoJSON layers (backend zone_packages.py:151-158), MAX_ARCHIVE_BYTES 16 MiB (domain/packages.py:30), expanded cap 5x (zone_archive.py:38). Pilot layers are KBs (qgis/demo-playground .../data ~9KB total). Lab downloadPackageArchive 7-13ms. => server unzip cost is MEASUREMENT NEEDED at pilot scale.
- next.config.ts:19-31 OLD_ROUTES 11 redirects for removed routes = legacy compat (deletion candidate under no-legacy policy).

- Repro scratchpad/repro/archive-cost.mjs (fflate+zod from web/node_modules): 1.4 MiB zip/5.9 MiB json -> unzipSync 38ms + JSON.parse 35ms; 16 MiB zip/68.9 MiB json (23k polygons) -> unzipSync 421ms + JSON.parse 459ms + zod 17ms, RSS ~930 MiB. Sync on the Node event loop, per plan per render. Sites page does up to 6.
- Repro scratchpad/repro/client-graph.mjs: zod reaches client via components/shell/LoadFailure.tsx -> lib/workspace/result.ts -> lib/api/errors.ts (zod at top); MapFrame -> SitePlan -> lib/plan.ts; ExportObservations/QgisScreen/Create/EditSiteDialog -> errors.ts; forms model -> lib/api/sites.ts. static-bundle.json: zod chunk 0wstr41mffx5k 391KB raw / 90.7KB gz on every /o route and /invite,/join; /account has none. supabase-js 231KB raw in data/site/zones/qgis/packages bundles (lib/api/browser.ts).
- Forms Save: features/forms/actions.ts:27-44 asManager -> revalidatePath(`/o/${org}/p/${project}`,"layout") on every action incl saveDraftAction :109-120. Docs revalidatePath.md:16 "Server Functions: Updates the UI immediately". Editor page forms/versions/[version]/page.tsx: 4 sequential waves getFormVersion :43 -> [listForms,listSites] :95 -> base getFormVersion :104 -> getSitePlan :121; DraftEditorScreen keeps state (key=version.code :137; useState init DraftEditorScreen.tsx:90-92) so re-rendered props are discarded. No measured Save (lab forms 500).
- JWKS cache is module-global in auth-js 2.117.2 (GoTrueClient.js:49-69); project signs ES256 (docs/Supabase-Setup.md:11) => getClaims local; fine.
- Legacy: LegacyVersionScreen route branch forms/versions/[version]/page.tsx:26-29,85-93; OLD_ROUTES next.config.ts:14-31; SW legacy cache names (service-worker.js per map).

- Repro scratchpad/repro/siteplan-cost.mjs (real code: lib/sites/archive.ts readPackageArchive+packageSiteCollection, lib/plan.ts projectSite via tests/unit/support.mjs hook): Fall Creek real 10 KiB zip -> 3ms, projected JSON 61 KiB; densified 832 KiB zip -> 85ms CPU, projected JSON 5.6 MB, RSS 419 MiB; 7.9 MiB zip -> 811ms CPU, projected 55 MB, RSS 1.36 GB; next size OOM-crashed node. Projected JSON ~6-7x compressed archive (full-precision doubles, lib/plan.ts:122-127 toPlan). API accepts up to 16 MiB archives.
- Double refresh: features/forms/RetireDialog.tsx:38-42 (action revalidates via asManager + router.refresh), DiscardDialog.tsx:44-47, UploadStep.tsx:455-456,464-465 (packageUploaded features/packages/actions.ts:14-18 revalidatePath then router.refresh).

- Repro shp-vertices.mjs: real survey Ithaca_QGIS/Drawings = 40 records, 1,553 vertices -> ~61 KB projected (matches Fall Creek 61 KiB). Cliff needs ~15-100x denser data; pilot unlikely to hit it.
- layout-router.js:556-613: ErrorBoundary+LoadingBoundary subtree keyed by child stateKey -> new Suspense per child segment (F-A mechanism confirmed in source).
- SecurityIsland.tsx:13 comment "ends this browser's session" + :22 footnote -> intent is local; code global.
- Ranking decided: F-C, F-A, F-B, F-E, F-D, F-F, F-G, F-H. STATUS: all drafts written; next = compose StructuredOutput.

## Confirmed findings

F-A fix refined: replace segment loading.tsx (new boundary per child segment -> fallback + 300ms throttle) with ONE persistent <Suspense fallback={<ProjectLoading/>}> around {children} in p/[project]/layout.tsx:33 (and (org)/layout.tsx) -> cold loads still stream skeleton; tab switches are transitions over an already-revealed boundary -> old page stays until new is ready. Add useLinkStatus pending to InkTabs for feedback.

### F-D (draft) Mutations re-render the current page server-side, often twice; form Save re-renders whole editor incl archive
- loc: features/forms/actions.ts:27-44 (asManager revalidatePath project layout) used by saveDraftAction :109-120; RetireDialog.tsx:38-42 + DiscardDialog.tsx:44-47 router.refresh after revalidating action; UploadStep.tsx:455-456/464-465 packageUploaded(revalidatePath) then router.refresh; editor page forms/versions/[version]/page.tsx:43,95,104,121 = 4 sequential waves + archive.
- docs: revalidatePath.md:16 Server Functions update UI immediately + refresh previously visited pages. No server data cache exists (fetch no-store lib/api/client.ts:57), so revalidation only buys current-page re-render + router-cache purge.
- consequence: each Save waits for PUT + full editor re-render (getWorkspace, getFormVersion x2, listForms, listSites, archive+projection) whose props DraftEditorScreen ignores (useState init :90-92, key=version.code). Retire/Discard/Upload render twice. Not measured (lab forms 500) => MEASUREMENT NEEDED.
- fix: drop revalidatePath from saveDraftAction (return etag only); delete router.refresh after actions that already revalidate (keep it in UploadStep's uncertain path). Keep revalidation for create/start/publish/retire/discard.
- verify: count server API calls per Save via apilog (expect 1 PUT + identity), Save latency before/after; back to versions list still fresh (staleTimes.dynamic=0 refetches on Link nav).

### F-E (draft) Data table renders every record twice (desktop table + hidden phone list)
- loc: features/data/DataTable.tsx:53-97 (table, `hidden md:block`) and :100-131 (ul `md:hidden`) both map all records.
- measured cold.json Z-data (500 rows): 15,213 DOM nodes, doc 54.8 KB enc / 2,214.8 KB decoded, LCP 840, usable 806, 1 long task 114ms vs data (8 rows) 597 nodes, LCP 216. Soft nav overview->data(500) RSC 12.8KB/418.6KB dec, usable 618-1115 (median ~700). Server part: listHistoricalObservations 332ms (backend).
- fix: render one structure (single list whose rows restyle at md via CSS) or mount the phone list only under a matchMedia check; no virtualization needed. Keep 500-row page + "newest 500" honesty.
- verify: cold Z-data DOM nodes ~halved (~9-10k), HTML decoded <1.3 MB, long task gone on 4x CPU throttle.

### F-F (draft) Avoidable sequential waves (MEASUREMENT NEEDED in prod; lab waves 10-40ms each)
- form editor forms/versions/[version]/page.tsx:43 -> :95 -> :104 -> :121 (4 waves; forms,S independent of version; archive independent of base); publish/page.tsx:63 -> :143 -> :146; data/[observation]/page.tsx:31 -> :38-44 (P,S independent of the record); zones/page.tsx:83 -> :97 -> :107 (current version's archive+zones need only getSite); overview page.tsx:61-68 -> :77-85 (today/7d need only P's timezone) and CoverageSection starts only after the page body resolves (Z: coverage 431-505ms after main wave ended 398).
- Overview listProjectPackages workspace.ts:204-211 = 1 listPackages per site (Z: 30 calls, 121-378ms), plus getPackage per blocked newest package.
- fix: hoist independent promises (start before awaiting), no new framework. Verify with apilog waterfall (fanout.cjs) on hosted API.

### F-G (draft) Client JS: zod on every /o route via LoadFailure; supabase-js eager on data/site/qgis (MEASUREMENT NEEDED)
- loc: components/shell/LoadFailure.tsx:9 imports isNoAccess from lib/workspace/result.ts:1 which imports lib/api/errors.ts:1 (zod, top-level schemas :45-53,128-138). static-bundle zod chunk 391,200 raw/90,698 gz/73,257 br; cold transfer org 344 KB vs account 246 KB scripts.
- supabase-js 230,986 raw module in data/site/zones/qgis/packages bundles via lib/api/browser.ts (needed only at export/download click on data/site/qgis). data script 449 KB vs overview 366 KB.
- lab: 0 long tasks on these routes, LCP 140-216 => no demonstrated harm. fix if measured on throttled CPU: move isNoAccess/isNotFound to a zod-free module; dynamic import of lib/api/browser.ts inside export/download handlers (cost: one chunk fetch at click). Keep: CommandPalette/cmdk (20 KB raw) eager.

### F-H (draft) Compatibility code contrary to no-legacy policy (deletion candidates)
- next.config.ts:14-31,40-42 OLD_ROUTES (11 redirects for Nocturne/sample routes) + e2e/removed-routes.spec.ts (passes with 404 too); lib/pwa/service-worker.js:3-4,65 legacy cache names fieldmaps-shell-v1/fieldmaps-public-*; features/forms/LegacyVersionScreen.tsx (94 lines) + forms/versions/[version]/page.tsx:26-29,85-93 + publish/page.tsx:36,106,129 "made before the form editor"; lib/observations/answers.ts:179-186 legacy `fields` reading.
- guard: confirm hosted pilot form versions all carry `questions` (or reset) before deleting the form legacy path.

### F-C (draft) Web sign-out is global: revokes the phone collector's session, contradicting the Account copy
- loc: web/src/lib/auth/actions.ts:136-146 signOut -> supabase.auth.signOut() (no scope); features/auth/actions.ts:124-133 switchAccount same; auth-js 2.117.2 GoTrueClient.js:3417,3427,3439 default scope 'global' -> admin.signOut(accessToken,'global'); copy features/account/SecurityIsland.tsx:21-23 "Signing out here does not affect the app..."; contrast features/account/actions.ts:103 signOut({scope:"local"}) and mobile sign-out.tsx uses scope local (mobile-inventory map §4).
- trigger: same person signed in on phone collector and web (manager who also collects; observer opening /collect or an invite link), signs out via AccountMenu/Security/"Not you?".
- consequence: all refresh tokens revoked; phone's next refresh (<=1h, jwt_expiry 3600 supabase/config.toml:164) fails -> collector signed out, uploads stop until re-sign-in in the field; records stay on device (owner_scope partition) so not lost, but the web promised otherwise.
- fix: signOut({ scope: "local" }) in both actions (one arg each). Keep: server cookie deletion + redirect. 
- verify: sign in same user on web + device (or 2 browser contexts), sign out in one, force refresh in the other: still signed in.

### F-B (draft) Map pages redo full archive download+unzip+projection per render; scaling cliff vs 16 MiB API ceiling
- loc: lib/api/workspace.ts:227-255 getPackageArchive/getSitePlan (cache() per request only), :261-277 getEditorBase; lib/sites/archive.ts:91-96 unzipSync all entries; callers: features/overview/CoverageSection.tsx:48-51, data/page.tsx:147, data/[observation]/page.tsx:38, sites/page.tsx:45-51 (<=6), sites/[site]/page.tsx:55, zones/page.tsx:107-112, zones drafts/[draft] (getEditorBase), publish, packages inspect, forms/versions/[version]/page.tsx:121; features/data/actions.ts loadSitePlanAction.
- measured: lab archive 7-13ms (tiny); warm-nav shows downloadPackageArchive on every soft nav to data/observation/sites/site/zones/draft.
- consequence: OK at pilot sizes; package of ~1 MiB => ~6 MB projected plan in each map page payload; ~8 MiB => ~0.8 s sync CPU + 1.4 GB RSS per plan, Sites does up to 6 -> function OOM/timeouts => site pages unusable.
- fix: guard: refuse to draw over a byte budget (check bytes.length before unzipSync; planNote "too detailed to draw here; open in QGIS"), or block at API prepare; round projected coords. Keep: per-request cache(); authorization through the user's own archive read. Not: 'use cache'/cacheComponents.
- verify: unit test with a >budget archive returns planNote without unzipping; rerun siteplan-cost.mjs.

### F-A (draft) Project loading.tsx forces >=300ms blank-card on every tab switch
- loc: app/(app)/o/[org]/p/[project]/loading.tsx:5-11 (ProjectLoading: Island + ScreenState loading, CSS delay 400ms styles/contour.css:84, ScreenState.tsx:92-96), InkTabs.tsx:168-171 prefetch={false}; React throttle react-dom-client.production.js:12006.
- measured warm-nav.json: data->sites rsc 60 usable 332; zones->forms rsc 63 usable 331; overview->data rsc 117 usable 345; vs sites->site rsc 90 usable 112.
- consequence: every cross-tab nav removes the page and shows an empty Island card for >=300ms (skeleton rows invisible until 400ms) even when data is ready at 60ms.
- fix: delete p/[project]/loading.tsx (and (org)/loading.tsx same pattern) and give tab links a pending state via next/link useLinkStatus (docs 01-getting-started/04-linking-and-navigating.md:233) — old page stays until new one ready. Keep: inner Suspense in Overview CoverageSection. Trade: cold hard loads lose early skeleton FCP (TTFB rises to page-ready).
- verify: rerun warmnav.cjs: tab switches usable ~= rscTotal+20ms; no blank island frame in a performance trace.

## Route table rows (WS = proxy getClaims + (app) layout getWorkspace -> GET /v1/me; every page then resolveProject from WS cache)

| Route | path | waves | measured (lab, prod build, no throttle) | boundaries | change |
|---|---|---|---|---|---|
| /sign-in (+sign-up/verify/forgot/reset) | proxy -> page (no API) | none | TTFB 11.5, LCP 52 | global-error, root not-found | none |
| /o | proxy -> WS -> 307 to remembered/only project | WS | 307 TTFB 40-58; usable at overview 324 | global-error | none |
| /o/[org] | WS -> readOrg -> listOrgProjects -> ∥ listSites(<=12) | 3 seq | TTFB 25, docEnd 69, LCP 140 | (org)/loading, [org]/error, not-found | F-A Suspense move |
| members, org settings | WS -> readOrg -> one ∥ wave | 2 | no-access path LCP 68-72 | same | none |
| overview | WS -> ∥[P,S,S->N×listPackages,forms,obs500] -> ∥[today,7d] -> ∥getPackage(blocked) -> Suspense Coverage ∥[summary(site), archive] | 4-5 | web: docEnd 241, LCP 324, 19 API calls; Z(30 sites,520 obs): 37 calls, docEnd 528, LCP 488, usable 541 | project loading/error + inner Suspense | chain today/7d off P; start coverage reads in W1 |
| data | WS -> ∥[P,S] -> (listPackages if ?version) -> ∥[obs500, <=3 summaries] -> formVersions -> archive | 4-5 | 8 rows: docEnd 124, LCP 216; 500 rows: docEnd 581, LCP 840, usable 806, 15,213 DOM, 2.2 MB HTML dec, LT 114ms; soft nav 500 rows usable ~700 | project loading/error | F-E dedupe DOM; archive ∥ formVersions |
| data/[obs] | WS -> getObservation -> ∥[P, archive, S] | 3 | docEnd 86, LCP 180; soft 88-105 | project | start P,S with getObservation |
| forms, forms/versions | WS -> ∥[forms,S,P] | 2 | lab API 500 (failure path) LCP 152-156; soft zones->forms usable 331 vs RSC 63 | project | F-A |
| forms/versions/[v] | WS -> getFormVersion -> ∥[forms,S] -> base getFormVersion -> archive | 5 | lab 500 | project | fetch forms,S with version; base ∥ archive; F-D |
| .../publish | WS -> getFormVersion -> ∥[forms,S] -> base | 4 | unmeasured | project | forms,S with version |
| sites | WS -> ∥[S,P] -> ∥ <=6 archives | 3 | docEnd 82, LCP 180; Z docEnd 153, LCP 328; soft data->sites usable 332 vs RSC 60 | project | F-A, F-B |
| sites/[site] | WS -> ∥[S,P] -> ∥[archive, summary] | 3 | docEnd 96, LCP 184; soft 112 | project | none |
| zones | WS -> ∥[S,P,WS] -> ∥[listPackages, drafts] -> ∥[archive, zones] | 4 | docEnd 186, LCP 336, 306 KB dec, 1249 DOM; soft 191 (RSC 48/119 KB) | project | current-version archive+zones in W2 |
| zones/drafts/[d] | WS -> ∥[S,P,WS] -> getZoneDraft -> ∥[editorBase(archive), zones]; browser re-reads draft | 4 | Z docEnd 206, usable 365; soft 242-280 | project | none |
| .../publish | same as editor | 4 | unmeasured | project | none |
| packages | WS -> ∥[S,P] -> listPackages -> ∥getPackage(blocked) | (inspect -> getPackage -> archive) | (upload -> listForms -> formDefs) | 3-5 | docEnd 134, LCP 328, 2113 DOM | project | F-D (double refresh) |
| team | WS -> ∥[P, members, invites] | 2 | docEnd 92, LCP 184 | project | none |
| settings (project) | WS -> P (+timeZones prop) | 2 | docEnd 44, LCP 160, 654 DOM | project | none |
| reports | WS -> ∥[P,S] -> ∥[summary, obs500] -> formDefs | 4 | docEnd 133, LCP 164; Z docEnd 517, LCP 552 (API list 396ms) | project | none |
| qgis | WS -> ∥[P,S] -> summary | 3 | docEnd 91, LCP 184 | project | none |
| account | proxy -> requireUser + getMe | 1 | docEnd 33, LCP 72 | global-error | F-C copy/scope |
| invite/join | readViewer (WS if signed in); secret read client-side | 1 | unmeasured | global-error | F-C (switchAccount) |

## Justified choices / keep despite complex

(none yet)
- [final] Composing StructuredOutput now (8 findings, table in notes).
