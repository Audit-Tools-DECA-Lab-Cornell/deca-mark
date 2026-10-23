SUMMARY.md was not written. The Write tool refused it ("Subagents should return findings as text, not write report files"), and I did not work around that with a shell heredoc. The full report is below, so save it as `journeys/SUMMARY.md`. The 24 evidence JSON files, `PROGRESS.md` and 160 screenshots are already in `/Users/praty/Desktop/StudentJob.nosync/field-ops/outputs/frontend-audit-2026-10-17/journeys/` (screenshots in `screens/`).

# DECA Mark frontend audit: journey runtime evidence (steps 1-8)

Run on 2026-10-18 (EDT). Repo HEAD was `b93a2b2`, not `9928f53` as the task said; `web/` source is unchanged between them per the perf step. Web ran as a production build on 127.0.0.1:3000, the API on :8001, Supabase on :54321. Everything was loopback only. Tooling was Chromium headless (Playwright 1.56.1) and Node 24.18.0.

`git status --porcelain` was empty at the start and empty at the end. All outputs are under gitignored `outputs/`.

## Caveats that shape the evidence

1. **The local database is two migrations behind the repo, so Forms is broken in this stack.**
   - `schema_migrations` holds only `20261012120000` and `20261012142629`. The repo also has `20261017000657_observation_creator_visibility` and `20261017050453_form_draft_revisions`.
   - The API returns HTTP 500 for `listForms` and `getFormVersion` from its first request (180 of 3279 logged responses before my run). It still does after the restart in 3a, so the cause is the database, not the API build.
   - Visible effect: the Forms page, Form versions page and the overview forms card show "Couldn't load the forms. DECA Mark could not finish this. Try again in a few minutes." The Data page shows the banner "Some questions could not be loaded. Answers made with workspace-check-v1 are shown under their question ids."
   - I did not apply migrations, because a schema change is outside "writes only inside the synthetic workspace". Forms with real data was not exercised. Run `supabase migration up --local` or similar and re-run to get it.
2. The Bash sandbox blocks loopback, so every script ran with `dangerouslyDisableSandbox`.
3. Step 3a restarted the API with the documented command. The new process (pid 26862) runs backend source at HEAD; the old one (pid 13292, started 2026-10-17 12:09) ran older code. Steps 1, 2, 3b, 3c and 4-8 ran on the old instance.
4. Timings are prod-build-on-localhost and not representative of hosted. "200% font" is the `html { font-size: 200% }` emulation (equal to raising the browser default font size), not page zoom.

## What I changed in the synthetic workspace

- **Site rename:** site `publish-e4b5ec52` in the zone-review project was renamed to "Synthetic publish e4b5ec52 AUDIT" and back to "Synthetic publish e4b5ec52". Verified in a fresh context; two `updateSite` PATCH calls, so its `updated_at` changed.
- **Zone draft:** `1a2fa02b-...` was edited only in the browser, with every non-GET API call blocked. Verified unchanged afterwards (revision 2, both zones "Unchanged").
- **Session-expiry save (3b ii):** it never reached the API, and the server value is unchanged.
- **Theme:** set to Dusk and restored to Day through the account menu, in throwaway browser contexts only.
- **API:** stopped and restarted (3a). The e2e sign-in spec ran as part of the restart command: 14 passed in 9.7 s. Docker, Supabase, the API (pid 26862) and the web app (pid 14740) were left running.

## Step 1. Orientation (active org / project / site / role)

I covered the web manager on overview, sites, forms, data and site detail at 1440x900, 1024x768 and 390x844 in Day, plus the zone manager on overview, data, site, zones and the draft editor.

Dusk was switched via the account-menu radio "Dusk" (result `data-theme=dusk`, `fm-theme=dusk`) and then restored to Day. Dusk screenshots cover web overview, data and site detail at 1440 (overview and data at 390), and the zone overview, data, site and draft editor at 1440 (draft editor at 390). Data is in `j1-orientation.json`; there were no page errors.

| Width | Header text visible to the manager | Role visible | Org visible | Project visible |
|---|---|---|---|---|
| 1440 | "DECA Mark / Web acceptance lab / Play study acceptance / Search or jump to ⌘K / Manager / QA" | yes | yes | yes |
| 1024 | same, with "Search" | yes | yes | yes |
| 390 | "Play study acceptance" and avatar "QA" only | no | only in the switcher's accessible name "Web acceptance lab, project: Play study acceptance" | yes |

