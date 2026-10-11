# Web handoff: manager zone boundaries

[Master plan](../docs/plan/zone-boundaries/README.md) · [API contract](../docs/plan/zone-boundaries/contract.md) · [Detailed UI plan](ZONE-BOUNDARIES-UI.md) · Tasks WEB-28 to WEB-42 in [PLAN.md](PLAN.md). Claude owns detailed frontend planning and implementation choices; backend semantics are shared contracts. The detailed interface, state architecture, task split and verification live in [ZONE-BOUNDARIES-UI.md](ZONE-BOUNDARIES-UI.md).

## Inspect before designing

Read local `AGENTS.md`, `README.md`, root `PRODUCT.md`/`DESIGN.md`, `src/features/sites/SiteScreen.tsx`, `features/packages/*`, `components/map/{MapFrame,SitePlan}.tsx`, `lib/{plan,sites/archive}.ts`, `lib/api/{client,workspace,mutations}.ts`, `features/data/*` and `lib/export/*`.

The web uses real API data and SVG site plans. A session-only editor was removed; do not restore it as a production feature. Current data already includes a zone field/filter/export, but it filters the loaded newest 500 and labels from current site zones. No arbitrary basemap editor or current web MapLibre engine exists. Claude should evaluate adapting geographic drawing to `MapFrame` versus using a dedicated map drawing surface; that choice must preserve coordinate fidelity, keyboard operation and the shared palette.

## WEB-28: required manager behavior

A manager opens a site's current package, starts/reopens a server-backed draft, draws/edits named polygons, sees validation, and deliberately publishes a new version. Viewers/observers cannot access mutation routes even by direct URL. Site adoption from legacy packages and unsupported/missing ground need explicit states, not fake controls.

Suggested essentials: add polygon/rectangle, edit vertices, name zone, undo/redo, discard, validation overlays, draft save state and publication confirmation. Holes/MultiPolygon must be displayed and preserved losslessly even if advanced editing tools come later; never convert an unsupported shape to a rectangle. Code/UUID are separate from editable display label. Client-generated new UUIDs remain stable through local undo and retry. Removing a zone affects only the proposed next version.

Draft autosave may debounce but must use `If-Match`, preserve local dirty changes and distinguish saving/saved/failed/conflict. Serializing saves or rejecting stale completions is mandatory; late responses cannot roll back local editor state. On 412/409 keep unsaved geometry available, show current server revision/package, and offer explicit recovery. Do not silently last-write-wins, merge boundaries, activate previews or autosubmit publication on reconnect.

Before publish show base and next version, changed/added/removed zones, validation errors/warnings, and the effect on observers: active offline rounds retain their old version. A successful result invalidates current-site/history/zone metadata but does not rewrite historical observations. Retry a lost publish response with the same request ID. Old success replay after a newer publish must display the returned historical result without claiming it is currently active.

Use the existing authenticated fetch/Server Action patterns for small operations. Draft bodies may exceed Server Action/proxy limits: the backend contract permits 4 MiB draft geometry, so evaluate the existing browser-to-API package route for large writes with ephemeral authentication and proper CORS. Never put tokens in URLs, localStorage or persistent draft files. Validate response schemas at runtime, scope client keys by account/project/site/draft/version, and purge unauthorized in-memory views on account change. No new caching library is mandatory.

## WEB-29: data/map/filter behavior

Default table label is recorded zone from the pinned package. Show map version in detail and as an available table column; exact column placement is Claude's decision. Legacy rows say “Boundary version not recorded” and retain their zone code, never a label fabricated from today's package. Distinguish sites with the same zone code.

Zone selection must filter both map and table through v2 server queries. Filter by stable identity across versions or exact package+zone; communicate which. Keep URL state and browser navigation. Reset pagination when filters change. A map displaying only a page must state that limit; totals/coverage use server summary. Do not equate the visible 500 or visible viewport with all matching observations.

Historical record detail loads its original package geometry. If results mix versions, do not draw a single current boundary and label it historical. Claude can choose a version selector, separate layers or an explicit mixed-version state. Retired zones remain in historical filter choices. Inventory appears as a zone-level record, not an ordinary point at its anchor. A zone with no events can still have an inventory; neither implies the protocol round is complete.

CSV/GeoJSON actions use complete server exports for the same scope, display any size limit, and include map/zone version metadata. Existing client codebook/form labels remain tied to each recorded form version. Summary/report counts must not reclassify old records under current geometry. Broader current-boundary spatial analysis is out of scope.

## Design constraints and evidence

Use Contour tokens and separate map palettes, Day default/Dusk preference, keyboard-accessible vertex controls, touch targets, clear zoom/pan versus edit modes, escape/cancel and screen-reader feedback. Any third-party drawing tool must pass a suitability spike with Polygon/MultiPolygon/holes and coordinate round-trip checks, not merely render an example.

Claude supplies a detailed component/state/accessibility/browser test plan. Test real API-backed create/edit/validate/publish and a two-manager conflict, direct unauthorized URLs, network failure, navigation with unsaved changes, keyboard and touch, historical map detail, >500 matching records and inventory representation. Existing route mock tests are useful but cannot establish persistence. Run web checks/unit tests and local browser acceptance; do not test mutations against hosted research data.
