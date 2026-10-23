# Web data/caching/identity/security audit notes (running)

Status: started 2026-10-17. Dimension: web data fetching, caching, freshness, mutations, identity, frontend security boundaries.

## Progress log
- [ ] read maps
- [ ] sign-out flow
- [ ] service worker
- [ ] client caches (packagePlans, palette recents, cookies)
- [ ] stale responses / abort
- [ ] mutations
- [ ] authorization (role before manager endpoints; backend enforcement)
- [ ] info sent to browser
- [ ] counts honesty
- [ ] session expiry mid-edit
- [ ] data-class table

## Findings (confirmed)

### F1 Web "Sign out" is global: it ends the collector's session on every device (copy says the opposite) — CONFIRMED DEFECT, high/medium
- Locations: web/src/lib/auth/actions.ts:136-146 `signOut` (`supabase.auth.signOut()` no scope, :138); web/src/features/auth/actions.ts:124-133 `switchAccount` (:127 same); copy web/src/features/account/SecurityIsland.tsx:23 footnote "Signing out here does not affect the app..."; installed lib default web/node_modules/.pnpm/@supabase+auth-js@2.117.2/.../GoTrueClient.js:3384-3398,3417,3427 (`scope: 'global'` "signs the user out of every device"). Mobile side: mobile/src/auth/provider.tsx:89,129 uses local; mobile/src/auth/session-retention.ts:19-24 keeps account on non-deliberate SIGNED_OUT (records kept, session null); mobile/PLAN.md:126 names "global sign-out" as a revocation cause.
- Trigger: a manager/observer who also collects (or an observer who opened an invitation link on a laptop and used "Not you?"/Sign out) signs out on web (AccountMenu.tsx:47,120; SecurityIsland.tsx:50; DeleteAccount.tsx:150; switchAccount).
- Behaviour: Supabase revokes all refresh tokens of the user; phone keeps working until access token expiry (~1h), then refresh fails -> SIGNED_OUT -> mobile shows signed-out, uploads pause until password sign-in on device (needs network).
- Consequence: in the field the collector can no longer upload; misleading copy on /account says the app is not affected. Records stay (mobile retention) so not loss, but blocked ordinary task + false statement.
- Fix: pass `{ scope: "local" }` in both actions (2 lines). Keep cookie deletion + redirect. No other change; copy then becomes true.
- Verify: sign in same account on web and on simulator; sign out on web; wait for/force refresh on mobile (app foreground, or set short JWT expiry locally) -> before fix mobile gets SIGNED_OUT; after fix still signed in. Unit: assert action calls signOut with scope local.

### F2 Ended session + Server Action: proxy 307s the action POST; client throws to error boundary; unsaved form-editor edits lost — CONFIRMED (code-traced, not run), confidence medium, high
- Locations: web/src/proxy.ts:17,33-43 (`protectedRoute && !authenticated` -> `NextResponse.redirect` 307 for ANY method incl. Server Action POST; matcher :67-80); web/node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js:70-73 (fetch POST, default redirect follow), :111-121 (non-RSC, no x-action-redirect -> throws "An unexpected response was received from the server."); next/dist/server/app-render/action-handler.js:456-466 (on /sign-in the action has no worker -> forward), :127-206 createForwardedActionResponse (fetch redirect:'manual' to /o/[org]/... which proxy again 307s -> not RSC -> returns '{}' JSON); features/forms/DraftEditorScreen.tsx:145-183 `save()` `start(async()=>{ await saveDraftAction(...) })` no try/catch; react-dom 19.2.4 chainThenableValue (rejected thenable -> transition state throws -> nearest error boundary); app/(app)/o/[org]/p/[project]/error.tsx:6-17 -> ErrorView "Something went wrong. Your records remain available." (components/shell/ErrorView.tsx:57-63). Editor has no autosave (explicit Save only), key=version.code.
- Trigger: form editor open with unsaved edits; session ends: user signs out in another tab of the same browser (ordinary), or global sign-out on another device (F1), or refresh token revoked/expired; press Save draft.
- Behaviour: the typed failure path in asManager/failedChange (forms/actions.ts:33-43 -> "Nothing was saved. Sign in to continue.") is never reached because proxy intercepts first; the action promise rejects; DraftEditorScreen unmounts behind ErrorView; leave guard gone; edits lost; page blames nothing specific.
- Same mechanism for every Server Action from a client island (sites EditSiteDialog, team/org dialogs, settings, DataScreen.loadMore -> silent: try/finally without catch DataScreen.tsx:186-206).
- Fix (smallest): in proxy.ts do not redirect non-GET/HEAD requests (or requests with `next-action` header); let the action run and return its existing typed sign-in failure (resolveProject throws -> failedChange). Optionally wrap `start` bodies in try/catch -> setFailure(UNCONFIRMED). Keep: document/RSC GET redirect to /sign-in?next; API 401 still refuses. Copy: say "Sign in again in another tab, then save" like zones save-queue.ts:409.
- Verify: Playwright: open forms/versions/<draft>, edit wording, in 2nd page of same context sign out, back, click Save draft -> today ErrorView; after fix Note "Nothing was saved. Sign in…" and edits still in fields; sign in other tab, Save -> saved.

