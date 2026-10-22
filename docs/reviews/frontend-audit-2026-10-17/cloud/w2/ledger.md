# Compact ledger: 76 original findings (Mac run, 9928f53) + first-pass verdict (Mac) + cloud verdict at 0279fd3 (2026-10-21), then new items

## WEB-R1 [web-rendering] Web sign-out revokes every session, including the phone collector, contradicting the Account page's promise
- original: high/high CONFIRMED DEFECT; platform: web (affects mobile collector); journey: Account / any workspace header -> Sign out; Invite/Join -> Not you?
- locations: web/src/lib/auth/actions.ts:136-146 signOut (supabase.auth.signOut() with no scope); web/src/features/auth/actions.ts:124-133 switchAccount (same call, 'Not you?' on /invite and /join); web/node_modules/.pnpm/@supabase+auth-js@2.117.2/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3417,342
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Core claim holds. Corrections: (1) severity high is overstated, so medium. No record loss, recovery is one sign-in (which needs the same network the upload needs), and it requires the same account on web and phone. The broken on-screen promise and the one-line fix keep it above low. (2) Footnote is SecurityIsland.tsx:23, not :22. (3) The mobile local sign-out is mobile/src/auth/provider.tsx:89,129 (hook doc at use-si
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Pass { scope: 'local' } to supabase.auth.signOut() in lib/auth/actions.ts:138 and features/auth/actions.ts:127. If 'sign out everywhere' is ever wanted, make it a separate, explicitly worded control.

## WEB-R2 [web-rendering] Project and org loading.tsx hold every tab switch for at least 300 ms behind an empty card
- original: medium/high CONFIRMED DEFECT; platform: web; journey: Moving between project tabs (manager review loop)
- locations: web/src/app/(app)/o/[org]/p/[project]/loading.tsx:5-11 ProjectLoading (comment: 'so a fast load shows nothing'); web/src/app/(app)/o/[org]/(org)/loading.tsx:5-11 OrgLoading; web/src/components/contour/ScreenState.tsx:92-96 loading rows fade in after --ct-duration-skeleton-delay; web/src/styles/conto
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Confirmed with caveats. (1) The org-tab half is inferred from identical code; warm-nav.json has no org-tab chain. (2) overview->data figures mix runs: median is rsc 125/usable 345, the first run was 117/353. (3) Fix is plausible but unverified by running, as the finding states. (4) Severity medium is at the top of honest: about 150-270 ms extra per tab switch at lab speed, zero when the server takes over 300 ms, plus
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Delete both loading.tsx files. Wrap {children} in one persistent <Suspense fallback={<same Island/ScreenState>}> inside p/[project]/layout.tsx:33 and (org)/layout.tsx:20. Cold loads still stream the skeleton. Tab switches become transitions over an already-revealed boundary, so the old page stays until the new one is ready and nothing is throttled. Optionall

## WEB-R3 [web-rendering] Map pages re-download, unzip and project the whole package on every render; the web hits a cost cliff far below the API's 16 MiB ceiling
- original: medium/medium DEMONSTRATED COMPLEXITY; platform: web (server render + client payload); journey: Site plans across review pages
- locations: web/src/lib/api/workspace.ts:227-237 getPackageArchive (cache() is per request only); web/src/lib/api/workspace.ts:243-255 getSitePlan, :261-277 getEditorBase; web/src/lib/sites/archive.ts:91-111 readPackageArchive (unzipSync of every entry, JSON.parse, zod); web/src/lib/plan.ts:122-127 toPlan (full
- first verdict (Mac): partially_confirmed -> low MEASUREMENT NEEDED; Mechanism and numbers reproduce, but the harm is hypothetical, so downgrade. (1) Category: MEASUREMENT NEEDED, since the finding's own evidence_needed is real package sizes, and pilot data sits about 4 orders below the problem range. (2) Severity: low at pilot scale. (3) Cost is linear (about 7x zip-to-JSON), not a cliff. (4) 'Next size up crashed Node OOM' did not reproduce: a 14 MiB zip finished in about 1.9 s at 1
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add a byte budget in getSitePlan and getEditorBase, checking bytes.length before unzipSync. Over budget, return null so the existing planNote path says the plan is too detailed to draw on the web and to open it in QGIS. State the same limit once as an API preparation check. Round projected coordinates (for example 2 decimals in plan units) to roughly halve t

## WEB-R4 [web-rendering] The Data table renders every loaded record twice (desktop table plus a CSS-hidden phone list)
- original: low/high DEMONSTRATED COMPLEXITY; platform: web; journey: Manager reviews returned observations
- locations: web/src/features/data/DataTable.tsx:55,70 (table inside 'hidden md:block', maps all records); web/src/features/data/DataTable.tsx:103-104 (ul 'md:hidden', maps all records again); web/src/app/(app)/o/[org]/p/[project]/data/page.tsx:181-206 (up to 500 observations, definitions and plan as props); web
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low DEMONSTRATED COMPLEXITY (dup of MFD-5); The 'roughly a third of the nodes' estimate is right for DataTable (36%) but about 30% of the whole page. The verification target (below about 10k nodes, under 1.5 MB, no long task at 4x) is not reachable by this fix alone; see MFD-5.
- smallest fix: See MFD-5: one rendering restyled by CSS.

## WEB-R5 [web-rendering] Mutations re-render the current page on the server; form Save re-renders the whole editor (including the archive), and three flows render twice
- original: low/medium MEASUREMENT NEEDED; platform: web; journey: Form editor Save loop; package upload
- locations: web/src/features/forms/actions.ts:27-44 asManager -> revalidatePath(`/o/${org}/p/${project}`, 'layout') for every form action; web/src/features/forms/actions.ts:109-120 saveDraftAction; web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/page.tsx:43,95,104,121 (editor reads incl. getSiteP
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low MEASUREMENT NEEDED; The saveDraftAction part of smallest_fix is wrong as written. revalidatePath also evicts the client router's bfcache (invalidateBfCache), and staleTimes does not apply to back/forward (staleTimes.md:36). The versions list shows questionCount and gives DiscardDialog the list row's etag (FormVersionsScreen:258, model.ts:67). If Save stops revalidating, browser Back to the list shows the old question count and Discard s
- smallest fix: Delete router.refresh() in RetireDialog:42 and DiscardDialog:47 (the action already refreshed the page), and in UploadStep:456 only on the success path (keep it after packageUploaded fails or in the uncertain-outcome branch, e.g. await packageUploaded(...).then(() => true, () => false) and refresh only on false). Leave saveDraftAction alone unless a measurem

## WEB-R6 [web-rendering] Independent reads are awaited one after another on several pages; Overview fans out one request per site
- original: low/medium MEASUREMENT NEEDED; platform: web (server); journey: Overview, observation drill-down, form editor
- locations: web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/page.tsx:43 -> :95 -> :104 -> :121 (forms and sites do not depend on the version; the archive does not depend on the base version); web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/publish/page.tsx:63 -> :143 -> :146; web/s
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low MEASUREMENT NEEDED; Zones: the shown version is the requested ?version= or the current one, so the archive and zones read can start from getSite alone only when no ?version= is given; with ?version=, listPackages is needed to resolve it. Hoisting is a conditional, not a pure Promise.all. Form editor: the version fetch does not need to wait for listForms/listSites except to choose the legacy screen (which WEB-R8 would delete).
- smallest fix: Start independent promises before awaiting (Promise.all): form editor and publish: [version, forms, sites] then [base, plan]; observation: start getProject/listSites with getObservation; Overview: start the two summaries right after getProject and the coverage reads in the page, passing promises to CoverageSection. See PERF-1 for the per-site N+1.

## WEB-R7 [web-rendering] zod (73 KB br) is bundled on every /o route only because LoadFailure imports a helper; supabase-js is eager on Data, Site and QGIS
- original: low/medium MEASUREMENT NEEDED; platform: web (client bundle); journey: First load of workspace pages
- locations: web/src/components/shell/LoadFailure.tsx:9 imports isNoAccess from web/src/lib/workspace/result.ts:1, which imports web/src/lib/api/errors.ts:1 (zod; top-level schemas :45-53, :128-138); outputs/frontend-audit-2026-10-17/perf/static-bundle.json: zod chunk 0wstr41mffx5k 391,200 raw / 90,698 gzip / 73
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY; Browser-side callers of browser.ts are more than ExportObservations and QgisScreen (see locations): the supabase copies come from three page families (data; site/packages/publish/zones/qgis; draft editor). Everything the finding says about zod and LoadFailure holds.
- smallest fix: Move isNoAccess and isNotFound into a zod-free module and import it from LoadFailure (about 10 lines; verified by build). For supabase see PERF-2: move AccountChangedError to its own module and reach browser.ts and the supabase client through dynamic import().

## WEB-R8 [web-rendering] Compatibility code that contradicts the no-legacy policy (deletion candidates)
- original: low/high DEMONSTRATED COMPLEXITY; platform: web; journey: Maintenance
- locations: web/next.config.ts:14-31,40-42 OLD_ROUTES: 11 temporary redirects for removed Nocturne/sample pages; web/e2e/removed-routes.spec.ts:1-21 (passes with either 404 or redirect); web/src/lib/pwa/service-worker.js:3-4,65 legacy cache names fieldmaps-shell-v1 / fieldmaps-public-*; web/src/features/forms/L
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low DEMONSTRATED COMPLEXITY; Drop the 'confirm hosted definitions first' step: the owner policy allows a reset. Note the same legacy shape is also carried in the backend (backend/src/fieldmaps_api/domain/legacy_forms.py, definition_format 'legacy' in domain/forms.py, LegacyDefinition in observation_export_columns.py), outside this batch; deleting web alone leaves that.
- smallest fix: Delete OLD_ROUTES (keep the spec as a plain 404 check), the legacy cache names, LegacyVersionScreen with its isCanonical branches, VersionRow.legacy and its three UI strings, and the legacy branch of readDefinition with its tests. With the legacy screen gone the form-editor page can start the version, forms and sites reads together (WEB-R6).

## WDI-1 [web-data-identity] A failed Server Action call (dropped connection, ended session, deploy mismatch) reaches the error boundary and drops unsaved form-editor edits; some other call sites fail with no message
- original: high/high CONFIRMED DEFECT; platform: web; journey: Manager prepares a study: editing a form draft, project/org settings, sites, tea
- locations: web/src/features/forms/DraftEditorScreen.tsx:145-183 (save: start(async () => { await saveDraftAction(...) }) with no try/catch), :196-208 (startFromThis); web/src/features/forms/PublishScreen.tsx:79, RetireDialog.tsx:37, DiscardDialog.tsx:41, NewFormDialog.tsx:79, FormVersionsScreen.tsx:100 (same p
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; The core claim holds: a rejected Server Action inside start(async ...) throws to the project error boundary and discards unsaved form-editor edits, and the try/finally sites fail silently. Three corrections. (1) Severity is medium, not high. The loss is limited to edits since the last manual Save, the trigger is transient (offline at the moment of Save, session ended), nothing server-side is corrupted, and the manage
- cloud verdict: confirmed -> medium CONFIRMED DEFECT; The prior check's severity of medium stands (loss limited to edits since the last Save, transient triggers, nothing corrupted server-side). The session-ended path is confirmed by run. The prior check's correction on the fix copy also stands: the sign-in message needs its own wording, and 'Reload the page' is bad advice because a document GET redirects to sign-in and drops the edits. New: the boundary's 'What failed: 
- smallest fix: Add a settleAction(promise, nothing) helper that turns a rejection into {status:'failed', message: UNCONFIRMED_CHANGE_COPY}, use it at the Forms call sites (the editor save first), and let proxy.ts skip the sign-in redirect for non-GET/HEAD or next-action requests, with its own 'Sign in again in another tab, then come back to save' copy. Keep the leave guard

## WDI-2 [web-data-identity] Web Sign out is global: it ends the person's collector session on every phone, while the Account page says it does not affect the app
- original: high/high CONFIRMED DEFECT; platform: web + mobile; journey: Observer or manager who also collects; invitation 'Not you?' on a shared laptop;
- locations: web/src/lib/auth/actions.ts:136-146 signOut (supabase.auth.signOut() with no scope, :138); web/src/features/auth/actions.ts:124-133 switchAccount ('Not you?', :127 same call); web/src/features/account/SecurityIsland.tsx:23 footnote 'Signing out here does not affect the app...'; :50 sign-out form; co
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; The core claim is confirmed: web Sign out and 'Not you?' revoke every session for that user, which contradicts the Account page footnote. The consequence is overstated. Collection is not blocked: the cached account keeps the gate on the app route, and records and local collection continue. What stops is uploads, after the access token lapses (about 1 h) and the refresh fails. The app shows 'Sign in to resume uploads'
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Pass { scope: 'local' } in signOut (lib/auth/actions.ts:138) and in switchAccount (features/auth/actions.ts:127). Two lines; after this the existing copy is true. Keep the flow-cookie deletion and the redirect.

## WDI-3 [web-data-identity] Open redirect after sign-in: safeNext turns dot-segment paths into '//evil.com'
- original: high/high CONFIRMED DEFECT; platform: web; journey: Sign in / sign up / verify / reset password with a ?next= link
- locations: web/src/lib/auth/navigation.ts:4-17 safeNext (checks raw and decoded startsWith('//') before normalising, then returns url.pathname + url.search at :13); web/src/app/(auth)/(signed-out)/sign-in/page.tsx:18-19,30 -> web/src/features/auth/SignInForm.tsx:59 hidden input -> web/src/lib/auth/actions.ts:4
- first verdict (Mac): refuted -> low DESIGN PREFERENCE; The stated exploit does not work. The finding's reproducer applied safeNext once, but the sign-in page and the authenticate action each apply it, so the dot-segment output '//evil.com' is re-sanitized to '/o' before redirect(). There is no reachable open redirect and no phishing consequence. What remains is a latent weakness: safeNext is not idempotent or origin-safe on its own, and tests/auth.test.mjs never exercise
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: In safeNext, after new URL(value, base), return HOME unless url.origin equals the base origin and !url.pathname.startsWith('//'). Add the four cases above to tests/auth.test.mjs. About two lines plus tests; nothing to delete.

## WDI-4 [web-data-identity] Installed web app opened offline shows the public landing page ('Sign in') instead of saying it needs a connection; legacy cache names remain
- original: low/high CONFIRMED DEFECT; platform: web (installed app, https only); journey: Manager opens the installed DECA Mark app on a laptop or iPad without a connecti
- locations: web/src/lib/pwa/service-worker.js:20-24 installStartUrl, :84-85, :96-99 (offline /o navigation -> cache.match('/')); web/src/app/manifest.ts:9 (start_url '/o'); web/src/app/(marketing)/page.tsx:33-57 (Sign in / Create account calls to action); web/src/lib/pwa/service-worker.js:2-4,65 (LEGACY_CACHE '
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; None to the claim. Add: the behaviour and the legacy deletion are both pinned by tests in web/tests/auth.test.mjs that must change with the fix.
- smallest fix: Delete installStartUrl, LANDING_URL, the startUrlNavigation branch (:84-85, :96-99) and LEGACY_CACHE/LEGACY_PREFIX (activate filter keeps only key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME). Remove the two start-URL tests and 'fieldmaps-*' keys from the activate test. Keep cacheable() and safeResponse().

## WDI-5 [web-data-identity] Account binding exists only in the zone editor: package upload, import, exports and downloads use whoever is signed in now, and the palette's recent places keep another account's role labels
- original: low/high CONFIRMED DEFECT; platform: web; journey: Shared lab laptop: one tab open on Upload or QGIS for account A while account B 
- locations: web/src/lib/api/browser.ts:105-119 preparePackage (browserApi(TRANSFER_TIMEOUT_MS): a bare number means no expectUser), :121-136 importQgisProject, :149-171 downloadPackageArchive, :178-196 downloadObservationExport, :199-214 downloadZoneBoundaries; Contrast: web/src/lib/api/zones-browser.ts (expect
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; Only the two writes (preparePackage, importQgisProject) matter for attribution; the three downloads read project data that B may read anyway, so binding them adds little. Scope note: most manager writes are Server Actions that carry the shared cookie and have no account binding either, so the expectUser fix covers only the browser-direct uploads, not the account-wide problem (not small to fix, and the API still autho
- smallest fix: Pass { timeoutMs: TRANSFER_TIMEOUT_MS, expectUser: useWorkspace().account.userId } for preparePackage and importQgisProject (userId is available client-side), and map AccountChangedError to 'You are signed in as someone else. Nothing was sent.' as zones/DiscardDraft.tsx:32 does. Key the palette recents as fm.palette.recent:<userId> (or drop meta).

## MOB-REC-01 [mobile-records] Any schema-version mismatch silently drops every unsent observation, draft and package file at app start
- original: critical/high CONFIRMED DEFECT; platform: mobile (iOS + Android), all environments; journey: An observer installs a new build mid-pilot with records still on the device.
- locations: mobile/src/storage/database-migrations.ts:5 SCHEMA_VERSION; mobile/src/storage/database-migrations.ts:55-89 initializeDatabase (check :61, drop loop :69-79); mobile/src/storage/database-migrations.ts:8-53 resetSchema (marker insert :52); mobile/src/storage/initialize-collector.ts:9-18 initializeColl
- first verdict (Mac): partially_confirmed -> medium DESIGN PREFERENCE; The mechanism is exactly as described, but it is a deliberate, documented, tested pre-launch policy, not an accidental defect. docs/plan/README.md:10-14 says there are no real users or production-data preservation obligations, that breaking changes may reset incompatible local data, and not to add old-schema upgrade paths to retain experimental data. The tests 'Prelaunch collection schema reset' assert populated tabl
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Keep the reset, as the policy allows, but refuse it when it would destroy unsent work. Inside the existing transaction, before dropping anything, count unsent observations (sync_state <> 'synced') plus active and parked drafts, tolerating missing tables. If the count is above 0, roll back and throw a typed error that the root ErrorBoundary shows as a blockin

## MOB-REC-02 [mobile-records] Account, sign-out and delete-account say the app cannot upload, and one stored state carries three names
- original: high/high CONFIRMED DEFECT; platform: mobile; journey: An observer leaves a shared tablet or deletes their account with unsent work.
- locations: mobile/app/(app)/(tabs)/account/index.tsx:35-40 doc comment, :135-137 Note 'This version does not upload yet.' (same screen shows Uploaded count :122-127); mobile/app/(app)/(tabs)/account/sign-out.tsx:126-129; mobile/app/(app)/(tabs)/account/delete-account.tsx:186-191 Alert 'This version cannot uplo
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; All copy and vocabulary claims are true at HEAD. The uploader is live, and it stops when the account signs out or is deleted. The Observations tab is the legacy records.tsx screen (pending shows 'Held', synced shows 'Synced'), while Account uses queue.ts (pending shows 'On device'), which contradicts DESIGN.md:896. SavedStep's 'form v... not published' gives the wrong reason, because heldOnly is really 'no project bi
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Delete both 'does not upload yet' notes and the stale doc comment. Sign-out should say 'Signing out pauses their upload until this account signs in again.' On delete-account, when unsent > 0, call the existing sync.wake() and say 'Stay connected until they show Uploaded', or offer 'Upload first'. Replace records.tsx STATES with the queue.ts mapping and State

## MOB-REC-03 [mobile-records] One persisted row the current build cannot parse blocks every map or every upload, with no visible explanation
- original: high/high CONFIRMED DEFECT; platform: mobile; journey: An observer updates the app with an unfinished observation, then tries to collec
- locations: mobile/src/session/draft-persistence.ts:30-40 useDraftRecovery (unreadable -> setStatus only); mobile/src/storage/draft-store.ts:107-129 readDraft; mobile/src/session/package-actions.ts:65-67 openPackage refusal; mobile/src/session/observation-actions.ts:82-85 begin refusal; :128-138 dispatch persis
- first verdict (Mac): partially_confirmed -> low CONFIRMED DEFECT; Two separate things were bundled. (A) Review race: confirmed by the repro. A saveDraft queued behind commitObservation re-inserts a draft carrying the committed id (1 observation plus 1 ghost draft row). The next observation's saveDraft then throws DraftConflictError, a restart offers the ghost back, and saving the ghost fails 'UNIQUE constraint failed: observations.id'. Code path: ReviewStep rows have no disabled-wh
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Use per-row safeParse wherever persisted rows are read (drafts, parked drafts, observations, upload rows). Skip unreadable rows and count them. Render one Projects card, 'N items from an older version cannot be opened', with Discard wired to the existing discardRecovered and discardParked, or route the case into the MOB-REC-01 guard. The uploader carries on 

## MOB-REC-04 [mobile-records] Retry delays outlive reconnect and restart: 'reconnect wakes the uploader', but it skips every row still waiting out its delay
- original: medium/high CONFIRMED DEFECT; platform: mobile; journey: An observer returns from the field and opens the app on Wi-Fi.
- locations: mobile/src/sync/coordinator.ts:65-82 backoff now+max(retryAfter, min(300000, 5000*2^min(attempts,6))); mobile/src/sync/bound-upload.ts:45-56 timeouts/network/TypeError -> retry; mobile/src/storage/sync-store.ts:31-40 pendingObservations `next_attempt_at <= ?`; :108-130 deferObservation attempts+1 (n
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Fully reproduced. Delays after failures 1-7 are 5, 10, 20, 40, 80, 160, 300 s, and attempts never reset. Ten seconds after the 7th failure, foreground plus connectivity wake made 0 upload calls (state stays pending, and changed() still bumps), and one upload went out after about 305 s. Only retryAttention resets next_attempt_at, and its button renders only when attention > 0. queue.uploadNow is just wake, has no UI c
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: In the existing drain path, when connectivity returns and when the app comes to the foreground, reset next_attempt_at to 0 for pending rows (leave needs-attention alone): one UPDATE. Alternatively, cap the delay for retry-class failures at about 30 s, since uploads are foreground-only anyway.

## MOB-REC-05 [mobile-records] Every token refresh rebuilds package operations: downloads cancelled silently, installed maps shown 'Not downloaded', every package re-verified, /v1/me and /sites re-fetched
- original: medium/high CONFIRMED DEFECT; platform: mobile (online, foreground); journey: An observer downloads a site before fieldwork, or opens the app and checks readi
- locations: mobile/src/auth/provider.tsx:160-196 onAuthStateChange setState with new session object; :198,201 startAutoRefresh; mobile/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2540-2547 (__loadSession refreshes inside getSession), :4287 TOKEN_REFRESHED; lib/constants.js:6-13 (90 s margin); mobil
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Confirmed. Every auth event stores a new session object. api and operations are memoised on it, and the effect cleanup calls dispose(), which aborts running downloads. performDownload returns false, the provider's current() check fails, and downloads is reset to {}, so progress vanishes with no failure state. installed is cleared and catalog() re-reads, re-hashes and zod-validates every retained version, so a site sh
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Make api, operations and the MeProvider effect depend on client, userId and `session !== null`, not on the session object. The token getter already calls getSession() for each request. Hold markAccountDeleted in a ref. Optional: list installed versions from catalog metadata at start, and verify an exact package when it is opened, not every version on every s

## MOB-REC-06 [mobile-records] The idle 5 s wake bumps the sync revision every time, so every focused screen re-reads the whole observations table, flips to its loading state and the field map is rebuilt
- original: medium/high DEMONSTRATED COMPLEXITY; platform: mobile (signed in, foreground, online); journey: An observer collecting with signal, or checking Account before signing out.
- locations: mobile/src/sync/provider.tsx:50 changed=setRevision; :100 activateHeldObservations per drain; :127-129 setInterval 5000; mobile/src/sync/foreground.ts:18-21 changed() after every drain; mobile/src/storage/sync-store.ts:43-78 BEGIN IMMEDIATE scan of local-only rows; mobile/src/storage/use-observation
- first verdict (Mac): confirmed -> low DEMONSTRATED COMPLEXITY; The mechanism is confirmed. While signed in, in the foreground and online, wake() runs every 5 s and changed() fires after every drain even with nothing pending (offline or backgrounded wakes return early). Each focused useObservations consumer sets loading=true and re-reads all rows into a new array. Account swaps its counts for 'Reading records from this device…', Sign-out swaps its warning for a loading state, and
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Have activateHeldObservations and the coordinator report whether they changed a row, and call changed() only then. In useObservations, set loading=true only on the first load for a key and keep showing the previous records while re-reading. Keep the 5 s timer only for rows waiting out a retry delay (or one timeout to the earliest next_attempt_at).

## MOB-REC-07 [mobile-records] Every environment shares the one `.dev` app identity, and SQLite keys are a frozen 'legacy' scope: compatibility code the no-legacy policy forbids
- original: medium/medium DEMONSTRATED COMPLEXITY; platform: mobile build config + storage identity; journey: The developer tests a build on a pilot device. Release packaging.
- locations: mobile/config/development.json:6, staging.json:6, production.json:6 bundleIdSuffix '.dev'; staging.json:2-3 == production.json:2-3; mobile/app.config.ts:24,31,88-89; :17-18 'fieldmaps' scheme; mobile/eas.json:7-21 development profile Android APK, same applicationId; mobile/src/data/legacy/scope.ts:2
- first verdict (Mac): partially_confirmed -> low DEMONSTRATED COMPLEXITY; The facts are right. All three configs have bundleIdSuffix '.dev' (line 6); staging and production share apiUrl and supabaseUrl; legacyScope hard-codes http://127.0.0.1:8000, the hosted issuer and a fixed project for every build, with a comment saying it 'must stay byte-for-byte stable until MOB-11 migrates it'; migrateLegacySession runs a keychain read on every staging or production start; and the 'fieldmaps' scheme
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Set the development suffix to '.local' (D15/README), and choose a distinct production id before any store submission. Build owner_scope from the configured connection (apiUrl, real issuer, userId; drop projectId). Delete data/legacy/scope.ts, migrateLegacySession and legacyStorageKey, and the 'fieldmaps' scheme. Changing the key means a schema reset, so ship

## MOB-REC-08 [mobile-records] Rotating the device remounts the field map and the step panel, breaking the screen's own 'map stays mounted' rule
- original: low/high CONFIRMED DEFECT; platform: mobile (phone and iPad rotation); journey: 
- locations: mobile/src/features/collect/CollectScreen.tsx:474-503 (side ? row tree : stacked tree); mobile/src/features/collect/CollectScreen.tsx:64-70 doc 'MapLibre stays mounted from the first point to the hundredth'; mobile/src/layout/use-layout.ts:25-34 wide = !portrait; mobile/src/features/collect/CollectM
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; None to the claim. The double-save consequence is negligible and should not carry weight. The camera and map-state loss is the real cost. The CollectScreen.tsx:64-70 doc comment ('MapLibre stays mounted') is untrue across rotation.
- smallest fix: Render one tree with identical wrapper Views and switch flexDirection and sizes through style only. Put map, status and panel at fixed child positions, so a null status takes a slot rather than shifting siblings. Keep the 46% slot and the instant height change.

## MOB-REC-09 [mobile-records] Persistence code that nothing reads, plus a one-time transition that runs every 5 s
- original: low/high DEMONSTRATED COMPLEXITY; platform: mobile storage; journey: 
- locations: mobile/src/storage/session-store.ts (no production caller); mobile/src/storage/package-references.ts:20-24 counts active_sessions (always 0); mobile/src/packages/hosted/operations.ts:216 selected() (no caller) -> mobile/src/storage/package-catalog-read.ts:70 readSelected; mobile/src/packages/hosted/
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY; Fix the verification: grep finds activateHeldObservations in sync/provider.tsx. The 'no schema bump' caution in MFD-9 no longer applies under the owner's decision. A SCHEMA_VERSION bump wipes dev-device SQLite, which is sanctioned, so drop the tables and the bump together. Note that removeAccountData is a privacy routine that delete-account.tsx says is 'not built yet'. Wiring it is a product decision tracked by MOB-R
- smallest fix: Delete session-store, last-received-at, readAvailableCurrent/setAvailableCurrent, readSelected, selectPackage, operations.selected, activateHeldObservations and its provider call, and the three tables, with a SCHEMA_VERSION bump. Keep package_authorizations and the lease, draft and record reference counts for removal refusal. Replace the active_sessions coun

## MFD-1 [maps-forms-data] Collect answer panel has no keyboard avoidance on Android (edge-to-edge build)
- original: high/medium CONFIRMED DEFECT; platform: mobile (Android phones and tablets); journey: Observer answers a form in the field
- locations: mobile/src/features/collect/CollectScreen.tsx:476-483 (panelBlock KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}); mobile/src/ui/Screen.tsx:100-105 (comment: 'Edge-to-edge on both platforms: the window does not resize, so padding lifts the content'; behavior="padding")
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; The core claim holds: KAV is a no-op on Android and nothing else lifts the panel. Platform behaviour is not device-verified. adjustResize not resizing under decorFitsSystemWindows(false) is documented Android behaviour and the project's own comment in Screen.tsx says so. Three corrections. (1) Severity high is too high: the pilot is a tablet, where the field is probably visible and the Back/Continue row is hidden, wi
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Use behavior="padding" on both platforms in CollectScreen, as Screen.tsx already does. The only thing to delete is the Platform branch. iOS behaviour stays the same, and the map slot height must still change instantly, never by animation (KAV wraps only the panel).

## MFD-2 [maps-forms-data] Token refresh rebuilds PackageOperations: an in-flight package download is aborted silently and every installed package is re-verified
- original: medium/high CONFIRMED DEFECT; platform: mobile (iOS and Android); journey: Observer prepares a site offline
- locations: mobile/src/packages/hosted/provider.tsx:50-58 (api useMemo deps [client, session, userId]); mobile/src/packages/hosted/provider.tsx:61-77 (operations useMemo deps [api, database, issuer, owner]); mobile/src/packages/hosted/provider.tsx:95-104 (effect: setDownloads({}), setInstalled([]), reconcileSta
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; The claim is confirmed. Corrections: (1) The silent return is at provider.tsx:129, inside download() at :105-146, not :125-129. (2) "Near-certain when Download is tapped right after resuming" is overstated. The resume tick fires at about t=0, so the refresh usually finishes before the observer navigates to Download. A better trigger is GoTrueClient.js:4126-4128, where getSession() itself refreshes when the token is w
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Key the API client on whether a session exists, not on the session object's identity. Use deps [client, session !== null, userId]; the token getter already calls getSession() on every request. Nothing else changes.

## MFD-3 [maps-forms-data] 5-second sync tick bumps revision unconditionally: full record re-read and re-parse, Observations header flicker, map re-serialization
- original: medium/high CONFIRMED DEFECT; platform: mobile (iOS and Android); journey: Observer collects with signal; observer checks the Observations tab
- locations: mobile/src/sync/provider.tsx:50 (changed -> setRevision), :127-129 (setInterval 5000 -> queue.wake()); mobile/src/sync/foreground.ts:18-22 (options.changed() after every drain, whether or not anything changed); mobile/src/storage/use-observations.ts:18-47 (useFocusEffect deps [refresh, revision]; re
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Confirmed. Refinements. (1) Real changes still fire changed(): wake() at provider.tsx:51-54 and retryNow at :108-115 call it directly. (2) The fix is not delete-only: createSyncCoordinator and activateHeldObservations return void, so both must report whether they acknowledged, deferred or activated anything before changed() can be made conditional. (3) site-versions.ts:37,78 also consumes sync.revision and runs zoneR
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Have the drain return whether it changed any row (activated, acknowledged, attempt recorded), and call changed() only when it did. Do not set loading on revision-driven refreshes; keep showing the previous rows.

## MFD-4 [maps-forms-data] Observations tab and collect map load every record ever kept on the device; the list mounts every row in a ScrollView
- original: medium/medium MEASUREMENT NEEDED; platform: mobile (iOS and Android); journey: Observer reviews what is on the device
- locations: mobile/app/records.tsx:83-131 (records.map inside PageScreen); mobile/src/components/screen.tsx:35-50 (PageScreen = ScrollView); mobile/src/storage/observation-store.ts:79-101 (no WHERE beyond owner, no LIMIT); mobile/src/features/collect/records.ts:20-37 (mapRecords filters the all-account array in
- first verdict (Mac): partially_confirmed -> low MEASUREMENT NEEDED; The core claim holds (unbounded read, parse and mount) and the category is honest, but there are three corrections. (1) The Collect fix `WHERE site_id` does not work: the observations table has no site_id column (database-migrations.ts:9-17 has id, created_at, payload, owner_scope, sync_state, sync_error, server_receipt, attempts, next_attempt_at and package_key), and package_key is per package version. It needs json
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Query only what each screen shows. For the Observations tab: all pending, local-only and needs-attention rows, plus the newest ~50 uploaded rows and a COUNT. For Collect: WHERE site_id. If the full history must be browsable, use React Native's built-in FlatList (virtualized-lists is already in the bundle at 48 KB). No new library is needed.

## MFD-5 [maps-forms-data] Web Data renders every loaded record twice (table plus card list), with 500 focusable SVG markers; selection re-renders everything
- original: low/high DEMONSTRATED COMPLEXITY; platform: web; journey: Manager reviews returned observations
- locations: web/src/features/data/DataTable.tsx:55-100 (table, hidden md:block) and :103-131 (card list, md:hidden), both always mounted; web/src/components/contour/Table.tsx:82-83 (each Tr is a client component calling useRouter); web/src/components/map/SitePlan.tsx:691-731 (each marker: g role=button tabIndex
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low DEMONSTRATED COMPLEXITY; The verification_scenario overstates the gain. Removing the card list takes Z-data from 15,213 to about 10.7k nodes and from about 2.2 MB to about 1.85 MB decoded, so it will not reach 'below about 10k nodes' or 'well under 1.5 MB', and 4x-throttle long tasks will shrink (roughly a third) but not vanish. The remaining weight is the 8k-element table, about 2.5k marker elements and about 420 KB of RSC props. Set the ac
- smallest fix: Render one structure: a single table whose rows restyle as cards below md with CSS (keep the real OBS link, roving tab stop and data-record-id), or mount the card list only below md with useSyncExternalStore (server snapshot = table). Memoize rows on (record, selected) if interaction cost is measured to matter. No virtualization.

## MFD-6 [maps-forms-data] CollectMap re-serializes the whole package GeoJSON to JSON on every render
- original: low/medium MEASUREMENT NEEDED; platform: mobile (iOS and Android); journey: Observer answers a form in the field
- locations: mobile/src/features/collect/CollectMap.tsx:324-341 (not memoized), :499-501 (mapStyle), :556-665 (GeoJSONSources), :366 (useMyLocation), :536-547 (setZoom); mobile/src/features/collect/CollectScreen.tsx:275-305 (inline callbacks and props); mobile/src/features/collect/QuestionStep.tsx:113-123 (dispa
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low MEASUREMENT NEEDED; Keep as MEASUREMENT NEEDED and do not fix before a package near the cap exists (server cap 16 MiB archive, 20k features per layer).
- smallest fix: If a large package ever appears, stringify the static style once per opened package (useMemo on sitePackage and base) and pass the string.

## MFD-7 [maps-forms-data] No device budget for package size: install keeps about six whole-package copies, and every start re-hashes, re-parses and re-validates every installed version
- original: low/medium MEASUREMENT NEEDED; platform: mobile (iOS and Android); journey: Observer prepares a site offline
- locations: mobile/src/packages/hosted/device.ts:112-127 (file.bytes() plus a copy for the digest); expo-crypto ios/CryptoModule.swift:16 (synchronous native digest); mobile/src/packages/hosted/archive.ts:24-47 (unzipSync, strFromU8, JSON.parse on the JS thread); mobile/src/packages/hosted/installation.ts:116-1
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low MEASUREMENT NEEDED; The 'about six copies' count is an estimate from reading the code. Not measured.
- smallest fix: Only if a large package arises: compare the written file's sha instead of reading back the text, and skip the second validation. Deleting files on remove is a separate small hygiene fix.

## MFD-8 [maps-forms-data] Web server re-downloads and re-unzips immutable package archives on every plan view
- original: low/high MEASUREMENT NEEDED; platform: web (Next.js server); journey: Manager browses sites and data
- locations: web/src/lib/api/workspace.ts:227-255 (getPackageArchive / getSitePlan wrapped in React cache); web/node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:724 ('React.cache is scoped to the current request only'); outputs/frontend-audit-2026-10-17/perf/api-fanout.json (Z-sites: 6 d
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low MEASUREMENT NEEDED; The finding frames this as transfer (multi-MB archives); the dominant cost is per-feature CPU (zod validation and projection), which a cache keyed by (packageId, archive_sha256) of the projected plan would also remove. At realistic playground-study sizes it is negligible, so it is a post-launch measurement, not a pre-launch fix. Pre-launch the added module-level cache is more code than the saved milliseconds.
- smallest fix: Do nothing before launch. If hosted p95 for Sites/Data shows archive time, add the in-process LRU of the projected plan keyed by (packageId, archive_sha256), consulted only after the request's own authorized read returns the sha.

## MFD-9 [maps-forms-data] Deletion candidates: web legacy `fields` form path and write-only mobile package tables
- original: low/high DEMONSTRATED COMPLEXITY; platform: web and mobile; journey: 
- locations: backend/src/fieldmaps_api/services/forms.py:35-49 (every saved definition is validated as canonical; domain/form_definition.py:102-111 requires at least one question); web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/page.tsx:25-28,85-93 (isCanonical -> LegacyVersionScreen); web/src/ap
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY (dup of MOB-REC-09 (mobile half; the web half is unique to this id)); The 'do not bump SCHEMA_VERSION' advice is overtaken by the owner's reset decision (see MOB-REC-09).
- smallest fix: Mobile half as MOB-REC-09. Web half: after confirming with a seeded-DB query that no form_versions row lacks `questions`, delete LegacyVersionScreen, both isCanonical branches and the `fields` reader.

## S1 [simplicity-change-cost] The collector wipes unsent records whenever the local schema version changes; the same root cause keeps a frozen legacy account key that cannot be removed safely
- original: critical/high CONFIRMED DEFECT; platform: mobile; journey: Observer collects offline, then installs an app update (TestFlight or dev-client
- locations: mobile/src/storage/database-migrations.ts:5 SCHEMA_VERSION = 6; mobile/src/storage/database-migrations.ts:55-88 initializeDatabase (drops every table in sqlite_master, then runs resetSchema; no unsent-row check); mobile/app/_layout.tsx:105-107 SQLiteProvider databaseName="fieldmaps-shell.db" onInit=
- first verdict (Mac): partially_confirmed -> medium DESIGN PREFERENCE; Keep the mechanism as a latent data-loss hazard, not a CONFIRMED DEFECT: severity medium, not critical. Nothing is lost today because no bump is pending; the loss needs a future SCHEMA_VERSION change over a device with unsent records. Reset-on-mismatch is documented MOB-28 behaviour. The claim 'ordinary updates silently destroy records' is too broad; only schema-bumping builds do. The claim that the legacy key 'can n
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Do not migrate; preserve and refuse to hide. In initializeDatabase, when user_version is neither 0 nor SCHEMA_VERSION: (1) count observations WHERE sync_state != 'synced' plus rows in both draft tables. (2) If the count is above zero, run `VACUUM INTO '<documents>/set-aside/v<old>-<timestamp>.db'` before the DROP; VACUUM INTO must run outside the transaction

## S2 [simplicity-change-cost] The release Observations tab is still the legacy Nocturne records screen, with its own status words that contradict the product's queue vocabulary
- original: high/high CONFIRMED DEFECT; platform: mobile; journey: Observer checks before leaving the field whether their records have uploaded
- locations: mobile/app/(app)/(tabs)/observations/index.tsx:3-5 ObservationsTab Redirect to /records ('Until the Contour observations list lands (Phase 8)'); mobile/app/records.tsx:31-36 STATES (pending -> 'Held', synced -> 'Synced'); mobile/src/features/preview/queue.ts:9-14 STATUS_TO_STATE (local-only -> held,
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; Core claim holds: the Observations tab is the legacy records screen and its status words violate the queue vocabulary. Corrections: (1) The consequence is overstated. The same screen says '{n} held for signal' and its footer says sync runs by itself with signal and the app open, so the observer is not told the records wait on someone else. The real defect is vocabulary (Held for pending, and the banned 'Synced') plus
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Create one exported map, storageStatus -> {label, tone}, in the Contour UI layer using PRODUCT.md's words (local-only: Held; pending: On device; synced: Uploaded; needs-attention: Needs attention). Use it in both records.tsx and preview/queue.ts. Then render records.tsx with the existing src/ui primitives (Screen, ListRow, StateBadge) and switch provider.tsx

## S3 [simplicity-change-cost] The guards that make the duplicated rules safe do not run in CI: form-engine parity, the 393 web unit tests and token drift/contrast
- original: medium/high CONFIRMED DEFECT; platform: web+mobile+shared; journey: 
- locations: .github/workflows/ci.yml:26-42 web job (web:check, test:api-errors, test:auth, test:account, build only); package.json:42-47 root check/test/forms:parity/tokens:check scripts (root `test` = mobile + backend + db); web/package.json:23 check = typecheck + lint; :31 test:unit; web/AGENTS.md:7 lists `pn
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Confirmed with minor ref fixes: the ci.yml web job is lines 26-43, not 26-42. In package.json, check is at line 40, test at 41, forms:parity at 44 and tokens:check at 46 (not 42-47). The parity script is 65 lines. The harm is a plausible future drift, not a current one: every guard passes at HEAD and the project is solo-developed, so medium is the ceiling. The fix is cheap and uncontroversial. Add `node scripts/check
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add to the CI web job: `node scripts/check-form-engine-parity.mjs`, `pnpm --dir web test:unit` and `node scripts/contour-tokens.mjs --check`. The emails half of tokens:check needs uv, so keep it in the backend job. Optionally add `pnpm test:unit` to web `check`.

## S4 [simplicity-change-cost] Web still carries the legacy `fields` form format and a second, unguarded form model that the API no longer supports
- original: medium/high DEMONSTRATED COMPLEXITY; platform: web; journey: 
- locations: web/src/features/forms/LegacyVersionScreen.tsx (94 lines); web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/page.tsx:27-29 isCanonical, :85-93 LegacyVersionScreen branch, :105; web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/publish/page.tsx:36 isCanonical, :106, :129 'I
- first verdict (Mac): refuted -> low DESIGN PREFERENCE; Refuted for HEAD b93a2b2. (1) 'The API no longer supports fields' and 'rejects in upload-target paths' are false. The upload-target path accepts fields-only forms again, and exports read them. Only new authoring and implicit draft copy of fields-only data are rejected. (2) The proposed fix (delete fields-only rows or reset, then remove LegacyVersionScreen and the readers) conflicts with the owner's newest recorded in
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Following the owner's policy, delete the fields-only form_versions rows (or reset) in local and hosted databases, rather than taking the 'preservation decision' from the 577959a message. Then delete LegacyVersionScreen, both isCanonical guards, the legacy flag and copy, LEGACY_KINDS/readField and the 'boolean' kind. Rebuild answerRows/answerLabel on the engi

## S5 [simplicity-change-cost] Rename-era compatibility code with no users contradicts the no-legacy policy
- original: low/high DEMONSTRATED COMPLEXITY; platform: web+mobile; journey: 
- locations: web/next.config.ts:14-31 OLD_ROUTES (11 temporary redirects), :39-42 redirects(); web/e2e/removed-routes.spec.ts:10-20 and web/e2e/support/routes.ts:92-100 REMOVED_ROUTES (passes on 404 or redirect); web/src/lib/pwa/service-worker.js:2-4 LEGACY_CACHE/LEGACY_PREFIX, :65; mobile/app.config.ts:17-18 sc
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY; Treat it as old-install legacy (delete under the policy) rather than rename legacy, and drop the grep verification.
- smallest fix: Delete OLD_ROUTES and redirects(), LEGACY_CACHE/LEGACY_PREFIX, migrateLegacySession with legacyStorageKey, its call and test, and 'fieldmaps' from the scheme list. Keep the live key names.

## S6 [simplicity-change-cost] Write-only and unwired mobile persistence: tables and modules with no production reader
- original: low/high DEMONSTRATED COMPLEXITY; platform: mobile; journey: 
- locations: mobile/src/storage/session-store.ts (64 + 80 test), imported only by package-store.fixture.ts:7; active_sessions table database-migrations.ts:48-50; counted anyway in package-references.ts:21; mobile/src/storage/package-catalog.ts:17-47 writeSelection (reads package_selections only to decide whether
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low DEMONSTRATED COMPLEXITY (dup of MOB-REC-09); S6 omits activateHeldObservations, which MOB-REC-09 covers. Its 'wire removeAccountData' part belongs with MOB-REC-02 or UXC-02, because it is a privacy decision.
- smallest fix: See MOB-REC-09.

## S7 [simplicity-change-cost] Adding a Data filter has a runtime-only trap and a second parser on Reports
- original: low/high DEMONSTRATED COMPLEXITY; platform: web; journey: 
- locations: web/src/features/data/actions.ts:26-36 filtersSchema z.object(...).strict(), not typed against ObservationFilters; :56 parse before try; web/src/features/data/DataScreen.tsx:186-205 loadMore try/finally without catch; web/src/lib/api/observations.ts:82-101 ObservationFilters and filterQuery (single 
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY; The `satisfies z.ZodType<ObservationFilters>` fix is ineffective. A fix that works (verified: TS1360 'Property formVersion is missing', clean without it): declare the shape as an object literal `satisfies Record<keyof ObservationFilters, z.ZodType>` and build `z.object(shape).strict()`. Also latent: zod 4 z.uuid() is RFC-strict and rejects ids such as 11111111-1111-1111-1111-111111111111 that view.ts's permissive UUI
- smallest fix: Use the Record<keyof ObservationFilters, ZodType> shape guard in actions.ts. Optionally call parseView/viewFilters from the Reports page (zones and version unset) and delete its parseDayKey/dayRangeIsBackwards/conversion. Add the missing catch (NEW-LOADMORE).

## S8 [simplicity-change-cost] Map package layer names are declared five times, two of them private duplicates inside web
- original: low/high DEMONSTRATED COMPLEXITY; platform: web+mobile+shared; journey: 
- locations: web/src/lib/packages.ts:14-47 LAYER_NAMES, REQUIRED_LAYERS, SLOT_ORDER, labels and geometry kinds; :118-119 name guess; web/src/lib/sites/archive.ts:69-70 schema and :78 private LAYER_NAMES; :240-293 projection; web/src/features/packages/upload-preview.ts:14 inline ["ground","paths","trees","zones"]
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY; The proposed satisfies against the generated type gives no safety, and the verification scenario ('add benches to the backend LayerName, regenerate: web and mobile tsc fail') is false: regeneration produces identical types.
- smallest fix: In web, export LAYER_NAMES once from lib/packages.ts and import it in sites/archive.ts and upload-preview.ts (delete the two copies). To tie web and mobile to the backend, add one unit test per app that reads contracts/openapi.json and asserts LAYER_NAMES equals components.schemas.PackageRequest.properties.layers.propertyNames.enum.

## S9 [simplicity-change-cost] Mobile dependency surface: an icon barrel is a quarter of the JS bundle, and three native or peer dependencies are unused or undeclared
- original: low/medium DEMONSTRATED COMPLEXITY; platform: mobile; journey: 
- locations: mobile/src/ui/Icon.tsx:1-86 imports 83 icons from the 'lucide-react-native' barrel; outputs/frontend-audit-2026-10-17/mobile-checks/bundle-attribution.txt:10,47,79-80 lucide-react-native 1543.9 KB = 25.2% of 6.26 MB iOS JS (barrel 615.9 KB + 1877 per-icon modules 922.4 KB); mobile/node_modules/lucid
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DEMONSTRATED COMPLEXITY; Keep the lucide change (the only part with a demonstrated cost). Downgrade the other three to hygiene, and do not remove expo-updates unless the owner drops OTA.
- smallest fix: In Icon.tsx import each icon from lucide-react-native/icons/<file> using the real file names, and pin lucide-react-native exactly. Add expo-font to package.json via expo install. Leave expo-updates until the OTA decision.

## UXW-1 [ux-web-manager] Server-blocked map upload is reported as a zone-shape error; the real reason (e.g. online basemap in the .qgz) is discarded
- original: high/high CONFIRMED DEFECT; platform: web (Next.js) + API package preparation; journey: M1 upload a map package and understand its checks
- locations: backend/src/fieldmaps_api/domain/packages.py:26 NO_PERMITTED_HOSTS (empty); backend/src/fieldmaps_api/domain/packages.py:237-296 _check_imagery_licence (blocked detail '...fetched from a tile service on demand... Supply institution-owned or openly licensed imagery.'); backend/src/fieldmaps_api/domai
- first verdict (Mac): partially_confirmed -> high CONFIRMED DEFECT; Core defect confirmed; three details need fixing. (1) 'Nothing on screen names the actual blocker' is overstated. Read project does list the basemap layer: backend/src/fieldmaps_api/domain/project_worker.py:46-56 emits ImportIssue 'This layer was not converted. Only file-based vector layers are supported; imagery and remote layers remain in QGIS.', which ProjectImport.tsx shows and which stays on screen after the fai
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Carry the first blocked PreparationCheck (step + detail) out of the worker, for example by writing error.json before exit(2). Return it in the 422, either as an issue code such as package_check_blocked with a message, or as `detail`. In UploadStep.uploadProblem, show failure.detail for any non-zone issue code instead of issueText. Cheaper still: have Read pr

## UXW-2 [ux-web-manager] Manager cannot tell which form version observers collect with: Forms list pairs the newest published version with sites using an older one, and Overview says 'Nothing needs attention'
- original: medium/high CONFIRMED DEFECT; platform: web; journey: M1 understand what is published and available to collectors
- locations: web/src/features/forms/model.ts:49 'Every site whose current package uses any version of this form.'; web/src/features/forms/model.ts:78-85 formRows union of sites over all versions; web/src/features/forms/model.ts:91 published = newest published version; web/src/features/forms/ProjectFormsScreen.ts
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; The ambiguity and the missing Overview item are real, but the title and consequence overstate. (a) 'Manager cannot tell' is too strong: the Site page, the Form versions screen and the publish screen each show the true binding. The gap is the Forms list row and the Overview. (b) The Overview sentence is literally true as written; it omits version binding rather than lying. (c) 'Data collected on the wrong protocol can
- cloud verdict: confirmed -> medium CONFIRMED DEFECT; The prior partial confirmation holds. The Publish page ('Using another version of this form now: ...' plus a delivery warning behind a checkbox), the Versions screen and the Site page do show the true binding, so the gap is the Forms row and the Overview. The Overview sentence is literally true as written; it omits version binding.
- smallest fix: Render 'Used by' on the Forms row as site plus its version, from versions[].sites, or show only the sites for the version displayed. Add an Overview 'waiting' item: '<form> vN is published; no site's current map names it - observers still get vM'.

## UXW-3 [ux-web-manager] On iPad and laptops under 1280 px, the Data site plan renders after the whole loaded table (up to 500 rows), so map/table coordination is out of reach
- original: medium/medium CONFIRMED DEFECT; platform: web on iPad (1024/768) and small or zoomed laptops; journey: M5 find returned observations on the data page map
- locations: web/src/features/data/DataScreen.tsx:375-401 wrapper `plan ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:items-start" : undefined`, Observations island before DataMap; web/src/features/data/DataScreen.tsx:210-214 selectMarker scrollIntoView moves to the row; web/src/features/data/Dat
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; No change to the claim. Notes: confidence is medium only because no tablet render exists; the DOM order and breakpoint are unambiguous from code, and the phone-390 screenshot shows the stacked order. Default 13-inch laptops at 1440/1470 CSS px are at or above 1280 and get the side-by-side layout, so the real exposure is iPad and zoomed laptop windows. Between 390 and 767 px the table becomes cards but the plan is sti
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Below xl, place DataMap before the Observations island (DOM order, or `order-first` on the plan column), with a compact height. At xl, make it `sticky top-4`. Optionally collapse it behind a 'Show the plan' disclosure only below md. No virtualization or new library is needed: the problem is order and position, not rendering cost.

## UXW-4 [ux-web-manager] A new form version reaches observers only through a full QGIS re-upload with zone-by-zone re-confirmation; an older QGIS zones layer silently replaces boundaries edited on the web
- original: medium/high DEMONSTRATED COMPLEXITY; platform: web + API; journey: M1 prepare/publish a form version so collectors get it
- locations: web/src/features/forms/PublishScreen.tsx:175-194 'What happens for observers' + 'Go to Sites to prepare a map package'; web/src/features/forms/model.ts:285-296 deliveryOf; web/src/app/(app)/o/[org]/p/[project]/sites/[site]/packages/page.tsx:221-296 UploadSection (published form required); web/src/fe
- first verdict (Mac): partially_confirmed -> medium DEMONSTRATED COMPLEXITY; Two factual corrections and one reframing. (1) 'Nothing compares the file's zone geometry with the current version' is inaccurate. The server does compute it: validate_zone_import (queries/zones.py:74 IMPORT_VALIDATE) calls fieldmaps_private.zone_validation (supabase/migrations/20261012120000_current_baseline.sql ~1756-1830), which sets a per-zone change of added/removed/geometry_changed/label_changed/unchanged (Zone
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add a server 'rebind' action that publishes vN+1 from the retained current archive with a new form_version and inventory form. It reuses the PublishJob path, which already builds from the retained archive and forms, and the IMPORT_FORMS resolution. Expose it as 'Use <form vN> on this map' on the site's Current map package island and on PublishScreen. Interim

## UXW-5 [ux-web-manager] Invitations: the shown-once code and link are discarded by Esc or a tap outside the dialog; email delivery outcome is never shown; default of 1 use contradicts the 'several people' hint
- original: medium/high CONFIRMED DEFECT; platform: web; journey: M1 invite observers
- locations: web/src/features/people/InviteDialog.tsx:74-78 changeOpen(false) -> reset() clears `created`; web/src/components/contour/Dialog.tsx:34-35 'Esc and a press on the scrim close it' (no onInteractOutside/onEscapeKeyDown guard); web/src/features/people/InvitationCreated.tsx:60-90 link and join code shown
- first verdict (Mac): partially_confirmed -> low CONFIRMED DEFECT; Only trigger (1) is a clean defect, and its consequence is smaller than stated. The UI already says 'Links and join codes are shown only once. To send one again, revoke it and create a new invitation.' (InvitationsTable.tsx:54), and the dialog Note says 'It is shown only once' (except in the queued-email case). A code that was never copied is known to nobody, so the 'stray valid code stays live' risk is negligible; r
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Once an invitation is created, keep the dialog open on Esc and outside taps (preventDefault in onEscapeKeyDown and onInteractOutside), so only Done closes it, or ask 'Close without copying?'. Show the created time on Join code rows. Expose the outbox status (sent/failed) on the invitation listing and show 'Email not delivered — copy the code' there; at minim

## UXW-6 [ux-web-manager] Observer filter is exact and case-sensitive, so typing lowercase initials shows 'No observations match this view'
- original: low/high CONFIRMED DEFECT; platform: web + API; journey: M5 find returned observations by observer
- locations: web/src/features/data/FilterBar.tsx:50-61 commitObserver trims only; backend/src/fieldmaps_api/domain/observation_filters.py:13 `o.observer_code = :observer`; backend/src/fieldmaps_api/observation_analysis_schemas.py:22-24 Observer: strip, 1-12 chars (no case rule); backend/src/fieldmaps_api/identit
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; (1) The cited observation_filters.py:13 is the wrong file: the predicate is in queries/observation_analysis.py:13. (2) 'Observer codes cannot contain lowercase' is only a collector and profile convention (mobile/src/features/onboarding/identity.ts:25 uppercases, identity_schemas.py:10 pattern ^[A-Z0-9]{1,10}$). The upload payload accepts any 1-12 character observer (zone_observation_schemas.py:48) and the DB check is
- smallest fix: Make the match case-insensitive on the server: upper(o.observer_code) = upper(:observer) in observation_analysis.py:13 (the export uses the same filters, so it follows). Optionally uppercase the typed text in commitObserver as well.

## UXW-7 [ux-web-manager] Data → observation → 'Data' breadcrumb returns to an unfiltered page; loaded pages are lost even on Back
- original: low/high CONFIRMED DEFECT; platform: web; journey: M5 review a filtered set of observations one by one
- locations: web/src/features/data/DataScreen.tsx:124-125 hrefOf = `${base}/${record.id}` (no query); web/src/features/observation/ObservationDetail.tsx:82,99 breadcrumb {label:'Data', href: projectHref(org, project, 'data')}; web/src/app/(app)/o/[org]/p/[project]/data/page.tsx:183 DataScreen key includes genera
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; The smallest fix forwards the filters but does NOT recover the loaded-more pages or scroll; that loss is inherent to the component unmounting and would need the state kept elsewhere (not a small change). In the detail page, parse the query with parseView and rebuild it with viewQuery rather than echoing raw searchParams.
- smallest fix: hrefOf = `${base}/${record.id}${viewQuery(current)}`; in data/[observation]/page.tsx read searchParams, run parseView then viewQuery, and pass the result so the breadcrumb href is `${dataHref}${query}`.

## UXW-8 [ux-web-manager] Empty-project Overview points its one primary action at an empty Data page, and its attention list sends the manager to upload before a form exists
- original: low/high DESIGN PREFERENCE; platform: web; journey: M1 first-run setup (novice manager)
- locations: web/src/app/(app)/o/[org]/p/[project]/page.tsx:139-146 primary 'Open observations' always; web/src/features/overview/model.ts:86-136 order: no site → no package (link to ?step=upload) → no form; web/src/app/(app)/o/[org]/p/[project]/sites/[site]/packages/page.tsx:248-265 'No published form yet … Pub
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DESIGN PREFERENCE; The doc order error is a confirmed inaccuracy, but the UI part is a first-run polish matter: every loop step is explained on screen and nothing is lost, so it stays a design preference. Severity low.
- smallest fix: In attentionItems emit 'no-form' before the per-site loop (when forms !== null) and update the two unit tests; swap J1 steps 3 and 4 in PRODUCT.md and docs/plan/product.md. Optional: when total observations is 0 and attention items exist, render 'Open observations' as outline.

## UXW-9 [ux-web-manager] Upload success confirmation may render off-screen at ≥1280 px while the visible form resets to empty
- original: low/low MEASUREMENT NEEDED; platform: web desktop ≥1280 px; journey: M1 upload a map package ('uploaded' claim)
- locations: web/src/features/packages/UploadStep.tsx:473 `xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]`; web/src/features/packages/UploadStep.tsx:450 setSlots(EMPTY_SLOTS) after success; web/src/features/packages/UploadStep.tsx:759 ServerResult at the top of the right column; :822 'Uploaded to DECA Mark'; web/s
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low MEASUREMENT NEEDED; 'Below the fold' holds only for the right-column island, not for all confirmation. Duplicate-upload risk is limited: files must be chosen again (slots cleared), and the result is also aria-live. Still unmeasured: the actual scroll position after the reset.
- smallest fix: If a rendered 1440x900 run confirms it: render ServerResult under the Upload button (or focus/scrollIntoView the island after success).

## UXC-01 [ux-mobile-collector] On iPhones the keyboard covers the whole answer panel: the required play-event summary is typed blind and cannot be dismissed
- original: high/high CONFIRMED DEFECT; platform: iOS phone (portrait and landscape); iPad portrait partially (iPad has a hide-key; journey: C3 Answer
- locations: mobile/src/features/collect/CollectScreen.tsx:474-483 (panelBlock KeyboardAvoidingView behavior padding); mobile/src/features/collect/CollectScreen.tsx:497-502 (map slot fixed height '46%' in portrait); mobile/src/features/collect/QuestionStep.tsx:141-145 (ScrollView without keyboardDismissMode); mo
- first verdict (Mac): partially_confirmed -> high CONFIRMED DEFECT; The headline holds, but the stated KAV arithmetic is wrong. KeyboardAvoidingView uses frame.y from onLayout, which is parent-relative (KeyboardAvoidingView.js:129). RN therefore pads only about 135 pt on a 390x844 iPhone, not about 302 pt, and the content box is about 150-170 pt, not 0. The outcome is the same because the panel's window-top is about 506-525 pt against a keyboard top of about 508 pt (QuickType on). Th
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: In CollectScreen, read the existing useKeyboardVisible() hook. While the keyboard is up, give the map slot height 0 and hide the status line, the same way `expanded` hides the panel, so the panel gets the full body height. Add keyboardDismissMode="on-drag" to the QuestionStep ScrollView. No new library is needed.

## UXC-02 [ux-mobile-collector] Upload and hold wording is false where observers decide: Account and Sign out say the app does not upload; practice records are 'held' as if they will upload
- original: high/high CONFIRMED DEFECT; platform: iOS and Android, all sizes; journey: C4 sign-out / C3 Saved
- locations: mobile/app/(app)/(tabs)/account/index.tsx:135-138 (Note 'This version does not upload yet.'); mobile/app/(app)/(tabs)/account/index.tsx:121-126 (same screen shows an Uploaded count); mobile/app/(app)/(tabs)/account/sign-out.tsx:125-131 ('This version does not upload yet, so they wait here either way
- first verdict (Mac): confirmed -> high CONFIRMED DEFECT; Every ref is correct. The uploader is live: SyncProvider is mounted at app/_layout.tsx:114 and uploads only while a session is present. The same app says the opposite elsewhere: SavedStep.tsx:119, guide content.ts:~83, the Account screen's own ResumeUploadsNote ('Uploading needs this account signed in') and records.tsx ('Sync runs by itself... no send button'). The Account copy was last edited 2026-10-15 19:15 and th
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Delete the two 'does not upload yet' notes. Replace the sign-out line with: 'Signing out pauses their upload until {email} signs in again on this device. To upload them first, stay signed in with the app open and online.' Change the heldOnly copy (SavedStep, guide, leaving.ts) to 'Practice record: stays on this device and is never uploaded.'

## UXC-03 [ux-mobile-collector] A double tap on a single-choice answer clears it or silently answers the next question (160 ms auto-advance, no input guard)
- original: medium/high CONFIRMED DEFECT; platform: iOS and Android, all sizes; journey: C3 Answer
- locations: mobile/src/features/collect/CollectScreen.tsx:42 (AUTO_ADVANCE_MS = 160); mobile/src/features/collect/CollectScreen.tsx:205-218 (dispatchStep sets the advance timeout); mobile/src/forms/session.ts:83-89 ('choose' on the already-chosen option un-chooses it, autoAdvance false); mobile/src/ui/AnswerTil
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; The reproducer output is confirmed: a second tap at 120 ms leaves answers {} on Q1, and a second tap at 250 ms yields {age_range: age_3_5, play_type_1: exploratory} with the screen on 'Exploratory play — which kind?'. In the real UI, AnswerGrid is outside the keyed FadeIn view, so the next question's tiles are live at once. Q1 has a 2-line hint and Q2 has none, so Q2's grid sits about 46 pt higher and a same-position
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: In QuestionStep, record the time each question mounts and ignore tile presses for about 400 ms after it. Within the same window, make a re-tap of the selected option a no-op, so un-choosing only works after the window. Keep the 160 ms auto-advance.

## UXC-04 [ux-mobile-collector] The Observations tab swaps the whole app for the legacy dark records screen, using the wrong state words and a retry that cannot fix rejections
- original: medium/high CONFIRMED DEFECT; platform: iOS and Android, all sizes; journey: C4 queued, uploaded and rejected work
- locations: mobile/app/(app)/(tabs)/observations/index.tsx:5 (<Redirect href="/records">); mobile/node_modules/expo-router/build/link/Redirect.js:31-43 (router.replace on focus); mobile/node_modules/expo-router/build/global-state/getNavigationAction.js:31-47 (targets the deepest divergent navigator, here the ro
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; The core claim is confirmed. Redirect calls router.replace on focus. findDivergentState finds 'records' diverging from '(app)' at the root, so a REPLACE hits the root stack and unmounts the whole (app) group, including the tabs and TabDock. The screenshot (2026-10-11, theme day, verifiedByOperator) shows the dark #161826 screen, '← Back to the map', no dock and the stale footer 'Point placed by hand…'. records.tsx:31
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Render a Contour list inside the observations tab stack. Read the same useQueue() mapping (features/preview/queue.ts) through StateBadge, and show each record's stored message with a first line saying where it is. Offer Retry only for codes that can change on the server side (membership_required, package_not_ready); otherwise end the message with 'Tell your 

## UXC-05 [ux-mobile-collector] Draft failures are never shown: Collect always claims 'Draft kept on this device', and an unreadable draft blocks all collection with no card to discard it
- original: high/medium CONFIRMED DEFECT; platform: iOS and Android; journey: C3 interruption and recovery
- locations: mobile/src/features/collect/CollectScreen.tsx:423-437 (status text hard-coded 'Draft kept on this device as you answer'); mobile/src/session/draft-persistence.ts:88-95 (validation or saveDraft failure only calls failed(), which sets session.status); mobile/src/session/draft-persistence.ts:29-38 (unr
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; The UI gaps are confirmed. CollectScreen.tsx:431-432 hard-codes 'Draft kept on this device as you answer'. A persistDraft failure only calls setStatus (provider.tsx:125-128), and session.status is rendered only by the legacy components/screen.tsx, never on Collect. useUnfinished() returns null when only unreadableDraft is true, nothing consumes recovered-drafts.ts:63, and openPackage and begin refuse with 'Resume or 
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Drive the Collect status line from the last draft write result: on failure, show 'Not kept: this observation is only in memory. Save it now.' Add an UnfinishedCard variant for an unreadable draft: 'An unfinished observation from an older version cannot be opened. Discard it to continue.', with a confirmed Discard calling clearDraft. During a save, disable th

## UXC-06 [ux-mobile-collector] A token refresh silently cancels a running site download and briefly shows a downloaded site as 'Not downloaded · needs a connection'
- original: medium/medium CONFIRMED DEFECT; platform: iOS and Android; journey: C2 download and Ready offline
- locations: mobile/src/auth/provider.tsx:160-195 (setState with the new session on every auth event, TOKEN_REFRESHED included); mobile/src/packages/hosted/provider.tsx:50-59 (api useMemo deps [client, session, userId]); mobile/src/packages/hosted/provider.tsx:61-77 (operations recreated when api changes); mobil
- first verdict (Mac): confirmed -> low CONFIRMED DEFECT; The mechanism is confirmed by code reading. A TOKEN_REFRESHED event sets a new session, which recreates api and then PackageOperations. The effect clears downloads and installed, and the cleanup disposes the old operations and aborts the running download. The catch is suppressed because runtime.current() is false after the generation change. Until catalog() re-verifies, HostedPackageIsland shows 'Not downloaded · {si
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Key the API client and operations on client, userId and whether a session exists (session !== null), not on the session object. The token getter already calls getSession() per request.

## UXC-07 [ux-mobile-collector] Phone-height collect layout: map controls are clipped, and the Saved step's only forward action sits below the fold
- original: medium/medium CONFIRMED DEFECT; platform: phones (portrait and especially landscape); tablets fit; journey: C3 Place / Saved loop
- locations: mobile/src/features/collect/CollectMap.tsx:220 (frame overflow hidden); mobile/src/features/collect/CollectMap.tsx:247-253 (controls: one absolute column); mobile/src/features/collect/CollectMap.tsx:763-809 (6 map IconButtons); mobile/src/ui/IconButton.tsx:29,41 (44 pt plus 3 pt ledge); mobile/src/f
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Confirmed by arithmetic. The six map controls need 334 pt (6 x 47 + 5 x 8 + 12), and the frame clips them. iPhone 14 portrait has a 284 pt frame, so 'Make the map larger' is hidden. An SE has 230 pt, so layers and expand are hidden. Phone landscape with the strip has about 186 pt, so only zoom ±/frame are fully visible, location is a 9 pt sliver, and layers and expand are hidden. In the collapsed state the expand but
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Pin 'Place the next observation' (or 'Inventory … next') outside the ScrollView, as Place, Question and Review already do. On tablet landscape, follow DESIGN.md:232: go straight to Place with the existing 'Last saved on this device' line. Lay the map controls out in two columns when the frame is under about 340 pt, or fold layers, location and expand into th

## UXC-08 [ux-mobile-collector] Every 5 s while online, Account counts and the sign-out warning flash to 'Reading records from this device…' and the Sign out button turns off
- original: low/medium CONFIRMED DEFECT; platform: iOS and Android, signed in, online, foreground; journey: C4 sign-out
- locations: mobile/src/sync/provider.tsx:127-129 (setInterval wake every 5000 ms); mobile/src/sync/foreground.ts:18-21 (changed() after every drain, even when nothing changed); mobile/src/storage/use-observations.ts:18-22 (setLoading(true) on every refresh); mobile/app/(app)/(tabs)/account/index.tsx:89-90; mobi
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT (dup of MFD-3); Duplicate of MFD-3's root cause (unconditional changed() and loading on revision refresh). Account, Sign out and Delete account are the user-facing places where it matters.
- smallest fix: As MFD-3: drain reports whether anything changed and calls changed() only then, and useObservations sets loading only on the first read for a key.

## UXC-09 [ux-mobile-collector] Rotating the device remounts the field map and the step panel, moving the aim back to the zone centre
- original: low/high CONFIRMED DEFECT; platform: iOS and Android with orientation set to 'Follow the device' (the default); journey: C3 Place / Review
- locations: mobile/src/features/collect/CollectScreen.tsx:485-503 (map at body>View>View in landscape vs body>View in portrait; panelBlock at child index 1 vs 2); mobile/src/features/collect/CollectScreen.tsx:64-70 (doc: 'MapLibre stays mounted from the first point to the hundredth'); mobile/src/features/collec
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT (dup of MOB-REC-08); Duplicate. Merge into MOB-REC-08.
- smallest fix: See MOB-REC-08.

## UXC-10 [ux-mobile-collector] Collector preferences promised by PRODUCT and DESIGN (preferred hand, haptics, larger text, Dusk) can only be set in dev builds
- original: low/high DESIGN PREFERENCE; platform: release builds, iOS and Android; journey: one-handed reach / outdoor use
- locations: mobile/src/ui/preferences.tsx:30-33,75-88 (store and defaults); mobile/app/(dev)/states.tsx:232 and mobile/app/(dev)/gallery.tsx:257,855,861,881 (the only callers of preferences.set); mobile/app/(app)/(tabs)/account/index.tsx:140-160 (only orientation is settable); PRODUCT.md:166; DESIGN.md:232 ('pa
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low DESIGN PREFERENCE; None. The finding is correct and is a product decision, not a defect.
- smallest fix: Owner picks one. Either delete the unreachable prefs (hand, haptics, largerText, dusk), their dev setters and the doc promises, or add a one-row Segmented 'Panel side' to Account. For the pilot tablets, hand only matters in landscape.

## A11Y-01 [accessibility] The release Observations tab is the legacy Nocturne screen, outside the accessibility system
- original: medium/high CONFIRMED DEFECT; platform: native (iOS and Android); journey: Observer checks which records are safe, held or need attention, then retries rej
- locations: mobile/app/(app)/(tabs)/observations/index.tsx:4-6 (Redirect to /records); mobile/app/records.tsx:57 (label "← Back to the map" / "← Studies"), :62 (title is a plain Text, no header role), :88-130 (a record is 5 sibling nodes, ungrouped), :109 (Chip), :115 (numberOfLines={2} on the answer summary); 
- first verdict (Mac): partially_confirmed -> low CONFIRMED DEFECT; Core claim stands: the Observations tab is the legacy Nocturne screen, with no header role on the title, an 11.5 pt text-only chip with no glyph, and a numberOfLines={2} clamp that breaks DESIGN Rule 05. Corrections: (1) A record is 4 accessible stops (OBS label, chip, meta, summary); the 5th (sync_error) appears only on rows that have an error. (2) The 'no max font multiplier' point cuts the other way. Legacy Text h
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Do not patch the legacy screen. Render the Contour list (ListRow + StateBadge, using the existing queue mapping) inside the tab stack, as the earlier UX finding proposes, and delete the legacy chrome. If that slips before the pilot, make four one-line patches in records.tsx: a header role on the title, an accessible label per record row combining label, stat

## A11Y-02 [accessibility] Accessibility preferences the product promises (Dusk, larger question text, preferred hand, haptics) cannot be changed in release builds
- original: medium/high CONFIRMED DEFECT; platform: native (iOS and Android); journey: Left-handed, low-vision or glare-sensitive observer sets up the collector before
- locations: mobile/src/ui/preferences.tsx:26-34 (Preferences type and defaults), :73-98 (provider); mobile/app/(dev)/gallery.tsx:257,855,861,881 and mobile/app/(dev)/states.tsx:232 (the only preferences.set callers); mobile/src/ui/theme.tsx:19-20,71 (larger question text, a +4 step); mobile/src/features/collect
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Confirmed with no ref errors. Two additions. (1) mapPalette has no setter anywhere outside the dev gallery either, and PRODUCT.md:166 also promises 'the map palette', so the gap is five preferences, not four. (2) This is already planned work: MOB-27 item 4 (mobile/PLAN.md:535, status doing) specifies exactly this Preferences UI and has not been built. Medium is defensible only because PRODUCT.md lists these under Acc
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add one Account island using the existing Segmented and Switch primitives: Screen (Day or Dusk), Panel side (Left or Right), Larger question text, and Haptics, each calling usePreferences().set. That is about 40 lines and no new primitive. If the pilot will not use them, delete `largerText` and `hand` and stop promising them in PRODUCT.md and DESIGN.md.

## A11Y-03 [accessibility] Three native live regions are Android-only, so VoiceOver is silent when the cross leaves its zone; two other messages are announced twice
- original: medium/high CONFIRMED DEFECT; platform: native (iOS mainly; Android for the duplicates); journey: Observer using VoiceOver nudges the cross, then places the point and saves
- locations: mobile/src/features/collect/PlaceStep.tsx:124-136 (placement readout; its text decides whether "Place point here" is enabled); mobile/src/features/collect/CollectMap.tsx:878 (selected-record callout); mobile/src/ui/OnlineIndicator.tsx:63-70; mobile/node_modules/react-native/Libraries/Components/View
- first verdict (Mac): confirmed -> medium CONFIRMED DEFECT; Core claim confirmed: on iOS VoiceOver the zone-coverage readout changes silently when the cross leaves its zone. Platform correction: the save confirmation is doubled on iOS as well as Android. StatusLine live fires its iOS announce() fallback with 'OBS-xxxx saved on this device' while CollectScreen's effect announces the same words with a trailing period, both queued, so the fix of dropping the CollectScreen effect
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Reuse the StatusLine pattern (an iOS-only effect that calls announce() when the text changes) for the PlaceStep readout and the callout. Remove one half of each duplicate pair: drop the CollectScreen save announce because StatusLine live already speaks it, and guard Field's announce with Platform.OS === "ios" like Note does.

## A11Y-04 [accessibility] The native map camera ignores Reduce Motion although the product promises map moves jump
- original: low/high CONFIRMED DEFECT; platform: native (iOS and Android); journey: Observer with Reduce Motion enabled nudges, taps, zooms or frames a zone on the 
- locations: mobile/src/features/collect/CollectMap.tsx:378 (easeTo to my location), :408 (moveTo, used by nudge, tap-to-aim, cluster zoom and adjust), :417 (fitBounds), :769 and :778 (zoom buttons); each passes duration: motion.camera; mobile/src/ui/tokens.ts:55-66 (MOTION); PRODUCT.md:165 ("makes map moves jum
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; None.
- smallest fix: Call useReducedMotion() once in CollectMap and use duration reduceMotion ? 0 : motion.camera at the six call sites.

## A11Y-05 [accessibility] Web shortcut layer fails WCAG 2.1.4 and the shortcut dialog documents Approve and Exclude keys that do nothing
- original: low/high CONFIRMED DEFECT; platform: web; journey: Keyboard or speech-input manager uses the workspace; the Shortcuts dialog is the
- locations: web/src/features/shell/useShortcuts.ts:53-80 and :84 (window keydown: `g` chord, `?`, `/`); web/src/lib/shortcuts.ts:56-70 (chord state, read by ZoneEditor.tsx onKeyDown), :90-100 (DATA_SHORTCUTS rows `a` and `x`), :102; web/src/components/shell/ShortcutsDialog.tsx:41; web/src/components/contour/use
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; Three dead rows (a, x, Esc), not two. Deleting the handlers also touches the hint chips in the palette (go-section shortcut: ['g', key] and the ['?'] chip), ZoneEditor's chordPending guard, a unit test and one e2e step that presses g then s.
- smallest fix: Delete the g, ? and / branches of useShortcuts, PROJECT_GO_KEYS/ORG_GO_KEYS/startChord/chordPending/CHORD_TIMEOUT, the PROJECT/ORG groups and the a, x, Esc rows, the palette shortcut chips, and the two tests; fix PLAN.md:395,400. Ctrl/Cmd+K, the roving table keys, and the Keyboard shortcuts entries in the account menu and palette remain. Alternative: one per

## A11Y-06 [accessibility] Password Show/Hide toggles fail Label in Name on web and native
- original: low/high CONFIRMED DEFECT; platform: web and native; journey: Voice-control user on sign in, sign up or reset password while the password is v
- locations: web/src/components/contour/PasswordInput.tsx:57-72 (aria-label="Show password" constant, aria-pressed, visible text flips Show/Hide); mobile/src/ui/PasswordInput.tsx:28-41 (accessibilityRole="switch", accessibilityLabel="Show password", visible text flips Show/Hide)
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low CONFIRMED DEFECT; None for the native half. Web half not checked here.
- smallest fix: accessibilityLabel={shown ? 'Hide password' : 'Show password'} with role button (or keep the constant label and make the visible text constant).

## A11Y-07 [accessibility] Cluster marker on the collect map is a 36 pt target with no hitSlop
- original: low/high CONFIRMED DEFECT; platform: native (iOS and Android); journey: Observer zoomed out on the collect map taps a cluster of earlier records
- locations: mobile/src/features/collect/CollectMap.tsx:295-303 (cluster style: minWidth 36, height 36), :671-691 (Pressable without hitSlop); mobile/PLAN.md:406-419 (MOB-18 lists the cluster marker as too small; status todo); PRODUCT.md:158 (targets of 48 to 60 on the collector)
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low CONFIRMED DEFECT; The size problem stands. The one-line fix is not proven to work inside a Marker.
- smallest fix: Make the Pressable itself at least 44 pt (minWidth/height 44) and draw the 36 pt pill inside it, so no slop is needed. Check with Accessibility Inspector on a device.

## A11Y-08 [accessibility] Native disabled reasons are exposed only as accessibilityHint, which RN 0.86.3 maps to Android tooltipText
- original: low/low MEASUREMENT NEEDED; platform: native (Android TalkBack); journey: TalkBack user meets a disabled Sign in during a rate-limit wait, or a disabled P
- locations: mobile/src/ui/Button.tsx:183-186 (hint = disabledReason), :205-233 (the visible reason is hidden with accessibilityElementsHidden and no-hide-descendants); mobile/node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.kt:82-89 (accessibilityHint 
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low MEASUREMENT NEEDED; None. Needs a TalkBack run.
- smallest fix: Test on the pilot Android tablet first. If silent, drop the hidden wrapper at Button.tsx:229 and the hint so the reason is its own readable element.

## A11Y-09 [accessibility] The assistive-technology matrix the product promises has never been run, and the automated axe scan is narrower than it looks
- original: medium/low MEASUREMENT NEEDED; platform: web and native; journey: All journeys, before the Janet pilot on a real iPad and Android tablet
- locations: PRODUCT.md:163-164 (live regions and VoiceOver coverage promised); mobile/PLAN.md:406-419 (MOB-18 Accessibility, status todo), :575-580 and mobile/README.md:3,193 (VoiceOver walkthroughs pending); web/PLAN.md:512 (manual matrix pending: keyboard-only, VoiceOver and NVDA, iPad Safari, reduced motion)
- first verdict (Mac): partially_confirmed -> low MEASUREMENT NEEDED; The 'never run' premise is right, but unknown (9) is partly wrong. 'axe is never run on mid-edit editor states' is refuted for the dev specimen: web/e2e/specimen/zone-editor.specimen.ts:515-540 runs AxeBuilder with a zone and a point selected, and zone-drawing.specimen.ts:273-295 runs it while drawing, each in Day and Night map palettes. Caveats that keep a gap: both run against the dev-only /dev/zone-editor specimen
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add 'wcag22aa' to the AxeBuilder tags and one spec that opens the account menu, shortcuts dialog, command palette, Layers popover, a Dialog and the zone editor mid-draw, then runs axe. Run the 9-scenario manual list on the pilot iPad and Android tablet before Janet, and record it in MOB-18. If scenario 1 shows focus stuck on <main>, have RouteFocus wait for 

## TEST-01 [testing] CI runs 84 of 477 web node tests; the 393-test unit suite, forms:parity and tokens:check never run
- original: high/high CONFIRMED DEFECT; platform: web + ci; journey: 
- locations: .github/workflows/ci.yml:26-43 (web job: web:check, test:api-errors, test:auth, test:account, pnpm build; no test:unit); .github/workflows/ci.yml:100-108 (plan job runs only docs/plan/check-plan.mjs and scripts/*.test.mjs database/*.test.mjs); web/package.json:31 (test:unit script over tests/unit/*.
- first verdict (Mac): confirmed -> high CONFIRMED DEFECT; No substantive correction. Two details: docs/Workspace.md:67 is vague ('the same web/mobile checks') rather than naming test:unit, so the stronger doc claim is web/AGENTS.md:7, which lists test:unit as a check. Severity high is defensible but reflects process risk, not user impact. The one-line fix (add test:unit, forms:parity, tokens:check) stands.
- cloud verdict: confirmed -> medium CONFIRMED DEFECT; Severity high is generous: all suites are green today and the cost is a missing guard, not a present failure; medium fits a pre-pilot repo whose own docs say CI covers these checks. Refinement: the emails half of tokens:check is already guarded in CI by backend/tests/test_email.py::test_contour_generated_templates_match_contract; only 'node scripts/contour-tokens.mjs --check' (web contour.css drift and contrast pairs
- smallest fix: In the web job add '- run: pnpm --dir web test:unit' and '- run: pnpm forms:parity' (about 5 s total) and in the existing contracts or web job '- run: node scripts/contour-tokens.mjs --check' (1 s, no uv needed). Optionally fold the three into a root script so Workspace.md:67 becomes true.

## TEST-02 [testing] The only real collector-to-API upload round trip has no runner; five acceptance files skip silently in CI
- original: high/high CONFIRMED DEFECT; platform: mobile + ci; journey: Observer saves offline, restarts, a newer map is published, the outbox uploads e
- locations: mobile/src/sync/bound-upload-api.acceptance.test.ts:22-23 (const input = process.env MOB29_BOUND_API_FIXTURE; it.skipIf(!input)); database/tests/test_mobile_bound_upload_api.py:31 (test_mobile_bound_outbox_restart_publication_replay_and_inventory) and :95-110 (subprocess.run of mobile vitest with th
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; The consequence sentence is overstated. 'The pilot's central promise rests on unit tests with a fake server' ignores backend CI live tests. backend/tests/test_bound_upload_live.py PUTs a bound point and replays it, asserts byte-identical replay content and readback, and asserts that concurrent retries commit one observation. It runs in the CI backend job with the integration marker. Server-side exactly-once and lost-
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add one named target, for example `pnpm backend:test:mobile`, that runs `sh database/zone-api-rehearsal.sh -c pyproject.toml ../database/tests/test_mobile_bound_upload_api.py ../database/tests/test_mobile_package_api.py`, and run it in a nightly or workflow_dispatch workflow (the rehearsal script uses docker run --pull never, so the job must pre-pull the Pos

## TEST-03 [testing] No native runtime layer: mobile component tests render a fake react-native and the core collect screens are never rendered
- original: high/medium MEASUREMENT NEEDED; platform: mobile; journey: Observer starts a record, force-quits the app, relaunches and resumes; account A
- locations: mobile/src/ui/native.fixture.tsx:1-207 (reactNative host stubs for View, Text, Pressable, ScrollView, TextInput; reanimated, svg, router, haptics, safe-area, kv-store replaced; header: 'Styles are not computed; layout is checked on the simulator'); mobile/src/ui/screen.fixture.tsx:52-102 (render, sa
- first verdict (Mac): partially_confirmed -> medium MEASUREMENT NEEDED; The core claim stands (fake react-native layer, core collect screens never rendered, no native E2E), but four details are off. (1) 'High' is not supported for a risk the finding itself calls unmeasured; use medium and keep MEASUREMENT NEEDED. (2) The verification_scenario is not discriminating. A no-op persistDraft would already fail provider.test.tsx:219, which reads the draft after chooseZone and again after remoun
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Create mobile/maestro/ with two flows against the bundled practice site and the iOS simulator (no network needed for the first): start observation, place point, answer two questions, killApp, launchApp, assert the Unfinished card and Resume restores the answers; and a second flow for the A to B switch (see missing tests). Run them manually before each pilot 

## TEST-04 [testing] The schema-reset test pins deletion of unsent records and nothing specifies the guard
- original: medium/high CONFIRMED DEFECT; platform: mobile; journey: App update (or older build over a newer database) opens a device holding pending
- locations: mobile/src/storage/database-migrations.test.ts:16-60 (loop over versions [1,2,3,4,99] asserts every collector table, including observations, is empty after initializeDatabase); mobile/src/storage/database-migrations.ts:5 (SCHEMA_VERSION = 6), :55-61 (initializeDatabase returns only on exact equality
- first verdict (Mac): partially_confirmed -> low DESIGN PREFERENCE; This is not a defect. The test faithfully pins the owner's documented decision, and the finding itself concedes it is 'deliberate pre-launch policy'. The proposed guard is new behaviour, not a missing check. It adds a dead-end state in which the app refuses to open with N unsent observations, so it also needs a discard escape path and root-boundary UI. That is old-schema data retention, which the policy discourages. 
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Specify the guard as a test first, then implement the smallest refusal consistent with the no-migration policy: in initializeDatabase, before the DROP loop on a mismatch, count rows in observations where sync_state <> 'synced' plus drafts and parked drafts; if any exist, throw a typed error the root boundary renders as 'This update cannot open N unsent obser

## TEST-05 [testing] The web's central honesty rule 'a failed read is not an empty list' has no page-level test on any of 23 pages
- original: medium/medium MEASUREMENT NEEDED; platform: web; journey: A manager opens Sites, Data, Team, Forms or Packages while one API read fails.
- locations: web/AGENTS.md:24 (rule: a failed read renders LoadFailure; 'No sites yet' must mean there are no sites); web/src/lib/workspace/result.ts:23 (settle) and web/tests/unit/errors.test.mjs:119-125 (the only settle test: data or failure, nothing about pages); web/src/components/shell/LoadFailure.tsx (rend
- first verdict (Mac): partially_confirmed -> medium CONFIRMED DEFECT; The finding's premise that no live violation exists is wrong: its own upgrade condition ('if any page collapses a failure to an empty list, upgrade to a confirmed defect') is met by the publish review page, so recategorize from MEASUREMENT NEEDED to CONFIRMED DEFECT, severity medium. The effect is a false 'No other version of this form is published.' and a missing 'Changes since' diff when secondary reads fail. It ne
- cloud verdict: not re-checked in cloud pass (had a Mac verdict)
- smallest fix: Add web/tests/unit/page-failures.test.mjs reusing the forms-concurrency registerHooks loader and a fetch stub that returns 503: render four to six server pages (sites, data, team, forms, packages, overview) and assert LoadFailure text ('Couldn't load ...') is present and the empty-state sentence ('No sites yet', 'No observations') is absent. No Playwright, n

## TEST-06 [testing] The 'honesty' scan is a copy and layout lint on one seeded success state, and the browser suite spends runs on assets
- original: low/high DEMONSTRATED COMPLEXITY; platform: web; journey: 
- locations: web/e2e/support/scan.ts:19-66 (SAMPLE and JARGON word lists), :192-196 (settle swallows a networkidle timeout), :204-205 (NOT_THE_PAGE regex), :171-181 (axe tags wcag2a/aa/21a/21aa on the static page), :248-302 (scanRoute soft assertions); web/e2e/honesty.spec.ts:21-33 and web/e2e/support/routes.ts 
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DESIGN PREFERENCE; Overstated parts: (a) 'all seeded success states' is wrong: the 41 routes include designed empty and limited states (site-empty, zones-empty-site, no-project, invite-without-link, viewer and observer views) and three designed 404s. True gap: no failed-read, stale, offline or partial state, and no-access text is not detected. (b) The proposed fix 'drop the tablet projects from the default config and keep them in scree
- smallest fix: Rename the describe/test to 'copy and layout scan'; add the no-access sentences to the loadFailure check only if a scan route is meant to be reachable (or leave it and keep the per-page specs); export axeFindings and call it after each dialog opens in screenshots.spec; make default 'pnpm test:e2e' pass --grep-invert @screenshots (or testIgnore screenshots.sp

## TEST-07 [testing] Tests pin compatibility branches that the app boundary cannot reach, contrary to the no-legacy policy
- original: low/high DEMONSTRATED COMPLEXITY; platform: web + mobile; journey: 
- locations: web/src/lib/labels.ts:29-40 (roundOf, roundLabel, roundName accept null or undefined) with web/src/lib/api/observations.ts:12,27,61 (zod round_type rejects null) and web/src/lib/api/schema.d.ts HistoricalObservation.round_type required; tests web/tests/unit/summary.test.mjs:74-85 and :172, web/tests
- first verdict (Mac): none (unverified)
- cloud verdict: confirmed -> low DEMONSTRATED COMPLEXITY; Counts: 3 tests carry null rounds (not 'about 10 cases'); 4 it-blocks / 5 executions for migrateLegacySession; 4 of 5 loop iterations are redundant by branch. Fix caveats: (1) other tests in auth-storage.test.ts (lines 68-152) use legacyStorageKey merely as a key name and file path, so they need a local constant after deletion. (2) The rest of the reset test is real and must stay (hostile table name quoting, sqlite_s
- smallest fix: Narrow roundOf/roundLabel/roundName to RoundType (or drop roundOf) and delete the 3 null cases; delete migrateLegacySession, legacyStorageKey and its call in auth/client.ts with the 4 tests (rename the key constant in the surviving tests); delete LEGACY_CACHE/LEGACY_PREFIX from service-worker.js and the two names from auth.test.mjs:58,69; delete removed-rout

## TEST-08 [testing] Mirror and duplicate tests carry cost without a second guarantee
- original: low/high DEMONSTRATED COMPLEXITY; platform: web + mobile; journey: 
- locations: mobile/src/ui/brand-artwork.test.ts:1-153 (10 tests regex-parse mobile/assets/icon-source/icon.svg and web/public/icons/icon.svg and compare numbers to BRAND_ARTWORK); web/tests/unit/labels.test.mjs:9-19 (assert.match over the text of mobile/src/domain/labels.ts and rounds.ts); WCAG luminance re-imp
- first verdict (Mac): none (unverified)
- cloud verdict: partially_confirmed -> low DESIGN PREFERENCE; Refuted: 'same conflict asserted three times'; dropping those steps would remove coverage of the Discard, note-only and save-as-file branches. Corrected: 'put contrast in one scripts/wcag.mjs imported by three tests' covers two of four copies at most. Important reversal for auth-local: deleting it first would remove the only check of the recovery-cookie binding (see NEW-AUTH-RECOVERY-UNRUN); port, then delete. brand-
- smallest fix: Delete brand-artwork.test.ts or cut it to the colour-set equality (2 tests); fold overview.spec's coverage test into overview-sql; leave the conflict steps; replace the labels source regex with a two-line shared cases file only if labels.ts changes again; port auth-local's three mismatch cases to Playwright (context.addCookies on fm-recovery-user, fm-recover

# New items from the cloud pass (runtime journeys J-*, native N-*, perf PERF-*, Forms runtime, NEW-*)

## PERF-4 [verify:web-render] Z-data with 500 rows: 2.2 MB decoded HTML, 15,213 DOM nodes, one 114-121 ms long task unthrottled, 944 ms of long tasks at 4x CPU
- verdict: partially_confirmed -> low/medium DEMONSTRATED COMPLEXITY (dup of MFD-5)
- locations: runtime/perf/cold.json routes.Z-data (domNodes 15213, docDecodedKB 2214.77, longTaskTotal median 114 n=3, tbt 64); runtime/perf/throttled.json routes.Z-data (longTaskTotal median 944 over only n=2: 789 and 1099; 4-8 tasks; tbt 643; usable 1,709 ms); web/src/features/data/DataTable.tsx:54-104
- evidence: The numbers match the JSON exactly. Attribution is only partly the duplicate list: SSR of the real DataTable shows 12.5k of the 15.2k nodes are table+cards (cards 4.5k), about 2.5k are SVG markers, and the decoded document also carries about 420 KB of RSC props (418.6 KB on soft nav). The 4x row is two samples and CPU throttling emulates a phone-class CPU, while the managers who use this screen are on desktops/laptops. The unthrottled long task (114 ms, one task) is just over the 50 ms threshold
- correction/notes: Do not read 944 ms as typical: n=2, 4x emulation, 500 rows. Removing the hidden card list is expected to cut about a third of it, not remove it.
- smallest fix: Same as MFD-5. Re-measure with n>=5 at 4x before and after if the number matters.

## PERF-1 [verify:web-render] Overview fans out listPackages once per site (N+1); summaries wait on all of them
- verdict: confirmed -> low/high DEMONSTRATED COMPLEXITY (dup of WEB-R6)
- locations: web/src/lib/api/workspace.ts:204-211 listProjectPackages (await listSites, then Promise.all(sites.map(listPackages))); web/src/app/(app)/o/[org]/p/[project]/page.tsx:64 (settle(listProjectPackages)), :77-85 (today and 7-day summaries after it), :97-103; contracts/openapi.json GET /v1/projects/{proje
- evidence: Traced: the only caller of listProjectPackages is the Overview page; it issues one listPackages per site after listSites resolves (React cache de-duplicates the page's own listSites, so no extra listSites call). Contract check: no batched or project-level package list exists; listPackages requires site_id; Site.package carries only the current ready package, but Overview needs newest-blocked-per-site and package activity, which only history has. api-fanout.json: 10-site overview: listSites done 
- correction/notes: The 4.2-4.5 s is not user-visible time. The N+1 is the critical path on a small project (about 47% of document time at 10 sites) and falls behind the observation list at 28; it would dominate again at 54 sites with a fast observation read. Fixing it needs a contract change (backend).
- smallest fix: Without any API change: start the two summaries right after getProject (they only need the timezone), and start the coverage reads in the page, so they stop waiting for the N listPackages (saves the 216-253 ms stage). Fully removing the N+1 needs one backend addition (make site_id optional on listPackages or add a project-level package list); not worth doing

## PERF-3 [verify:web-render] zod 4 plus openapi-fetch is a 382 KB raw / 89 KB gzip chunk on every authenticated project and org page
- verdict: partially_confirmed -> low/high DEMONSTRATED COMPLEXITY (dup of WEB-R7)
- locations: web/.next/static/chunks/0wstr41mffx5k.js module 26336; web/src/components/shell/LoadFailure.tsx:9 -> web/src/lib/workspace/result.ts:1 -> web/src/lib/api/errors.ts:1; web/src/lib/api/browser.ts:3 (openapi-fetch, in the supabase chunks, not here)
- evidence: Opened the chunk: it holds one module (26336), zod only, 391,200 B file / 364 KB module; the 'openapi-3.0' string inside is zod's JSON-schema target, not openapi-fetch. openapi-fetch (module 96960, 6.4 KB) sits in the browser.ts chunks with supabase-js. The chunk is on all /o routes, join and invite, and absent from /account (verified in the build manifests). Import path and build-verified fix: see WEB-R7.
- correction/notes: Drop 'plus openapi-fetch': that library ships only on pages that load lib/api/browser.ts. The 'every authenticated page' wording is true except /account.
- smallest fix: See WEB-R7 (zod-free failure helper). Optionally later: zod/mini or generated plain types where schemas only run on the server.

## PERF-2 [verify:web-render] @supabase/supabase-js is bundled three times in three route-group chunks (about 70 KB gzip each)
- verdict: confirmed -> low/high DEMONSTRATED COMPLEXITY
- locations: web/.next/static/chunks/159n5qswl4qfq.js, 2d013804da0kj.js, 3-dr7pv7v6of6.js (each 271,735 B, same six modules in different order: openapi-fetch, download.ts, export/files.ts, supabase-js (231 KB), observation zod schemas, browser.ts); web/src/lib/api/browser.ts:7 (createSupabaseClient), web/src/lib
- evidence: Reproduced from the build output and confirmed with two scratch rebuilds. The three chunks are the module closure of lib/api/browser.ts, emitted once per page family: data (2d01), site/packages/publish/zones/qgis (3-dr7), zone draft editor (159n). Turbopack does not hoist a module reached statically from three families into one shared chunk, and the installed Next docs say nothing about the rule, so the cause is stated from observation, not from documentation. E1: move AccountChangedError to lib
- correction/notes: A single static 'shared import' does not fix it; only routing every consumer through the same dynamic import yields one cached copy. AccountChangedError must live in its own tiny module, or the instanceof checks keep the static edge. Each action then pays one chunk fetch on first use (the editor on mount).
- smallest fix: Add lib/api/account-changed.ts, switch the three AccountChangedError importers and zones-browser to it, and replace the static browser.ts imports in the five handlers, zones-browser and useDraftSaving's effect with dynamic import(). Only worth doing with the zod change (WEB-R7), since each is small on loopback and on a warm cache.

## NEW-LOADMORE [verify:web-render] 'Show the next 500' fails silently on a dropped connection or any thrown action error
- verdict: new -> low/medium CONFIRMED DEFECT
- locations: web/src/features/data/DataScreen.tsx:186-205 loadMore (try/finally, no catch); web/src/features/data/actions.ts:48-57 (filters/cursor parse and scope parse before the try; apiRequestError rethrows non-API errors); web/src/features/data/DataMap.tsx:166-188 (the sibling loadSitePlanAction call does ca
- evidence: Code-derived, not run. loadMore awaits a Server Action; when the request itself fails (connection drop, server crash) the call rejects, loadMore has only a finally that clears loadingMore, Button passes onClick through, so the rejection is unhandled: no moreProblem is set, no message shown, the button re-enables. The same feature's other action call (DataMap.tsx:178) handles this with a catch and a message, which shows the gap. The same path is also hit by any ZodError from the strict filter sch
- correction/notes: 
- smallest fix: Add `catch { setMoreProblem('Nothing more was loaded. Check the connection and try again.') }` to loadMore, mirroring DataMap.tsx:178.

## J-1 [verify:web-ux] Save after session expiry shows the generic crash page and loses the form (runtime confirmation of WDI-1)
- verdict: confirmed -> medium/high CONFIRMED DEFECT (dup of WDI-1)
- locations: web/src/proxy.ts:17,33-43; web/node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js:69-73,111-121; web/node_modules/next/dist/server/app-render/action-handler.js:127-206,455-466; web/node_modules/next/dist/server/app-render/manifests-singleton.js:200-213; web/src
- evidence: Observed at runtime (0 API calls, boundary shown, typed input gone). Chain traced in the installed Next 16.2.7: (1) cookies cleared, so proxy.ts getClaims fails and, for a /o path, NextResponse.redirect (307, keeps method and body) is returned for the action POST. (2) The reducer's fetch(state.canonicalUrl, {method:'POST'}) uses default redirect:follow, so the browser re-POSTs the action (Next-Action header and body kept) to /sign-in?next=. (3) /sign-in's bundle does not contain the action, so a
- correction/notes: Fix precision: catching the rejection at the call sites (the settleAction helper from WDI-1) is what stops the crash and the loss. A proxy change cannot do it alone, because any non-RSC reply, even a 401 text/plain (reducer :111-114 throws new Error(text)), still rejects. The proxy tweak (do not 307 requests carrying a next-action header) only improves the m
- smallest fix: Wrap each start(async ...) action call in settleAction(promise) returning {status:'failed', message}; with a rejection, say 'Nothing was saved. You may have been signed out; sign in again in another tab, then save.' Keep the editor mounted. Optionally skip the sign-in redirect in proxy.ts for next-action requests so the typed failure path answers.

## J-2 [verify:web-ux] One API outage gives a shell-less 'Couldn't load this organization' on fresh load but the 'Something went wrong' boundary on client navigation
- verdict: confirmed -> low/high CONFIRMED DEFECT
- locations: web/src/app/(app)/o/[org]/layout.tsx:21-39; web/src/app/(app)/o/[org]/p/[project]/layout.tsx:22-24; web/src/lib/api/workspace.ts:99-115 (resolveOrg/resolveProject throw when the workspace is unavailable); web/src/app/(app)/o/[org]/p/[project]/sites/page.tsx:33; web/src/app/(app)/o/[org]/p/[project]/
- evidence: Source trace matching the runtime observations. On a fresh load OrgLayout renders AppHeader plus LoadFailure(what='this organization') instead of its children, and ProjectLayout returns null, so no page runs. On client navigation the layouts are kept and only the page re-renders; the page's first call is resolveProject, which calls getWorkspace (re-fetched, fails) and throws workspaceError. 17 call sites await it unguarded, so the error reaches p/[project]/error.tsx (ErrorView, header stays). Ov
- correction/notes: The runtime rated it Medium; I rate it low. Both outcomes are honest, recover with Try again, and lose no data. The design comment at workspace.ts:99-101 assumes a layout always shows the failure, which does not hold on client navigation. HTTP 200 on the failure page is a nit.
- smallest fix: One page-level helper (e.g. a requireProject that settles the workspace and returns a LoadFailure element) used at the 17 sites, or accept the boundary and make the layout failure match it (keep tabs). Do not add per-page try/catch.

## J-3 [verify:web-ux] Root font-size ignored by px type tokens; 320 px at 200% root overflows and clips
- verdict: partially_confirmed -> low/medium DESIGN PREFERENCE
- locations: web/src/styles/contour.css:157-280 (generated from contracts/contour.json by scripts/contour-tokens.mjs); web/src/app/globals.css:95 (body 16px/24px)
- evidence: Facts hold by code: every type-* utility sets font-size and line-height in px; body is 16px; Tailwind spacing and touch sizes are rem, so a larger root grows boxes but not text, which explains the emulated overflow at 320 px with html{font-size:200%}. Judged against WCAG: 1.4.4 Resize Text is met by browser zoom (page zoom satisfies it; text-only scaling is not required), and the layout was measured with no horizontal overflow at 320 and 390 CSS px at 100% (88 measurements), which is the 1.4.10 
- correction/notes: Not a failure of 1.4.4 or 1.4.10. What is real: a user's default-font-size preference (desktop Chrome/Firefox) does nothing to text, and 'large root plus 320 px' breaks layout, a contrived combination on desktop (Android Chrome text scaling scales px text anyway; iOS Safari ignores root size). Because the token contract is shared with mobile, the change goes
- smallest fix: If wanted: have the generator emit rem for web type size and line-height (px/16) and body 1rem, then re-run the 320 px at 200% root measurement and fix what still overflows.

## J-4 [verify:web-ux] Invite dialog never returns focus to its trigger (and 12 other dialogs the same way)
- verdict: confirmed -> low/high CONFIRMED DEFECT
- locations: web/src/components/contour/Dialog.tsx:19-21,64-67; web/node_modules/.pnpm/@radix-ui+react-dialog@1.1.23_*/node_modules/@radix-ui/react-dialog/dist/index.mjs:154-157; web/src/features/team/TeamScreen.tsx:80-88; web/src/features/org/members/MembersScreen.tsx:97-105; web/src/features/org/settings/Setti
- evidence: Library-derived and consistent with the runtime (Invite 6 of 6 trials lost focus; Edit site details, which passes trigger, returned it). Radix Dialog 1.1.23's modal content always runs event.preventDefault() in onCloseAutoFocus and then context.triggerRef.current?.focus(); triggerRef is set only by Dialog.Trigger. contour/Dialog.tsx renders a Trigger only when the trigger prop is given, so its docstring 'Focus returns to it on close' holds only then. 22 usages: 9 pass trigger; 13 are opened by a
- correction/notes: Broader than 'the Invite dialog': one shared component defect affecting 13 dialogs. Severity low, not medium: no data loss, Chrome keeps a sequential-focus start point so Tab continues near the page, and WCAG 2.4.3 failure is arguable rather than certain.
- smallest fix: In contour/Dialog.tsx remember document.activeElement in onOpenAutoFocus (FocusScope reads it before moving focus) and in onCloseAutoFocus call event.preventDefault() and focus it if still connected (composeEventHandlers skips Radix's own handler when defaultPrevented). About 8 lines fix all 13.

## J-5 [verify:web-ux] Observer direct entry to /forms runs getProject, listSites and listForms before the observer screen
- verdict: partially_confirmed -> low/high DESIGN PREFERENCE
- locations: web/src/app/(app)/o/[org]/p/[project]/layout.tsx:26; web/src/app/(app)/o/[org]/p/[project]/forms/page.tsx:22-31; web/src/app/(app)/o/[org]/p/[project]/page.tsx:57-58; web/src/app/(app)/o/[org]/p/[project]/reports/page.tsx:46; web/src/app/(app)/o/[org]/p/[project]/qgis/page.tsx:38-39; backend/src/fie
- evidence: Code-derived. The behaviour is real: the layout's redirect(collectPath) for collectOnly runs in parallel with the page (Next renders layouts and pages concurrently), and only the overview, reports and qgis pages repeat the collectOnly check; forms, forms/versions, sites, data and others do not, so their reads run and their output is discarded. Authorization (the question asked): listForms is allowed to any project member by design. The route is user_transaction with the caller's id, and RLS give
- correction/notes: Not a defect: no leak, no user-visible effect; only a few wasted reads when an observer opens a manager URL (bookmark or role change). Downgrade to design preference.
- smallest fix: None needed. If wanted, the shared helper from J-2 could also redirect collectOnly before any read.

## J-6 [verify:web-ux] Zone editor save status says 'Checking whether your last change was saved...' while nothing is checking (indefinitely in an outage) and a fast-failing PUT loops without backoff
- verdict: confirmed -> low/high CONFIRMED DEFECT
- locations: web/src/features/zones/editor/save-queue.ts:386-387 (status text), get-ok verify branch and get-failed branch (:236-262, :296-306); web/src/features/zones/editor/useDraftSaving.ts:134-141,208-240 (the only triggers); web/src/lib/api/browser.ts:23 (15 s timeout); web/tests/unit/zone-save-queue.test.m
- evidence: Reproduced at reducer level with the real save-queue.ts (scratch repro/j6.mjs). Case A (API down, browser online): put-failed(network) issues a verify GET; get-failed(network) leaves reading:null, inFlight set, pause 'unconfirmed' and returns no command, yet saveStatus still returns 'Checking whether your last change was saved…' because the text derives from pause only. Nothing schedules a retry: the hook re-flushes only on an edit debounce, blur, pagehide, visibilitychange, the online event or 
- correction/notes: Real trigger for case B needs a PUT that fails quickly while GET works (path-specific proxy, WAF, CORS) or 15 s PUT timeouts (one pair per 15-30 s, benign), so impact is low. The runtime's '6 s' understated case A.
- smallest fix: (1) When pause is 'unconfirmed' and reading is null, show 'Not saved yet · DECA Mark could not be reached. Your changes are kept in this tab.' (2) Add one backoff timer in useDraftSaving (for example 5, 10, 20, 30 s) that flushes while the pause still needs a read, and apply the same backoff before the resend after a verify that found 'not saved'.

## J-7 [verify:web-ux] fm-place cookie survives sign-out; sb auth cookie is JS-readable with ~400-day expiry
- verdict: partially_confirmed -> low/high DESIGN PREFERENCE
- locations: web/src/features/shell/RememberPlace.tsx:26-33; web/src/lib/auth/actions.ts:136-146; web/src/lib/workspace/home.ts:19-45; web/src/app/(app)/o/page.tsx:34; web/node_modules/@supabase/ssr/dist/main/utils/constants.js:7-10; web/src/lib/api/browser.ts:16-20,53-77; supabase/config.toml:164-173,320-324
- evidence: Code-derived plus installed library. (a) fm-place: signOut deletes only fm-verify-email, fm-recovery-* and fm-email-sent, so the path-only cookie (1 year) survives. It is read only by /o and passed through homeFor, which requires the SAFE_PATH regex and that the current person's own index contains that org or project, else it is ignored. Another account lands there only if it is already a member of that project, so nothing leaks. The real cross-account carry-over is the palette recents in localS
- correction/notes: (a) is benign by construction; an optional one-line store.delete('fm-place') in signOut. (b) is refuted as a finding: standard library defaults on a design that needs them. The only related point is that no CSP is configured (see NEW-headers).
- smallest fix: None required. Optional: delete fm-place in signOut.

## J-8 [verify:web-ux] Role and org not visible in the header below 1024 px; observer sees 'MEMBER'
- verdict: partially_confirmed -> low/high DESIGN PREFERENCE
- locations: web/src/components/shell/AppHeader.tsx:58-96; web/src/components/shell/Switchers.tsx:228-253; DESIGN.md:225-229
- evidence: Code-derived, consistent with the runtime measurements. RoleLabel is 'hidden lg:inline', so the role shows at 1024 and above; the org and project switchers show at 768 and above, so the org is hidden only below 768, where the merged switcher shows the project name (org in its accessible name and menu). The role stays one tap away in the account menu. The observer's 'MEMBER' comes from role = project?.role ?? org?.role: observers' pages are /o/[org]/collect, with no project in the route, so the o
- correction/notes: 'Org not visible below 1024' is wrong: the cut-off is 768. DESIGN.md documents the merged switcher but not hiding the role, so it is an undocumented space trade-off. Observers mostly use the phone app, so the 'MEMBER' header affects few people.
- smallest fix: None needed. Optional: show the role only when a project is on screen, or label the collect page 'Observer'.

## J-9 [verify:web-ux] Org no-access pages lack an h1; sign-in gives no signed-out reason; signed-in users can open /sign-in
- verdict: confirmed -> low/high CONFIRMED DEFECT
- locations: web/src/features/org/NoAccess.tsx:7-19; web/src/components/contour/ScreenState.tsx:88; web/src/app/(app)/o/[org]/(org)/settings/page.tsx:25-29; web/src/app/(app)/o/[org]/(org)/members/page.tsx:22-25; web/src/app/(app)/o/[org]/layout.tsx:21-39; web/src/proxy.ts:33-38,52-58; web/src/app/(auth)/(signed
- evidence: Code-derived. (a) OrgNoAccess returns a bare LoadFailure; ScreenState's default heading is h3, so the page has an h3 and no h1 (the same holds for the org page failure states and the OrgLayout failure; project no-access pages render a PageHeader first, e.g. project settings/page.tsx:27-40). (b) The proxy only sets ?next=; the sign-in lead differs only for invitation paths (isInvitationPath), so a session-expiry redirect reads exactly like a first visit. (c) The proxy redirects only '/' for an au
- correction/notes: Part (a) is wider than 'no-access': every org-level failure state lacks an h1. Impact is low on all three; none loses data.
- smallest fix: (a) Give OrgNoAccess a title and render PageHeader above the LoadFailure, as the project pages do. (b) When ?next= is present, lead 'Sign in to continue.' (no new plumbing). (c) In proxy.ts add authenticated && (/sign-in or /sign-up) -> workspace(request); the invitation 'Not you?' flow signs out first so it is unaffected.

## J-10 [verify:web-ux] Multi-word search matches any word
- verdict: refuted -> low/high DESIGN PREFERENCE
- locations: web/src/features/data/view.ts:244-267; web/tests/unit/data-view.test.mjs:225-232
- evidence: Reproduced with the real searchLoaded (scratch repro/j10.mjs). The search splits on whitespace and requires every term to be a substring of the record's search text (terms.every(...)): AND, not any-word. 'synthetic nope' returns no rows, which any-word semantics would not. The unit test pins this ('garden sandpit' returns the one record with both, 'no such words' returns none). The runtime result ('record 7' kept all 8 rows) is a seed artifact: every seeded row's label is OBS-700000 (the runtime
- correction/notes: Not a defect. The only real property is substring (not word-boundary) matching, so short numeric terms match ids, labels and dates, which is normal for this kind of box.
- smallest fix: None.

## J-11 [verify:web-ux] Success toast overlaps content
- verdict: partially_confirmed -> low/medium DESIGN PREFERENCE
- locations: web/src/components/contour/Toast.tsx:84-91,95-110
- evidence: Code-derived; not reproduced by me. The viewport is fixed to the bottom (bottom-left from md up), the card is pointer-events-auto, shows for 6 s, one at a time, pauses on hover and focus, and has no close button (swipe, or Esc after the F8 hotkey). Overlapping page content during those 6 s is inherent to a toast; the runtime's hit-test found nothing covered because no toast was open then.
- correction/notes: The claim is literally true but expected toast behaviour. The only theoretical hazard is WCAG 2.2 2.4.11 (a focused control at the bottom-left under an open toast, with no scroll-padding-bottom); not shown.
- smallest fix: None. If a covered control is ever shown: add scroll-padding-bottom while a toast is open, or a Dismiss control.

## NEW-headers [verify:web-ux] No Content-Security-Policy, frame-ancestors or X-Content-Type-Options configured for the web app
- verdict: new -> low/medium DESIGN PREFERENCE
- locations: web/next.config.ts:43-53 (headers() only for /sw.js); web/vercel.json; vercel.json; web/src/app/layout.tsx:54; web/src/app/global-error.tsx:22; web/src/proxy.ts:47-48 (sets Referrer-Policy and Cache-Control only)
- evidence: Code-derived: no security headers are configured anywhere in the repo. There are only two inline scripts (the constant THEME_SCRIPT). The bearer token must be JS-readable by design (J-7b), so a CSP would be the only XSS mitigation layer. Clickjacking of the signed-in state is not practical because SameSite=Lax cookies are not sent in cross-site iframes. Headers set by the Vercel project itself are unknown.
- correction/notes: Hardening only, not a reachable defect. No user-visible effect.
- smallest fix: Add a headers() entry in next.config.ts for /:path* with X-Content-Type-Options: nosniff, frame-ancestors 'none' (or X-Frame-Options: DENY) and a nonce-based CSP (the inline theme script needs a nonce or hash, and connect-src must allow the API and Supabase origins).

## N-1 [verify:mobile] Answer step on a portrait iPhone: the answer input is clipped to a sliver at rest; the scroll viewport is only about 150 pt
- verdict: new -> medium/high CONFIRMED DEFECT
- locations: mobile/src/features/collect/QuestionStep.tsx:48-51,141-145,241-259 (ScrollView flex:1 between a fixed acts bar above and a fixed Back/Continue row plus links row below); mobile/src/features/collect/CollectScreen.tsx:499 (map slot fixed at 46% of the body in portrait); mobile/src/features/collect/Col
- evidence: Screenshots (14 and 20 viewed) plus code. The input is not overlapped by a floating footer. It is the last item inside a ScrollView whose viewport is short, so the ScrollView's bottom edge clips it; the footer is a sibling below. On the 402x874 pt iPhone 17 Pro the map slot takes 46% of the body (about 296 pt), then the status row, so the panel is about 300 pt. The step root subtracts the acts bar and the footer rows (about 130 pt), leaving about 150 pt for the scroll content, which is about 217
- correction/notes: The report says 'overlapped by the sticky footer'. More exactly it is clipped by the ScrollView's bottom edge, with the footer as a sibling.
- smallest fix: Give the Answer and Review steps more of the screen in the stacked layout: map slot about 30% (or collapsible) when step is answer or review, set through style so the map stays mounted. Combine with the UXC-01 keyboard change (map slot to 0 while the keyboard is up).

## N-2 [verify:mobile] Keyboard up on Answer: the input and Continue are both behind the keyboard and tapping elsewhere does not dismiss it
- verdict: confirmed -> high/high CONFIRMED DEFECT (dup of UXC-01)
- locations: mobile/src/features/collect/CollectScreen.tsx:476-483,499; mobile/src/features/collect/QuestionStep.tsx:141-145,241-259; screenshot runtime/native/16d-keyboard-covers-answer-field.png (viewed)
- evidence: Screenshot and code. The map slot keeps 46% regardless of the keyboard. The panel's KeyboardAvoidingView (behavior padding on iOS) pads by the keyboard overlap of its own frame: keyboard top at 539 pt, KAV bottom at about 840 pt, so about 301 pt of padding against a panel of about 300 pt. The content box is about 0, the ScrollView shrinks to 0, and the fixed Back/Continue and link rows overflow under the keyboard (the run's a11y tree put the field at y=529-579 and Back/Continue at 592-648, below
- correction/notes: Same cause and the same numbers as UXC-01 (299 pt panel, 302 pt overlap).
- smallest fix: As UXC-01: while the keyboard is up (Keyboard will-show/hide, or the existing useKeyboardVisible in features/auth), set the map slot to height 0 and hide the status line; add keyboardDismissMode='on-drag' to the QuestionStep ScrollView.

## N-3 [verify:mobile] Site download whose map archive succeeded but getFormVersion failed shows 'Map v49 did not finish downloading. Nothing was kept'
- verdict: partially_confirmed -> low/high CONFIRMED DEFECT
- locations: mobile/src/features/projects/versions.ts:100-107,142-148; mobile/src/packages/hosted/download-failure.ts:6-24; mobile/src/packages/hosted/prepare.ts:36-59 (archive first, formVersion afterwards); mobile/app/(app)/(tabs)/(projects)/[project]/[site].tsx:332-336; screenshot runtime/native/10-site-after
- evidence: Screenshot and code. The wording does not wrongly blame the map: the screen's unit is 'Map package v49', which holds the map, zones and both forms (the site screen says a site is collectable only once map, zones, form and guide are on the device), and 'Nothing was kept' is true because install is atomic. The real defect is different: downloadFailure() classifies only BoundPackageError, InstallationError and PrepareError as 'verify_failed'. Every other error (a 500 from getFormVersion, a dropped 
- correction/notes: Do not reword 'Map' to 'form'. Keep the copy but let it carry the cause.
- smallest fix: In versions.ts show failed.message for the failed state too (api errors already have messages), or add a short cause line: 'The server could not send the form' vs 'No connection'.

## N-4 [verify:mobile] Bottom tab bar absent from the XCUITest accessibility tree on project screens
- verdict: partially_confirmed -> low/low MEASUREMENT NEEDED
- locations: mobile/src/ui/TabDock.tsx:78-181; mobile/app/(app)/(tabs)/_layout.tsx:12-33; mobile/node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabView.js:165-205; mobile/node_modules/react-native/React/Views/RCTViewManager.m:105-108
- evidence: Code only. The dock is a custom tabBar rendered by expo-router's bottom-tabs fork as a sibling after the screens container. Its container is a plain View with accessibilityRole 'tablist' inside an absolute, pointerEvents='box-none' anchor, with three Pressables (accessible by default) carrying role 'tab', a baked label '<name>, tab, i of 3' and selected state. I found nothing in the navigator wrapper or the dock that hides it from accessibility (no accessibilityElementsHidden or importantForAcce
- correction/notes: Absence from the tree is an observation I cannot confirm or explain from code; it is not shown to be a VoiceOver defect.
- smallest fix: Dump the tree with Accessibility Inspector on the project screen. If the tabs are absent, test removing accessibilityRole 'tablist' from the container and setting accessible={false} on the anchor. Otherwise no change.

## N-5 [verify:mobile] expo-linking warns that app.config.ts declares three URI schemes and ignores two
- verdict: confirmed -> low/high DEMONSTRATED COMPLEXITY
- locations: mobile/app.config.ts:17-18; mobile/node_modules/expo-linking/src/Schemes.ts:175-189
- evidence: Code plus the run's Metro log ('Using DECAMark. Ignoring: decamark, fieldmaps, com.fieldmaps.collector.dev'). resolveScheme warns whenever the config has more than one scheme (extraSchemes.length); the native bundle id is always appended to the message but never triggers it on its own. So a single scheme string silences the warning. 'DECAMark' appears only in app.config.ts. iOS URL schemes are case-insensitive, so DECAMark and decamark are one scheme on iOS; Android intent-filter schemes are cas
- correction/notes: The warning is dev-time noise, not a runtime defect.
- smallest fix: scheme: 'decamark' (single string); delete the fieldmaps entry (S5) and the duplicate-case 'DECAMark'. Update the mobile docs and the comment at app.config.ts:17.

## N-6 [verify:mobile] Training practice records can never upload; Account, Sign out, Saved and the guide describe them as held for the project
- verdict: confirmed -> high/high CONFIRMED DEFECT (dup of UXC-02 (and MOB-REC-02))
- locations: mobile/src/storage/observation-store.ts:27-31; mobile/src/forms/registry.ts:30-32; mobile/src/storage/sync-store.ts:20-40,42-78; mobile/src/session/observation-actions.ts:202; mobile/src/features/collect/SavedStep.tsx:115-120; mobile/src/features/account/leaving.ts:33-41; mobile/src/features/preview
- evidence: Code only; not seen in the native run. Practice records (formVersion 'shell-v1') are unbound, so initialSyncState gives 'local-only' and pendingObservations selects only 'pending'. activateHeldObservations skips unbound records. No path turns a practice record into an upload. What the screens say: Saved shows 'Upload: Held on this device: form shell-v1 is not published to the server yet'. The guide says Held means the project has not published the form version. Account counts practice records un
- correction/notes: The answer to the owner's question is no: they can never upload. The screens are wrong in saying they wait for a project.
- smallest fix: Per MOB-REC-02: delete both 'does not upload yet' notes. When isShellObservation, say 'Practice record: stays on this device and is never uploaded' in SavedStep, the guide and leaving.ts, and exclude practice records from the sign-out 'not been uploaded' count. Use one state mapping on Account and Observations.

## NEW-LEGACY-REDIRECTS [verify:tests] web/next.config.ts keeps 11 redirects for removed Nocturne/sample/old-flow addresses, pinned only by removed-routes.spec
- verdict: new -> low/high DEMONSTRATED COMPLEXITY
- locations: web/next.config.ts:15-31 (OLD_ROUTES: /overview, /observations, /places, /basemaps, /instrument, /qgis, /onboarding, /onboarding/:path*, /o/:org/library, .../reports/views, .../settings/rounds) and :40-42 redirects(); web/e2e/support/routes.ts:85-93 (REMOVED_ROUTES, 7 of the 11); web/e2e/removed-rou
- evidence: Code-derived. The comment says the addresses belong to the old 'Nocturne workspace', the set-up flow and sample-data pages that no longer exist. Owner policy (pre-launch, dev devices only, no legacy code, old product name is deletion material) makes redirects for those addresses compatibility code. removed-routes.spec accepts either a 404 or a redirect, so it passes with or without them. Not run.
- correction/notes: Not a defect; it is deletion material under the owner's policy, small in size.
- smallest fix: Delete OLD_ROUTES and the redirects() function in next.config.ts, removed-routes.spec.ts and REMOVED_ROUTES. The unmatched addresses fall to the app's designed 404, which the scan already checks for /o/deca and project-missing-page.

## NEW-AUTH-RECOVERY-UNRUN [verify:tests] The recovery-cookie binding that lets a password reset skip OTP re-verification is tested only by a hand-run script
- verdict: new -> low/medium CONFIRMED DEFECT
- locations: web/src/lib/auth/actions.ts:54-68 (recoveryVerified: fm-recovery-user must equal '<user.id>:<session_id>' and user.email must equal fm-recovery-email, else verifyOtp runs); web/tests/auth-local.test.mjs:90-125 (only assertions of the mismatch refusals; skipped unless DECAMARK_AUTH_LOCAL_TEST=1); web
- evidence: Code-derived plus grep: 'fm-recovery' appears in no unit test and no Playwright spec; only auth-local.test.mjs asserts that a mismatched user, session or email cookie is refused with 'invalid or expired'. That test is not in any script run by CI or the documented checks except the opt-in test:auth:local. Not run (needs dev server and mailbox).
- correction/notes: The branch is a shortcut that skips the one-time-code check on retry; a regression in the comparison would not fail any automatic check. Impact needs a signed-in recovery session in the same browser, hence low.
- smallest fix: Add three Playwright cases to auth-flows.spec.ts that tamper each of fm-recovery-user (user part, session part) and fm-recovery-email with context.addCookies and expect the refusal; then delete auth-local.test.mjs and its test:auth:local script.

## NEW-TEST02-CI [verify:tests] TEST-02 must be corrected at HEAD: the real TS transport already meets the real API in CI for two scenarios; only the bound-upload acceptance driver is orphaned
- verdict: new -> low/high CONFIRMED DEFECT (dup of TEST-02)
- locations: .github/workflows/ci.yml backend job (pnpm --dir mobile install; pnpm backend:test ZONE_API_REHEARSAL=1); backend/tests/test_fields_only_history.py:156 and backend/tests/test_published_form_compatibility.py:297 (spawn mobile vitest with a loopback API fixture); mobile/src/sync/fields-only-outbox.tes
- evidence: Code-derived plus the mobile run above (both outbox tests pass in plain mode, which is why mobile has 841 tests instead of 839). grep at HEAD still finds test_mobile_bound_upload_api.py and MOB29_BOUND_API_FIXTURE referenced only by the two files themselves (docs excluded); backend pyproject testpaths=['tests'] so database/tests/*.py never runs. CI on the final commit could not be checked (HEAD message says the database job was broken).
- correction/notes: TEST-02's claim that client/server wire drift passes CI is refuted for hand-placed standard and zone-point observations: the production createBoundUpload and wire-body serializer run against the real API in CI. Still uncovered: install, offline save, restart, v2 publication, drain, and the observer export 403 (the acceptance file), plus the inventory body. A
- smallest fix: Move test_mobile_bound_upload_api.py and test_mobile_package_api.py into backend/tests (same pattern CI already runs) instead of adding a Makefile target; no new framework.

## FORMS-EDIT-SAVE [runtime:forms] Create draft, change a question, Save and reload keep the edit; publish works
- verdict: new -> low/high DESIGN PREFERENCE
- locations: web/src/features/forms/DraftEditorScreen.tsx:145-183; web/src/features/forms/actions.ts
- evidence: Start new draft opened workspace-check-v5; the edited label was saved with the 'Draft saved' toast and survived a reload (data/j1-state.json). Publish via the review page published v5 once. No defect here; this records the happy path with a healthy schema.
- correction/notes: None. The earlier runs could not exercise this because every Forms endpoint returned 500.
- smallest fix: None needed.

## FORMS-DATA-OVERVIEW [runtime:forms] Data 'Some questions could not be loaded' banner is gone; Overview has no forms card
- verdict: new -> low/high DESIGN PREFERENCE
- locations: web/src/features/data/DataScreen.tsx:369; web/src/features/overview/model.ts:127-147
- evidence: On /data in web-acceptance (8 rows) and zone-review (520 rows) the banner does not render. Overview text contains no forms card; forms feed only attentionItems ('No form is published', draft items). The draft item renders: 'Workspace check has an unpublished draft, v2.'
- correction/notes: The task's assumption that Overview renders a forms card does not match HEAD.
- smallest fix: None needed.

## FORMS-PERF [runtime:forms] Cold timings for the four Forms routes
- verdict: new -> low/medium DEMONSTRATED COMPLEXITY
- locations: web/src/app/(app)/o/[org]/p/[project]/forms
- evidence: 3 samples per route (after one warm-up), fresh context, empty cache, production build, 4-CPU container, 1440x900. usable ms median: forms 288, versions 328, detail 403, editor 393. LCP 304, 352, 432, 420. CLS 0 on all. Requests 29 to 31, 442 to 469 KB, no external hosts, no browser-to-API calls. Long tasks of 52 to 169 ms appear on every route (earlier M1 data had none on 29 of 30 routes). Lab only; see data/perf-desk.json.
- correction/notes: These replace the earlier stale-schema error-screen numbers. They are not comparable 1:1 with M1 Pro numbers.
- smallest fix: None; no user-visible defect shown.

## FORMS-AXE [runtime:forms] axe on Forms routes: 0 violations at 1440 and 390 in Day
- verdict: new -> low/high DESIGN PREFERENCE
- locations: web/src/features/forms
- evidence: axe-core via @axe-core/playwright 4.13.0 with wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa found 0 violations on forms, versions, version detail, the editor (also with an unsaved edit) and the publish page, at both widths. The only 'incomplete' items are color-contrast in the collector preview, where overlap with the map prevents a background check. No horizontal overflow. Day theme only; Dusk was not run. See data/axe.json.
- correction/notes: None.
- smallest fix: None needed.

## FORMS-REQREF [runtime:forms] Error boundary 'Reference REQ-xxxx' is a hash of the client error message, not a request id
- verdict: new -> low/medium DESIGN PREFERENCE
- locations: web/src/components/shell/ErrorView.tsx:17-28
- evidence: The same reference REQ-939D-68 appeared for different runs and viewports with the same 'Failed to fetch' error. The source comment says a client error has no digest, so its message stands in, although the card says to send the reference to the organization owner.
- correction/notes: The card's wording implies the owner can use it to find the request. For client-side failures it identifies only the message.
- smallest fix: For errors without a digest, say what failed in words instead of showing a reference, or omit the reference row.