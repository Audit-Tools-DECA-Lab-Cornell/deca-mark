# DECA Mark web

The management side of DECA Mark: projects, sites, forms, map packages, the team, and the observations the [native collector](../mobile/README.md) uploads into the shared spatial database. Researchers read what came back here and take it into QGIS.

This application and the collector are one product, so they carry one design system, **Contour**, described in [`DESIGN.md`](../DESIGN.md). Its values live in [`contracts/contour.json`](../contracts/contour.json). `pnpm tokens` generates [`src/styles/contour.css`](src/styles/contour.css) from that file, and the collector reads the same file in `mobile/src/ui/tokens.ts`, so a token changes in one place and the two applications cannot drift. Day is the default theme; Dusk is a preference in the account menu.

## What is real

All of it (D30). Every page under `/o/<org>/p/<project>` reads and writes the DECA Mark API for the signed-in person: sites and map packages, forms and their versions, observations, the team, invitations, and project and organization settings. Sign-in, sign-up, verification and password recovery use Supabase through Server Actions (`src/lib/auth/actions.ts`). There is no sample workspace, no fixture data, no Preview data marker and no set-up flow.

When a feature has no backend, the page says so once, with `components/shell/NotAvailable.tsx`: "X is not available yet.", then why, and what to do instead. Today that covers saved named views, the rounds plan, editing zones on the web where a site has no usable boundary or published form (edit them in QGIS), reviewing or excluding records, device readiness, live QGIS database access, deleting projects, organizations, sites or map packages, and resending invitations. A read that fails shows `LoadFailure` and never an empty list. The Honesty section of [`AGENTS.md`](AGENTS.md) holds the rules.

Data pages through all matching observations, 500 at a time, with server filters and recorded map/zone labels. Zone/round coverage uses the server summary, and exports download the complete authorized scope within the documented server limits. Observer/day/play-type breakdowns and loaded-row search still disclose their loaded subset. Dates use the project's timezone. See [current position and remaining acceptance](../docs/plan/current-state.md).

Organizations are created by the bootstrap script (`scripts/bootstrap-study.mjs`), not on the web. Owners and admins create projects on the organization's Projects page.

## Sections

| Route | What it is |
| --- | --- |
| `/` | The home page: what DECA Mark is, Sign in, and how observers get the Android app |
| `/sign-in`, `/sign-up`, `/verify`, `/forgot-password`, `/reset-password` | Authentication with six-digit email codes |
| `/invite`, `/join` | Join a project or organization with an invitation link or a code |
| `/account` | Profile, password, sign out, delete account |
| `/o` | Opens the person's last project, their only project, or their first organization |
| `/o/[org]` | The organization's projects; Members and Settings for owners and admins |
| `/o/[org]/collect` | Where observers land: they collect in the DECA Mark app |
| `/o/[org]/p/[project]` | Overview: what the field returned, coverage by zone and round, and what needs attention |
| `…/data`, `…/data/[observation]` | Every matching observation, 500 at a time, as a table and a plan of one map version, with filters and export; one record on the map version it was recorded with |
| `…/sites`, `…/sites/[site]`, `…/sites/[site]/packages` | Sites, the plan of each, and its map packages: history, checks, upload from QGIS layers |
| `…/sites/[site]/zones`, `…/sites/[site]/zones/edit` | Zone identities, version history, server draft editing and publication review |
| `…/forms`, `…/forms/versions`, `…/forms/versions/[version]` | Forms, their versions, the draft editor and publishing |
| `…/team`, `…/settings` | Project members and invitations; name, description, timezone and archive (managers only) |
| `…/qgis` | Maps for QGIS in; records out as CSV, GeoJSON and a codebook |
| `…/reports` | Counts by zone, round type, play type, observer and day, printable |