- **Role at 390:** it appears only after opening the account menu: "QA | Local manager | manager@fieldmaps.test | MANAGER · Play study acceptance | Account | Project settings | SCREEN | Day | Dusk | Keyboard shortcuts | ? | Sign out".
- **Merged switcher at 390:** opening it shows "ORGANIZATIONS | Web acceptance lab | MEMBER | , current | Filter projects | YOUR PROJECTS IN WEB ACCEPTANCE LAB | Play study acceptance | Manager | , current | All projects".
- **Active tab:** the project tab carries `aria-current` on every route.
- **Site context:** the site shows only as the page heading on site pages ("Fall Creek test site", "Zones · Synthetic review-site", "Edit zones · Synthetic review-site"). Data, overview and forms headers carry no site context.
- **Observer:** the header reads "MEMBER" (the organization role) on the project-less page "Collect with the DECA Mark app", while the card says "Observer".
- **Forms at all widths:** "Forms Couldn't load the forms. DECA Mark could not finish this. Try again in a few minutes. Try again" (caveat 1).
- **Overview at 390:** it also shows "Couldn't load the forms." and "Couldn't load form activity." cards.
- **Layout notes:** on /data at 1440 the Site column wraps "Fall Creek test site" over 4 lines. All 8 seeded observations are labelled "OBS-700000" because the seed UUIDs share a prefix.
- **Matches expectation:** yes at 1024 and above. At 390 it is partial: role and org are behind menus and there is no site context off site pages.
- **Screenshots:** `day-{1440,1024,390}-{overview,sites,forms,data,site-detail}.png`, `day-*-zone-*.png`, `day-390-overview-account-menu.png`, `day-390-overview-switcher-open.png`, `dusk-1440-{overview,data,site-detail,zone-draft-editor}.png`, `dusk-390-*.png`.

## Step 2. Horizontal overflow at 390 and 320

`j2-overflow.json` holds 88 measurements in Day: 22 web-manager routes, 11 zone-manager routes and 11 public routes, each at 390 and 320. Routes include `/o` (which redirects to the project), org projects/members/settings, account, the project pages, the zone editor and publish pages, the public auth pages, privacy, and the 404s.

- **Offenders:** none. `scrollWidth <= clientWidth` on all 88.
- **Contained scrollers (by design):**
  - The project tab strip scrolls sideways on every project page (745 px of tabs in a 358 px strip at 390, 288 px at 320).
  - The overview and data tables scroll inside their cards (514 px in 356 px at 390; 303 px in 286 px at 320).
  - The legal table at 320 scrolls too (330 px in 288 px).
- **Tab strip edge:** at 390 the active "Reports" tab ends at 392 px, 2 px past the strip edge (`j2b-checks.json`). Every other tab scrolls fully into view.
- **Sign-up checkbox:** `/sign-up` has an `opacity:0`, absolutely positioned checkbox (`name=privacy`, no label text) at left -6 px, width 22. It causes no overflow and was not axe-scanned.

## Step 3. Failure states

### 3a. API stopped (`j3a-api-down.json`, `j3a-run.log`, `j3a-restart.log`)

- **Commands:** `kill -TERM -13292` (the process group from `api.pid`; connections were refused within 0.5 s), then `sh scripts/e2e-local.sh --prod --reuse-web --skip-seed --zones --project=desktop-1440 e2e/sign-in.spec.ts`.
- **Fresh loads:** overview, data, sites, forms, team, settings, site detail and org projects (plus overview and data at 390) all returned HTTP 200 in 1.2-1.4 s with the same LoadFailure: "Couldn't load this organization. DECA Mark cannot be reached right now. Try again in a few minutes. Try again".
  - It is a LoadFailure, not an empty list and not a crash.
  - The shell shrinks to brand, search and avatar "M", with no switchers, tabs or role. The title says "organization" even on project pages, and a failure page returns HTTP 200.
  - Screenshots: `3a-down-*.png`.