### F3 Post-sign-in open redirect: safeNext returns "//evil.com" for dot-segment paths — CONFIRMED DEFECT (reproduced), high
- Locations: web/src/lib/auth/navigation.ts:4-17 `safeNext` (checks raw/decoded startsWith("//") BEFORE URL normalisation, then returns `url.pathname + url.search` :13 which can be "//host"); used by app/(auth)/(signed-out)/sign-in/page.tsx:18-19,30 -> SignInForm.tsx:59 hidden input -> lib/auth/actions.ts:41,93,133 `redirect(next)`; also verify/reset/sign-up/forgot pages, features/auth/actions.ts:125. Next 16.2.7: action-handler.js:240 sets `x-action-redirect: //evil.com`; client server-action-reducer.js:108 assignLocation -> new URL("//evil.com", href) = https://evil.com/ -> :222-227 isExternalURL -> completeHardNavigation.
- Repro: scratchpad/repro/safenext-test.mjs with the real function: "/a/..//evil.com"->"//evil.com"; "/.//evil.com"->"//evil.com"; "/%2e%2e//evil.com"->"//evil.com"; "/o/..//evil.com/x"->"//evil.com/x". Existing tests (web/tests/auth.test.mjs:8-22) cover "//", "/\\", "%2f%2f", "%5c" only.
- Trigger: phishing link https://<web>/sign-in?next=/a/..//evil.example ; manager signs in with real password on the real site; lands on attacker page (e.g. fake "session expired, sign in again").
- Fix: in safeNext, after `new URL(value, base)`, return HOME unless `url.origin === base origin` and `!url.pathname.startsWith("//")` (2 lines) + add the 3 cases to tests/auth.test.mjs. Keep: internal path+query preserved; auth pages -> HOME.
- Verify: unit test cases above return "/o"; manual: open /sign-in?next=/a/..//example.com, sign in, land on /o.

