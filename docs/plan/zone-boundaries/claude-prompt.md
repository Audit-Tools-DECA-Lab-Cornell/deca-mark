# Claude implementation handoff: zone-boundary web and mobile UI

Copy the text below into the DECA Mark workspace chat with Claude. Use the existing detailed UI plans; task status belongs only in the owning PLAN files.

---

Work in `/Users/praty/Desktop/StudentJob.nosync/field-ops`. Implement zone polygon boundaries one unblocked frontend task at a time. The owner has approved replacing experimental incompatible data across the product. The authoritative contract defines one `/v1` API, one zone-aware archive manifest `format: 1` and one observation fingerprint. Map versions begin at 1 and increment; they are distinct from API or archive versions.

CON-06 aligns specifications and authored cases. DB-19 supplies the current schema baseline; BE-22 implements the current API and regenerates OpenAPI and client declarations. Existing BE-18–20 implementation and evidence describe the previous baseline and do not establish new-contract compliance. Start with unblocked pure geometry/editor tasks WEB-30 and WEB-31; integration tasks wait for their documented BE-22 dependencies. Verify task status and source before relying on any endpoint or field. Do not invent success responses to unblock a screen.

Claude owns WEB-28 through WEB-42 and mobile UI tasks MOB-30 through MOB-32, including the UI collaboration in MOB-29. The mobile data owner owns MOB-28, MOB-33 and MOB-29's geometry, serializer and receipt work. MOB-28's local lifecycle implementation is committed in `a86a1ee`; its real API gate remains pending DB-19/BE-22. Read `mobile/PACKAGE-LIFECYCLE.md` before integrating storage. MOB-33 supplies `SiteVersions`, `Pinned` and `Recovered` read models; agree those interfaces before wiring dependent screens. Do not implement a competing package catalog or session store.

Read only the specifications and source paths relevant to the selected task:

1. Root and component `AGENTS.md` and README, `PRODUCT.md`, `DESIGN.md`, `docs/plan/zone-boundaries/README.md` and `contract.md`.
2. The owning task in `web/PLAN.md` or `mobile/PLAN.md`, and its `ZONE-BOUNDARIES.md` and `ZONE-BOUNDARIES-UI.md`.
3. Relevant backend/database specifications and `docs/plan/zone-boundaries/verification.md`; use generated declarations after BE-22 passes.

## Product behavior

Managers prepare research sites, maps and forms on the web. Observers manually place activity locations on phones/tablets, often offline and in daylight. Standard and Reliability are point events. Inventory describes the whole recorded zone: event geometry is null and the server's display anchor is only a reference, never an observed point. GPS is not a child's location.

The first editor changes zones over imported ground/reference layers. Imagery ingestion, mobile polygon authoring, GPS tracking, form builders and scheduling are out of scope. Preserve Polygon, MultiPolygon and holes without changing coordinates the manager did not edit. Contour tokens live in `contracts/contour.json`; map colors live in `contracts/map-palettes.json`. Every web screen uses real authenticated API data.

An immutable package freezes stable zone UUID/code, version-specific label/geometry and exact form versions. Renaming/reshaping keeps identity; splitting/merging creates new identities. Every observation keeps its recorded package/zone. Analysis never silently reclassifies historical records using current boundaries.

One collection session is one visit to the collect screen. It pins its map throughout that visit. An unfinished observation survives process death with its exact map, zone, point and answers. New visits use the newest verified installed version; publishing or downloading never swaps an active visit's map. Unfinished work is resumed or explicitly discarded before starting competing work. Schema mismatch deliberately resets incompatible data; ordinary same-schema restarts and account changes preserve current work.

## Wire and runtime boundaries

All API paths use `/v1`. Site path/query identifiers are UUIDs. Draft writes use a strong ETag with `If-Match`; publication uses a request ID and expected current package. A missing precondition is 428, stale revision is 412, and competing current package is 409. Preserve unsaved geometry on all conflicts. Draft saves echo submitted geometry; validation returns normalized digests and change classifications against current. Responses expose the promised author names, current/base versions and body ETag. Additional fields in the UI change-request tables remain proposals until explicitly adopted into the canonical contract.

Publication returns `{site_id, draft_id, package, current_package_id, replayed}`. A successful retry returns the original package with `replayed: true` and the live current pointer; it never reactivates that package. The first QGIS upload supplies an explicit null current precondition and a complete source-feature-to-zone-UUID identity map. Every subsequent upload/publication creates the next immutable map version. Published archives are ready when the response returns.

Site discovery returns the explicit current pointer and exact package/zone metadata. Site-filtered package history returns every version and the current pointer. Project members can recover exact older packages and bound form versions, including retired forms. Verify archive digest, zone/manifest agreement and exact form UUIDs before marking a package ready. Inventory binding null means unavailable; never choose a latest form. Removal checks all references, including records, unfinished work and foreground leases. Physical package files may be shared by account grants; follow the data owner's lifecycle interfaces.

The only observation upload uses nested `answers`, exact site/package/zone UUIDs, form version and round context. Point rounds require hand placement, coordinates and strict boolean `first_round`; Inventory omits coordinates and `first_round`. MOB-29 owns serialization and receipt checks. Retry immutable payloads under the same observation ID; acknowledge only after every receipt identity matches. Practice records stay local.

Observation list/detail/summary/export use server filters and recorded labels. The list is paginated; all counts and exports use the same full scope. A page-limited map says which subset is displayed. Dates are half-open aware UTC bounds, observer matching is exact and case-sensitive, and cursor identity includes normalized filters and project. Inventory is a zone reference without an event point.

Export downloads an `application/zip` containing the selected CSV or GeoJSON observation file, `codebook.csv`, `metadata.json`, `forms.json` and `historical-zones.geojson`. Respect the contract's limits and coded `export_scope_too_large`/rate-limit responses. Never export only a loaded page while claiming all matching records. Extra facets, a separate zones-export route and reason enums remain proposals unless the contract adopts them.

## Execution and evidence

Keep the existing UI plans and dependency graph. Finish each task's implementation, acceptance checks, specification review and quality review before its dependent task. Maintain task status only in its owning PLAN and run `pnpm plan:check`. Account/project/site/draft/package scopes belong in cache keys; account changes fence stale requests and clear unauthorized in-memory views.

Use Node 24 and pnpm 10.17.1. Run owning app checks/tests and real local browser/device acceptance appropriate to the task. Mocked responses and successful compilation do not prove persistence, offline retention or server authorization. The current single-path acceptance stack must be built on DB-19/BE-22; previous rehearsal scripts are not proof of that contract. Do not run timing-sensitive database rehearsals concurrently.

Do not read secret/env files. Hosted resets, migrations, deployments, releases and commits require direct authorization. Source changes and disposable local tests are authorized by the implementation plan. Use parallel subagents only with explicit disjoint file ownership and no reverting others. Report concrete changes, executed tests, remaining concerns and the next dependency; distinguish local evidence from hosted, physical-device and QGIS acceptance.