- **Client-side navigation:** clicking the Sites, Data, Team and Forms tabs from a page loaded before the outage showed the error boundary "Something went wrong. Your records remain available. Try again or return to the workspace. Try again / Return to projects" (1.8-1.9 s). The header stayed. The same outage gives two different outcomes depending on how you arrive (`3a-down-client-nav-forms.png`).
- **Zone editor:** an edit stays local ("Changed", leave guard on, Review and publish disabled). The status stayed "Checking whether your last change was saved…" for the 6 s I waited. Reloading during the outage showed the LoadFailure and the unsaved edit was gone. Nothing was saved.
- **Recovery:** `/ready` returned 200 six seconds after I spawned the restart, and the e2e sign-in spec passed 14 tests in 9.7 s.
  - "Try again" on the boundary restored the Forms page without re-signing-in.
  - Fresh loads of data, sites and team were normal, and the session was still valid.
  - Forms still failed because of caveat 1.
- **Extra, emulated:** I aborted only the draft PUT in the browser while the API was up. The editor stayed at "Checking whether your last change was saved…" with Discard draft and Review and publish disabled for the full 40 s, with no stop message in that window (`j3a2-failed-save.json`, `3a-failed-save-editor-top.png`).

### 3b. Session expiry (`j3b-session-expiry.json`)

I loaded a signed-in context and called `clearCookies()`.

- **(i) Click the Sites tab.** Client navigation ends on `/sign-in?next=%2Fo%2Fweb-acceptance%2Fp%2Fplay-study%2Fsites` ("Welcome back / Sign in to your research workspace.") with 0 API calls. Signing in again lands on `/sites`. The sign-in page does not say you were signed out.
- **(ii) Save Project settings.** I typed a description, then clicked Save changes. The result was a full-page error boundary: "REQUEST INTERRUPTED Something went wrong. Your records remain available... What failed: The page could not load its records ... Reference REQ-987D-13".
  - The form and my typed input are gone, and nothing mentions the session or that the save did not happen.
  - There were 0 API calls and the server value is unchanged (`3b-ii-mutation-after-cookie-clear.png`).
- **(iii) Reload on /data.** It redirects to `/sign-in?next=%2Fo%2F...%2Fdata` with no explanatory text.

### 3c. Manager-only routes as observer and viewer (`j3c-no-access.json`)

API operations come from `api.log`, which carries no headers.

| Role | Route | Rendered | API ops during the load |
|---|---|---|---|
| observer | /forms, /forms/versions | h1 "Collect with the DECA Mark app" ("Observers collect in the app. This site is for managers and viewers."), no tabs | get_identity x2, **getProject, listSites, listForms (500)** |
| observer | /settings, /team, project overview | same observer screen | get_identity x2 only |
| viewer | /settings | "Project settings Only project managers can open the project settings. You are a viewer on Play study acceptance. Ask a project..." | get_identity only |
| viewer | /team | "Project team Only project managers can open the team. You are a viewer on Play study acceptance. Ask a project..." | get_identity only |
| viewer | /forms, /forms/versions | the Forms page (stale-DB LoadFailure) | getProject, listSites, listForms (500) |
| manager, observer, viewer | org /settings and /members | "Only organization owners and admins can open Settings. Ask an owner or admin of this organization if you need..." | get_identity only |
| outsider | project /data | HTTP 404 "This page is not on the map." | n/a |

- **Observer reads:** on the forms routes, the observer's project reads (including `listForms`) run before the observer screen is shown. Settings, team and overview make no such reads. Whether the API would authorize `listForms` for an observer could not be seen, because it 500s here.
- **Missing h1:** the org no-access pages have no `<h1>`. The project no-access pages do.

## Step 4. Identity and caching (`j4-identity-default.json`, `j4-identity-bfcache.json`, `j4c-place-cookie-outsider.json`)

In one context the manager signed in through the form, visited overview, `/data` and `/data/<observation>`, signed out via the account menu, then signed in as the observer.

- **(i) Back x5:** every history entry re-rendered as observer content (h1 "Collect with the DECA Mark app", header "MEMBER OB") or as the sign-in form.
  - No manager content was visible to the observer, both with Playwright's default flags and with `--disable-back-forward-cache` removed.
  - bfcache never restored a page: `pageshow.persisted` stayed false (`4-default-back-1..5.png`).
- **(ii) Direct URLs:** the manager's `/data` and `/data/<obs>` opened as the observer show the collect screen, with no manager content. As the outsider they return 404.
- **(iii) Service worker:** the app registers it only on https (`PwaRegister`). On http loopback `getRegistrations()` and `caches.keys()` are both empty.
  - As a labelled simulation I registered `/sw.js` by hand and posted `CACHE_URLS` (29 URLs). The cache `decamark-public-<build>` held only `/`, `/_next/static/*` and `/icons/icon.svg`.
  - Registration and cache survived sign-out and the second sign-in unchanged.
  - The source matches this behaviour: it skips RSC and Authorization requests and uses `credentials: "omit"`.