The route tree is in [`PLAN.md`](PLAN.md#target-route-tree). Old paths (`/overview`, `/observations`, `/places`, `/basemaps`, `/instrument`, `/qgis`, `/onboarding`) redirect to `/o` and keep the query string.

Filters and the selected record live in the URL, so a filtered view can be sent to a colleague, opened in a second tab, and undone with the back button. A link replaces saved named views.

Form editing carries the loaded draft ETag through save and discard. Each successful
save replaces the editor's ETag with the returned value. The publication review retains
its own ETag; publication never reads a newer draft just to obtain a precondition.
A conflict keeps unsaved wording in the editor and offers the latest draft in another
tab for comparison. Saving waits for explicit reconciliation/reload. Publication reloads
the review and clears confirmation when its ETag changes. The focused component/action
regression is `tests/unit/forms-concurrency.test.mjs` (also in `pnpm test:unit`).

## Import a QGIS project for a site

Open **Sites → the site → Upload a new version**. Choose a `.qgz` or `.qgs` project and click **Read project**. If its vector data is external, select its GeoPackage or every shapefile part too, or upload a ZIP containing the project folder. A `.qgz` alone works only when it contains the source datasets; a saved project normally refers to files on the author's computer.

The API converts uploaded GeoPackage, shapefile and GeoJSON layers to EPSG:4326. Review the ground and zones slots and assign any unmatched layer names before **Upload package** saves an immutable version for that site and published form. Reading the project does not save a package. Optional GeoJSON files replace matching converted layers; existing GeoJSON-only uploads remain available. A single ground polygon without `kind` becomes the site boundary; multiple polygons still require exactly one feature with `kind = site`. Zones need valid identifiers and labels.

Import accepts at most 64 selected files totalling 16 MB, with bounded ZIP expansion. Missing or ambiguous sources are named rather than read from the host. Remote sources, raster imagery, QGIS styling and filtered-layer conversion are not supported; include a GeoJSON export of a filtered layer. The original project metadata remains attached for the existing source and imagery checks. This flow requires deploying the matching API and web changes together.

## Design rules this application keeps

- **Day by default, Dusk by choice.** Every screen works in both. Map canvases keep their own palette (Day, Night) from [`contracts/map-palettes.json`](../contracts/map-palettes.json), the one the collector uses, so a manager sees the plan the observer saw.
- **Map colours stay on the map.** Zones and observations take the palette's colours, and UI state colours never appear on a plan.
- **State is a glyph plus a word plus a colour**, in that order, so the colour is never load-bearing. The vocabulary is the `states` block of `contracts/contour.json`, shared with the collector, and nothing invents a state beside it.
- **One magenta action per screen.** Ink is for the strong second action and outline for the rest. Selection, focus and navigation use ink.
- **Mono for anything someone might read aloud.** IDs, versions, codes and counts are Spline Sans Mono; words are Geologica. Labels wrap and never truncate, and text follows the browser zoom.
- **Motion conveys state, never decoration.** Durations come from the tokens. No shimmer and no hover lift, and every movement has a reduced-motion fallback.
- **Nothing tappable goes below 44 px**, focus is a visible ink ring, and keyboard and screen readers are first-class.
- **Copy says where the work is and what to do next.** Buttons are a verb and an object, in sentence case. Errors say what happened, what is safe and what to do. No "Oops", no exclamation marks, no "successfully", no blame.

Primitives live in `src/components/contour/`, with the same names as the collector's `mobile/src/ui/`. When one side gains a primitive, give the other the same one. `/dev/contour` (dev and preview builds only) shows every primitive in Day and Dusk.

The text fields (`TextInput`, `PasswordInput`, `CodeInput`, `Textarea`) are read-only, and a `Button` with `type="submit"` is disabled, until the page has hydrated (`useHydrated`). React overwrites a controlled textarea when it hydrates and loses text typed into an input before then, and a Save pressed early posts the form natively. `e2e/hydration.spec.ts` holds the page's scripts, types, and checks that nothing is accepted until they are released. `buttonClasses` lives in its own module (`buttonClasses.ts`) so server components can import the class function without importing the client `Button`.

## Public policy pages

`/privacy` and `/privacy/delete-data` are the privacy policy and data deletion pages for the native collector, for its Google Play listing. They live in `src/app/(legal)/`, carry their own stylesheet because they follow the visitor's light or dark system setting, and are prerendered as static pages. Every statement was checked against the mobile, backend and database code; update the pages before the app collects anything new.

Facts only the operator can supply live in `src/app/(legal)/policy.ts`: the operator (DECA Lab at Cornell University, led by Professor Janet Loebach), the privacy contact, and the developer. The server host, retention periods and deletion time are marked "Assumed" there and need confirming with the lab. Any field set back to `null` brings back a visible draft notice and an inline "to be confirmed" marker.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Every workspace and account route needs a Supabase sign-in, so set the Supabase and API variables below first. Without Supabase configuration nobody is signed in, and the workspace stays closed.

## Connect it to the API

The server calls the API for everything except map packages. A map package (up to 24 MiB) is too large for Vercel and for Server Actions, so the browser sends it, and fetches its archive, straight to the API.

```bash
cp .env.example .env.local   # then edit if your API is not on 127.0.0.1:8000
```

| Variable | Value |
| --- | --- |
| `DECAMARK_API_URL` | The API's origin, no trailing slash, read by the web server: `http://127.0.0.1:8000` locally, `https://field-maps.onrender.com` deployed |
| `NEXT_PUBLIC_DECAMARK_API_URL` | The same origin, for the browser's package upload and download |
| `NEXT_PUBLIC_ANDROID_APP_URL` | Optional. An https link to the Android build. When set, the home page and the collect page show it |

`NEXT_PUBLIC_` variables are compiled into the browser bundle, so they are public by construction. Never put a token or key beside them. Next.js reads `.env.local` at build time, so restart `pnpm dev` after changing one; on Vercel, set it in **Project → Settings → Environment Variables** and redeploy, since a running deployment will not pick it up.

Workspace navigation, row links and action links disable speculative Next.js prefetching. Rendering a tab bar or scrolling observations should not fetch every linked screen and repeat its authenticated reads. `ButtonLink` and `TextLink` can explicitly opt in with `prefetch`. Reads still run on navigation, explicit retry and successful mutations.

The API must also name the web origin. Browsers preflight a cross-origin request that carries an `Authorization` header, and the API allows no origin by default, so add the web origin to `browser_origins` in the API's configuration (`backend/config.local.json` locally, `backend/config.render.json` deployed) — see [the API README](../backend/README.md). Miss that step and a package upload or download fails in the browser's network layer before the API is reached; the pages the server renders still load. Vercel preview deployments get a new hostname per branch, so those are covered by `browser_origin_pattern` rather than listed.

A page served over HTTPS may not call an API on `http://127.0.0.1`, so the deployed site needs a deployed API over HTTPS. Uploading takes the signed-in person's own access, and the API accepts it only from a project manager.

Quality checks:

`pnpm api:types` regenerates declarations from `../contracts/openapi.json`. Package checks use those types; error responses use `src/lib/api/errors.ts` for validated codes and local user copy. Run `pnpm test:api-errors` for malformed-response and error-code coverage. Regenerate the backend and both apps together with root `pnpm contracts:generate`.

```bash
pnpm check   # typecheck and lint
pnpm build
```

From the repository root, `pnpm tokens:check` confirms that `src/styles/contour.css` matches the contract and that every declared colour pair meets its contrast minimum in Day and Dusk.

## Authentication and server API

Set these process or deployment settings before starting the app:

| Setting | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Auth origin, local `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable key (local legacy anon key also supported), never a service-role key |
| `DECAMARK_API_URL` | Server-only API origin, normally local `http://127.0.0.1:8000` |

`/sign-up`, `/verify`, `/sign-in`, `/forgot-password`, and `/reset-password` use Server Actions and six-digit email codes. The local confirmation/recovery email templates must contain `{{ .Token }}`; read the codes in Mailpit at `http://127.0.0.1:54324`. Pending email addresses live in short-lived httpOnly cookies, never URLs. Resends enforce a 60-second cooldown in the action as well as the UI. Supabase remains the rate-limit authority. If a recovery code succeeds but the new password is rejected, retries reuse that verified recovery session. A short-lived httpOnly workflow marker must match the current Supabase-verified user, session ID and pending email; it is cleared when a new recovery starts, the password changes, or the user signs out.

The proxy refreshes cookies and protects `/o` and `/account`; server components and the API client independently verify claims. A signed-in visit to `/` goes to `/o`, which opens the project the person was last in (the `fm-place` cookie), their only project, or their first organization, and says "You are not in a project yet" when there is none. `/account` shows the live profile and memberships, profile editing, account deletion and sign-out. Sign-out and "Not you?" on the invitation and join pages end this browser's session only (`signOut({ scope: "local" })`; Auth's default would also end the same account's session on the phone collector) and clear the `fm-place` cookie. Sign-in uses a validated same-origin `next` path or `/o`.

`src/lib/api/client.ts` is server-only, uses generated endpoint types, validates identity data, attaches the verified session's access token, disables caching, and gives every request its own 15-second timeout. `src/lib/api/workspace.ts` holds the cached reads and `src/lib/api/mutations.ts` one function per write; writes run in authenticated Server Actions that validate their input and then refresh the page. Map package upload and archive download go browser-to-API through `src/lib/api/browser.ts`, to avoid the Vercel and Server Action body limits, so the public API origin and the CORS settings are required.

The service worker only caches the public landing page, icons, and static build assets. It never stores auth pages, account/tenant pages, API results, query strings, cross-origin requests, or RSC responses. The landing shell is network-first, with its current build cache used offline; static assets are cache-first. Installation and asset prewarming apply the same response checks, rejecting redirects, unsuccessful responses, and responses marked private or no-store.

`src/lib/pwa/service-worker.js` is the worker source. `next.config.ts` renders the ignored `public/sw.js` during development startup and production builds, using a fresh UUID for each build. The public `DECAMARK_SERVICE_WORKER_BUILD_ID` process variable keeps that token stable across Next's build workers; it is an internal build value, not a deployment setting. Local builds use the same token as Next's build ID. With Vercel's deployment ID, Next ignores custom build IDs, so the worker retains its independently generated build token. Production startup preserves the generated file. `/sw.js` is served with revalidation headers, and activation removes older DECA Mark public caches and the legacy FieldMaps caches (`fieldmaps-shell-v1` and `fieldmaps-public-*`). The install manifest opens `/o`; `/robots.txt` permits only the exact landing URL and `/privacy*`.

Run `pnpm test:auth` for redirect, response-validation and private-cache regressions, then `pnpm check` and `pnpm build`. With a dev server on port 3002 connected to the local Auth/API stack, run `DECAMARK_AUTH_LOCAL_TEST=1 pnpm test:auth:local` for real signup, verification, recovery and changed-password sign-in through Server Actions. This opt-in test creates a synthetic local account and reads its codes from local Mailpit; it never targets hosted services.

## Technical shape

- Next.js 16 App Router, React 19, TypeScript
- Tailwind v4, with the generated Contour tokens mapped in `@theme inline` so the utilities _are_ the design system
- Geologica and Spline Sans Mono, self-hosted through `next/font`, so chrome never waits on a network
- Lucide icons (`lucide-react`)
- SVG site plans (`SitePlan`, `MapFrame`) drawn from a map package's GeoJSON and the palettes in `contracts/map-palettes.json`; `fflate` reads the package archive in the browser
- Server-filtered observation pages, summary and ZIP exports including the codebook and historical zone geometry
- Progressive Web App manifest and a same-origin offline shell cache

## What this application deliberately does not do

- **Collect observations.** The collector does that, on a device, offline. A browser form beside it would be a second way to enter the same record and a second thing to keep in step.
- **Author the initial ground or ingest imagery.** QGIS supplies the site ground/reference layers. Managers can then edit named Polygon/MultiPolygon zones in server-backed drafts and publish immutable versions through the web editor. See [zone workflow](ZONE-BOUNDARIES.md).
- **Review, exclude or delete records and projects.** Every uploaded observation is in the exports. Deleting projects, organizations, sites and map packages, and resending invitations, are not available yet; each says so where it would be.
- **Promise email delivery without the service.** Addressed invitations can queue transactional email through the backend's Brevo outbox when configured. Link/code sharing remains available; queued is not delivered. See [email setup and evidence](../docs/Brevo-Email.md).
- **Deliver a package to a device.** The web app stores, versions and offers map packages for download. The collector downloads each site's current package itself (D27).
- **Claim a sync path of its own.** Scoped live QGIS access remains a separate provisioning/acceptance task; exports are for analysis, backup and interoperability, and say so.
