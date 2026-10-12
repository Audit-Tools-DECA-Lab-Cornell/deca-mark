# DECA Mark web

Next.js App Router management application for DECA Mark. Parent `AGENTS.md` contains product routing and operating rules; this folder's `README.md` describes the sections and the design rules. Root `DESIGN.md` and `PRODUCT.md` hold the design system and the product voice.

- Run app commands from `web/`, or use the product-root `pnpm web:*` aliases.
- Dependencies and lockfile belong to this folder; do not hoist or merge with Expo dependencies.
- Source aliases map `@/*` to `web/src/*`. Checks: `pnpm check`, `pnpm build`, `pnpm test:unit`. Browser tests run on a local stack with `sh scripts/e2e-local.sh` from the repository root, never against hosted services. `pnpm format` applies only to this app.
- Deploy this folder as the web project root. Do not deploy or change hosted settings without authorization.

## Design

- This application and the collector share one design system, Contour. Its tokens live in `contracts/contour.json`. `pnpm tokens` (from the root) generates `src/styles/contour.css`, which `src/app/globals.css` maps to Tailwind utilities. Never edit the generated file: change the contract, run `pnpm tokens`, and keep `pnpm tokens:check` (drift and contrast) passing.
- Take every colour, type style, size, spacing, radius and duration from the tokens, through the generated CSS variables or the Tailwind utilities. Do not hard-code a hex, a font name or a pixel value the tokens already carry. Words are Geologica; IDs, versions, codes and counts are Spline Sans Mono. Icons are Lucide (`lucide-react`) plus the custom two-bar held glyph.
- Day is the default theme. Dusk is a preference, set from the account menu and kept in this browser. Every screen works in both. Map canvases are separate: they take a palette (Day, Night) from `contracts/map-palettes.json`, the same file the collector reads, and never a colour of their own. UI state colours never appear on a map.
- State is a glyph plus a word plus a colour, from the state vocabulary in `contracts/contour.json`. Do not invent a state beside it.
- One magenta action per screen. Ink is for the strong second action and outline for the rest. Selection, focus and navigation use ink.
- Primitives live in `src/components/contour/`, with the same names as the collector's `mobile/src/ui/`. Add a primitive to both apps together and show it in the `/dev/contour` gallery in Day and Dusk.

## Honesty

Everything on the web is live (D30). Every page under `/o/<org>/p/<project>` reads and writes the DECA Mark API for the signed-in person. There are no fixtures, no sample workspace, no Preview data marker and no session-only actions. A lint rule bans imports of `@/fixtures`, `@/data` and `@/lib/preview`. Do not work around it.

- **Say what is not built, once.** A feature with no backend shows `components/shell/NotAvailable.tsx`: "X is not available yet.", one sentence on why, and one on what to do instead. Never a disabled button, a fake button or a flag that pretends. Today that covers saved named views (links replace them), the rounds plan, the zone editor (edit zones in QGIS), record review and exclusion, device readiness, live QGIS database access, deleting projects, organizations, sites or packages, and resending invitations.
- **A failed read is not an empty list.** A read that fails renders `components/shell/LoadFailure.tsx` (sign in again, no access, or try again). "No sites yet" must mean there are no sites. Pages pass the failure down from `settle()`; they never swallow it.
- **Check the role before you read.** Manager-only pages check `projectAbilities(role).manage` or `orgAbilities(role).manage` (`lib/workspace/access.ts`) first, and render the no-access state when it fails. Never call a manager-only endpoint for someone without the role. Hiding a tab is not enough, because people open addresses directly.
- **Say the cap.** The API returns at most the newest 500 observations. Every count, chart, table or export built from a list at that cap says "Based on the newest 500 observations."
- **Say only what the API does.** Archiving a project marks it finished and does not stop uploads. Invitation creation reports whether an email was queued, unavailable, or not requested; queued does not mean delivered. The link and code are still shown once for manual sharing. Dates are in the project's timezone (`lib/time.ts`), not the browser's.
- **Write for researchers.** Readers are field researchers and a professor running a study. Use their words: sites, zones, map packages, forms, rounds, observations, observers, team. Never show: fixture, preview, sample, demo, API, endpoint, server, session, token, payload, 404, null, undefined, UUID, slug (say "web address"), or JSON (say "file", unless naming the .geojson or .json files the person picks). No filler and no exclamation marks. An error says what did not happen ("Nothing was saved.") and why.
- **One primary action per screen.** Pass `variant` explicitly on every `Button`. Secondary actions are `ink` or `outline`.