- **(iv) Storage and cookies:** `localStorage`, `sessionStorage` and IndexedDB were empty throughout. The only key the app writes is `fm-theme`, and it holds no identifiers.
  - `sb-127-auth-token` is not HttpOnly, has no Secure flag on http, is SameSite Lax, expires in about 400 days, and is removed on sign-out.
  - `fm-place` holds the path `/o/web-acceptance/p/play-study` for one year and **survives sign-out**.
  - The outsider account signing in on the same browser then landed on "You are not in a project yet", and the cookie still held the manager's path.
- **Sign-in page:** a signed-in observer opening `/sign-in` sees the form (HTTP 200, no redirect).

## Step 5. Navigation (`j5-navigation.json`)

- **Filters:** data filters are in the URL (`?site=fall-creek&round=inventory&q=record+7`, `&zone=<uuid>`).
  - Back from an observation returns to the filtered URL with the selects and counts restored ("Showing all 2 matching observations").
  - Forward goes back to the detail page, and reload keeps the filters.
  - "Copy link to this view" copies `http://127.0.0.1:3000/o/web-acceptance/p/play-study/data?site=fall-creek&round=inventory` (toast "Link to this view copied"), and that link reproduces the same view in a fresh context.
  - In the zone project, Back after choosing a zone returns to `?site=review-site`.
- **Search:** the box matches any word. "Synthetic record 7" and "record 7" kept all 8 rows, "zzzznope" gave 0, and "inventory" gave 2 (status "2 of 8 loaded match · 8 match the filters").
- **Deep link:** `/data/<observation>` in a fresh signed-in context returned HTTP 200 with h1 "OBS-700000" and the Data tab active, in 0.6-1.3 s. Signed out, it redirects to `/sign-in?next=...` and returns to the observation after sign-in.
- **Leave guard** (zone draft editor, API writes blocked):
  - With no edit, `beforeunload` is not prevented. After an edit it is.
  - Clicking the Data tab or pressing Back shows the app's own dialog "Save your changes first? Some changes to this draft are not saved yet. If you leave without saving, they are lost and the draft keeps its last saved revision." with Keep editing, Leave without saving and Save and leave.
  - Reload triggers the browser's beforeunload; accepting it loses the edit (`5-D2-leave-dialog.png`).

## Step 6. Mutation consistency (`j6-mutation.json`)

I renamed the site in the zone project through Edit details > Name > Save details, with no reload.

- **API calls:** 1 PATCH `updateSite` (200), then 2 `listSites`, `getProject` and a package archive read.
- **Dialog and heading:** the dialog closed in about 0.8 s and the heading and breadcrumb switched to "Synthetic publish e4b5ec52 AUDIT". A toast "Site details saved." appeared bottom-left, overlapping part of an info card.
- **Without reload:** the Sites list, Overview and the Data site filter all showed the new name via tab navigation. Hard loads also show it.
- **Palette:** the command palette does not index sites (searching "AUDIT" lists only the "Switch to Dusk" action).
- **Double-click on Save details** (the restore): exactly **one** PATCH `updateSite` reached the API. The button showed "Saving…" (busy), the dialog closed and no error appeared.

## Step 7. Keyboard and accessibility

### 7a. Tab order and dialogs (`j7a-keyboard.json`, `j7a-invite-focus-restore.json`)

Focus-indicator detection compares a pixel diff of the element focused and unfocused.

- **Sign-in:** Email is auto-focused. Tab then goes Password, "Show password", "Sign in", "Forgot password?", "Create account". All show a visible indicator (3 px solid dark outline in Day).
- **App shell and /data:** the first stop is the link "Skip to content", and Enter moves focus to `<main>`. The 42 stops are brand, Organization, Project, Search, Account, the 8 project tabs, then page controls: Copy link, Export, Site, Round type, Observer, From (4 stops), To (4 stops), Search, a table row, Refresh, 6 map markers, then Zoom in, Zoom out and Map layers. Indicators are visible except on 3 of the 6 markers. The markers sit on the same point in this seed, so one marker's focus ring is covered by the others.
- **After client navigation:** focus lands on `<main id="main">`, and the title updates ("Sites · DECA Mark").
- **Account menu:** Enter opens it. ArrowDown walks Account, Project settings, Day, Dusk, Keyboard shortcuts, Sign out. Escape returns focus to the "Account, Local manager" button.
- **Edit site details dialog:** it opens on the Name field and focus stays inside over 10 Tab presses. Escape closes it and focus returns to "Edit details".
- **Invite dialog:**
  - It opens on the radio "Observer" and is named "Invite someone to Play study acceptance". Focus stays inside, the background is hidden, and Escape closes it.
  - After closing, focus is left on `<body>` in 6 of 6 trials instead of returning to the Invite button. I tried keyboard and mouse opens, and Escape and Cancel closes.
