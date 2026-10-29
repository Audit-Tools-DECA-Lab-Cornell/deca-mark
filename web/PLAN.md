# Web workspace plan (`web/`)

This file is part of the [DECA Mark production plan](../docs/plan/README.md) and defines the `WEB-*` tasks. Related plan files:
- **API shapes:** [contracts.md](../docs/plan/contracts.md).
- **The API side:** [backend/PLAN.md](../backend/PLAN.md).
- **User journeys:** J1, J3 and J4 in [product.md](../docs/plan/product.md#journeys-the-pilot-must-support).
- **Fixture list:** [architecture.md](../docs/plan/architecture.md#fixture-and-practice-data-inventory-current-boundaries) records the fixtures that D30 removed from the web.
- **Local rules:** `web/AGENTS.md` still applies. In particular:
  - every workspace page is live (D30): no fixtures, no Preview data marker, and a feature with no backend says "X is not available yet." (the Honesty section of `web/AGENTS.md`);
  - Contour tokens change only in `contracts/contour.json`; `pnpm tokens` regenerates `src/styles/contour.css`, and the collector reads the same file (D19).

**Skills to load** when working here: `vercel-plugin:nextjs`, `frontend-dashboard-polish`, `responsive-design`, `site-architecture`.

## Original baseline (verified 2026-09-22)

Current changes verified 2026-10-04: WEB-01 package uploads use a real selected project and an authenticated session. WEB-03 through WEB-05 add Supabase SSR authentication, protected account/onboarding routes and a server-only API client. `/account` reads live `/v1/me` data; workspace and onboarding content remains a fixture preview. The service worker now allows only public landing/static assets and excludes private, query-bearing and RSC requests. The baseline below records the starting point, not current behavior.

- **Stack and auth.** Next.js 16.2.7, React 19.2.4, Tailwind v4, react-leaflet 5. There is no Supabase package, no `proxy.ts`, no route handlers, no auth, and no error or not-found pages.
- **Data.**
  - Every workspace screen imports fixtures from `src/data/*`. `VIEWER` is hard-coded to Janet (`src/data/project.ts:70-76`).
  - The only network call is the package upload (`src/lib/packages.ts:82`). It posts to `PROJECT.id = "prj-riverside-play-study"` (`src/data/project.ts:19`), which is not a UUID, so the API returns 422. The manager's token is pasted in (`PackageUpload.tsx:166-181`).
- **Routes.**
  - `(marketing)` at `/`.
  - `(workspace)`: `/overview`, `/observations`, `/places`, `/basemaps`, `/instrument`, `/qgis`, with no project in the URL.
  - `(legal)`: `/privacy`, `/privacy/delete-data`. The privacy copy says administrators create accounts, which is wrong now that sign-up is public.
- **Offline caching.** WEB-02 now generates `public/sw.js` from a source template with a token for each build. It caches only the public landing shell, icons and static build assets, validates responses, and keeps the shell network-first. The manifest opens `/o`.
- **Tablet and touch.** The three-pane Observations view needs a width of at least 1280 px. Several tap targets are 32–40 px (`RailNav.tsx:31`, `chrome.tsx:171,423`, `PackageUpload.tsx:145`).

Current navigation: [whole-product position](../docs/plan/current-state.md). Delivery notes and dated evidence below distinguish implemented scope from remaining manual/hosted acceptance.

## Target route tree

This is the tree in `web/src/app` today (WEB-27). The route group `(auth)/(signed-in)` is now `(auth)/(join)`, because `/invite` and `/join` also serve signed-out visitors.

```
src/app/
  (marketing)/page.tsx                       /
  (legal)/…                                  /privacy, /privacy/delete-data
  (auth)/(signed-out)/…                      /sign-in, /sign-up, /verify, /forgot-password, /reset-password
  (auth)/(join)/…                            /invite (token in the URL fragment), /join (type a code)
  (app)/account/page.tsx                     profile, password, sign out, delete account
  (app)/o/page.tsx                           opens the remembered project, the only project, or the first organization
  (app)/o/[org]/…                            header, no tabs: collect (observer handoff), [...missing], not-found, error
  (app)/o/[org]/(org)/…                      projects (org root), members, settings
  (app)/o/[org]/p/[project]/…                overview (project root), data, data/[observation],
                                             sites, sites/[site], sites/[site]/packages (?package=, ?step=upload),
                                             sites/[site]/zones, sites/[site]/zones/edit,
                                             forms, forms/versions, forms/versions/[version],
                                             forms/versions/[version]/publish, team, qgis, reports, settings
  dev/contour/                               every primitive in Day and Dusk (dev and preview builds only)
src/proxy.ts                                 session refresh + auth redirects
src/lib/supabase/{server,client}.ts
src/lib/api/{client,workspace,mutations}.ts  server-only: cached reads, one function per write
src/lib/api/browser.ts                       browser to API: package upload, archive download and authenticated draft operations
src/lib/workspace/…                          roles, the /o resolver, results (pure, unit-tested)
src/components/contour/…                     primitives, same names as mobile/src/ui/
src/components/shell/…                       header, switchers, tabs, ⌘K, LoadFailure, NotAvailable
src/features/<area>/…
```

Removed in WEB-27: `(onboarding)`, `(org)/library`, the old fixture zone routes (current server-backed Zones/editor routes were added by WEB-28/37), `reports/views`, `reports/[report]` and `settings/rounds`. `/o/deca` is an ordinary address now, not a sample.

A project has eight tabs: Overview, Data, Sites, Forms, Team, QGIS, Reports, Settings. An organization has three: Projects, Members, Settings. The header holds the organization and project switchers, "Search or jump to" (⌘K) and the account menu (with Day · Dusk). Team and Settings are for project managers. Members and the organization's Settings are for owners and admins, who also act as managers of every project in the organization. Nobody else sees those tabs, and those pages check the role themselves and show a no-access note. An observer who opens a project is sent to `/o/<org>/collect`. `/o` opens the project the person was last in (cookie `fm-place`), the only project, or the first organization. The old paths (`/overview`, `/observations`, `/places`, `/basemaps`, `/instrument`, `/qgis`, `/onboarding`) redirect with a 307 to `/o`. `library`, `reports/views` and `settings/rounds` redirect to the page that replaced them. Every route under `(auth)` and `(app)`, and `/dev/contour`, is `noindex`.

**Contour screens, then live data.** WEB-20 to WEB-26 built every page above in Contour on fixtures (D19–D22), and the wiring tasks WEB-04 to WEB-13 were to connect real data to them. WEB-27 (D30) wired all of it at once and removed the fixtures. There is one workspace now: every page under `/o/<org>/p/<project>` reads and writes the API for the signed-in person. The sample workspace at `/o/deca`, the Preview data marker, the set-up flow and the preview sign-in bypass (D20, D23, D24) are gone. A feature with no backend shows one "X is not available yet." note. Where a task below names something WEB-27 retired (`src/data/*`, `src/fixtures/*`, `LeafletCanvas`, `ZonePlan`, `(onboarding)`), read the WEB-27 note at the top of that task. The design pages named under `Read first` come from the four Contour design sets, which are not committed ([docs/ux/README.md](../docs/ux/README.md)); root `DESIGN.md` is the committed reference.

## Tasks

### WEB-01: Quick fix so the package upload reaches a real project
Status: doing (code in place 2026-10-01; the staging upload is not verified) · Phase 0 · Size S · Depends: DB-01 · Blocks: WEB-08
The original project-ID variable, pasted token and fixture/site-code stopgap were superseded by WEB-27 and WEB-42/43. Do not rebuild those controls or recreate the retired configuration. The current browser uses the authenticated route context and explicit zone identities.

Remaining acceptance: after the intended hosted schema/runtime is reconciled, verify a manager can upload the real site's package and see the server checks and current version. This staging check is still unverified; WEB-08 retains it as a prerequisite. DB-01 remains the hosted data acceptance gate.

Done when: an authorized staging upload succeeds through the supported current path, recorded with the exact runtime revision.
Verify: current package/import browser specs locally, then the authorized staging upload. No hosted result is claimed by source delivery.

### WEB-02: Service worker, manifest and indexing safety
Status: done · Phase 0 · Size S · Depends: none · Blocks: WEB-10
Verified 2026-10-04: 30 auth/worker tests, web typecheck/lint and production builds passed under Node 24.18.0. Consecutive rebuilds rotated worker tokens from `703ee8d0-f836-4791-b0c7-05a36e4fdb12` to `5080ce95-4057-4789-861a-c2b5170f14fc`. The second build used a temporary deployment ID, confirming rotation even when Next ignores `generateBuildId`. On the local production server at port 3014, curl returned `Allow: /$`, `Allow: /privacy*`, `Disallow: /`; the manifest opened `/o`, and `/sw.js` returned JavaScript with `no-cache, no-store, must-revalidate`. Production startup preserved the worker token. Activation removes the legacy `fieldmaps-shell-v1` cache and older DECA Mark public caches while preserving unrelated caches. No hosted deployment or browser/device installation was verified.

Do:
1. Changes to `public/sw.js`:
   - add the build id to the cache name;
   - never cache `/_next/data`, `?_rsc`, `/api`, or any cross-origin request;
   - keep the app shell network-first.
2. Point the manifest's `start_url` at `/o`, where WEB-06 will redirect to the last project.
3. Add `src/app/robots.ts`: allow only `/` and `/privacy*`; disallow everything else.

Done when: after a rebuild the cache name changes, and `curl localhost:3000/robots.txt` shows the rules.

### WEB-03: Supabase SSR foundation and proxy
Status: done · Phase 1 · Size M · Depends: DB-02 · Blocks: OPS-05, WEB-04, WEB-05, WEB-16
Verified 2026-10-04: unauthenticated `/o` returns 307 to `/sign-in?next=%2Fo`; real local sign-up/code verification reaches the protected onboarding page and `/account`. Claims are checked again in server components and the API client. Production build lists these routes as dynamic. Public Supabase dependencies were already exactly pinned.

Read first: <https://supabase.com/docs/guides/auth/server-side/nextjs>; <https://nextjs.org/docs/app/api-reference/file-conventions/proxy>.
Do:
1. Add `@supabase/ssr` and `@supabase/supabase-js`, with exact versions pinned in `web/package.json`.
2. Create `src/lib/supabase/server.ts` with `createServerClient`, using `cookies()` `getAll`/`setAll`, and `src/lib/supabase/client.ts` with `createBrowserClient`.
3. Create `src/proxy.ts`. It refreshes the session cookies and redirects unauthenticated requests for `/o/**`, `/onboarding` and `/account` to `/sign-in?next=…`.
4. Also check auth inside every server component and Server Action that reads tenant data, with a `requireUser()` helper that uses `getClaims()`. The proxy alone is not enough.
5. Add the env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, documented in `web/README.md`.

Done when: an unauthenticated visit to `/o` redirects to sign-in, and a signed-in visit passes.

### WEB-04: Authentication pages
Status: done (2026-10-14; local stack only, no hosted auth) · Phase 1 · Size M · Depends: DB-02, WEB-03 · Blocks: WEB-06, WEB-15
Verified 2026-10-04 against local Supabase and Mailpit: browser sign-up, resend, six-digit verification, live account and account-menu sign-out. The automated real Server Action flow additionally verifies unconfirmed-account errors, invalid codes, resend cooldown, recovery code plus password update, same-password rejection followed by successful retry without a new code, rejection of mismatched recovery user/session/email, rejection of the old password, acceptance of the new password, and safe fallback for an external `next`. Emails stay in httpOnly cookies. `DECAMARK_AUTH_LOCAL_TEST=1 pnpm --dir web test:auth:local` passed. No hosted auth verification or deployment is claimed.
Remaining (2026-10-04): the `authenticate` and `signOut` Server Actions are done and tested; their first pages were plain. The Contour screens from WEB-21 replace those pages at the same URLs and now post to the same actions, with the same field names and messages. This task is done when the Contour screens pass the flows above. Password rule: 8 to 128 characters everywhere (D25).

Do: wire these pages to Supabase Auth. WEB-21 builds them in Contour on fixtures; keep its layout, copy and 44 px targets:
- `/sign-up`: email and password (8 characters or more), then `signUp`, then `/verify`.
  - The email travels in `sessionStorage` or an httpOnly cookie, never in the URL. URLs end up in request logs, history and Sentry breadcrumbs.
- `/verify`: 6-digit code, `verifyOtp({type: 'email'})`, and resend with a cooldown.
- `/sign-in`: distinct errors for wrong credentials, unconfirmed email (links to verify), and rate limiting.
- `/forgot-password` → `/reset-password`: code, then new password (`verifyOtp({type: 'recovery'})`, then `updateUser`).
- Sign-out from the account menu.

After sign-in, go to `next`, the last project, or `/onboarding`.

Done when: every flow works against the local stack, with codes read from Mailpit.
Verified 2026-10-14 on the Contour screens, on the local stack (local Supabase Auth and Mailpit, the API on :8001, a production build; `sh scripts/e2e-local.sh --prod --zones --skip-seed --project=desktop-1440 --project=phone-390`, 256 of 256 passed): `e2e/auth-flows.spec.ts` (2 of 2) signs up, refuses a wrong six-digit code, accepts the one read from Mailpit, shows the address on `/account` and signs out from the account menu, then resets the password with the recovery code from Mailpit, refuses the old password and accepts the new one; `sign-in.spec.ts` (12 of 12) signs in to the person's project, keeps the destination of a signed-out visit, and sends a signed-in home-page visit to the workspace. `DECAMARK_AUTH_LOCAL_TEST=1 pnpm --dir web test:auth:local` 1 of 1 (the Server Action flow above; its final redirect check now accepts Next 16's `;push` suffix), `test:auth` 34, `test:api-errors` 38, `test:account` 12, `test:unit` 354, `pnpm --dir web check`. No hosted auth was run.

### WEB-05: Server-side API client
Status: done · Phase 1 · Size M · Depends: BE-06, CON-03, CON-04, WEB-03 · Blocks: WEB-06, WEB-12, WEB-27
WEB-27 (2026-10-09, D30): kept. `NEXT_PUBLIC_DECAMARK_API_URL` is not removed: the browser uses it to send map packages (up to 24 MiB) and fetch their archives straight from the API, as step 3 allowed. Server components and Server Actions use `DECAMARK_API_URL`. The client also gained cached reads (`lib/api/workspace.ts`), one function per write (`lib/api/mutations.ts`) and a 15-second timeout for each request.
Verified 2026-10-04: authenticated `/account` renders real `/v1/me` profile and membership counts from the local API, in both browser and automated HTTP acceptance. Generated endpoint types, runtime identity parsing, no-store requests and a 15-second timeout are in place. Large package uploads remain direct browser-to-API, retaining CORS and the public API origin to avoid introducing a web proxy body-size limit. `pnpm --dir web check`, `build`, `test:auth` (11 tests) and `test:api-errors` (31 tests including HTML 200 response handling) passed.

Do:
1. Create `src/lib/api/client.ts` and mark it `server-only`. It fetches `DECAMARK_API_URL` (a server environment variable, not `NEXT_PUBLIC_`) with the session's access token and `cache: 'no-store'`, typed by the generated `schema.d.ts`. It maps the error envelope to typed errors (`errors.ts`).
2. Mutations go through Server Actions that call this client. Each action checks auth itself.
3. Make one exception: large package uploads may post from the browser directly to the API. They need CORS, which `browser_origins` already covers. Alternatively, the upload goes through a Route Handler proxy, which also needs a body-size decision. Record the choice in this task's notes.
4. Remove `NEXT_PUBLIC_DECAMARK_API_URL` once nothing reads it.

Done when: one server component renders `/v1/me` data, and the typecheck passes against the generated types.

### WEB-06: Onboarding, organization and project routes, account page
Status: done (2026-10-14; as built under D30; account deletion's 204 and 202 answers are unit-tested, not run in a browser) · Phase 1 · Size L · Depends: BE-06, BE-07, BE-08, WEB-04, WEB-05 · Blocks: WEB-07, WEB-08, WEB-09, WEB-10, WEB-11, WEB-14, WEB-15
WEB-27 (2026-10-09, D30): delivered, except the set-up. `/o` opens the person's last project, their only project or their first organization. The organization and project routes and switchers come from `/v1/me`. Owners and admins create projects from the organization's Projects page. `/invite` and `/join` preview and redeem real invitations. The organization and the project have `loading.tsx`, `error.tsx` and not-found pages. `/account` was already live. Retired: `/onboarding` and creating an organization on the web (the bootstrap script does that).
Do:
1. `/onboarding`:
   - create an org (name, auto slug) and the first project (name, code, timezone) through `POST /v1/orgs`;
   - or show "You were invited? Open your invitation link."
2. `/invite` (the token in the URL **fragment**, `/invite#t=…`):
   - The fragment never reaches the server, the logs or the referrer.
   - The page reads it client-side and keeps it in `sessionStorage` through sign-up or sign-in. `next` points at `/invite`, without the token.
   - Then it calls `POST /v1/invitations/preview`, and shows "Join {project} ({org}) as {role}?".
   - `POST /v1/invitations/redeem` runs only on that confirmation. Opening a link never enrols anyone silently.
   - Set `Referrer-Policy: no-referrer` on `/invite` and `/verify`.
   - Add a Sentry `beforeBreadcrumb` rule that drops URLs under `/invite` and any `email` parameter (WEB-16).
3. `/o/[org]` lists the projects and org settings, including org members when the user is an admin.
4. The workspace sections live under `/o/[org]/p/[project]/…` with the D21 slugs (`data`, `sites`, `forms`, `team`, `qgis`, `reports`, `settings`), and the old paths redirect; WEB-22 builds both. Resolve the org and project from the route and `/v1/me` instead of the fixture slugs. Keep the fixture reads and the Preview data marker (D20) until WEB-08 to WEB-12 wire each screen.
5. Header: the org and project switcher from `/v1/me`, and the account menu. Remove the `VIEWER` fixture, and the marketing page's `ORGANIZATION.name`; the landing page names the product, not a tenant.
6. `/account`: profile (`PATCH /v1/me`) and delete account.
   - Deletion calls `DELETE /v1/me` behind a two-step confirm, with a `sole_owner` message.
   - On 202, show "Deletion is finishing" and retry up to 3 times over about 30 seconds while the session is valid.
   - Then sign out (204 or 202 alike).
   - The server keeps the durable record (BE-08).
7. Add `error.tsx`, `not-found.tsx`, and a `loading.tsx` for each section.

Done when: J1 steps 1–2 work end to end against the local stack, and the old URLs redirect.
Verified 2026-10-14, as built under D30 (organizations from the bootstrap script, projects on the web), on the local stack (local Supabase Auth and Mailpit, the API on :8001, a production build; `sh scripts/e2e-local.sh --prod --zones --skip-seed --project=desktop-1440 --project=phone-390`, 256 of 256 passed): J1 on a fresh synthetic account, its organization set up by `scripts/bootstrap-study.mjs` (WEB-43: organization, project, published forms, Fall Creek with map v1) and opened on the web; `org.spec.ts` (8 of 8) has an owner create a project in their own organization and land in it as its manager, and shows Members and Settings only to owners and admins; `invite-viewer.spec.ts` and `join-observer.spec.ts` redeem an invitation link and a join code; `removed-routes.spec.ts` (14 of 14) redirects the old URLs and retires `/onboarding`. Account deletion: a pending (202) deletion now says it is finishing and tries again after 5, 10 and 15 seconds (`src/features/account/deletion.ts`; `tests/unit/account-deletion.test.mjs`, 3 tests), then says the deletion is recorded and will be completed. Every try names the account the dialog was opened for, and the Server Action sends nothing when another account is signed in on the browser (PR 26 review): `e2e/account-deletion.spec.ts` (2 of 2, desktop and phone) signs in a second account from another tab, and the first tab's request is refused before it reaches the API; the same spec fails when the check is removed. **Not run in a browser:** `DELETE /v1/me` answering 204 or 202, because the local API has no Auth Admin key and answers 503 (BE-08's credential, a user step).

### WEB-07: Team page (members, invitations, join codes)
Status: done (2026-10-15; the mobile side ran on the phone's API path, not yet on a device) · Phase 1 · Size M · Depends: BE-07, WEB-06 · Blocks: WEB-15
WEB-27 (2026-10-09, D30): delivered on live data for a project (Team) and for an organization (Members): the list, role change, remove, an invitation by link or by an 8-character code (shown once, with "DECA Mark does not send email"), pending invitations and revoke. Not built: the QR code (dropped), devices (DB-10) and resending an invitation ("not available yet"). Nobody becomes an owner by a role change; ownership moves only by Transfer ownership in the organization's Settings.
Do:
1. List members with their role, and let a manager change a role or remove someone.
   - The UI blocks removing the last manager, and the API enforces it too.
   - On the organization page (`/o/[org]`), owners and admins manage org members the same way. Only owners see `admin` and `owner` controls, and ownership moves only through "Transfer ownership".
2. Invitations, for a project (project roles) or, on the organization page, for the org (`member` or `admin`):
   - create one with a role, an optional email, a use limit and an expiry;
   - show the link (`/invite#t=…`) and the 8-character code **once**, with copy buttons and a QR code of `decamark://join?code=`;
   - list active invitations and revoke them.
3. Observer devices come from DB-10 `devices`, once it exists.

Done when: a manager creates a code on the web and an observer redeems it on mobile (MOB-06).
Progress 2026-10-14, web side, on the local stack (production build, desktop-1440 and phone-390, in the 256-test run): `team.spec.ts` (a manager invites someone, sees the link and the code once, and revokes the invitation), `invite-viewer.spec.ts` (a viewer joins from the link and sees no Team or Settings), `join-observer.spec.ts` (an observer joins by code on the web and lands on the collect page) and `org.spec.ts` (Members and Settings only for owners and admins), each 2 of 2 or more.
Verified 2026-10-15, mobile side (MOB-06): on the local stack, a single-use observer code made by the seed's manager through `POST /v1/projects/{project}/invitations` (the Team page's call) was previewed and redeemed by a newly signed-up observer through the collector's own API client and join logic, and `/v1/me` then listed the project as active beside Training (`mobile/src/features/onboarding/join.acceptance.test.ts`). The redemption through the phone's screens is in the [device checklist](../docs/qa/device-checklist-2026-10.md), pending (user).

### WEB-08: Sites and packages on real data
Status: doing (2026-10-15 reconciliation: implementation delivered in part; remaining acceptance below) · Phase 3 · Size M · Depends: BE-13, WEB-01, WEB-06 · Blocks: none
Current scope (reconciled 2026-10-15): WEB-27 delivered live site CRUD, plans and package history/download; WEB-36/42/43 delivered the single site API and identity-aware imports. `sites.spec.ts`, `packages.spec.ts` and the zone import suites supply local browser evidence recorded in those tasks. No fixture or pasted-token cleanup remains.

Remaining: complete WEB-01's staging upload acceptance and BE-13's Storage-backed delivery before closing the original production package flow. Inspect the current `src/features/sites/` and `src/features/packages/` implementations, not the deleted basemap components. No Activate action is planned; publication/import selects the newest ready immutable version.

Done when: a manager creates a site, uploads and downloads its package on the intended staging runtime, and the current plan/history agree. Local source delivery does not prove hosted delivery.
Verify: owning site/package browser specs on the local stack, then the explicitly authorized staging acceptance.

### WEB-09: Instrument on real data
Status: doing (2026-10-15 reconciliation: implementation delivered in part; remaining acceptance below) · Phase 3 · Size M · Depends: BE-11, WEB-06, WEB-10 · Blocks: none
Current scope (reconciled 2026-10-15): WEB-27 delivered real forms, version drafts, server save/validation, publish and retire. The current editor and local `forms.spec.ts` evidence replace the fixture-based Instrument/Studio work. Templates are implemented; arbitrary JSON draft import is not.

Remaining: verify the canonical Janet definition can be prepared and published through the supported workflow; either implement the original JSON import requirement or obtain an explicit scope decision to replace it with templates. Keep protocol-content approval separate from technical publishing. No fixture cleanup is left.

Done when: Janet's approved canonical definition is published locally without changing its meaning, and the import/template scope decision is recorded.
Verify: `pnpm forms:parity`, form browser specs, and inspect the saved immutable definition and map form binding.

### WEB-10: Observations on real data
Status: doing (2026-10-15 reconciliation: implementation delivered in part; remaining acceptance below) · Phase 3 · Size L · Depends: BE-14, WEB-02, WEB-06 · Blocks: WEB-09, WEB-13
Current scope (reconciled 2026-10-15): WEB-39/40 delivered cursor paging in batches of 500, server site/zone/package/round/observer/date filters, URL history and recorded-version detail. The Data map explicitly draws a chosen version and a labelled loaded subset; search is loaded-row only. The 520-row local fixture is covered by `data-history.spec.ts`. No legacy Leaflet/fixture work remains.

Remaining: the original viewport/bbox query, clustering and the 10,000-observation smoothness acceptance are not delivered by that 520-row run. Resolve these against BE-14's remaining scope; preserve exact recorded boundaries and whole-zone Inventory semantics. Do not reintroduce current-boundary relabelling.

Done when: the remaining map/scale scope is implemented and the 10,000-row local browser scenario filters, pages and reloads smoothly with truthful subset labels.
Verify: `data.spec.ts`, `data-history.spec.ts`, and a recorded scale/viewport scenario after BE-14's applicable work.

### WEB-11: Overview on real data
Status: doing (2026-10-15: implemented overview counts/zone-round coverage verified against local SQL; original TypeBars scope remains unresolved) · Phase 3 · Size M · Depends: BE-14, WEB-06 · Blocks: none
Current scope (reconciled 2026-10-15): WEB-41 moved zone/round coverage to the authorized server summary. Counts no longer pretend a loaded page is the whole project. Observer/day/play-type breakdowns still use loaded rows and say so; do not describe every panel as a complete server aggregate.

Remaining: implement the original `TypeBars` requirement with the required summary dimensions, or record an explicit decision to drop that scope. Existing total/zone-round overview aggregates now have local SQL/browser acceptance below; preserve loaded-subset labels for answer-based breakdowns until a matching server aggregate exists. BE-14’s viewport filter remains separate WEB-10 work. Fixtures and former client-only coverage are historical.

Done when: all intended overview dimensions match the authorized SQL scope, with no unlabelled truncation.
Verify: summary unit/API checks and `overview.spec.ts`/historical-summary acceptance on a multi-page fixture.

Verified 2026-10-15: the part of BE-14 this task needs is in the API (`GET …/observations/summary`, BE-20's subset; BE-14 itself still lacks the viewport filter), and the overview reads it (`summarizeObservations` for today and the last 7 days, `coverageFromGroups` for coverage by zone and round; WEB-41); `src/lib/analysis.ts` is gone. `e2e/overview-sql.spec.ts` reads the project's counts straight from the local database (`docker exec … psql`, total and by zone and round type) and holds the overview's total and each zone's coverage row to them: 2 of 2 at desktop-1440 and phone-390 on the local stack, beside `overview.spec.ts` 4 of 4. Not built: `TypeBars` on the overview, because the summary carries no answers (play types); DESIGN.md rules out KPI tiles, and the lead may drop that part of the Do line.

### WEB-12: GIS page and exports
Status: doing (2026-10-15 reconciliation: implementation delivered in part; remaining acceptance below) · Phase 3 · Size S · Depends: BE-14, BE-15, GIS-01, GIS-04, WEB-05 · Blocks: none
Current scope (reconciled 2026-10-15): WEB-41 delivers server ZIP exports for every matching observation within the documented limits, with CSV/GeoJSON, codebook, forms, metadata and historical zones. The QGIS page also offers package downloads. Client-only newest-500 exports are superseded.

Remaining: BE-15's `/gis-access` and the real per-project connection panel, after GIS-01 to GIS-04 and scoped reader provisioning. GIS-09's historical geometry work does not complete these pilot access tasks.

Done when: existing server exports remain correct and a project with an authorized grant displays the real public connection settings and typed layer names.
Verify: `qgis-reports.spec.ts`, scoped export acceptance, then the authorized live-reader/QGIS scenario.

### WEB-13: Tablet layout and touch targets
Status: doing (2026-10-14: started under the user's exception; it closes only after WEB-10) · Phase 3 · Size M · Depends: WEB-10 · Blocks: none
WEB-27 (2026-10-09, D30): not part of this task. WEB-27's screens are built to fit 390 px, and the Playwright honesty scan in `web/e2e` screenshots every route at 1440, 1024, 768 and 390 in Day and Dusk. The audit of 44 px targets at 768×1024, 1024×768 and 1280×800 is still open.
Do:
1. Observations: two panes (map and table) from `md`, with detail as a sheet. Three panes at `xl`.
2. Every control is at least 44 px tall (`RailNav.tsx:31`, `chrome.tsx:171,423`, `ObservationsWorkspace.tsx:102`, `PackageUpload.tsx:145`).
3. Check at 768×1024, 1024×768 and 1280×800 using the `responsiveness-check` skill.

Done when: there is no horizontal scroll and no clipped pane at those three sizes. Record screenshots in the task notes.
Exception (2026-10-14, user): started before WEB-10 is done ("start only, close later"). It stays doing until WEB-10 is done.
Progress 2026-10-14, local stack, production build, Chromium with touch emulation (`pointer: coarse`) at 768×1024, 1024×768 and 1280×800, on 16 pages as an owner (the project's overview, Data, Sites, a site, its packages and zones, Forms, versions, Team, QGIS, Reports and Settings; the organization's projects, members and settings; Account). Each control's target was measured by hit-testing outward from its centre, so a `::before` extension counts as it does for a finger; one browser context per size, measuring before any full-page screenshot (each resets Chromium's touch emulation). Screenshots of all 48 pages were taken but not committed (`web/e2e/screenshots/` is ignored).
- **No horizontal scroll** on any page at any size. Nothing is clipped beyond its own frame: the site plan clips its drawing to the map, and the Data and Form versions tables scroll sideways inside their own island at 768.
- **Fixed:** small outline and danger buttons reached only 40 px, because a `::before` inset starts inside the 2 px edge; the sm `Button`, the sm `IconButton` and the package-upload label now centre a 44 px box (69 findings to 0). A `TextLink` with a glyph ("All observations", "Package history", "Open the draft") is a 44 px target on touch screens (`pointer-coarse:`), without moving its words. QGIS's wrapped download row keeps 16 px between lines so the link below does not take the buttons' targets; QGIS now has no target under 44 px (`qgis-reports.spec.ts`, 14 of 14 with setup, after the change).
- **Open:** links without a glyph used as row titles or standalone actions are 20 to 24 px (site names on Sites and the organization's Projects, "Show vN" in package history, "Edit zones", "Draft · v2", "Organization members"); Data plan markers are 27 px (37 px selected), deliberately short of 44 so close markers stay separable, with each row in the table as the 44 px way to the same observation. Do step 1 names files that WEB-27 replaced (`RailNav.tsx`, `chrome.tsx`, `ObservationsWorkspace.tsx`, `PackageUpload.tsx`): the Data screen stacks the table and plan until `xl`. Whether two panes from `md` still apply is the lead's call.

Related 2026-10-22: the Data page's plan-after-table layout below 1280 px (frontend audit C12) is fixed in WEB-51.

### WEB-14: Legal pages for public sign-up
Status: done (2026-10-14; two facts stay "to be confirmed": the email provider and the Training retention) · Phase 1 · Size S · Depends: WEB-06 · Blocks: OPS-11
WEB-27 (2026-10-09, D30): not changed. The legal layout only takes the new header mark (D29).
Read first: `src/app/(legal)/privacy/page.tsx` (`:78-80` and `:281` say administrators create accounts); `src/app/(legal)/policy.ts`.
Do:
1. Describe public sign-up, email-code verification, and what data an account holds.
2. Describe the Training project and its 30-day retention. The retention period depends on Q2.
3. State that a user can delete their account in the app, or signed in on the web at `/account`.
4. Make `/privacy/delete-data` work **without the app**, to meet the Play requirement: signed-in users get the deletion flow; signed-out users get instructions and a contact.
5. Keep the "to be confirmed" markers wherever a value is still open.

Done when: nothing on the page contradicts public sign-up, and the deletion path works without the app.
Verified 2026-10-14: `/privacy` describes public sign-up with a six-digit email code, what an account holds (the Profile row, memberships, the Training project and its retention), the website's cookies and self-serve deletion at `/account` ("The app cannot delete accounts yet"); `/privacy/delete-data` adds "Delete your account yourself" for anyone with the web, and instructions with a contact for anyone without it. `policy.ts` keeps `trainingRetention` ("30 days after they arrive", Q2) and `emailProvider` (null) as "to be confirmed" facts, and the effective date is October 14, 2026. On the local stack (local Supabase Auth and Mailpit, the API on :8001, a production build; `sh scripts/e2e-local.sh --prod --zones --skip-seed --project=desktop-1440 --project=phone-390`, 256 of 256 passed): the honesty scan reads `/privacy` and `/privacy/delete-data` honestly signed out (Day and Dusk, axe clean) and screenshots both widths. The deletion itself is WEB-06's flow, not browser-run locally for the reason given there.
Updated 2026-10-15 (MOB-05, MOB-07): the app now creates accounts and deletes them, so `/privacy` and `/privacy/delete-data` say so (app deletion path, records not uploaded stay on the device and can no longer upload, sign-out works offline, and the note the app keeps at sign-out); the effective date is October 15, 2026. The two "to be confirmed" facts are unchanged.

### WEB-15: End-to-end tests with Playwright
Status: doing (2026-10-15: WEB-07 local mobile redemption gate passed; local suites exercised; remaining authorized deletion/browser and CI acceptance) · Phase 4 · Size M · Depends: DB-02, WEB-04, WEB-06, WEB-07 · Blocks: QA-04
WEB-27 (2026-10-09, D30): partly delivered. `web/e2e` and `scripts/e2e-local.sh` run Playwright against local Supabase, the local API and the seed in `database/seed-web-workspace.mjs`. Specs: sign-in, sites, packages, forms, data, overview, QGIS and reports, settings, team, organization pages, an invitation redeemed by a viewer, an observer joining by code, the removed routes, and a scan of every route for sample words, jargon, more than one primary button and axe findings in Day and Dusk. At the original D30 baseline, sign-up, password reset and account deletion were not covered; WEB-04 and WEB-06 added the later coverage below. There is no onboarding to test.
WEB-04 (2026-10-14): `e2e/auth-flows.spec.ts` now covers sign-up with Mailpit codes (a wrong code, then the right one) and password reset (the old password refused, the new one accepted), and `org.spec.ts` covers an owner creating a project in their own organization. Account deletion is unit-tested only: the local API has no Auth Admin key, so `DELETE /v1/me` answers 503 there. The successful/pending deletion responses still need browser acceptance with the authorized Auth Admin runtime; the cross-account refusal is browser-covered by `account-deletion.spec.ts`. WEB-07’s local collector-client redemption gate now passes; physical screen walkthrough remains in the device checklist. Successful/pending deletion browser acceptance and complete CI evidence remain open.
Do: finish the existing `web/e2e/` suite on the local stack with Mailpit codes. The original coverage list is:
- sign-up and verify, then bootstrap the organization and create a project through the supported D30 flow;
- sign in and reset password;
- invitation link redemption by a second user;
- a manager creates a join code;
- account deletion.

Done when: the suite passes locally and in CI (OPS-06).

Progress 2026-10-15: every dependency is done (WEB-07 closed today). On the local stack, with the API's email delivery off (`scripts/e2e-local.sh` now forces it; since 529e81b the API sent `team.spec.ts`'s invitations whenever the calling shell had provider settings), the suite for this task passes at desktop-1440 and phone-390, 38 of 38 with setup: `auth-flows.spec.ts` (sign-up and verify with Mailpit codes, password reset), `sign-in.spec.ts`, `org.spec.ts` (an owner creates a project; organizations come from the bootstrap script under D30, so "onboarding, then the org and project exist" is the bootstrap plus this spec), `invite-viewer.spec.ts` (a second user redeems a link), `team.spec.ts` (a manager creates a join code), `join-observer.spec.ts` and `account-deletion.spec.ts` (the account check; DELETE /v1/me answering 204 or 202 needs BE-08's key). **Open:** CI runs no Playwright job; a proposed job is in [the 2026-10-15 requests](../docs/handoff/frontend-requests-2026-10-15.md) for the CI owner (OPS-06).

### WEB-16: Web error reporting
Status: todo · Phase 4 · Size S · Depends: OPS-07, WEB-03 · Blocks: QA-06
WEB-27 (2026-10-09, D30): not changed.
Do:
1. Add `@sentry/nextjs` for server, edge and browser.
   - Server and edge read `SENTRY_DSN`.
   - The browser reads `NEXT_PUBLIC_SENTRY_DSN`, which is fixed at build time (OPS-05). A DSN is public.
2. Apply the OPS-07 scrubbing:
   - no request bodies;
   - no `answers`;
   - no emails;
   - a `beforeBreadcrumb` rule that drops `/invite` URLs and `email` parameters (WEB-06).
3. Add a hidden `/account/sentry-test` action, for signed-in platform admins only, that throws once.

Done when: a server-side and a browser-side test error from the preview deployment both appear in Sentry, with no personal data in their breadcrumbs.


### WEB-17: Form Studio: the canonical form, a live collector preview, and local drafts
Status: done (2026-10-01) · Phase 1 · Size M · Depends: CON-02 · Blocks: none
WEB-27 (2026-10-09, D30): drafts moved to the server. The browser-only drafts, the change list, the `.json` download and the `/instrument` studio (`components/studio/*`) are retired. A draft is saved to the API, published and retired from Forms. Kept: the parser and engine in `src/lib/forms/` (`pnpm forms:parity`) and the collector view in the draft editor, which runs the same engine.
Added 2026-10-01 to show Janet her form as the collector asks it, before the instrument API exists. WEB-09 later swaps the source from `contracts/forms/` to the API and adds publishing; the studio's UI stays.
Read first: `contracts/README.md`; `mobile/src/forms/{definition,engine}.ts`; `mobile/src/components/question-panel.tsx`.
Do:
1. Copy the form parser and engine to `web/src/lib/forms/`, byte-identical below a header, with `pnpm forms:parity` checking it. Add `loadDefinition()`, which returns every problem instead of throwing.
2. `/instrument` reads `contracts/forms/*.json` at build time and renders each question in authored order: kind, required, display rule as a sentence, options, dynamic option sets, export column, open protocol questions.
3. A phone preview (`src/components/studio/PhonePreview.tsx`) runs the same engine: one question per screen, auto-advance on single choice, review, saved, and the export columns an answer lands in.
4. Customize a draft in place: wording, guidance, required, option labels (codes never follow a relabel), new options, order, simple display rules, new questions with no invented export column. A published version is read-only; changing it starts a new draft beside it.
5. Drafts stay in this browser (`localStorage`, guarded) with a change list against the shipped file and a `.json` download. No publish control pretends to work.

Done when: Janet's form renders from `contracts/forms/janet-test-v1.json`, branching on the phone matches the device, an edit appears on the phone at once, and the change list names it.

Verify: `pnpm forms:parity`, `pnpm --dir web check`, and a browser pass recorded here.

Verified 2026-10-01: the web copy matches mobile byte for byte and replays all 39 `janet-test-v1` contract cases; `pnpm --dir web check` passes. In the browser, Janet's form renders from the contract, choosing Imaginative reveals its own subtype list, an added option and a required toggle reach the phone at once and appear in the change list, review blocks a save on missing required answers, and the saved screen lists the export columns. No horizontal scroll at 1440, 1024 or 768 px.

### WEB-18: Set-up flow preview (organization, project, site, form, invitation)
Status: done (2026-10-01) · Phase 1 · Size S · Depends: none · Blocks: none
WEB-27 (2026-10-09, D30): retired. `/onboarding`, `features/onboarding` and `components/onboarding` are deleted, with every link to them. Organizations come from `scripts/bootstrap-study.mjs`. Owners create projects on the organization's Projects page. Sites, forms and the team are created in their own tabs.
Added 2026-10-01 for the J1 walkthrough with Janet. A clickable preview at `/onboarding` that saves nothing and says so; WEB-06 and WEB-07 replace its "Continue" steps with the real calls once BE-07 exists.
Do: five steps (organization and slug, first project and timezone, site and the QGIS layers it needs, starting form, observer join code), a live "what this creates" panel, links into `/basemaps` and `/instrument`, and a phone mock of the collector's join screen. No control is labelled as creating anything.

Done when: every step is keyboard reachable, the banner states that nothing is saved, and the page passes `pnpm --dir web check`.

Verified 2026-10-01: all five steps walked in the browser (slug and project code derive from the names, a join code is generated, the join-screen mock names the project and org), the page is `noindex`, every control is at least 44 px tall, and `pnpm --dir web check` passes.

### WEB-19: Map palettes on the web maps (Day, Night)
Status: done (2026-10-01) · Phase 1 · Size S · Depends: none · Blocks: none
WEB-27 (2026-10-09, D30): the Leaflet maps are retired: the observations map, the package-upload preview and the tile layers. `leaflet` and `react-leaflet` are removed. Plans are the SVG `SitePlan` and `MapFrame`, which keep the Day and Night palettes from `contracts/map-palettes.json`.
Added 2026-10-01 with MOB-22 (decision D18). The observations map and the package-upload preview read `contracts/map-palettes.json` through `src/lib/map-palette.ts`; a Day · Night switch on the observations map is shared by both maps and remembered in the browser. Light or dark CARTO tiles follow the palette.
Verified 2026-10-01: `pnpm --dir web check` passes; in the browser the switch flips the site fill between the Day and Night colours and the choice survives a reload. The ground repaint around the site on a palette change was not seen in a browser (the pane was hidden).

### WEB-20: Contour foundation (web)
Status: done (2026-10-14; the comparison against the Contour system pages is pending (user)) · Phase 1 · Size L · Depends: none · Blocks: WEB-21, WEB-22
WEB-27 (2026-10-09, D30): the temporary parts are gone: the fixture scaffold (`src/fixtures`, `lib/preview.ts`), the Nocturne alias block in `globals.css`, `components/nocturne` and `src/data`. The ESLint rule now bans `@/fixtures`, `@/data` and `@/lib/preview` in place of the Nocturne-era modules. The tokens and `/dev/contour` are unchanged.
Added 2026-10-03 (D19, D22). It builds no product screen. The screens built on it (WEB-21 to WEB-26) run on fixtures; the wiring tasks WEB-04 to WEB-13 later connect real data to them without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`, `web/AGENTS.md`, `contracts/contour.json`, `contracts/map-palettes.json`; designs: Contour system pp. 1–12.
Do:
1. Tokens. `scripts/contour-tokens.mjs` generates `src/styles/contour.css` (`--ct-*` on `:root` for Day and on `[data-theme="dusk"]`); `--check` fails on drift and on contrast below 4.5:1 for text or 3:1 for UI, in both themes. Root scripts `pnpm tokens` and `pnpm tokens:check`. `globals.css` maps the variables to Tailwind utilities with `@theme inline`. A temporary block of Nocturne-name aliases keeps untouched screens readable until WEB-26 deletes it.
2. Fonts: Geologica and Spline Sans Mono through `next/font/google` as `--font-sans` and `--font-mono`, falling back to vendored woff2 through `next/font/local` if the fetch is blocked.
3. Theme. An inline `<head>` script reads `localStorage["fm-theme"]` (Day by default) and sets `data-theme`, `colorScheme`, the theme-color meta and `data-platform` before first paint; `suppressHydrationWarning` on `<html>`; no cookies, so static pages stay static. `manifest.ts` and `viewport` take the Contour colours.
4. Dependencies: `lucide-react`, `radix-ui` and `cmdk`; dev `@playwright/test` and `@axe-core/playwright`. Motion is CSS only, from the motion tokens, and every movement has a reduced-motion fallback.
5. Primitives in `src/components/contour/*`, with the same names as `mobile/src/ui/*`: actions, containers, state, inputs, navigation, data and feedback, as listed in `DESIGN.md`. `Icon` maps the Lucide names in the state vocabulary of `contracts/contour.json` and adds the custom two-bar held glyph. State is always a glyph, a word and a colour from that vocabulary.
6. Maps. `components/map/SitePlan` is a server-renderable SVG drawn from the palette and the site GeoJSON (`lib/plan.ts` projects any GeoJSON). The client `MapFrame` adds keyboard zoom and pan, round + / − buttons, the Layers popover (Day · Night), the label island, the scale chip, hatched focus zones and violet markers. The shared Riverside plan moves to `contracts/fixtures/sites/riverside.json`.
7. The fixture scaffold in `src/fixtures/*` (`PREVIEW_NOW`, every time in an explicit timezone, U2–U7 concepts in tagged types), `lib/{theme,preview,plan,time}.ts`, and an ESLint `no-restricted-imports` rule that stops new imports of `@/data/*` and `nocturne/*`.
8. `/dev/contour`: every primitive in Day and Dusk, `noindex`, dev and preview builds only. Add the Playwright harness in `web/e2e/` (against `next start`, service workers blocked) that screenshots a route at 1440, 1024, 768 and 390 in both themes.

Done when: the gallery renders every primitive in Day and Dusk; `pnpm tokens:check` passes, contrast included; the existing routes still build.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of `/dev/contour` against the Contour system pages.
Verified 2026-10-14: the tokens, fonts (`next/font` Geologica and Spline Sans Mono), the pre-paint theme script (`src/lib/theme-script.ts`, `fm-theme`), the dependencies, the primitives, the maps, the `noindex` gallery and the Playwright harness are in place. Every component `src/components/contour/index.ts` exports appears in the gallery's source except Radix sub-parts (`MenuCheckboxItem`, `PopoverAnchor`, `PopoverClose`); `Skeleton` draws inside the loading `ScreenState`. `e2e/specimen/contour-gallery.specimen.ts` (`pnpm --dir web test:specimen`, 1 passed) opens every one of the 17 sections in Day and Dusk at 1440, 1024, 768 and 390 with no page error and no sideways scroll, and screenshots each to `web/e2e/screenshots/gallery-<width>/<theme>/dev-contour.png`. `pnpm tokens:check` passes, contrast included; `pnpm forms:parity` passes; `pnpm --dir web check` passes and the production build serves the 256-test local-stack run. **Pending (user):** comparing those screenshots with the Contour system pages.

### WEB-21: Identity screens on Contour (web)
Status: doing (2026-10-15: live implementation delivered by WEB-27; remaining design/manual acceptance) · Phase 1 · Size L · Depends: WEB-20 · Blocks: none

Current boundary: the WEB-27 delivery note below records implemented scope. The original October 3 design brief that follows is historical: fixture, preview, session-only and removed-route instructions are superseded by D30 and the zone tasks. Retain only applicable design/accessibility comparisons as remaining acceptance; do not rebuild retired screens or fixture behavior.

WEB-27 (2026-10-09, D30): delivered. `/invite` and `/join` preview and redeem real invitations. The token stays in the URL fragment and the code never goes in the URL. The group `(auth)/(signed-in)` is now `(auth)/(join)`, because the pages also serve signed-out visitors. Joining again as an existing member is answered 404 by the API, and the join page says the person may already be a member. Retired: the `(onboarding)` frame and `/onboarding/[step]`, the Preview data footer line and the `?preview-state` demo screens.
Added 2026-10-03. WEB-04 (sign-up, sign-in, codes, passwords) connects them to the Supabase Server Actions at the same URLs, and WEB-06 (onboarding, invitation) connects them to the API, without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Contour system p. 12, Organization, auth and public pp. 6–13; `src/components/onboarding/*` (WEB-18).
Do:
1. Layouts: `(auth)/(signed-out)` (split layout with the SitePlan hero island and a Privacy link), `(auth)/(signed-in)` (split layout with the account chip and "Not you?") and the `(onboarding)` stepper frame, each with the Preview data footer line.
2. `/sign-in`, `/sign-up`, `/verify`, `/forgot-password` and `/reset-password`. A code is one wide mono field with a counter ("4 of 6"): a paste is cleaned, the field submits by itself at the 6th digit, a wrong code reselects it, and "Resend in 0:24" counts down in mono. Password checks update live, "Does not match yet" appears only after blur, and a disabled button always carries its reason.
3. `/invite` ("Join Play Study?", the token in the URL fragment) and `/join` (PROPOSAL U3, with its flag; join codes are uppercased as you type).
4. `/onboarding/[step]` for organization, project, site, form and team, keeping WEB-18's `SetupFlow` logic and its rule that no control claims to create anything.
5. Every error state in the designs, in Contour wording: what happened, what is safe, what to do.

Done when: each screen matches its design page at 1440 and 390 in Day and Dusk; codes paste and submit by themselves; every error state can be shown in the preview.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of each route against its design page, with axe failing on serious or critical findings.

### WEB-22: Workspace shell and navigation
Status: doing (2026-10-15: live implementation delivered by WEB-27; remaining design/manual acceptance) · Phase 1 · Size L · Depends: WEB-20 · Blocks: WEB-23, WEB-24, WEB-25, WEB-26, WEB-27

Current boundary: the WEB-27 delivery note below records implemented scope. The original October 3 design brief that follows is historical: fixture, preview, session-only and removed-route instructions are superseded by D30 and the zone tasks. Retain only applicable design/accessibility comparisons as remaining acceptance; do not rebuild retired screens or fixture behavior.

WEB-27 (2026-10-09, D30): delivered on live data. The switchers, the account menu (real name, email and initials), the tabs by role, ⌘K and the shortcuts read `/v1/me` through `WorkspaceProvider`. ⌘K covers tabs, organizations, projects and the account, not sites, people or `OBS-` ids. Retired: the Preview data marker and footer, View as and Show state, the session-only store, the Form library tab, and Create project in the switcher (it is on the organization's Projects page). The old paths redirect to `/o`.
Added 2026-10-03 (D20, D21). WEB-03's proxy now guards it (with the D23 preview bypass), and WEB-06 (switchers and account menu from `/v1/me`) connects it to real organizations and projects without changing its layout.
Read first: `DESIGN.md`, `PRODUCT.md`, `web/AGENTS.md`; designs: Contour system pp. 5, 6 and 10, Organization, auth and public pp. 1, 18 and 19.
Do:
1. The `(app)` layouts: `/account` and `/o/[org]` with the header and no tabs; `(org)` with the org tabs (Projects, Members, Form library, Settings); `(project)` with the project tabs (Overview, Data, Sites, Forms, Team, QGIS, Reports, Settings).
2. Header: the org and project switchers (menus with typeahead, role and state, Create project last); "Search or jump to" (⌘K) over tabs, projects, sites, zones, form versions, people and `OBS-` ids, with the actions Day · Dusk, map palette, Export current view and Invite member, and recent items; the account menu with Day · Dusk.
3. InkTabs: the white current-tab pill slides inside the ink bar, with no slide on first paint; narrow screens scroll the tabs with edge fades. Shortcuts: `g` then `o/d/s/f/t/q/r`, `?` for the list, `/` for search. A skip link, and focus moves to the page heading on navigation.
4. The Preview data marker, a mono pill in the header. Its popover reads "Everything here is sample data. Nothing is read from or written to the DECA Mark database." In dev and preview builds it also offers View as (`?as=viewer|observer`), Show state (`?preview-state=`) and Theme. One footer line says the same. Preview actions go into a `sessionStorage` store, take effect on screen, reset on reload and never claim a server round trip.
5. Redirects in `next.config.ts` (307, query string kept) from `/overview`, `/observations`, `/places`, `/basemaps`, `/instrument` and `/qgis` to the new routes.
6. The org-level 404 and error pages (the org header without tabs; the error page with "What we know" and a reference), and the org Projects page.
7. Delete `(workspace)`, `RailNav` and `StatusFooter`. Cached Nocturne pages are dropped by WEB-02's per-build worker cache, which replaced a manual `CACHE_NAME` bump.

Done when: the old paths redirect; the skip link, tabs, ⌘K and menus work by keyboard alone; `?as=viewer` hides Team and Settings; axe is clean in both themes.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of each route against its design page, plus a scripted keyboard run.

### WEB-23: Project screens: field return (overview, data, observation)
Status: doing (2026-10-15: live implementation delivered by WEB-27; remaining design/manual acceptance) · Phase 1 · Size L · Depends: WEB-22 · Blocks: none

Current boundary: the WEB-27 delivery note below records implemented scope. The original October 3 design brief that follows is historical: fixture, preview, session-only and removed-route instructions are superseded by D30 and the zone tasks. Retain only applicable design/accessibility comparisons as remaining acceptance; do not rebuild retired screens or fixture behavior.

WEB-27 (2026-10-09, D30): delivered on live data (the overview as in WEB-11, the data page and record as in WEB-10). Retired: approve and exclude with undo ("Reviewing or excluding observations is not available yet"; every uploaded observation is in the exports), the session-only Save view ("Copy link to this view" replaces it) and the record's history, which has no audit log behind it.
Added 2026-10-03. These screens run on fixtures. WEB-10 (data), WEB-11 (overview) and WEB-12 (exports) later connect real data to them without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Project workspace pp. 1–3, Contour system p. 8; `src/lib/filters.ts`, `src/lib/analysis.ts`, `src/lib/exports.ts`.
Do:
1. Overview (project root), "What came back from the field": coverage and what is blocking. Every count comes from the fixture rows through `lib/analysis.ts` and `lib/filters.ts` (14 observations; play types 5/4/3/2; observers JL 6, PS 4, AK 4; coverage 5 of 9 zone-rounds).
2. Data: filters in the URL that update at once, "14 of 14 shown" in a live region, and Clear filters returning focus to the first filter. `MapFrame` and `DataTable` share a two-way selection: the row scrolls into view, the map eases only when the marker is off-screen, and a selection that leaves the view clears with "OBS-0244 is not in this view".
3. The selected-record panel. `j`/`k` or ↑/↓ move the selection, Enter opens, `a` approves and `x` excludes; the toast reads "OBS-0244 approved · Undo" (6 s), ⌘Z also undoes, and focus stays on the row. These are session-only preview actions.
4. Save view (session only), and Export through a dialog that reuses `lib/exports.ts` and repeats the scope.
5. `data/[observation]`: every answer, the context, the location and the history.
6. Every data area has its loading, empty, filtered, error, offline and no-access states. At 768 Data shows the map and table with the selected record in a dialog; at 390 tables become row cards.

Done when: the numbers match the designs; the selection rules hold; the `j/k`, `a/x` and undo keyboard run passes.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of each route × preview state against its design page.

### WEB-24: Project screens: places (sites, site, zone, zone editor, map packages)
Status: doing (2026-10-15: live implementation delivered by WEB-27; remaining design/manual acceptance) · Phase 1 · Size L · Depends: WEB-22 · Blocks: none

Current boundary: the WEB-27 delivery note below records implemented scope. The original October 3 design brief that follows is historical: fixture, preview, session-only and removed-route instructions are superseded by D30 and the zone tasks. Retain only applicable design/accessibility comparisons as remaining acceptance; do not rebuild retired screens or fixture behavior.

WEB-27 (2026-10-09, D30): delivered on live data: Sites, Site and Map packages (history, inspect, upload, download). At the D30 baseline the Zone page/editor were retired; WEB-28 and WEB-37 have since delivered the server-backed Zones/editor routes. Still unavailable: Device readiness (not available yet) and "Activate" (the newest ready package is current).
Added 2026-10-03. These screens run on fixtures. WEB-08 (sites and packages) and WEB-10 (zone data) later connect real data to them without changing their layout. The package upload stays real: it keeps `lib/packages.ts` and says "Sends this package to the DECA Mark API."
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Project workspace pp. 6–10; `src/components/basemaps/PackageUpload.tsx`, `src/lib/packages.ts`.
Do:
1. Sites, and Site: zones on the `SitePlan`, coverage, packages and its data. Device readiness always reads "as last reported".
2. Zone (`sites/[site]/zones/[zone]`): the data and coverage inside one zone.
3. Edit zone boundaries (`sites/[site]/zones/edit`, PROPOSAL U2, with its flag). Handles are focusable buttons: arrows nudge 1 map unit and Shift+arrow 10; Delete removes a vertex but keeps at least three. Edits sync both ways with the vertex table, ⌘Z undoes, and Discard confirms. Edits are session-only.
4. Map packages (`sites/[site]/packages?step=`). The step lives in the URL, so back works. Inspection rows support a "Checking" state, and the fixtures show the final state. "Activate v4" turns v3 into Archived, session only. Step 1's dialog keeps the real upload and previews the layers with `SitePlan`.

Done when: vertex editing works by keyboard; `?step` back navigation works; the upload still reaches the API.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of each route against its design page.

### WEB-25: Project screens: forms, team, QGIS, reports, settings
Status: doing (2026-10-15: live implementation delivered by WEB-27; remaining design/manual acceptance) · Phase 1 · Size L · Depends: WEB-22 · Blocks: none

Current boundary: the WEB-27 delivery note below records implemented scope. The original October 3 design brief that follows is historical: fixture, preview, session-only and removed-route instructions are superseded by D30 and the zone tasks. Retain only applicable design/accessibility comparisons as remaining acceptance; do not rebuild retired screens or fixture behavior.

WEB-27 (2026-10-09, D30): delivered on live data: Forms, Form versions, the draft editor, Publish, Team, QGIS, Reports and Settings. Reports is one page with Print. Retired: saved views (`reports/views`), the separate printable report (`reports/[report]`), Rounds (`settings/rounds`, U6), the join-code island, QGIS reader grants and the type-to-confirm danger zone. "Saved report views", "Planning rounds", "Deleting a project" and "Connecting QGIS directly to the database" say they are not available yet. Archive and Unarchive remain.
Added 2026-10-03. These screens run on fixtures. WEB-09 (forms), WEB-07 (team) and WEB-12 (QGIS) later connect real data to them without changing their layout. Reports (U7) and rounds (U6) are proposals and always show their flags.
Read first: `DESIGN.md`, `PRODUCT.md`; designs: Project workspace pp. 4, 5 and 11–19; `src/components/studio/PhonePreview.tsx`, `src/lib/forms/*`.
Do:
1. Forms, Form versions (with the `janet-test-v1` draft and its 8 protocol notes), the draft editor (`forms/versions/[version]`, read-only once published) and Review publication (`…/publish`). The confirm checkbox enables "Publish demo-v2", and the reason shows until then; afterwards the version history updates, session only.
2. A new `CollectorPreview` on a `usePreviewSession` hook taken out of `PhonePreview`'s engine wiring, with a Phone · Tablet toggle, scoped to Day. The engine files in `src/lib/forms/` stay untouched.
3. Team: members, roles, invitations and the join code. Copy turns into "Copied ✓", Download saves a `.txt`, and Dismiss confirms; the island then collapses to "Code dismissed · Rotate code".
4. QGIS: maps in (packages by site) and evidence out (publishing, access, exports).
5. Reports, Saved views (`reports/views`) and the printable site summary (`reports/[report]`: `@page` A4, forced Day, no ledges).
6. Project settings and Rounds (`settings/rounds`). Unsaved changes replace "Last saved yesterday by JL" with "Unsaved changes", and leaving the page asks first. The danger zone lists every affected resource before the type-to-confirm button.

Done when: `pnpm forms:parity` passes with the engine files untouched; the print preview of the site summary fits one A4 page.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of each route against its design page, plus a print-to-PDF of the site summary.

### WEB-26: Organization, account and public pages, and retiring Nocturne and Leaflet
Status: doing (2026-10-15: live implementation delivered by WEB-27; remaining design/manual acceptance) · Phase 1 · Size L · Depends: WEB-22 · Blocks: none

Current boundary: the WEB-27 delivery note below records implemented scope. The original October 3 design brief that follows is historical: fixture, preview, session-only and removed-route instructions are superseded by D30 and the zone tasks. Retain only applicable design/accessibility comparisons as remaining acceptance; do not rebuild retired screens or fixture behavior.

WEB-27 (2026-10-09, D30): delivered: the organization's Projects, Members and Settings on live data (Transfer ownership for owners; "Deleting an organization" is not available yet), the observer handoff at `/o/[org]/collect` (the person's own observer projects, with the Android link when `NEXT_PUBLIC_ANDROID_APP_URL` is set), the home page and the not-found page. `/account` was already live. Retired: the Form library (U4; `/o/[org]/library` redirects to the organization), the join QR code, `src/data/*`, `components/nocturne`, the Nocturne CSS aliases, `leaflet` and `react-leaflet`. The route groups are `(marketing)` and `(legal)`, not `(public)`.
Added 2026-10-03. These screens run on fixtures. WEB-06 (org pages, account), WEB-07 (members) and WEB-14 (privacy wording) later connect them without changing their layout.
Read first: `DESIGN.md`, `PRODUCT.md`, `web/AGENTS.md`; designs: Organization, auth and public pp. 1–5 and 14–19.
Do:
1. Org Members, Form library (`/o/[org]/library`, PROPOSAL U4, with its flag) and Org settings.
2. `/account` (the header, no tabs): profile, password, sign out, delete account. No control claims a deletion it does not perform.
3. `/o/[org]/collect`, the observer handoff "You collect in the app" (PROPOSAL U3; the org header without tabs). `?as=observer` lands here.
4. Landing, Privacy and Request data deletion in the `(public)` layout, and the global 404 ("This page is not on the map.") and error ("Something went wrong.") pages.
5. Delete `src/data/*`, `src/components/nocturne/*`, `lib/states.ts`, the old studio and observation components, the Nocturne CSS aliases, and `leaflet` and `react-leaflet`.

Done when: no import of `@/data` or `nocturne` remains; no hex outside the generated tokens and the map palette; the build passes.

Verify: `pnpm --dir web check`, `pnpm --dir web build`, `pnpm tokens:check`, `pnpm forms:parity`, and the Playwright screenshot comparison of every route × preview state × role against its design page.

### WEB-27: One live workspace
Status: done (2026-10-09) · Phase 1 · Size L · Depends: WEB-05, WEB-22 · Blocks: none
Added 2026-10-09 (D30), as Janet started using DECA Mark. Her organization, `/o/deca-lab`, returned 404, while every page under `/o/deca` showed made-up data and a made-up person. This task makes every workspace page read and write the API for the signed-in person. It removes the sample workspace, the fixtures, the Preview data marker, the set-up flow and the session-only sample actions, and it puts the real name, email and initials in the header. The notes at the top of WEB-01 and WEB-05 to WEB-26 say which parts of them this task delivered or retired.
Read first: D30 in `docs/plan/decisions.md`; the Honesty section of `web/AGENTS.md`; `contracts/openapi.json`; `backend/WEB-FLOW-HANDOFF.md`.
Do:
1. Data layer.
   - `lib/api/client.ts` (server-only): reads the signed-in person's token once per request, and gives every request its own 15-second timeout.
   - `lib/api/workspace.ts` (server-only): cached reads with plain arguments. They are `getMe`, `getWorkspace` (never throws), `resolveOrg`, `resolveProject`, the organization, its projects, members and invitations, the project, its members and invitations, sites, packages, `getSitePlan`, forms, form versions, `listObservations` (originally newest-500; WEB-39 now reads the paginated envelope) and `getObservation`.
   - `lib/api/mutations.ts` (server-only): one function per write endpoint. `lib/api/browser.ts` (browser): package upload and archive download straight to the API.
   - Pure modules with unit tests: `lib/workspace/*` (roles, the `/o` resolver, invitations, results), `lib/time.ts` (the project's timezone), `lib/labels.ts` (`OBS-3F2A1B`), `lib/observations/{answers,summary}.ts`, `lib/export/*` and `lib/sites/archive.ts` (reads a package archive with `fflate@0.8.2`).
2. Shell.
   - `/o` opens the person's last project, their only project or their first organization, or says "You are not in a project yet". Observers go to `/o/<org>/collect`.
   - `WorkspaceProvider` feeds the header, switchers, tabs, account menu, ⌘K and the shortcuts from `/v1/me`.
   - `LoadFailure` (sign in again, no access, or try again), `NotAvailable`, and `loading.tsx` and `error.tsx` for the organization and the project. `features/people` holds the member and invitation tables and dialogs that Team and Members share.
3. Screens, as work packages WP1 to WP7.
   - WP1 sites and map packages, with an upload from QGIS layers.
   - WP2 forms: list, new form, versions, the draft editor and publish.
   - WP3 data and the record page.
   - WP4 overview, reports and QGIS.
   - WP5 project team and settings.
   - WP6 the organization's projects, members and settings.
   - WP7 invite, join, the home page, the collect page and the auth pages.
4. Cleanup.
   - Delete `src/fixtures`, `src/data`, `lib/preview.ts`, the Preview data marker and footer, the session stores, the web `ProposalNote` (mobile keeps its own) and the legacy components (`observations`, `basemaps`, `places`, `instrument`, `metrics`, `maps`, `qgis`, `studio`, `nocturne`), the Nocturne CSS aliases and the leaflet dependencies.
   - Add a lint rule that bans `@/fixtures`, `@/data` and `@/lib/preview`.
   - Write D30, the Honesty section of `web/AGENTS.md`, this file, the sitemap and the launch runbook.
5. At the October 9 baseline, not available: saved named views (links replace them), the rounds plan, the zone editor (subsequently implemented by WEB-28), reviewing or excluding records, device readiness, live QGIS database access, deleting projects, organizations, sites or packages, and resending invitations.

Done when: no page under `/o` reads a fixture, and no code imports `@/fixtures`, `@/data` or `@/lib/preview`; a failed read shows `LoadFailure` and never an empty list; a viewer who opens Team or Settings sees the no-access note, and the page calls no manager-only endpoint for them; an upload from QGIS layers makes the new version current; every aggregate built from a limited loaded subset discloses it. The original 500-row export behavior is superseded by WEB-39 to WEB-41's server scope.

Verify: `pnpm --dir web check`, `format:check`, `build`, `test:unit`, `test:auth`, `test:api-errors` and `test:account`; from the root `pnpm tokens:check`, `pnpm forms:parity`, `pnpm plan:check`, `pnpm mobile:check` and `pnpm mobile:test`; a grep showing no `@/fixtures`, `/o/deca` or `onboarding` in `web/src`; and `sh scripts/e2e-local.sh` on the local stack (its header lists the options; the seed is `database/seed-web-workspace.mjs`, and nothing targets hosted services).

Verified 2026-10-09 (Node 22.22.0, pnpm 10.17.1): `test:unit` 229 of 229, `test:auth` 34 of 34, `test:api-errors` 31 of 31, `test:account` 12 of 12, `pnpm forms:parity` and `pnpm tokens:check`. The full local-stack Playwright run is not recorded here.

### WEB-28: Build a real manager zone editor
Status: done (2026-10-13; the manual matrix is pending (user)) · Phase 3 · Size L · Depends: BE-22, WEB-34, WEB-38, WEB-42 · Blocks: QA-07
Owner: Claude web owner.
Planned 2026-10-11: the detailed UI, state architecture, drawing-surface decision and verification are in [ZONE-BOUNDARIES-UI.md](ZONE-BOUNDARIES-UI.md). This task is now the acceptance gate for editing and QGIS uploads; WEB-30 to WEB-38 and WEB-42 do the work.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md), [component specification](ZONE-BOUNDARIES.md) and [UI plan](ZONE-BOUNDARIES-UI.md) sections 1, 3, 5 and 10.
Do: Run the editing evidence in UI plan section 10 against the local stack with the real API: create, edit, validate, publish, two-manager conflict, lost-response replay, direct-URL refusal, network loss, leave guard, keyboard, touch emulation and the manual iPad Safari check.
Done when: Real API browser flow and two-manager conflict pass; no fake saves or complex-geometry loss; manual evidence is recorded or marked pending.
Verify: `pnpm web:check`, `pnpm --dir web build`, `pnpm --dir web test:unit`, `sh scripts/e2e-local.sh` with the zones-* specs, and the manual matrix in UI plan section 10.
Verified 2026-10-13 on the local stack against the real API, production build, desktop-1440 and phone-390 (`sh scripts/e2e-local.sh --prod --zones`): the zones-* specs, 36 of 36; after review, the publish, draft, conflict and data-history specs again (26 of 26) and the editor spec with the traced strip (both projects). By UI plan section 10 item:
1. `zones-editor.spec.ts`: a draft is started from the Zones page. A rectangle is drawn by mouse (touch drag on the phone), with sides exactly on longitude and latitude. A shape is drawn by keyboard at the cross. On the phone a point is dragged by touch, and only that point moves. A point moved by keyboard into the lawn is DECA Mark's "overlap" for that revision, and one Undo puts it back to the imported numbers. On the desktop a strip is traced along the lawn's edge ("Follow the edge", 1 point copied): it holds the lawn's three corners exactly, and DECA Mark finds no overlap. A reload keeps every zone, and v2 is published with all of them. The imported zones keep every number they came with.
2. `zones-conflict.spec.ts`: two managers in two browsers on one revision: the second gets the dialog with its edits intact, saves them as a file, decides later, then replaces the saved draft. Two publications from one base: the first is v2, the second says "v2 was published while you were reviewing" with its draft kept. Two tabs of one manager publish one revision with their own request IDs: the second says "This draft was already published as v2." with "Open v2". Editor → review → Back to the editor → edit saves without a conflict.
3. `zones-publish.spec.ts`: a lost answer is sent again with the same request and publishes once; a replay after a newer publication says "A later version is current now."; a note saved elsewhere during review asks which to keep, and the file kept from it has the note.
4. `zones-access.spec.ts` and `zones-draft.spec.ts`: a viewer opening a draft or its review directly is told only managers can, and nothing of the draft is shown; an observer never reaches the zones; a viewer sees every version.
5. `zones-network.spec.ts`: an edit made offline says so, stays in the tab and saves as the next revision on reconnecting; meanwhile a `g` chord, the command palette and a breadcrumb link each ask first, and after the save the link leaves without asking.
8. `zones-honesty.spec.ts`: the Zones page (current, an earlier version, a site with no package), the editor and the review as a manager, and the Zones page and a draft as a viewer, read honestly in Day and Dusk: no banned words, one primary action, no sideways scroll, axe clean.
- **Checks:** `pnpm --dir web check`, `test:unit` 351 of 351.
- **Updated 2026-10-14, account changes mid-edit:** `zones-account.spec.ts` (2 tests, desktop-1440 and phone-390, 4 of 4 on the local stack (local Supabase Auth and Mailpit, the API on :8001, a production build; `sh scripts/e2e-local.sh --prod --zones --skip-seed --project=desktop-1440 --project=phone-390`, 256 of 256 passed)): signing out in another tab pauses saving with "Not saved · you were signed out. Sign in again in another tab, then come back to save.", and signing back in saves the edit as the next revision; another account signing in shows "You are signed in as someone else.", sends no draft write, and the server keeps the last revision. The tab switch is a `visibilitychange` the spec dispatches, because Playwright keeps every page visible.
- **Pending (user), UI plan section 10 manual matrix:** keyboard-only full edit, publish and review; VoiceOver with Safari and NVDA; iPad Safari on the LAN (drag, pinch, draw, 44 px handles, leave guard; WEB-30 gates 4 and 8); Chrome and Firefox at 1440 and 1024, Safari at 1440, iPad portrait and landscape; reduced motion; the WEB-30 timings on the final build.

### WEB-29: Display and filter historical zone versions
Status: done (2026-10-13; the refusal above 10,000 is unit-tested only) · Phase 3 · Size L · Depends: BE-22, WEB-40, WEB-41 · Blocks: QA-07
Owner: Claude web owner.
Planned 2026-10-11: see [ZONE-BOUNDARIES-UI.md](ZONE-BOUNDARIES-UI.md) section 7. This task is now the acceptance gate for review; WEB-36 and WEB-39 to WEB-41 do the work.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md), [component specification](ZONE-BOUNDARIES.md) and [UI plan](ZONE-BOUNDARIES-UI.md) sections 7 and 10.
Do: Run the review evidence in UI plan section 10 with more than 500 synthetic observations across two map versions: totals, paging, zone filters by identity and by version, map version picker, inventory, record detail and complete exports.
Done when: Map/table/export agree beyond 500 without reclassification against current boundaries.
Verify: Web checks/unit tests and real browser history/filter/export scenarios (`data-history.spec.ts`, `export-v2.spec.ts`).
Verified 2026-10-13 on the local stack (`sh scripts/e2e-local.sh --prod --zones`, desktop-1440 and phone-390), on the zone review project's 520 observations across v1 and v2, the zone renamed between them:
- **Data (`data-history.spec.ts`, UI plan section 10 item 6):** "Showing 1–500 of 520", the next page loads the rest once each, and nothing says "Based on the newest 500". A zone filter matches by identity on every version, named as today's map names it. Choosing one map version narrows to what was recorded on it. Inventories are whole-zone records. Back undoes a filter. Search says it covers the loaded observations only.
- **The plan:** the current version is drawn and v1's points are dimmed rather than placed on it. v1 draws its own boundaries. Choosing an inventory switches to the version it was recorded on. A v1 record is drawn on v1 and says v2 is current.
- **Exports (item 7, in the same spec):** the ZIP's `observations.csv` has the 260 rows of v1, which equals `metadata.json`'s `total_matching`. `codebook.csv`, `forms.json` and `historical-zones.geojson` come with it. The v1 name starting with "=" is written as `'=Synthetic lawn v1`. QGIS (`qgis-reports.spec.ts`) exports every record and downloads a version's boundaries. `export-v2.spec.ts` was not written: its cases are these.
- **Not run in a browser:** more than 10,000 matching observations, refused with "One export holds up to 10,000 observations…" (`tests/unit/export-files.test.mjs`); seeding that many on the local stack is not part of the fixture.

### WEB-30: Spike the zone editor drawing surface
Status: done (2026-10-12; gates 4 and 8 pending (user) on a real iPad) · Phase 3 · Size M · Depends: CON-05 · Blocks: WEB-33
Needs user: run gates 4 and 8 on a real iPad against `next dev --hostname 0.0.0.0` on the LAN (local stack only). WEB-30 may close with those two gates recorded as pending (user); a later failure opens a new task.
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-1, WUI-2 and "WEB-30 spike gates"; `src/components/map/{MapFrame,SitePlan}.tsx`; `src/lib/plan.ts`; `contracts/zones/geometry.cases.json`.
Do: Build a dev-gated throwaway harness of Option A (the SVG editing layer on a pure longitude/latitude model) and measure it against the nine gates, including a real iPad Safari run. If gate 4 or 8 fails, stop and send the measurements to the lead; any OpenLayers trial runs in a scratch copy under `$TMPDIR` and never adds `ol` to `web/`. Delete the harness and record the results in the UI plan.
Done when: Each gate has a measured result in the UI plan; the harness is gone; no production route or dependency changed.
Verify: Measurements and screenshots in the decision record; `git status` shows no leftover prototype files.
Verified: Option A holds on the dev-only `/dev/zone-editor` specimen with no new dependency (results table in the [UI plan](ZONE-BOUNDARIES-UI.md#web-30-spike-gates)). Gates 1–3, 5–7 and 9 pass in desktop-1440 and phone-390 Chromium and unit tests: lossless round trips on all 15 sets, holes unfilled, keyboard editing of every fixture, axe clean in both palettes and themes, handle ink at least 3:1 on every palette surface, no outside requests, 39.7 KB gzipped of route-only code and no editor module in other routes. Desktop Chromium production timings (not the gate): 53–66 ms for the 20,000-position site, 60 fps for a 2,000-point drag. The harness is the specimen WEB-33 keeps (plan amended: the iPad gates run on it); iPad steps are in the UI plan and need a production build, because `next dev` on the network address never hydrates in Next.js 16.

### WEB-31: Keep zone geometry lossless in the web plan model
Status: done (2026-10-12; the honesty-scan screenshots followed on 2026-10-14) · Phase 3 · Size M · Depends: CON-05 · Blocks: WEB-32, WEB-40
Owner: Claude web owner.
Verified: Zones are one feature with every part and hole (holes drawn against their outer edge under a nonzero fill, so overlapping parts stay filled; amended after review 2026-10-13), keyed by `zone_id`, carrying the exact longitude/latitude; the archive reader takes only the contract's `format: 1` manifest and refuses (never boxes or repairs) a zone that disagrees with it or is not a closed, readable MultiPolygon; loops replace spreads; the background is memoised. `tests/unit/zone-plan.test.mjs` and `site-archive.test.mjs`: every valid `structure_cases` shape round-trips to identical JSON, every invalid one is refused, holes and parts project ring for ring, 200,000 positions fit without a stack overflow. `pnpm --dir web check` passes; `test:unit` 246 of 247 (the failure is the pre-existing collector-rule assertion, unrelated). Until BE-22 ships the contract archive, packages from the current backend show their no-plan note. Updated 2026-10-14: with BE-22's archives on the local stack, the honesty scan draws the plans of Sites, a site, Data and Overview from the archive, holes and parts included, and screenshots them in Day and Dusk at 1440 and 390 (`honesty.spec.ts`, 82 of 82, in the 256-test run of `sh scripts/e2e-local.sh --prod --zones`).
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-2 and section 2; `src/lib/{plan.ts,sites/archive.ts}`; `src/components/map/SitePlan.tsx`; `tests/unit/site-archive.test.mjs`.
Do: Keep every zone as one feature with parts, rings and holes drawn so holes stay unfilled (amended 2026-10-13: a nonzero fill over rings wound outer one way and holes the other, because an even-odd fill over the whole zone empties the patch where two parts overlap); carry `zone_id`, code and the raw longitude/latitude; read zones strictly (no silent repair, no bounding-box stand-in); replace `Math.min(...spread)` with loops; memoise the static background.
Done when: Every fixture geometry renders with its holes and parts; a parse-then-serialise round trip is number-identical; all existing map screens and unit tests pass.
Verify: `pnpm --dir web test:unit`, `pnpm web:check`, and the honesty scan screenshots of Sites, site, Data and Overview.

### WEB-32: Build the pure zone editor core
Status: done (2026-10-12; unit and static checks) · Phase 3 · Size L · Depends: WEB-31 · Blocks: WEB-33
Owner: Claude web owner.
Verified: `src/lib/zones/{geometry,hints}.ts` and `src/features/zones/editor/{state,history,save-queue}.ts` are pure. 51 new unit tests (`zone-geometry`, `zone-hints`, `zone-editor-state`, `zone-save-queue`): the reader agrees with all 29 `structure_cases`, bounds equal `limit_cases` (at the limit accepted, one over `too_complex`), an unedited draft re-serialises byte-identical for every valid fixture, one move leaves every other position the same array, nudges land within 0.5% of 10 cm and 1 m, snapping and tracing return the original arrays, coverage agrees with all 16 `coverage_cases` and containment with all 3, hints flag only `bow_tie` and `outside_hole`, history merges nudges within 1 s and caps at 200, and every save-queue branch in UI plan section 10 (success, dirty-after-flight, late response, 412, 409, 428, 413, 422, 401, 403/404, unconfirmed-then-acknowledged/-retry/-conflict, offline, 429) passes. `pnpm --dir web check` passes; `test:unit` 297 of 298 (the pre-existing collector-rule failure).
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-2, WUI-4, WUI-5, WUI-8, 5.6 and 6.3; `contracts/zones/geometry.cases.json` (`structure_cases`, `limit_cases`).
Do: Write `src/lib/zones/{geometry,hints}.ts` and the editor reducer, history and save-queue reducer as pure modules: vertex addressing, closed-ring edits, nudges in metres, rectangle and midpoint, structural checks with contract limits, exact-vertex snapping, tracing, self-intersection and outside-site hints.
Done when: Unit tests cover every operation and every save-queue transition listed in UI plan section 10, and agree with `structure_cases`.
Verify: `pnpm --dir web test:unit`, `pnpm web:check`.

### WEB-33: Build the zone editor canvas and panels
Status: done (2026-10-12; Chromium specimen runs, real iPad pending with WEB-30) · Phase 3 · Size L · Depends: WEB-30, WEB-32 · Blocks: WEB-34, WEB-35
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) 5.3 to 5.6 and 6.6; `DESIGN.md` §5, §8 and §9; `src/components/map/MapFrame.tsx`; deleted `VertexHandles.tsx` and `ZoneEditor.tsx` at `4922f2b^` (reuse the names and announcements, not the per-vertex tab stops or the rounding).
Do: Add the MapFrame mode, camera context, key ownership, pinch zoom, border-correct inverse and zoom by ground resolution; build handles, select, move, insert and remove point, the Zones list, the selected zone panel, the Points table and the keyboard map; add the dev-only `/dev/zone-editor` specimen with no network or save code.
Done when: Every fixture shape can be edited by keyboard alone and by touch emulation with holes and parts preserved; screen-reader names and announcements match the UI plan.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, a Playwright run of the specimen at desktop-1440 and phone-390, and axe with no serious or critical findings.
Verified: `MapFrame` has `edit`/`draw` modes with free panning, 1 cm-per-pixel zoom, a camera context, `data-map-keys` key ownership, two-pointer pinch, frame-batched drags and a border-correct pointer position; `src/features/zones/editor/` has the handles (one tab stop per ring, 44 px targets, snapping, midpoints), Zones list, Selected zone, Points table, Problems island, toolbar and visible key list, and `/dev/zone-editor` is the in-memory specimen (no save, publish or network code). `pnpm --dir web test:specimen`: 51 passed, 3 skipped by design, at desktop-1440 and phone-390, covering keyboard-only and touch-emulated editing of every fixture set with holes and parts kept, point names and announcements, and axe with no violations in both palettes and both themes. Fixed on the way: Layers-menu presses reaching the plan through the React portal and deselecting the zone, touch drags ending at once, the plan image wrapping buttons (axe `nested-interactive`). `pnpm --dir web check` passes; `test:unit` 301 of 302 (the pre-existing collector-rule failure).

### WEB-34: Add zone drawing, snapping and tracing tools
Status: done (2026-10-12; DECA Mark's check of a traced pair runs in WEB-28's `zones-editor.spec.ts`) · Phase 3 · Size M · Depends: WEB-33 · Blocks: WEB-28
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) 5.4, 5.5 and WUI-8.
Do: Add Draw shape, Draw rectangle, keyboard drawing at the centre cross, snap feedback, edge tracing between two snapped vertices of one ring, and removing a hole or part.
Done when: Two adjacent zones drawn with a traced shared edge share exactly the same vertex pairs; unfinished shapes never enter a save.
Verify: `pnpm --dir web test:unit` (exactness tests), specimen Playwright run; server validation of the traced pair is checked in WEB-28.
Verified: Draw shape and Draw rectangle by pointer, touch and the keyboard cross (P, R, V; Space, Enter, Backspace, T, Escape), exact-vertex snapping with a marker and Alt to place freely, "Follow the edge" between two snapped points of one zone or the site boundary (again for the other way round), and Remove hole and Remove part. `tests/unit/zone-drawing.test.mjs`: a traced neighbour shares the very same position arrays (so the same pairs), an unfinished shape never enters the zones, refusals say why, and drawing undoes as one step. `e2e/specimen/zone-drawing.specimen.ts` at desktop-1440 and phone-390: the concave fixture's notch drawn by mouse with a traced edge shares its three points exactly; rectangles by mouse and touch drag align to longitude and latitude; a shape tapped out by touch; holes and parts removed and undone; axe clean while drawing in both palettes. Full specimen suite 60 passed, 6 skipped by design; `pnpm --dir web check` passes; `test:unit` 305 of 306 (the pre-existing collector-rule failure). Review fixes (2026-10-13): a second finger during a point or rectangle drag pinches instead (the point goes back, nothing is drawn), drawing works over plain HTTP on a LAN address, overlapping parts stay filled and hit, outlines keep zoom-dependent precision, and the save queue recovers after a too-large refusal or a failed conflict read; specimen suite 64 passed, 8 skipped by design, `test:unit` 310 of 311.

### WEB-35: Persist zone drafts with conditional autosave
Status: done (2026-10-13; offline runs in a browser in WEB-28's `zones-network.spec.ts`, and since 2026-10-14 the signed-out and account-change paths in `zones-account.spec.ts`) · Phase 3 · Size L · Depends: BE-22, WEB-33, DB-18 · Blocks: WEB-37, WEB-38
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-3, WUI-4, WUI-11, WUI-12, 5.8, 5.9, 6.3 and 6.4; [contract](../docs/plan/zone-boundaries/contract.md) manager endpoints and errors; `src/lib/api/{browser,errors}.ts`; `src/features/shell/useLeaveGuard.ts`.
Do: Add zod schemas, `src/lib/api/zones-browser.ts` with If-Match, ETag and caller abort, the new error kinds with issues and conflict details, the autosave queue wiring, save status, the conflict dialog, validation with the Problems list and canvas markers, the shell navigation guard, the account fence, the mount-time draft GET, and the manager-gated editor route with removal of only the `zones/:path*` redirect (and its REMOVED_ROUTES entry).
Done when: Against the local API, edits save with increasing revisions, a stale revision opens the conflict dialog with local edits kept, and validation results attach to their exact revision.
Verify: `pnpm --dir web test:unit`, `pnpm web:check`, and a local-stack Playwright smoke of save, conflict and validate.
Verified:
- **Reads and requests:**
  - Drafts, draft lists, checks and a version's zones are parsed at runtime (`src/lib/zones/schemas.ts`), with strict geometry: a ring that does not close is a failed read.
  - Requests from the browser (`src/lib/api/zones-browser.ts`) send `If-Match`, read the ETag and `X-Request-Id`, can be ended by the caller, and are refused while another account is signed in.
- **The editor route:** `…/sites/[site]/zones/drafts/[draft]` is for managers only. A viewer sees "Only project managers can edit zones." and nothing is read for them. A site without zone editing shows its NotAvailable note.
- **Saving** (`useDraftSaving`): the save queue runs 1.5 s after the last edit, or 10 s at most. It also runs on blur, when the tab is hidden, and when the connection comes back. The draft is read again before any edit is accepted. Responses for an earlier sequence are dropped.
  - Statuses read as in 5.8.
  - A 412 opens "Someone else saved this draft" with the edits kept: replace (after a confirmation), load the saved draft, or save the edits as a file.
  - Checks run after 10 s without changes or from "Check boundaries", and attach to their revision. A stale check reads the draft as a conflict.
  - Another account signing in replaces the editor and forgets the kept plans.
- **Leaving:** links, Back, `g` chords and the palette ask "Save your changes first?". The editor's tool keys leave a pending chord alone.
- **Checks:** unit `zone-drafts` (10 tests; `test:unit` 342 of 342) and `pnpm --dir web check`.
- **Local stack at desktop-1440 and phone-390** (`e2e/zones-draft.spec.ts`, 12 passed, on a draft each run makes and discards):
  - Renames save as revisions 2, 3, …
  - "Checked revision N" appears for the saved revision.
  - A rename over another manager's newer revision opens the dialog with the typed name kept. "Replace" saves the next revision with it; "Load the saved draft" shows theirs.
  - Leaving with a change not yet saved asks first, and "Save and leave" saves it before leaving.
  - A viewer opening an editor address sees the no-access state.

### WEB-36: Read sites through the single site API
Status: done (2026-10-13) · Phase 3 · Size M · Depends: BE-22 · Blocks: WEB-37, WEB-39, WEB-42
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) section 4 and WUI-13; [contract](../docs/plan/zone-boundaries/contract.md) "Selected compatibility mechanism"; `src/features/{sites,packages,qgis,data}/*`; `src/features/packages/history.ts`.
Do: Read `GET /v1/projects/{p}/sites` in its BE-22 shape with runtime parsing; carry `siteId`; mark the current package from `current_package_id` in Sites, the site page, package history (with its copy) and the QGIS page; read package history from the BE-22 package list; choose plans from the current package on Data and Overview.
Done when: The current package always comes from `current_package_id`; site API calls use UUIDs while web addresses keep site codes.
Verify: `pnpm --dir web test:unit` (package-history, site-view), `pnpm web:check`, and the sites and packages e2e specs.
Verified: Sites, package histories and package details are parsed at runtime (`src/lib/api/sites.ts`); every API call names a site by `site_id` and web addresses keep codes; the current package comes from `current_package_id` on Sites, the site page, the history (Active only for that package; a replayed upload says it is not current), Overview, QGIS and the upload. Unit: `site-view`, `package-history`, `api-shapes`, `forms-model`, `qgis`, `overview`; `pnpm --dir web check`; local stack `sites.spec`, `packages.spec` at desktop-1440 and phone-390.

### WEB-37: Build the Zones page, draft start and version history
Status: done (2026-10-13) · Phase 3 · Size L · Depends: WEB-35, WEB-36 · Blocks: WEB-38
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-13, section 4, 5.1 and 5.2; `next.config.ts` redirects; `e2e/removed-routes.spec.ts`; `e2e/support/routes.ts`.
Do: Add the Zones page (current version, drafts, versions, read-only `?version=`, restore an earlier version through a new draft from current), Start draft, the site page entry replacing the NotAvailable note where editing is available, and removal of the root `zones` redirect with its e2e route change.
Done when: A viewer sees the history; a manager starts, reopens and finds other managers' drafts; observers and viewers opening editor URLs see the no-access state; unsupported sites show their specific reason.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, `zones-access.spec.ts` and the honesty scan with the new routes.
Verified:
- **The Zones page** `…/sites/[site]/zones` (`src/features/zones/{ZonesScreen.tsx,model.ts}`) shows:
  - the shown version's plan, its zones (name, code, parts and holes) and its facts;
  - the open drafts (managers only), each with Open and "Save as file";
  - every version, with Active or Archived, "Replaced by v2", how it was made, its change note and a read-only `?version=1` view.
- **Starting a draft:** a Server Action with a request ID chosen when the dialog opens, so retries make one draft. The dialog names other managers' drafts on the same version ("JL has a draft based on v2… only the first one published becomes v3").
- **Restoring v1:** starts a draft from the current version with v1's zones and the note "Restores v1 boundaries".
- **The site page:** the Zones island links to it ("Edit zones" or "Zone versions"). The root `zones` redirect and its removed-route entry are gone, and the honesty scan covers the Zones page as manager and viewer, plus the no-package site.
- **Checks:** unit `zones-page` (5 tests; `test:unit` 347 of 347) and `pnpm --dir web check`.
- **Local stack at desktop-1440 and phone-390** (`zones-access.spec.ts`):
  - A manager finds their own and the other manager's drafts, opens their own, and starts another with the other-drafts note.
  - `?version=1` shows v1's names.
  - Restoring v1 makes a draft with v1's zones.
  - A viewer sees the versions and no drafts or start buttons.
  - The no-package site says "No map package yet".
  - An observer opening the Zones page or a draft address never reaches either.
  - Also `zones-draft`, `sites`, `removed-routes` and the honesty scan of every route (118 passed).

### WEB-38: Build zone publication review and discard
Status: done (2026-10-13) · Phase 3 · Size L · Depends: WEB-35, WEB-37 · Blocks: WEB-28
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-6, 5.7, 5.10 and 6.7; `src/features/forms/PublishScreen.tsx`.
Do: Add the publish page: readiness for the exact revision, changes against the base, base versus new map, observer effect, forms, change note, confirmation, request ID kept per revision, lost-response check, replay display, publication conflict recovery and revalidation; add discard with confirmation.
Done when: Publish, replay and conflict e2e cases pass on the local stack; no screen claims a replayed result is current.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, `zones-publish.spec.ts` and `zones-conflict.spec.ts`.
Verified:
- **The review page** `…/zones/drafts/[draft]/publish` (`src/features/zones/publish/{PublishReview.tsx,model.ts}`) shows:
  - DECA Mark's check of the exact revision ("Ready to publish: revision 3 has no problems", or the problems with "Fix in the editor"), and warnings;
  - the changes against the base, from `zones[].change`;
  - the plan with changed and new zones hatched;
  - what observers experience, and the forms;
  - the change note, which saves a revision and is checked again;
  - the confirmation, and primary "Publish v2".
- **Request IDs:** one per revision, kept in `sessionStorage`.
- **Answers:**
  - A 201 opens the Zones page with "v2 is published."
  - A replay never claims to be current unless it is (`publishedLine`).
  - A lost answer reads the draft and sends the same request again, so it publishes once.
  - A publication made elsewhere meanwhile says "Not published. v2 was published while you were reviewing…", with the draft kept and "Start a draft from v2".
  - 412, 422 and 429 read as UI plan 5.10.
- **Discard** (editor, review, drafts list) asks first, then sends DELETE with If-Match.
- **Checks:** unit `zone-publish` (3 tests; `test:unit` 350 of 350) and `pnpm --dir web check`.
- **Local stack at desktop-1440 and phone-390** (`zones-publish.spec.ts`, on sites the run makes, so the fixture site keeps v1 and v2):
  - start, rename, review (revisions 2 and 3 checked), note, confirm and publish v2 with its note;
  - an answer aborted after DECA Mark received the request, with the same request sent again: "already published as v2 · v2 is the current version" and exactly two packages;
  - a version published elsewhere during review refused with the draft still open;
  - Discard asking first, then the draft discarded.
  - `zones-conflict.spec.ts` (WEB-28) adds two managers in two browsers and two tabs of one manager.
- **After review (2026-10-13):**
  - the review asks the editor's conflict question when someone else saved the draft (`ConflictChoice`, shared with the editor), and says whether the zones or the note differ;
  - the note is read only while publishing;
  - an answer that arrives after the person left does not take them back;
  - a replay no longer current says "A later version is current now.";
  - a draft another tab published says "already published as v2" with "Open v2" while v2 is current;
  - a draft kept as a file keeps its change note.

### WEB-39: Read observations with server filters and paging
Status: done (2026-10-13) · Phase 3 · Size L · Depends: BE-22, WEB-36 · Blocks: WEB-40, WEB-41
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) WUI-9, 7.1 and 7.2; [contract](../docs/plan/zone-boundaries/contract.md) "Observation reads, filters and exports"; `src/features/data/*`; `src/lib/time.ts`.
Do: Add the observation page adapter with runtime parsing, the URL-to-query builder (site-scoped zones by identity or version, round, observer, project-day to UTC), pushed filter history, "Show the next 500" through a Server Action, totals and refresh, the new columns, inventory rows, and "Search loaded observations".
Done when: With more than 500 matching synthetic rows, counts and paging agree with the summary and nothing says "Based on the newest 500" where a server total exists.
Verify: `pnpm --dir web test:unit` (data-view, time), `pnpm web:check`, `data-history.spec.ts`.
Verified: Data reads pages of 500 with the address's filters applied by the API (site, zones by identity, one map version as `package_id`, round, exact observer, project days to UTC through `Clock.dayStart`), "Show the next N" through a Server Action that checks access again, pushed filter history, Refresh, "Showing 1–500 of N … counted at", Zone and Map columns, inventories as "Whole zone", and "Search loaded observations". Unit: `data-view`, `time` (DST, Santiago, ±14 h), `api-shapes`. Local stack `data-history.spec.ts` on the 520-row zone review fixture (`scripts/e2e-local.sh --zones`): 500 of 520, then all 520; zone by identity across v1–v2; one version 260; inventories 20, all whole-zone; Back undoes; search says loaded only; the CSV writes the v1 name `=Synthetic lawn v1` as `'=…`. Also `data.spec` at both widths. Partial, moved ahead from WEB-40: the record page draws the recorded package, and the Data map draws only points of the plan's version (the version picker stays with WEB-40).

### WEB-40: Draw historical map versions on Data and record pages
Status: done (2026-10-13) · Phase 3 · Size M · Depends: WEB-39, WEB-31 · Blocks: WEB-29
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) 7.3 and 7.4, WUI-10.
Do: Add the map version picker with dimmed other-version points, the zone inventory list and highlighting, the loaded-subset note, record detail on the recorded package, inventory detail, and the account-scoped memo for package zones.
Done when: A mixed-version fixture never draws current boundaries under historical points as theirs; inventory is never a marker.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, `data-history.spec.ts` map cases.
Verified:
- **Data plan:** one map version at a time (`src/features/data/{DataMap.tsx,map.ts}`). The default is the filter's version, else the current one when a match was recorded on it, else the newest one a match was recorded on.
  - The Boundaries picker reads "v2 (current) · 260 observations", with counts from the summary of the same filters (or from the loaded observations, which it then says).
  - Points of other versions are dimmed, with the note "Points recorded on v1 are dimmed. Their zones may differ from these boundaries.", and the subset note says what loaded.
  - "Zone inventories in this view" lists each zone and version with its count; choosing a row hatches the zone on its own version. An inventory is never a marker.
  - Other versions' plans load through a Server Action that checks the package belongs to the site, and are kept per `${userId}:${projectId}:${packageId}` (`plans.ts`, at most 8). A failed load keeps the drawn version and offers Try again.
- **Record page:** "Map v1, the version this observation was recorded with. v2 is current."; an inventory reads "An inventory of the whole zone. No point was recorded."; Zone reads "Name (CODE) · map v1"; a failed map read says "We could not load map v1 for this observation. The record and its zone are unchanged." with Try again.
- **Checks:** unit `data-map` (7 tests; `test:unit` 332 of 332) and `pnpm --dir web check`.
- **Local stack at desktop-1440 and phone-390:** `data-history.spec.ts` "The plan draws one map version…" on the 520-row fixture: v2 current by default with v1's points dimmed, the two inventory rows of 10, v1 drawn with v2's dimmed, an inventory switching the plan back to v2, and a v1 record saying v2 is current. Also `data.spec`, `overview`, `qgis-reports`, `sites` and the honesty scan of every route (116 passed).

### WEB-41: Move summaries and exports to the server scope
Status: done (2026-10-13) · Phase 3 · Size L · Depends: WEB-39 · Blocks: WEB-29
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) 7.5 and 7.6; `src/features/{overview,reports,qgis}/*`; `src/lib/export/*`; `src/lib/observations/summary.ts`.
Do: Feed coverage, field return, reports by zone and round, and the site page counts from the summary; keep page-limited panels labelled; download the server ZIP export for the same scope with the scope text and the 10,000-row ceiling; add the zones GeoJSON download on the QGIS page.
Done when: `observations.csv` inside the downloaded ZIP has exactly `total_matching` rows; above 10,000 the action is disabled with its reason; coverage rows are recorded snapshots.
Verify: `pnpm --dir web test:unit` (summary, export, overview, reports), `pnpm web:check`, `export-v2.spec.ts`.
Verified: Data and QGIS download DECA Mark's export ZIP browser-direct (`downloadObservationExport`): every match, the scope repeated one filter per line with the days' UTC bounds, the search named as not applied, refused above 10,000 with "One export holds up to 10,000 observations. Narrow the dates or choose one site." (also for an `export_scope_too_large` refusal); the browser-built CSV, GeoJSON and codebook are removed. QGIS adds each site's current zone boundaries as GeoJSON (`zone_id`, `map_version`). Reports apply days on the server, take zones and rounds from the summary and say when observers, days and play types come from the newest 500; coverage, field return and the site page ("on v2 · N on earlier versions") read the summary. Unit: `export-files`, `reports`, `summary`, `site-view`, `qgis`. Local stack at desktop-1440 and phone-390: `data.spec` (the ZIP's `observations.csv` has exactly the 8 matches and a codebook), `data-history.spec` (one version: 260 rows, the v1 name written `'=Synthetic lawn v1`), `qgis-reports.spec` (GeoJSON ZIP with inventories as null geometry; the zone boundaries download), `overview`, `sites`, `packages`, `packages-identity` and the honesty scan of every route.

### WEB-42: Upload QGIS packages with zone identity mapping
Status: done (2026-10-13) · Phase 3 · Size M · Depends: BE-22, WEB-36, DB-18 · Blocks: WEB-28, WEB-43
Owner: Claude web owner.
Read first: [UI plan](ZONE-BOUNDARIES-UI.md) 5.11; [contract](../docs/plan/zone-boundaries/contract.md) "Existing import/publication route" and "Package format 2 and capabilities"; `src/features/packages/UploadStep.tsx`; `backend/src/fieldmaps_api/zone_import_schemas.py`.
Do: Add the identity mapping step to every upload (a first upload maps every feature to a new zone) (preselect only features carrying a matching `zone_id`; code or label matches stay unselected suggestions), the removed-zone list, the change note, a per-attempt `request_id`, `expected_current_package_id`, and the conflict and identity error copy.
Done when: On the local stack, a first upload creates v1; a later upload with one mapped, one new and one removed zone creates v2; a stale expected current gets the conflict copy.
Verify: `pnpm web:check`, `pnpm --dir web test:unit` (mapping model tests), and the packages e2e specs with first and later uploads.
Verified: Every upload maps each zone of the file (`src/features/packages/{identity.ts,ZoneMapping.tsx}`): only a carried `zone_id` is preselected, a matching code or name is a suggestion, new zones get a client identity and a valid free code, left-out zones are listed; the inventory form, the change note, `request_id` and `expected_current_package_id` are sent; an attempt whose answer is unknown is kept whole until answered (resend replays); conflicts and zone issues read in words. Unit: `zone-identity`, `package-checks`, `package-history`. Local stack at desktop-1440 and phone-390: `packages-identity.spec.ts` (one kept, one new, one removed across successive versions with zone A's identity and its 8 records kept; an upload against a map changed meanwhile is refused with the conflict copy and makes no version) and `packages.spec.ts`.

### WEB-43: Send the bootstrap script's first map on the single upload path
Status: done (2026-10-14; local stack only) · Phase 3 · Size S · Depends: BE-22, WEB-42 · Blocks: none
Owner: Claude web owner.
Added 2026-10-14 (WEB-06): under D30, J1 starts with `scripts/bootstrap-study.mjs`, and its package request still used the envelope from before BE-22. On a fresh local stack the API refused it with 428, then with 422 "Invalid structure", because the Fall Creek zones name themselves `label` and the identity map needs `name`.
Read first: [contract](../docs/plan/zone-boundaries/contract.md) "Existing import/publication route"; `scripts/bootstrap-study.mjs`; WEB-42's `src/features/packages/identity.ts`.
Do: send the first map as every web upload does: `site_id`, a `request_id` per run, `expected_current_package_id`, both form versions, a change note and a zone identity map with each zone's `name`; check zone codes before sending; print the API's issue list when it refuses; on a rerun, say which map version the site already has.
Done when: on the local stack, a fresh run publishes map v1 and the set-up opens on the web.
Verify: a run against the local stack with a synthetic account.
Verified 2026-10-14 on the local stack with a new synthetic account and organization: the first run creates the organization, the project, both forms (published), Fall Creek and map v1 ("Published map v1"); the set-up opens on the web, where the site page shows map v1 as current, its forms and its one zone, "Zone A · Whole playground", on the plan. Two later runs keep everything ("Fall Creek Elementary playground already has map v1"). Not run against a hosted API.

## Pilot readiness from the frontend audit (added 2026-10-22)

These tasks come from the [frontend audit](../docs/reviews/frontend-audit-2026-10-17/REPORT.md) (C-numbers are its clusters) and the owner decisions D31–D34. [docs/plan/pilot-readiness.md](../docs/plan/pilot-readiness.md) orders them into waves and lanes. Browser checks run on the local stack (`sh scripts/e2e-local.sh --prod --zones`) at 1440 and 390, plus 1024 and 768 where a task names a tablet.

### WEB-44: A failed Server Action never loses typed work
Status: done (2026-10-28; unit tests, and `e2e/action-failures.spec.ts` through `scripts/e2e-local.sh --prod --zones` at desktop-1440 and phone-390 on the local stack; no real Vercel deploy skew) · Phase 4 · Size M · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C03). Reproduced in the browser at 1440 and 390 with an aborted action POST, cleared cookies (the proxy answers the POST with a 307 to `/sign-in`), offline, a bogus `Next-Action` id (deploy skew, D34) and a 401: the draft editor unmounts into ErrorView ("What failed: The page could not load its records"), the unsaved edit is gone, and "Try again" shows the old wording with no unsaved marker. Settings, the five Forms dialogs, the Sites dialogs and ProfileForm have the same path; "Show the next 500" fails silently.
Read first: `src/features/forms/DraftEditorScreen.tsx:145-208`; `project-settings/SettingsScreen.tsx:120-133`; `data/DataScreen.tsx:186-205` and the catch precedent at `data/DataMap.tsx:178`; `forms/PublishScreen.tsx:79`, `RetireDialog.tsx:37`, `DiscardDialog.tsx:41`, `NewFormDialog.tsx:79`, `FormVersionsScreen.tsx:100`; `sites/CreateSiteDialog.tsx`, `EditSiteDialog.tsx`; `account/ProfileForm.tsx`; `lib/api/errors.ts` (`UNCONFIRMED_CHANGE_COPY`, `wasRefused`); `zones/StartDraft.tsx` ("could not confirm whether"); `src/proxy.ts:33-43`; `next/dist/client/components/router-reducer/reducers/server-action-reducer.js:69-121`.
Do:
1. Catch the rejection at every Server Action call site (editor save first, then Settings, `loadMore`, the Forms, Sites, org and people dialogs, ProfileForm), keeping the screen mounted and the leave guard armed.
2. Three-way copy, because "Nothing was saved" is true only when the action never ran: never ran (`unstable_isUnrecognizedActionError(e)` from `next/navigation`, or a sign-out sentinel) → "Nothing was saved. …"; unknown outcome → "DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected."; a 412 after an unknown outcome proves nothing by itself (another manager may have saved in between), so read the draft back: only when its content equals the wording this page submitted does the page say "Your earlier save went through." and clear the unsaved state; otherwise it keeps the wording and opens the normal conflict choice. Dialogs with nothing typed keep `UNCONFIRMED_CHANGE_COPY`. For deploy skew: "DECA Mark was updated while this page was open. Nothing was saved. Copy your wording, reload, then paste and save."
3. Optional: answer `next-action` POSTs from the proxy with a fixed 401 sentinel instead of a 307, so the copy can name the sign-out. It cannot affect the zone editor, which calls the API directly.
Done when: a Playwright spec at 1440 and 390 covers aborted POST, cleared cookies, offline, a bogus action id and a reply lost after commit (`route.fetch()` then abort): the editor and Settings stay mounted, the edit stays in the field, ErrorView never shows, the reply-lost case never claims "Nothing was saved", and its second Save (412) reads the draft back and reports the earlier save only because the content matches; a case where a second manager saves between the lost reply and the retry ends in the conflict choice with this page's wording kept; the leave guard is still armed; "Show the next 20" on the zone-review project shows a failure note.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, the new spec through `scripts/e2e-local.sh`.
Verified 2026-10-28: A Server Action call that rejects no longer reaches the error page. The form editor (Save draft and Start a new draft), Publish, Retire, Discard, New form, Start draft on the versions page, project Settings and Archive, Create site, Edit site, Create project, organization settings, Transfer ownership, Revoke, Change role, Remove member, Profile, Delete account, and the sign-in, sign-up, code and resend forms catch it (`lib/action-rejection.ts`) and keep the screen, the typed values and the leave guard; a redirect from an action is rethrown, so signing in and leaving an organization still leave the page. The copy says only what is known: for a page older than the server's build, D34's "DECA Mark was updated while this page was open. Nothing was saved. Copy your wording, reload, then paste and save."; for a browser that was signed out, "You were signed out. Nothing was saved. Your wording is still here. …"; and for a call that may have been committed, "DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected." (never "Nothing was saved"; dialogs with nothing typed keep `UNCONFIRMED_CHANGE_COPY`). The proxy answers a Server Action POST from a signed-out browser with a fixed 401 "Signed out" (text/plain, the only body the action runner reads) before the action runs, instead of the 307; page requests still redirect (the optional step 3). A Save whose reply was lost is remembered; when the next Save meets the 412 the editor reads the draft back (`readDraftAction`, manager only, changes nothing) and says "Your earlier save went through." only when the stored draft equals the wording this page sent (`landedSave`), otherwise it keeps the wording and shows the normal conflict choice; Save and leave leaves only when nothing was typed since that save. "Show the next …" (DataScreen `loadMore`, the first commit, so lane F could rebase) shows "The next observations did not load." with the reason. Unit: `action-rejection` (15 tests: the copy and D34's wording, no banned words, the redirect passthrough, `landedSave`) and `forms-lost-reply` (the real editor with only the action boundary replaced by a compare-and-set fake: 6 of 6 fail on the base editor, 6 of 6 pass); `pnpm --dir web test:unit` 508 of 508 (487 before). Local stack at desktop-1440 and phone-390: the new `e2e/action-failures.spec.ts`, 13 tests per project: the editor and Settings through an aborted POST, offline, cleared cookies, a bogus action id and a reply lost after the commit (`route.fetch()` then abort); the second-manager case ending in the conflict choice with this page's wording kept; the leave guard still armed after every failure; "Show the next 20" on the zone-review project through the same four; the proxy's 401 and redirect. On the base (e79b83d) 26 of 26 fail (the editor and Settings reach "What failed: The page could not load its records" in all 22, "Show the next" fails silently, the proxy answers 307); after, 26 of 26 pass. On the same stack `settings`, `forms`, `forms-version-delivery`, `sites`, `org`, `team`, `auth-flows`, `sign-in`, `account-deletion` and `hydration` pass at both projects (one cold-load layout-shift reading of 0.02 on the first sign-in page after a seed passed 10 of 10 on a rerun). Two older specs already fail on the base and are not changed here: `forms-feedback.spec.ts` looks for the label "Minimum", which reads "Minimum (optional)", and `sign-out.spec.ts` looks for "Not you?", which the account chip now calls "Switch account". Not run: a real deploy skew on Vercel (the bogus action id stands in for it); the second manager is the seeded manager saving through the API; the Forms dialogs, Sites dialogs, organization, people, profile, account deletion and auth forms are covered by types and the shared helper's tests, not by a browser failure run; the plain `<form action={signOut}>` and "Switch account" buttons carry no typed work and are not wrapped.

### WEB-45: Web sign-out signs out only this browser
Status: done (2026-10-24; unit and local-stack e2e; device check pending (owner)) · Phase 4 · Size S · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C06). `lib/auth/actions.ts:138` (`signOut`) and `features/auth/actions.ts:127` ("Not you?" on invite and join) call `supabase.auth.signOut()` with no scope; auth-js 2.117.2 defaults to `global` (`GoTrueClient.js:3417`), which revokes the phone collector's session too, while `account/SecurityIsland.tsx:23` promises "Signing out here does not affect the app". `features/account/actions.ts:103` and the collector (MOB-07) already use `local`.
Read first: the three call sites; `SecurityIsland.tsx:23`.
Do: pass `{ scope: "local" }` at both call sites; clear the `fm-place` cookie at the same moment (audit J-7). If "sign out everywhere" is ever wanted, it becomes a separate, explicitly worded control.
Done when: signed in with one account on the web and the iOS simulator, a web sign-out followed by a forced token refresh on the phone leaves the collector uploading; a second browser stays signed in; `fm-place` is gone after sign-out.
Verify: `pnpm web:check`; the manual two-device check recorded here.
Verified 2026-10-24: Sign out (one action behind the Account page and the account menu), "Not you?" on the invitation and join pages, and a finished account deletion each end this browser's session with `{ scope: "local" }` and delete `fm-place`. Unit `sign-out.test.mjs` runs the three real Server Actions with only Next's request context and Auth's client replaced (4 of 5 fail on the base: scope `global`, `fm-place` kept; 5 of 5 pass after) and scans `src` for any `.signOut(` without the local scope. Local stack at desktop-1440 and phone-390: `sign-out.spec.ts` signs one synthetic account in on two browsers, signs out on the first from the Account page and again through "Not you?", and sends the second browser's refresh token to local Auth, which is what the collector's token refresh sends: refused with 400 on the base, 200 after, and the second browser stays on `/account`; `fm-place` is gone after both. `auth-flows` and `account-deletion` still pass. Not run: the iOS simulator collector with a forced token refresh (device check pending (owner)).
Device check, in this order (the sign-out must come before the refresh, because auth-js refreshes every 30 s while the app is in the foreground and 90 s before expiry, so a collector kept open through the sign-out has already refreshed and would pass on the base too; the API checks access tokens locally, so only the refresh sees a revoked session): (1) at T0 sign in as the same synthetic account X on the iOS simulator collector and in Mac browser A, stop the local API, collect one observation so it stays queued, and press Home at once so auto-refresh stops; also sign in as X in Mac browser B (private window). (2) Within a few minutes, well before T0+58 min, choose Sign out on A's Account page: A lands on /sign-in with no `sb-...-auth-token` and no `fm-place` cookie; B reloads /account and still shows X. (3) Keep the collector in the background until T0+61 min or later, or terminate it and relaunch after that time (an expired access token makes it refresh on foreground or launch). (4) Restart the API, bring the collector to the foreground, open Records. Read: the observation uploads within seconds, Account still shows X, no "Sign in to resume uploads" banner, and `docker logs supabase_auth_field-maps` shows a `grant_type=refresh_token` request answered 200 after the sign-out time (on the base the same order ends in a 400 and SIGNED_OUT). In B open Data: the observation is listed.

### WEB-46: Text fields are inert until the page is interactive
Status: done (2026-10-24; unit and local-stack e2e) · Phase 4 · Size S · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C07). React 19.3 (the canary Next 16.2.7 runs) overwrites a controlled `<textarea>` at hydration with no `onChange`; a select-all that races hydration saves NEW+OLD; inputs keep typed text on screen but not in state (sign-in then rejects filled fields; the settings name is wiped by the next render); Save before hydration does a native GET. The window is 0.1–0.2 s in the lab and 1.3–2.5 s cold on a throttled profile. It is why `e2e/settings.spec.ts` fails 5 in 20.
Read first: `src/components/contour/{TextInput,Textarea,PasswordInput,CodeInput}.tsx`; `features/project-settings/SettingsScreen.tsx`; `features/auth/SignInForm.tsx:55-108`; `e2e/settings.spec.ts`; `cloud/w3/runtime-hydration/` in the audit evidence.
Do: add one `useHydrated()` (`useSyncExternalStore(noop, () => true, () => false)`) in `components/contour`; apply `readOnly={readOnly || !hydrated}` in the four primitives (keep the read-only style tied to the caller's prop) and `disabled={!hydrated}` on form submit Buttons; in `settings.spec.ts`, wait for the "Project settings saved." toast before the API poll and the reload. Do not switch to `defaultValue`: the textarea is still overwritten.
Done when: a Playwright check that holds `/_next/static` cannot type before release and a fill after release saves exactly NEW (20 runs); sign-in submits what is shown; `settings.spec` passes 40/40 on desktop-1440 and phone-390; autofocus still works and CLS stays 0.
Verify: `pnpm web:check`, the specs through `scripts/e2e-local.sh`.
Verified 2026-10-24: `useHydrated()` (`components/contour/useHydrated.ts`) gates the four text primitives (read-only until hydrated, the read-only look still tied to the caller's prop) and every `type="submit"` Button (disabled, no reason shown); `buttonClasses` moved to `buttonClasses.ts` so server pages still import it without the now-client Button; `settings.spec` waits for the "Project settings saved." toast. New `e2e/hydration.spec.ts` holds every `/_next/static` script, shows that the settings description and the sign-in fields are read-only and Save and Sign in are disabled, that typing goes nowhere, and, after release, that a fill saves exactly NEW (20 runs per project) and sign-in submits what is shown; CLS is 0 and the sign-in email field is focused. It fails on the base (the textarea is not read-only before release) and passes after: 20 of 20 runs on desktop-1440 and on phone-390. `settings.spec` repeated 20 times per project: 40 of 40 pass. Whole e2e suite on the local stack (`--prod --zones`): 437 of 437 pass. Unit `hydration-gate.test.mjs` guards the wiring; `pnpm --dir web test:unit` 406 of 406. The e2e runs used port 3002 with a temporary API config naming that origin, because an orphaned lane F server held :3000.

### WEB-47: Managers see which form version each site collects with
Status: done (2026-10-24; unit tests, and `forms-version-delivery.spec.ts` through `scripts/e2e-local.sh --prod --zones` at desktop-1440 and phone-390 on the local stack once it matched master) · Phase 4 · Size M · Depends: none · Blocks: QA-08
Added 2026-10-22 (audit C11, UXW-2). Reproduced in the browser: with v1 bound by Site A's map and v2 published, the Forms row says "PUBLISHED v2 · USED BY Site A", Overview says "Nothing needs attention. Every site has a ready map package, a form is published and no draft is waiting.", and the upload step preselects v1 with no hint that v2 exists. The Site, Versions and Publish pages are already correct.
Read first: `src/features/forms/model.ts:49,78-91,285-296`; `ProjectFormsScreen.tsx`; `features/overview/model.ts:86-147`; `features/packages/forms.ts:49-60`; `PublishScreen.tsx:175-194`.
Do: the Forms row's "Used by" names site and version ("Site A · v1"); Overview gets a waiting item ("<form> v2 is published; no site's map names it, so observers still get v1 at Site A") with a link to the site's upload step; the upload step preselects the newest published version and says when an older one is selected.
Done when: in a synthetic project with v1 bound and v2 published, the three surfaces read as above; unit tests cover `formRows` and `attentionItems` for that state.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, a browser check.
Verified 2026-10-24: the Forms row's "Used by" reads "Site A · v1" beside Published v2 (`FormRow.uses`), Overview lists "<form> v2 is published, but no site's map names it" with "Observers still get v1 at Site A" and a link to that site's upload step (to Sites when several are behind; play and inventory forms alike), and the upload step starts on the newest published version of the current map's form and says "A newer version is published: <code>" while an older one is chosen (the inventory choice does the same). Unit: `forms-model`, `overview`, `package-history` (13 new tests; 12 of the 14 new or changed fail on the base). Browser at desktop-1440 and phone-390, production build, the local API with only the forms list answered by a proxy because the local database is three migrations behind master (the real forms read answers 500): the three surfaces read as above for Fall Creek on v1 with v2 published, and the upload step started on v2. Not run: `e2e/forms-version-delivery.spec.ts` (a synthetic project in the zone fixture's organization: bind v1, publish v2, check the three surfaces, upload v2 and see them clear) needs `pnpm db:reset` on the local stack (owner), then `sh scripts/e2e-local.sh --prod --stop-web --zones e2e/forms-version-delivery.spec.ts`.
After review (2026-10-24): the adversarial reviewer ran `forms-version-delivery.spec.ts` on the local stack, restored to master's baseline, and it passed at desktop-1440 and phone-390. A review comment on #37 then found that a map naming a retired version lost its form; `formVersionIndex` now resolves every version, retired ones included, so the upload starts on that form's newest published version (unit test added; web unit 407 pass).

### WEB-48: Publish a newer form to a site's observers without a QGIS re-upload
Status: todo · Phase 4 · Size M · Depends: BE-26 · Blocks: none
Added 2026-10-22 (audit C11, UXW-4). Today a corrected form reaches observers only by re-uploading the whole QGIS export and confirming every zone, and an older zones layer can silently replace boundaries edited on the web.
Read first: BE-26; `features/forms/PublishScreen.tsx`; `features/packages/UploadStep.tsx`; WEB-47.
Do: after publishing, the publish result and the site page offer "Use v2 at Site A", which calls BE-26 and publishes the site's next map version from its current archive with the new form; show the zone changes BE-26 reports when an import would change web-edited boundaries ("Boundary changed since v3: …").
Done when: a browser test publishes v2, uses it at a site, and the site page and an observer's next download name v2, with records of v1 unchanged.
Verify: `pnpm web:check`, the spec through `scripts/e2e-local.sh`.

### WEB-49: Failed reads look the same everywhere and never read as empty
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C16). The publish review turns failed form and site reads into "No other version of this form is published." (`forms/versions/[version]/publish/page.tsx:143-155`); one API outage shows a shell-less "Couldn't load this organization" on a fresh load but "Something went wrong" on client navigation; org no-access pages have no h1; ErrorView's "Reference" is a hash of a client message no log can match.
Read first: the publish page; `app/(app)/o/[org]/layout.tsx:21-39`; `p/[project]/layout.tsx:22-26`; `lib/api/workspace.ts:99-115` (17 unguarded call sites); `features/org/NoAccess.tsx`; `components/contour/ScreenState.tsx:88`; `components/shell/ErrorView.tsx:17-28`; `src/proxy.ts:33-58`.
Do: settle the publish page's reads and show "Couldn't check other versions; try again before publishing"; one `requireProject()` page helper that settles the workspace, applies the observer redirect and returns a LoadFailure element, used at the 17 call sites; PageHeader on org no-access and failure states; ErrorView omits the reference when there is no digest; the sign-in page leads with "Sign in to continue." when `?next=` is present.
Done when: `web/tests/unit/page-failures.test.mjs` (a 503 stub over sites, data, team, forms, packages, overview and publish) fails before and passes after; with the API stopped, a fresh load and a client navigation show the same LoadFailure with the tabs kept.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`.

### WEB-50: Tab switches keep one loading boundary
Status: todo · Phase 4 · Size S · Depends: none · Blocks: none
Added 2026-10-22 (audit C17, measured). The project and org `loading.tsx` wrap each child segment in a Suspense keyed by that child, so every tab switch mounts a new boundary and React 19.3's 300 ms fallback reveal throttle holds ready pages: warm tab switches took 327–360 ms against 79–205 ms with the boundary moved up (7 production builds, 5 samples per cell; `cloud/w2/boundary-summary.md`). Cold loads keep the skeleton either way.
Read first: `app/(app)/o/[org]/p/[project]/loading.tsx`; `app/(app)/o/[org]/(org)/loading.tsx`; the experiment summary and `cloud/run/boundary/run.cjs`.
Do: move `p/[project]/loading.tsx` up to `p/loading.tsx` (or wrap `{children}` in one Suspense with the same skeleton in the project layout) and treat the org one the same way; add `useLinkStatus` pending feedback on the project tabs so a slow hosted response still shows progress. Prefetch stays off.
Done when: the boundary harness shows warm overview→data, data→sites and site→forms usable within about 220 ms (lab) with no skeleton flash; a hard load still shows the skeleton.
Verify: `pnpm web:check`, `pnpm build`, the harness on the local stack.

### WEB-51: Data review: one rendering, map first on tablets, forgiving filters, a breadcrumb that keeps the view
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C18, C12, C28, C29). Data renders every loaded record twice (a table plus a CSS-hidden card list: 15.2k nodes and 2.2 MB of HTML at 500 rows, 4.5k of them cards); below 1280 px (every iPad) the site plan comes after up to 500 rows and selecting a marker scrolls away from the map; the observer filter is exact and case-sensitive; the "Data" breadcrumb on an observation drops the filters.
Read first: `src/features/data/DataTable.tsx:55-131`; `DataScreen.tsx:210-214,375-401`; `features/data/view.ts`; `components/contour/Table.tsx:82-83`; the observation detail breadcrumb; WEB-13.
Do: render records once (a table whose rows restyle as cards below md, keeping the real link, the roving tab stop and `data-record-id`); below `xl` put the plan first at a compact height and keep it sticky at `xl`; compare observer initials case-insensitively (uppercase on input); carry the current view into the breadcrumb link.
Done when: SSR node count at 500 rows drops by about 4.5k; at 1024×768 and 768×1024 the top of the plan is above the first row; lowercase initials match; the breadcrumb returns to the filtered URL; phone-390 still shows cards.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, the data specs through `scripts/e2e-local.sh`.

### WEB-52: Browser-direct transfers and recents belong to the page's account; offline install says it needs a connection
Status: todo · Phase 4 · Size S · Depends: none · Blocks: none
Added 2026-10-22 (audit C30, C31). Only the zone editor and account deletion check that the signed-in account is the page's; browser-direct package uploads, QGIS import, exports and downloads use whoever is signed in now (another tab may have switched), and the palette's recents keep another account's labels. The installed web app opened offline shows the public landing page instead of saying it needs a connection.
Read first: the zone editor's `expectUser` fence (`lib/api/zones-browser.ts`); `features/packages/UploadStep.tsx`, `ProjectImport.tsx`, the export and download helpers; `fm.palette.recent`; `lib/pwa/service-worker.js`.
Do: reuse the account fence on every browser-direct transfer (refuse and say which account the page belongs to); key palette recents by user id; serve an offline page for navigations instead of `/`, and delete the legacy `fieldmaps-*` cache names (audit C19).
Done when: a Playwright test signs in as B in a second tab and an upload from A's page is refused with that message; recents of A never show for B; the service-worker vm test covers the offline navigation.
Verify: `pnpm web:check`, `pnpm --dir web test:auth`, the spec.

### WEB-53: Dialog focus, password toggle and keyboard shortcuts meet WCAG 2.2 AA
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C23, C32). 13 of 22 dialogs never return focus to what opened them (the Invite dialog failed 6 of 6 in the browser); the password Show/Hide control fails label-in-name; the single-key shortcuts (`g` chords, `?`, `/`) fail 2.1.4, and the shortcuts dialog documents Approve, Exclude and Esc keys that do nothing.
Read first: `components/contour/Dialog*`; `PasswordInput.tsx`; `features/shell/useShortcuts.ts:53-84`; `lib/shortcuts.ts:56-102`; `ShortcutsDialog.tsx`; the zone editor's `chordPending` guard.
Do: return focus to the trigger in the shared dialog primitive (or the 13 call sites that override it); make the password control's accessible name contain its visible text; delete the single-key layer and the dead rows (Ctrl/Cmd+K and the palette own keyboard navigation), updating the zone editor guard, one unit test and one e2e step.
Done when: a Playwright check opens and closes every dialog by keyboard and finds focus on its trigger; axe stays at 0 violations on the scanned routes.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, the honesty and keyboard specs.

### WEB-54: The zone editor's save status says what is actually happening
Status: todo · Phase 4 · Size S · Depends: none · Blocks: none
Added 2026-10-22 (audit C26). In an outage the editor shows "Checking whether your last change was saved…" indefinitely (6 s observed; 40 s on an aborted PUT) while nothing is checking, and a fast-failing PUT is resent without backoff. The save queue itself is sound and stays.
Read first: `features/zones/editor/save-queue.ts`, `useDraftSaving.ts`, `failure.ts`.
Do: after a transport failure, show "Not saved yet: DECA Mark can't be reached. Your changes are kept in this tab and will be saved when it can." with a retry countdown; back off exponentially (cap about 30 s); keep one PUT in flight, If-Match and the account fence.
Done when: the existing zones-network spec passes and a new case asserts the status text and the backoff during an aborted PUT.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, the zones specs.

### WEB-55: Delete web compatibility code and duplicated rules
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C19 web, C33, C36, part of C34). Under D31 these are deletions before the pilot.
Read first: `next.config.ts:19-42` (`OLD_ROUTES`, `redirects()`); `e2e/removed-routes.spec.ts`; `e2e/support/routes.ts:85-100`; `features/forms/RetireDialog.tsx:42`, `DiscardDialog.tsx:47`, `features/packages/UploadStep.tsx:456`; `lib/workspace/result.ts` and `components/shell/LoadFailure.tsx:9`; `lib/packages.ts:14-47`, `lib/sites/archive.ts:69-78`, `features/packages/upload-preview.ts:14`; the Reports date parser; `lib/labels.ts:29-40`; `overview/model.ts:103-115` and `packages/page.tsx:99-107`.
Do: delete the old-route redirects and `removed-routes.spec`; delete the three redundant `router.refresh()` calls (keep the one after an uncertain upload outcome and `saveDraftAction`'s revalidate, which also evicts the bfcache the versions list relies on); move `isNoAccess`/`isNotFound` out of the zod module so zod leaves every page bundle; one `LAYER_NAMES` export tied to `contracts/openapi.json` by a test; Reports reuses `parseView`; narrow `roundOf`/`roundLabel`/`roundName` to `RoundType`; import supabase-js from one shared lazy module so it is bundled once; delete the unreachable "blocked package" display paths after a SQL count on the hosted database shows no blocked rows.
Done when: `pnpm build` shows zod absent from project-page chunks and one supabase chunk; unit tests pass; the e2e suite passes.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, `pnpm build`, the e2e suite.

### WEB-56: Forms in one canonical format, templates from the API
Status: todo · Phase 4 · Size S · Depends: BE-24, BE-25 · Blocks: none
Added 2026-10-22 (D32). The web still carries the fields-only form path and compiles its "start from" templates from `contracts/forms/*.json`.
Read first: CON-07 (`contracts/README.md` "Form schema version"); `features/forms/LegacyVersionScreen.tsx`; `forms/versions/[version]/page.tsx:25-29,85-93`; `publish/page.tsx:36`; `features/forms/answers.ts` and the fields reader; `features/forms/templates.ts`; BE-24, BE-25.
Do: delete `LegacyVersionScreen`, both `isCanonical` branches, `VersionRow.legacy` and its strings, the fields reader and its fixtures; load templates from BE-25's endpoint; read every served definition (versions, drafts, templates, historical observation detail) through `parseServedDefinition(schema_version, definition)`, and where the number is unknown show "Update DECA Mark to use this form" instead of the editor or reader.
Done when: `grep -rn "contracts/forms\|LegacyVersion\|isCanonical" web/src` finds nothing; a unit test shows a version served with schema version 2 renders the update sentence; the forms specs pass.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, the forms specs.

### WEB-57: Measure and cut server fan-out on hosted latency
Status: todo · Phase 4 · Size M · Depends: none · Blocks: none
Added 2026-10-22 (audit C34). In the lab, Overview calls `listPackages` once per site (10 calls at 10 sites; 4.2–4.5 s of summed API time at 28 sites inside a 478–507 ms document), and several pages await independent reads in series. Loopback hides the cost; hosted latency will not.
Read first: `docs/reviews/frontend-audit-2026-10-17/runtime/perf/SUMMARY.md` §5; `app/(app)/o/[org]/p/[project]/page.tsx`; the form editor and publish pages; `contracts/openapi.json` (is there a batched package read?).
Do: measure Overview, Data and the form editor against the hosted preview (3+ samples, recorded here); start independent reads together (`Promise.all`, earlier promise starts); replace the per-site N+1 with one batched read (add the endpoint as a BE task if none exists); remeasure.
Done when: the before/after table is recorded here, and Overview makes a constant number of API calls whatever the site count.
Verify: `pnpm web:check`, the measurement script.

### WEB-58: Manager polish: invitations, upload confirmation, empty projects, header orientation
Status: todo · Phase 4 · Size S · Depends: none · Blocks: none
Added 2026-10-22 (audit C27, C40, C41, C42). The one-time invitation code and link are lost on Esc or an outside tap, and the email delivery outcome is never shown; the upload success confirmation may render off-screen at ≥1280 px while the form resets; an empty project's Overview points its primary action at an empty Data page and lists "upload a map" before "publish a form"; below 1024 px the header hides role and org, and an observer's header says "MEMBER".
Read first: `features/team/InviteDialog.tsx:57,74-78,162`, `InvitationCreated.tsx:75-90`; `features/packages/UploadStep.tsx` (success state); `features/overview/model.ts`; `components/shell/AppHeader.tsx:72-92`.
Do: after creation the invite dialog closes only through "Done" (Esc asks first) and shows queued / unavailable / not requested; scroll the upload confirmation into view and announce it; on an empty project point the primary action at the next setup step in dependency order (form, then map); show role and org in the switcher's visible text below 1024 px, and the project role for observers.
Done when: browser checks at 1440, 1024 and 390 show each state.
Verify: `pnpm web:check`, the team, packages and overview specs.

### WEB-59: Web text scales with the browser's font size
Status: todo · Phase 4 · Size S · Depends: none · Blocks: none
Added 2026-10-22 (audit C43). Type tokens are emitted in px, so a larger browser default font size does not grow text (browser zoom works and meets 1.4.4/1.4.10); at 320 px with a 200% root, two pages overflow sideways.
Read first: `scripts/contour-tokens.mjs`; `src/styles/contour.css` (generated); `contracts/contour.json`.
Do: emit the web's type and spacing tokens in rem from the generator (the collector keeps reading points from the contract); regenerate; fix the two overflowing islands found at 320 px with a 200% root.
Done when: `pnpm tokens:check` passes; at 320×640 with a 200% root, overview and site detail have no sideways scroll and no clipped values; screenshots at 100% are unchanged.
Verify: `pnpm tokens`, `pnpm tokens:check`, `pnpm web:check`, the reflow check from the audit's `j7c` script.

### WEB-60: Upload asks before leaving an online background map out
Status: todo · Phase 4 · Size S · Depends: BE-23 · Blocks: QA-08
Added 2026-10-23 (D35, audit C04). After BE-23 the API refuses a package whose QGIS project has an online background map unless the request names those layers in `leave_out_online_basemaps`, and Read project marks them. Today the web shows that refusal as a broken zone ring; it must ask the manager instead.
Read first: D35; BE-23; `src/features/packages/UploadStep.tsx` (`uploadProblem` and the submit path); `ProjectImport.tsx` and `project-import.ts` (the Read project result and the slot's Ready badge); `checks.ts` and `VersionHistory.tsx`; `forms/DiscardDialog.tsx` (the confirm dialog pattern); `web/e2e/packages.spec.ts` (`qgisUpload()`).
Do:
1. When Read project marks online background maps, the slot stays Ready and lists each one: "<layer> (<host>) is an online background map. It will not be uploaded."
2. On Upload with such layers, open a confirmation before sending. Title "Upload without the background map?"; the body names each layer and host and says observers see the vector layers only; actions "Upload without it" and "Cancel". Confirming sends the request with `leave_out_online_basemaps` set to those layer names. Cancel sends nothing, keeps the chosen files and says: "Not uploaded. Remove the background map from the project in QGIS, or upload without it."
3. If the API still answers `online_basemap_unconfirmed` (the project file changed after Read project, or Read project was skipped), open the same confirmation with the layers from the answer. Never show the ring copy for it.
4. The version history shows the warning check that names each layer left out.
Done when: `qgisUpload()` gains an XYZ layer and the packages spec covers three paths at 1440 and 390: Cancel uploads nothing and keeps the files; confirming publishes, and the new version shows the warning naming the layer; and an upload whose Read project result carried no mark (the test removes it with `page.route`) receives `online_basemap_unconfirmed`, opens the same dialog with the layers from that answer, and its confirmed retry publishes. No message mentions rings; the dialog passes axe and returns focus to Upload on Cancel.
Verify: `pnpm web:check`, `pnpm --dir web test:unit`, the packages spec through `scripts/e2e-local.sh`.