## Justified choices
- Sign-out/sign-in via Server Action that writes cookies: Next 16.2.7 marks ActionDidRevalidateStaticAndDynamic on any cookie set/delete (server/web/spec-extension/adapters/request-cookies.js:111-116) and the client then calls invalidateBfCache + invalidateEntirePrefetchCache (server-action-reducer.js:192-209); glossary 01-app/04-glossary.md:45. So Back after sign-out refetches -> proxy redirects. Document responses private,no-store (proxy.ts:47).
- WorkspaceProvider index holds only the viewer's own name/email/userId + orgs/projects/roles (lib/workspace/types.ts:27-52, build.ts:37-63); no other members, no join codes, no tokens.
- Invitation lists never carry secrets (backend invitation_schemas.py:42-59: token/code only on InvitationCreated); link secret kept in fragment -> sessionStorage per tab, removed from URL (features/auth/InviteScreen.tsx:76-85, invitation.ts:9-16,148); no-referrer.
- Role gate before manager-only reads: members/page.tsx, settings (org/project), team/page.tsx, forms publish, zones drafts; observer redirect in project layout. Backend enforces regardless: DB functions change_org_member/change_project_member/create_invitation check has_org_role/has_project_role (baseline.sql:300-336,467-490), require_manager in services (tenancy.py:53,59; invitations.py:132,137).
- packagePlans keyed userId:projectId:packageId, packages immutable (features/data/plans.ts:3-17); DataMap request token fence (DataMap.tsx:119-187).
- Service worker caches only "/", /icons/*, /_next/static/* with response checks (service-worker.js:8-41), skips RSC/Authorization requests (:82); prewarm credentials omit. Nothing authenticated cached.
- Counts honesty: Data countLine/subsetNote, Export dialog "search is not applied" (ExportObservations.tsx:132-136), Reports "counted from the newest N" (ReportsScreen.tsx:316,335-353), Overview FieldReturn "read from the newest N" (FieldReturnIsland.tsx:36-37,89), org rows "skipped"/"failed" never zero (org/projects/rows.ts:7-58).
- No optimistic UI anywhere (no useOptimistic) and no server data cache (fetch no-store), so a refresh can never resurrect old data; revalidatePath only purges router cache + re-renders.

## Keep despite complex
- Zone draft autosave queue + account fence (features/zones/editor/useDraftSaving.ts, save-queue.ts): If-Match, one PUT in flight, abort on fence, signed-out pause resumes via auth-js visibility recover (GoTrueClient _recoverAndRefresh emits SIGNED_IN), e2e zones-account.spec.ts:69,114.
- Package upload idempotent resend (UploadStep.tsx:252-263, 399-470): same request_id + expected_current_package_id after an unknown answer.
- safeNext + flow cookies (httpOnly 30 min) — keep, but fix F3.

## Data-class table

### F2 (REVISED, supersedes F2 above) Server Action transport failures are uncaught: in transitions they hit the project error boundary and discard unsaved edits; in try/finally sites they fail silently — CONFIRMED (code-traced in installed Next/React, not run), high
- Root cause: call sites assume a Server Action always resolves to a typed result. It rejects when the fetch fails (offline/Wi-Fi drop: server-action-reducer.js:70-73 fetch -> rejection -> :302-305 reject(e)), when the response is not RSC (:111-121, e.g. proxy 307 of a signed-out POST, 5xx HTML), or on deploy skew (UnrecognizedActionError :75-82).
- Transition sites without catch (rejection -> React 19.2.4 transition thenable rejected (react-dom chainThenableValue) -> nearest error boundary): forms/DraftEditorScreen.tsx:145-183 save() & :196-208; PublishScreen.tsx:79; RetireDialog.tsx:37; DiscardDialog.tsx:41; NewFormDialog.tsx:79; FormVersionsScreen.tsx:100; org/settings/SettingsScreen.tsx:98; TransferOwnership.tsx:58; org/projects/CreateProjectDialog.tsx:104; project-settings/SettingsScreen.tsx:120. Boundary = app/(app)/o/[org]/p/[project]/error.tsx -> ErrorView "Something went wrong. Your records remain available." (ErrorView.tsx:57-63); retry remounts from server props -> unsaved draft wording gone (editor has no autosave; useLeaveGuard unmounted).
- try/finally without catch (silent: no message, unhandled rejection): sites/EditSiteDialog.tsx:74-87, CreateSiteDialog.tsx:93, data/DataScreen.tsx:186-206 loadMore ("Show the next 500" just stops).
- Correct examples already in repo: zones/StartDraft.tsx:64-75, DiscardDraft.tsx:64-70, data/DataMap.tsx:169-187 (catch -> honest message).
- Session-ended variant: proxy.ts:33-43 307s POSTs too, so the typed sign-in failure in forms/actions.ts:33-43 is never reached.
- Fix: one helper (e.g. `settleAction(promise, nothing)` -> on rejection `{status:"failed", message: UNCONFIRMED_CHANGE_COPY}` lib/api/errors.ts:293) used at these ~13 call sites; proxy: skip the sign-in redirect for non-GET/HEAD so actions answer "Sign in to continue" themselves. Keep: typed failures, "may have saved" honesty (unconfirmed copy), leave guard, editor state.
- Verify: Playwright form editor: edit, `context.setOffline(true)`, Save draft -> today ErrorView; after fix Note with unconfirmed copy, edits still present, back online Save works. Same with signing out in a 2nd page. Unit: helper maps TypeError/Error to failed.

### F4 Offline PWA start: /o answered with the cached public landing ("Sign in / Create account") — CONFIRMED behaviour, low; + legacy cache names (deletion)
- Locations: web/src/lib/pwa/service-worker.js:20-24 installStartUrl, :84-85, :96-99 (offline -> cache.match("/")); manifest start_url "/o" (web/src/app/manifest.ts:9); landing CTAs (app/(marketing)/page.tsx:33-57 Sign in/Create account). Legacy names :2-4,:65 (fieldmaps-shell-v1, fieldmaps-public-*), added at rename 52f6267.
- Behaviour: a signed-in manager opening the installed app without connection sees the marketing page with Sign in, implying signed out; clicking Sign in fails offline. README:134 does not mention it.
- Fix: delete installStartUrl branch (browser shows its own offline page) or serve a 5-line "DECA Mark needs a connection; nothing here is lost" response; delete LEGACY_* names (pre-launch, no installs under old name). Keep: cacheable() allowlist + safeResponse.
- Verify: on https preview, install, DevTools offline, open /o -> after fix no landing page.

### F5 Account binding only in the zone editor: other browser-direct calls and palette recents ignore which account the page/tab belongs to — CONFIRMED, low
- Locations: web/src/lib/api/browser.ts:105-119 preparePackage `browserApi(TRANSFER_TIMEOUT_MS)` (number => no expectUser), :121-136 importQgisProject, :149-171 downloadPackageArchive, :178-196 downloadObservationExport, :199-214 downloadZoneBoundaries; contrast zones-browser.ts (expectUser, WUI-12 web/ZONE-BOUNDARIES-UI.md:140-145) and account/actions.ts:80-83 (confirmedBySignedIn). Palette: features/shell/palette.ts:27-28,48-64 stores label+meta (org name + role label, :120-133) in localStorage, not keyed by user; CommandPalette.tsx:79-80 filters by href only.
- Trigger: shared lab laptop; tab rendered for A on Upload step / QGIS; B signs in another tab; A's tab uploads/exports with B's token (publishes package as B, or export scope of B) while header shows A. Palette shows A's role label ("Manager") to B for a shared project.
- Fix: pass `expectUser: account.userId` from the page into browserApi for upload/import/export (option exists), map AccountChangedError to "You are signed in as someone else"; store recents under `fm.palette.recent:<userId>` or drop meta from stored entries. Keep: per-request authorization at API.
- Verify: Playwright 2 pages same context as zones-account.spec.ts; sign in other account in page 2; upload in page 1 -> refused before send.

## Data-class table (done; final copy goes in assessment_markdown)
(see final structured answer; summary: no server data cache anywhere (fetch no-store lib/api/client.ts:57; React cache() per request only); router cache dynamic=0 + back/forward reuse, purged by any revalidating action incl. cookie writes; layouts (WorkspaceProvider, project tabs) persist across soft nav; browser memory: packagePlans LRU 8 keyed user:project:package; localStorage fm.palette.recent (not keyed), fm-theme, map palette; sessionStorage fm-invite, fm.flash, zone-publish ids; cookie fm-place (validated by homeFor); SW: public only.)

## Progress
- All investigation items done. Findings F1, F2(revised), F3, F4, F5. Next: write final StructuredOutput.