- **Zone draft editor:** 35 stops with indicators visible on all. The zone list is a listbox: one Tab stop, ArrowDown moves between zones.

### 7b. axe (`j7b-axe.json`, `j7b-axe-by-rule.json`)

- **Setup:** @axe-core/playwright 4.13.0 (axe-core 4.13.0) with tags wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa.
- **Coverage:** 15 routes (sign-in, overview, data, observation, sites, site detail, forms in its LoadFailure state, team, project settings, qgis, reports, account, site zones, zone draft editor, zone data with 520 rows), each in Day and Dusk at 1440 and 390. That is 60 runs.
- **Result:** 0 violations in all 60 runs, including the WCAG 2.2 target-size rule.
- **Needs review:** only `color-contrast` was flagged, as `bgOverlap` (30 per theme), `shortTextContent` (5) and `elmPartiallyObscuring` (2) on overview, data and site detail. I did not resolve these by manual measurement (`j7b-contrast-incomplete.json`).
- **Hit-test:** a hit-test of every interactive element (`j7b-hit-test.json`) found nothing covered by an overlay, except the stacked map markers.

### 7c. 320x640 and root font 200% (`j7c-reflow-zoom.json`, `screens/7c-*`)

- **Text does not scale.** Type tokens are px (`contour.css`, 13-72 px). h1 stays 36 px, body stays 13-16 px, and nav links stay 16 px. Only rem-based parts grow (some buttons 16 to 32 px, the fixed toast list 32 to 64 px).
- **At 320x640 with 200% root:**
  - The document scrolls sideways on overview (352 > 320) and site detail (356 > 320).
  - Clipped content: the overview island "FIELD RETURN 8 observations…" is 357 px in a 254 px box, so values like "Last received" and "Observed today" are cut off. The map card is 410 px in 234 px. On site detail, "Current map package" is 412 px in 254 px and "Details" is 415 px in 254 px.
  - Visually, "Open observations" is wider than the viewport, map chips and controls cover the whole map card, and the zone link wraps one character per line (`7c-320x640@200%-overview.png`, `7c-320x640@200%-site-detail.png`).
- **Other combinations:**
  - 1440x900 at 200%: no document overflow.
  - 320x640 at 100%: no document overflow. The "clipped" and "overlapping" counts there are `sr-only` elements and the scrolling tab strip, not defects.
  - Forms and team at 320 and 200%: no document overflow.
  - The WCAG 1.4.12 text-spacing run: no document overflow.

### 7d. Map (`j7d-map-keyboard.json`, `j7d2-map-zoom-pan.json`)

- **Data page markers:** they are `g[role=button][tabindex=0]` labelled like "OBS-700000, Zone A · Whole playground, Reliability, map v1".
  - There are 6 points; the 2 Inventory observations have no point by design.
  - Enter selects a marker: the side panel shows "OBS-700000 · Zone A · Whole playground · Reliability · Map v1 · Oct 07, 2026 · 10:05 Open observation", the row highlights, and `aria-pressed="true"`.
  - Zoom in works from the keyboard. With the plan focused, ArrowRight pans (markers moved from x=1171 to x=1052) and `+` and `-` zoom.
- **Non-map equivalent on /data:** the observations table has 8 links. In the 520-observation project it shows "Showing 1–500 of 520", and "Show the next 20" reveals the rest.
- **Zone editor:** "Keys on the plan" lists the keys: arrows move a point 10 cm (Shift 1 m), `[` and `]` step through points, Delete removes, I inserts, Esc returns to the list, Ctrl Z undoes, `+` and `-` zoom, and V, P, R, T switch tools.
  - Zones are a listbox. A selected zone exposes Name and Code inputs and a points table with Longitude and Latitude inputs per point plus Insert and Remove buttons. That is a full non-map route to every zone and vertex.
  - My keyboard probe nudged a vertex locally; nothing was saved.

