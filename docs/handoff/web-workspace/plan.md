# Plan: make the web workspace real, restore the purple icon, real identity, remove the sample and set-up

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../plan/current-state.md) and [web task owners](../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## Context

Janet (DECA Lab owner, Play Study manager) starts using DECA Mark today. On the web today:

- every page under `/o/**` reads made-up sample data (`/o/deca`), and her real org `/o/deca-lab` returns 404;
- the account menu shows a hard-coded sample person ("PS · ps2245@cornell.edu", `web/src/fixtures/people.ts`, `AccountMenu.tsx:52`) for everyone;
- signing in lands on `/onboarding`, a set-up flow that saves nothing and links into the sample;
- the headers (web and mobile) draw a newer black "ring" mark instead of the purple DECA Mark app icon that installs, favicons and the store use;
- the home page `/` is old Nocturne styling with developer copy.

Owner decisions: delete the sample workspace entirely; build the full manager set on live data; build features whose backend is light (derive from existing endpoints) and show a short "not available yet" for the rest; replace the home page; remove set-up; real identity; purple icon everywhere; copy written for researchers (no "preview/API/endpoint/session/token/fixture"), anti-AI-slop, per `ui-ux-pro-max` + DESIGN.md rules.

The API already has everything needed (`contracts/openapi.json`): `/v1/me`, orgs, projects, members, invitations (+ preview/redeem), sites, packages (+ archive zip), forms/versions (draft → publish → retire), observations (≤500 newest, no cursor).

## Architecture

**Routes.** Keep `/o/[org-slug]/p/[project-code]/…`. `/o` resolves home (`lib/workspace/home.ts`, unit-tested): remembered project (`fm-place` cookie) → the only project → first org (owned first) → in-shell "You are not in a project yet" with "Enter a join code". Observers go to `/o/<slug>/collect`. Training projects are hidden. Signed-in `/` → `/o` (proxy). Sign-in fallback `safeNext` → `/o`.

**Data layer (server-only).**

- `web/src/lib/api/client.ts`: cached session token; a fresh `AbortSignal.timeout(15s)` per request (today one signal is shared); `call()` helper that throws `parseApiError`.
- New `lib/api/workspace.ts`: React `cache()` reads with primitive arguments only: `getMe`, `getWorkspace` (never throws), `resolveOrg`, `resolveProject`, org/project/members/invitations, sites, packages, `getSitePlan`, forms, form versions, `listObservations` → `{rows, limited}`, `getObservation`.
- New `lib/api/mutations.ts`: one function per write endpoint.
- New `lib/api/browser.ts`: browser → API with the signed-in user's token, for package upload and archive download. Bodies of up to 24 MiB exceed both the Vercel and Server Action limits, and CORS is already set.
- Pure, unit-testable modules:
  - `lib/workspace/{types,access,result,home,invitations}.ts`
  - `lib/time.ts`, `lib/labels.ts` (`OBS-3F2A1B`, matching the collector)
  - `lib/observations/{answers,summary}.ts`
  - `lib/export/{columns,observations}.ts`
  - `lib/sites/archive.ts` (adds `fflate@0.8.2`, the version mobile uses; zip → `parseSite`/`projectSite` plan; ground `kind`, tree polygons, zone ids from the manifest)

**Permissions.** `lib/workspace/access.ts` replaces `lib/preview.ts can()`:

- abilities come from `/v1/me` roles (project manager/observer/viewer; org owner/admin/member);
- tabs hide manager-only sections, and those pages render a no-access state themselves;
- pages never call admin-only endpoints for users without the role (avoids 403s from row security).

**Client data flow.**

- Server pages await `params` (Promises in Next 16), fetch in parallel, and pass plain serialisable props to client screens.
- Mutations are `"use server"` actions per feature (zod-validated). They return "Nothing was … " plus the existing safe `errorCopy`, and call `revalidatePath` (with `("/o","layout")` for name/membership changes).
- A `WorkspaceProvider` in `(app)/layout.tsx` feeds the header, switchers, tabs, account menu, ⌘K palette and shortcuts.

**States.**

- New `loading.tsx` for org and project, and an `error.tsx` for the project.
- New `components/shell/LoadFailure.tsx`: sign in again, no-access, or try again.
- New `components/shell/NotAvailable.tsx`: "X is not available yet." plus one reason and the alternative.
- Every aggregate or export that hits the 500-row cap says "Based on the newest 500 observations".

## Screens (all live)

| Screen             | Content                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Org projects       | List with site and observation counts; "Create project" for owners and admins (`POST /v1/orgs/{org}/projects`)                                                                                                                        |
| Org members        | Members, roles, remove, invitations (owner/admin)                                                                                                                                                                                     |
| Org settings       | Name and slug, facts, transfer ownership; delete is not available                                                                                                                                                                     |
| Overview           | Field return (totals, today, 7 days), coverage of zones × Standard/Reliability/Inventory over the site plan, "Needs attention" (no package, blocked package, no published form, draft notes), recent activity derived from timestamps |
| Data               | Table and plan with filters (site/round refetch from the server; zone/observer/dates/search in the URL), "Copy link to this view", export dialog                                                                                      |
| Observation detail | Answers labelled from the form definition                                                                                                                                                                                             |
| Sites              | List, create site                                                                                                                                                                                                                     |
| Site               | Plan with zone counts, edit name and description, current package with download, note that zones come from QGIS                                                                                                                       |
| Map packages       | History (current = newest ready), inspect server checks, real upload from QGIS layers (blocking zone-id check mirrors the server)                                                                                                     |
| Forms              | List and "New form" with templates (Behaviour mapping, Zone inventory, Blank)                                                                                                                                                         |
| Form versions      | New draft, discard, retire                                                                                                                                                                                                            |
| Draft editor       | Save (PUT); 422 messages shown; leave guard kept                                                                                                                                                                                      |
| Publish            | Protocol notes from the definition; copy states that older versions stay published                                                                                                                                                    |
| Team               | Members, role change, remove, invite (link and code shown once, with "DECA Mark does not email this"), revoke                                                                                                                         |
| QGIS               | Download maps; CSV, GeoJSON and codebook export; live connection is not available                                                                                                                                                     |
| Reports            | Counts by zone, round type, play type, observer and day; print                                                                                                                                                                        |
| Settings           | Name, description, IANA timezone, archive and unarchive; delete and rounds plan are not available                                                                                                                                     |
| `/invite`, `/join` | Real preview and redeem; the token stays in the URL fragment, the code never goes in the URL                                                                                                                                          |
| Collect handoff    | The user's real observer projects                                                                                                                                                                                                     |

**Not available, as one short line each:** saved named views (links replace them), rounds plan, zone editor (edit in QGIS), record review, device readiness, live QGIS database access, deleting projects, orgs, sites or packages, and resending invitations.

**Dropped:** package "Activate" (the newest ready package is current), the org form library tab, the join QR code, and web org creation (the bootstrap script does it).

## Identity, icon, home page

- **Header and account menu:** real name and initials from `/v1/me` (`features/account/view.ts` `personName`, `avatarInitials`), email from Supabase claims. The sample "Alex Kim" chip on `/invite` and `/join` is replaced the same way.
- **Purple icon:**
  - Web: `components/shell/Brand.tsx` `BrandMark` → `/icons/icon.svg`.
  - Mobile: `mobile/src/ui/Logo.tsx` `Mark` redrawn from `mobile/assets/icon-source/generate.py` with react-native-svg, plus a vitest that keeps its colours in step with `icon.svg`.
  - Docs: DESIGN.md :460 and the rule-03 exception (:67, :969); decision D29. App icons, favicons and the manifest are already purple.
- **Home page `/`:** replaced with a short Contour page in plain words: what DECA Mark is, Sign in, how observers get the Android app (`NEXT_PUBLIC_ANDROID_APP_URL` when set), and Privacy.

## Deletions

- `web/src/app/(onboarding)/**`, `features/onboarding/**`, `components/onboarding/**`; onboarding entries in `proxy.ts`, `lib/auth/preview.ts`, `Switchers` and `YourProjects`.
- `web/src/fixtures/**`, `web/src/data/**`, `lib/preview.ts`, PreviewProvider, PreviewMarker, PreviewFooter and PreviewLine, session stores, proposal flags.
- Legacy unused components: `components/{observations,basemaps,places,instrument,metrics,maps,qgis,studio,nocturne}`.
- Screens with no backend: zone editor, rounds, saved-views and report-detail routes, and the org library.
- The Nocturne CSS alias block.
- Leaflet dependencies.
- A lint guard bans `@/fixtures`, `@/lib/preview` and `@/data`.

## Docs

- `web/AGENTS.md` Honesty section: everything is live; the not-available pattern; no jargon in UI.
- `web/PLAN.md`: new WEB-27, status notes on WEB-06…26.
- `docs/plan/decisions.md`: D29 (brand mark), D30 (one live workspace, which supersedes D20, D23 and D24 and part of D1, plus browser-direct package transfer and the 500-row wording).
- DESIGN.md, `web/README.md`, `docs/ux/sitemap.md`, `docs/Launch-Runbook.md`, PRODUCT.md, root README.

## Execution (Workflow, ultracode)

1. **Foundation**, in parallel on disjoint files:
   - WP0A: data layer, pure modules, `package.json`, unit tests.
   - WP0B: shell, layouts, `/o` resolver, real identity, states, `features/people` shared tables and dialogs, onboarding removal, `next.config` redirects. A temporary shim keeps the old screens compiling.
   - WP8: mobile and web brand mark, DESIGN.md, D29.
   - WP9: Playwright E2E harness and local-stack seed scripts.
   - Then run `pnpm --dir web check` and the unit tests.
2. **Screens**, in parallel, each package owning its own route and feature folders:
   - WP1 sites and packages
   - WP2 forms
   - WP3 data and observation detail
   - WP4 overview, reports and QGIS
   - WP5 team and settings
   - WP6 org pages
   - WP7 invite, join, home, collect and auth cleanup
3. **Cleanup (WP10):** remove the shim and fixtures, add the lint guard, write the docs.
4. **Review, adversarial:** per-area bug review, a copy and UX review against `ui-ux-pro-max` rules and DESIGN.md (one magenta action per screen, state vocabulary, contrast, 390 px layout, plain words), and an honesty sweep. Fix, then loop until a round finds nothing new.
5. **Verify** (below), then one PR to `master` from `pratyush-cc/bold-darwin-9vz8fz`, driven to green.

## Verification

- **Static checks:** `pnpm --dir web check`, `format:check`, `build`, `test:unit` (new: access, home, workspace-index, site-archive with the real Fall Creek layers, observation summary including a DST day, answers, export, invitations, time, labels), plus the updated `test:auth` and `test:api-errors`. Also `pnpm tokens:check`, `forms:parity`, `plan:check`, `mobile:check` and `mobile:test`, and a grep showing no `@/fixtures`, `/o/deca` or `onboarding` left in `web/src`.
- **E2E on the local stack** (local Supabase, API on :8001, `bootstrap-study.mjs`, about 8 seeded observations, `next build && start`, Playwright):
  1. As manager: sign in, land on `/o/deca-lab/p/play-study`, and see the real name, email and initials in the header.
  2. Overview totals match the seeded observations.
  3. The site plan shows Zone A.
  4. Upload a new package and see v2 become current.
  5. Edit a form: new draft, save, publish.
  6. Invite someone (link and code shown), then revoke the invitation.
  7. Data: filter, open a record, export CSV.
  8. QGIS GeoJSON and Reports.
  9. Change and save a setting.
  10. Org pages open for the owner.
  11. Invite redeem as a viewer, who sees no Team or Settings tabs.
  12. An observer joins by code.
  13. Honesty scan on every route (no sample strings, no jargon, at most one primary button, axe clean in Day and Dusk).
  14. Screenshots at 1440, 1024, 768 and 390 for review.
- CI gains `test:unit` and an E2E job (non-blocking at first).

## After merge (owner)

- Vercel needs `NEXT_PUBLIC_DECAMARK_API_URL=https://field-maps.onrender.com` (browser upload and download) and `DECAMARK_API_URL`.
- The API's CORS allows `decamark.vercel.app`. If production uses another domain, add it to `browser_origins` in `backend/config.render.json`.
- Janet owns DECA Lab (she ran the bootstrap), so she can add you from Organization members.