## Step 8. prefers-reduced-motion (`j8-reduced-motion.json`)

The stylesheet has a blanket `@media (prefers-reduced-motion: reduce)` rule (`app/globals.css:172`) that sets animation and transition duration to 0.01 ms !important and scroll-behavior to auto.

- **No-preference:** 8-11 elements have transitions (max 240 ms; tab links 0.2 s, buttons 0.12 s). The menu pop-in runs 200 ms, the dialog fade 120 ms plus pop 200 ms, and map zoom shows 10 distinct intermediate marker positions.
- **Reduce:** `matchMedia` is true and the computed `transition-duration` is 1e-05 s on every element sampled (button, tab link, account trigger, search pill, select, island). No element has a transition above 0.02 ms, menu and dialog do not animate, and map zoom jumps in one frame. Transitions do not animate under reduce.
- **Unused token:** the `--ct-duration-reduced-fade` (100 ms) token exists but is never used, because the blanket rule makes reduce fully instant.

## Consolidated findings (my severity labels)

| # | Finding | Step | Severity |
|---|---|---|---|
| 1 | A save after session expiry shows a generic crash page, loses the form, and says nothing about the session or whether the save happened | 3b | High |
| 2 | One outage gives two outcomes: a shell-less LoadFailure titled "organization" on fresh load, but a "Something went wrong" boundary on client navigation | 3a | Medium |
| 3 | Root font-size is ignored by text (px tokens). At 320 px with 200% root two pages overflow sideways, island content is clipped and controls cover the map | 7c | Medium |
| 4 | The Invite dialog never returns focus to its trigger (6 of 6) | 7a | Medium |
| 5 | Observer direct entry to /forms issues getProject, listSites and listForms before the observer screen | 3c | Low-Medium |
| 6 | Editor save status stays "Checking whether your last change was saved…" for 6 s in a real outage and 40 s in an emulated PUT failure | 3a | Low-Medium |
| 7 | `fm-place` survives sign-out with the last project path. `sb-127-auth-token` is JS-readable with about 400-day expiry (standard @supabase/ssr) | 4 | Low |
| 8 | Role and org are not visible in the header below 1024 px, and the observer sees "MEMBER" | 1 | Low |
| 9 | Org no-access pages have no h1. The sign-in page gives no signed-out reason. Signed-in users can open /sign-in | 3b, 3c, 4 | Low |
| 10 | Multi-word search matches any word | 5 | Low |
| 11 | The success toast overlaps content | 6 | Low |
| 12 | The local DB is behind repo migrations, so Forms and Data degrade (environment, not the app) | caveat 1 | Env |

Strengths:
- 0 axe violations in 60 runs.
- No horizontal overflow in 88 measurements.
- No cross-identity content leak via Back, direct URL or caches.
- The service worker caches public assets only.
- Filters, deep links and copied links round-trip.
- Double submit sends one request.
- A mutation propagates to detail, list, overview and filter without reload.
- The zone editor guards unsaved changes.
- Skip link and route focus work.
- Keyboard routes exist for the map content.
- Reduced motion stops all animation.

## Not done or limited

- Forms with real data (caveat 1).
- A real https service worker.
- bfcache restoration, which never engaged.
- A Dusk focus-ring pixel check.
- A real browser font-size preference (I emulated it).
- Firefox and Safari, and real devices.
- A longer outage window for editor autosave retry.
- Manual resolution of the axe contrast "needs review" items.
- One unreproduced 45 s `page.goto` timeout on the zone site page during 7a. Three later loads took 241-694 ms.

## Scripts

Everything ran as `node <file>` with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`, unsandboxed. The scripts are in `/private/tmp/claude-501/-Users-praty-Desktop-StudentJob-nosync-field-ops/968ba758-2013-4d65-8988-633bbef0c0ba/scratchpad/runtime/`: `j-lib.cjs`, `j1`, `j2`, `j2b`, `j3bc`, `j3a`, `j3a2`, `j4` (modes `default` and `bfcache`), `j4c`, `j5`, `j5b`, `j6`, `j7a`, `j7a2`, `j7a3`, `j7b`, `j7b2`, `j7b3`, `j7c`, `j7d`, `j7d2`, `j8` (all `.cjs`). Seed credentials were read in memory only and never printed.