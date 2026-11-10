# QGIS-first map setup

## Outcome and size

Make the normal route **Add map → Set boundaries → Review and publish**. A manager starts with a QGIS project, supplies its missing source data only when needed, reviews the map, draws any missing site outline and zones, and publishes one usable map version. A saved unfinished setup survives leaving and returning. Separate ground, zones, paths and trees uploads are not prerequisites.

This is a **large, coordinated web/API/database change: 7–10 engineer days (56–80 hours)**, including regression testing and documentation. Two engineers with clear ownership can target **5–7 working days**, excluding release scheduling and waiting for access. The earlier rough 2–5 day estimate did not include the newly confirmed absence of an outline editor or a durable first-map draft lifecycle. The immediate wording/picker correction is about 4–6 hours inside this total; it does not complete the workflow.

This document is the single implementation plan. Its task numbers are execution order, not additional canonical roadmap statuses. Update statuses only in the owning component `PLAN.md` when implementing. This planning deliverable does not implement, migrate, deploy, or verify the feature at runtime.

## Evidence and scope

At planning time, the source allowed optional individual GeoJSON files but required ground and zones for publication. `web/src/features/packages/UploadStep.tsx` also had two project-selection paths: `ProjectImport` performed conversion, while the lower attachment picker merely stored the selected file. Its “Ready” treatment did not establish that a map was imported. `web/src/features/zones/ZonesScreen.tsx` required a first published package, while that first package required zones: the first-map workflow was incomplete.

The existing editor in `web/src/features/zones/editor/ZoneEditor.tsx` edits zones only. `siteBoundary` is an immutable input used for snapping and checks. Existing `zone_drafts` require a base package and form; making these fields nullable throughout that subsystem is not the chosen approach.

The importer supports bounded local vector conversion into WGS84; a `.qgz` is not guaranteed to contain its data. Missing local sources, raster imagery, remote layers, QGIS styling and filtered sources have distinct limitations. A project with only remote imagery cannot currently provide the map needed for drawing. Do not invent geographic coordinates, an outline from the map rectangle, or offline readiness.

| In scope                                                                                                  | Outside this change                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| One understandable entry path, project/source recovery, import review and optional advanced GeoJSON input | General QGIS renderer, raster processing, automatic remote downloads, new basemap SDK |
| Durable manager-only incomplete setup, outline creation, zone creation, validation and safe publication   | Changes to observation semantics, collector package format or broad form editing      |
| First maps and replacement imports, stable zone identities, current-map/history protection                | Rewriting existing packages, silent migration of historical research data             |
| Accessible desktop/tablet/phone layout and language, real local acceptance                                | Site-wide visual redesign or new design system                                        |
| Release checklist and explicit deployment verification gates                                              | Executing hosted changes, commits, branches or pushes without separate authorization  |

Read `PRODUCT.md`, `DESIGN.md`, `web/AGENTS.md`, `web/README.md`, `backend/README.md`, `database/README.md`, `contracts/README.md` and `docs/plan/README.md` before implementation. There is no `supabase/README.md`; use the database README and `supabase/PLAN.md`. Preserve unrelated work. Use Node 24 and pnpm 10.17.1. Do not read `.env`, secret files or deployment configuration to carry out this plan.

## Product flow and exact language

Use the existing Contour shell, typography, tokens, Lucide icons and SVG map. Desktop puts the map beside a compact task panel; narrow screens put the active task above the map and keep its controls reachable without horizontal scrolling. Avoid a stack of ornamental cards, prominent optional uploads, decorative gradients, invented status colours and motion. Keep one magenta primary action per screen, visible ink focus, at least 44px targets and Day/Dusk support. Map Day/Night palettes remain separate from application state colours.

| Location/state                       | Visible language                                                                                                                     | Action and result                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Site has no current map and no setup | “Set up this site’s map” / “Start with a .qgz or .qgs file. If it uses files stored separately, we’ll tell you which ones to add.”   | **Set up map** opens stage 1.                                                                                                         |
| An unfinished setup exists           | “Map setup in progress” / last confirmed save time                                                                                   | **Resume map setup** opens the acknowledged server draft.                                                                             |
| Site has a current map               | “Current map: version N”                                                                                                             | **Upload a new version** starts/reopens setup; current map stays available.                                                           |
| Stage 1, Add map                     | “Choose QGIS project” / “You can also choose a ZIP containing the project and its data files. Up to 64 files, 16 MB total.”          | A single picker/drop target starts reading automatically. Show “Reading project…”; filename alone never means imported.               |
| Missing source                       | “This project uses ‘trees.gpkg’, which was not included.” / “Add this file, or choose a ZIP containing the project and its data.”    | **Add missing files** uses the same intake, retains existing files and retries. List actual missing names.                            |
| Imported usable vectors              | “Map read. Review the layers before continuing.”                                                                                     | Source review assigns compatible roles or explicitly leaves layers out; **Continue to boundaries** saves before navigation.           |
| No usable geometry                   | “We could not read any map features from this project.” / “Add the missing data files, or export the map layers as GeoJSON in QGIS.” | Stay in Add map. Explain identified unsupported sources; no blank canvas at an invented location.                                     |
| Stage 2, missing outline             | “Draw the site outline” / “Mark the outside edge of the site. You’ll draw the observation zones next.”                               | **Draw site outline**, with visible finish/cancel/undo controls.                                                                      |
| Stage 2, missing zones               | “No zones in this project. Draw them here.” / “Zones divide the site into areas for observations.”                                   | **Draw a zone**; require a name and unique code before review, not before saving unfinished work.                                     |
| Imported outline/zones               | “Review the site outline” / “Review the imported zones”                                                                              | Confirm or edit existing geometry; no redundant drawing.                                                                              |
| Confirmed partial save               | “Draft saved. Observers cannot use it yet.”                                                                                          | **Save and leave** waits for acknowledgement, then returns to the site.                                                               |
| In flight / not saved                | “Saving…” / “Changes not yet saved.”                                                                                                 | Keep editor and edits present. Never imply persistence before acknowledgement.                                                        |
| Unconfirmed write                    | “We could not confirm the save. Keep this page open while we check.”                                                                 | Read back and compare the submitted revision/content; offer **Try again** only after resolution.                                      |
| Known refused write                  | “Your changes were not saved. [Specific reason].”                                                                                    | Explain sign-in/access/validation recovery without discarding local work.                                                             |
| Conflicting change                   | “Someone changed this map setup. Your changes are still here.”                                                                       | Open saved version for comparison, download unsaved work, then explicitly choose which version to keep.                               |
| Stage 3                              | “Review and publish” / “Choose the published form observers will use with this map.”                                                 | Summarize outline, zone count/identities, included/left-out layers and warnings; **Publish map** only for a saved validated revision. |
| Missing published form               | “Publish an observation form before publishing this map.”                                                                            | **Open forms**; preserve setup and provide return navigation.                                                                         |
| Publish complete                     | “Map version N published.” / “Observers can download this version in the app.”                                                       | **View map**. Do not claim it has reached any device.                                                                                 |
| Competing publication                | “A newer map was published. Your setup is still saved.”                                                                              | Compare with current map; do not overwrite/rebase automatically.                                                                      |

The step labels are navigation, not a decorative progress percentage. Back returns to retained data. Clicking a later unavailable step explains the remaining task beside that step. A direct step URL is checked against server state and returns to the first incomplete prerequisite with a reason. Import errors remain beside the picker; geometry errors name and focus the affected outline/zone; publication errors stay on review.

“Site outline” is the manager-facing term for the enclosing polygon; other ground features remain reference data. “Boundaries” encompasses the outline and zones. Advanced **Use separate GeoJSON files** is a secondary disclosure below project intake, with every optional field labelled optional. Existing valid GeoJSON-only imports remain supported and enter the same review/setup flow. Do not describe a QGIS project as a ready “map package” before publication.

### Cognitive walkthrough: Janet on a first visit

This is a **source-based predicted walkthrough**, not a claimed novice usability test. The current flow fails discoverability because the real importer and attachment picker compete, fails action interpretation because ground/zones appear as prerequisites, and fails feedback because an attached file can look Ready without converted content. A first site also has no actionable route to draw its required boundaries.

| Atomic action      | Q1: Will she form the right goal?       | Q2: Will she notice the action?        | Q3: Will she link action to goal?                    | Q4: Will she recognize progress?                     |
| ------------------ | --------------------------------------- | -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Start setup        | Empty state names missing map           | One Set up map action                  | Label uses her site's map                            | Add map heading appears                              |
| Choose project     | Helper names QGZ/QGS                    | One visible picker                     | No four-layer prerequisite                           | Reading then reviewed result                         |
| Add missing source | Actual missing filename explains need   | Add missing files beside issue         | Names match the project dependency                   | Missing issue clears or explains next problem        |
| Assign source role | Preview identifies selected content     | Role selector beside source name       | Friendly role descriptions and geometry restrictions | Included content highlighted; unresolved count falls |
| Draw outline       | Task names outside edge                 | Draw site outline button               | Hint distinguishes outline from zones                | Visible in-progress points, undo available           |
| Finish outline     | Hint explains closed shape              | Finish outline control remains visible | Action closes this shape                             | Outline shown, next zone task appears                |
| Draw zone          | Missing zones is explained as next work | Draw a zone button                     | Zone means observation area                          | Polygon feedback inside outline                      |
| Finish/name zone   | Name/code purpose is stated             | Finish zone then labelled fields       | Fields label the new area                            | Named zone row and validation result                 |
| Leave setup        | Saved/unconfirmed state is explicit     | Save and leave action                  | Waits until work is actually stored                  | Site shows Resume map setup                          |
| Resume setup       | Site names unfinished work              | Resume map setup in all entry points   | Returns to same draft                                | Restored map and confirmed save time                 |
| Choose form        | Review explains observer form           | Labelled published-form selector       | Form binds to this map                               | Review summary names selected version                |
| Publish            | Review names release to observers       | One Publish map action                 | Label expresses exact effect                         | Published version plus View map                      |

Run this walkthrough as a first-time user without developer terminology. Record each failed inference and fix the interface rather than adding a long tutorial. An optional one-sentence hint may explain a drawing action; essential instructions must not live only in a tooltip.

Low-fidelity layout (structure only; existing Contour components/tokens determine appearance):

```text
Desktop                              Narrow screen
Site name / Map setup                Site name / Map setup
Add map → Boundaries → Review        Add map → Boundaries → Review
┌────────────────┬───────────────┐    Current task + saved state
│ Map preview    │ Current task  │    Current task controls
│ selected layer │ Saved state   │    ┌─────────────────────────┐
│ and geometry   │ Controls      │    │ Map + drawing controls  │
│                │ Next action  │    └─────────────────────────┘
└────────────────┴───────────────┘    Back          Primary action
```

## Architecture decisions

### Separate setup aggregate; unchanged published contracts

Add a manager-only `fieldmaps.map_setups` aggregate and private `map_setup_sources` storage through a **forward migration**, not baseline edits. One active setup per site is enforced with a partial unique index. Managers collaborate on the same active setup, with author/timestamp attribution and revision conflicts. Existing zone drafts may coexist; publication uses the same site lock and expected-current check, so the first successful publication wins and the other draft remains available for explicit reconciliation.

The aggregate records site/project, state (`draft`, `published`, `discarded`), revision, creator/editor timestamps, expected current package (nullable only for the first map), import generation, server-owned normalized layer data and import issues, stable source-layer identifiers, reviewed role assignments/exclusions, optional outline, zones, selected published forms, change note, confirmed source omissions and publication receipt. Zone IDs are allocated once and retained across saves/retries. Drafts allow no outline, zero zones and no selected form; published packages still require valid outline, at least one zone and a published play form.

Store the selected source bundle privately to allow **Add missing files after reload**. Apply the existing combined 16 MiB / 64-file input limits, 64 MiB/256-member/depth-2 expansion limits and existing importer layer/feature/time/concurrency bounds. Preserve `project_worker.bounded_output`’s 16 MiB converted-result cap. Cap the full normalized editable setup document at 24 MiB UTF-8, including duplicated adopted geometry; this is a draft storage ceiling, not a relaxation of importer or published limits. Reject excess as a named limit with the previous acknowledged draft intact. The canonical project attachment remains capped at 8 MiB and final archive at 16 MiB; surface these constraints at import/review rather than discovering the project attachment cap after drawing.

Successful discard explicitly removes source blobs, normalized imported content and editable geometry while retaining audit metadata; confirmation says the saved setup will be removed and current published map stays. Successful publication releases the source bundle and heavy normalized/derived draft data only after the immutable package/archive and receipt commit, retaining immutable request hash, package result, published receipt and audit summary for replay. No automatic time-based expiry, unbounded version copies or public bucket. Account deletion and project/site ownership rules must cover the new rows; no private source data in logs, browser service-worker cache or observer endpoints. Normal GET responses never include original source bytes; the manager sees source names/sizes and the normalized editable map only.

### Endpoints, identity and concurrency

All new paths share `/v1/projects/{project_id}/sites/{site_id}/map-setups`; names below are proposed. Register a dedicated router using the existing manager context, transaction and request-error patterns. Large import/source bodies go browser-to-API using `web/src/lib/api/browser.ts`, not through Server Actions. Small mutations may follow the existing authenticated action pattern.

| Method/path suffix                            | Request and semantics                                                                                                                         | Result                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /` and `GET /{setup_id}`                 | Manager-only active summary / full acknowledged editable state; terminal summary has no removed blobs                                         | Strong `ETag: "map-setup:<id>:<revision>"`; failed reads never look empty                                                                                                          |
| `POST /import`                                | `request_id`, explicit `expected_current_package_id`, input files; supports project mode or explicit GeoJSON mode                             | Convert outside long DB transaction; then atomically persist usable/partial result and sources. 201 new, 200 exact replay; 409 existing active setup with authorized resume target |
| `POST /{id}/sources`                          | `If-Match`, `request_id`, additions/replacements by normalized relative path; reject ambiguous duplicates                                     | Rerun from retained bundle; failed conversion retains acknowledged setup. Successful changed import increments generation/revision and clears review approval                      |
| `PUT /{id}`                                   | `If-Match`, complete editable snapshot referencing current import generation; server-owned source/normalized data cannot be changed by client | Save structurally safe incomplete geometry, assignments, names/codes, forms and notes; return incremented revision and ETag                                                        |
| `POST /{id}/validate`, `/publish`, `/discard` | All require `If-Match`; publish also immutable `request_id` and explicit expected current                                                     | Revision-bound validation; exactly-once atomic publication; explicit terminal discard                                                                                              |

Use 428 for absent preconditions, 412 for stale revision, 409 for current-package/active-setup/idempotency conflicts, 422 for semantic invalidity, and existing appropriate body-limit/resource-busy errors. Manager access is checked before reading setup/source/receipt data and again in final write transactions. Other projects and roles cannot infer draft contents or resume IDs. Check permissions again after long conversion work.

The create/source idempotency fingerprint covers the exact normalized request, not just filenames. Look up successful requests before conversion. Concurrent duplicate conversion may occur within existing worker limits but commits only once under lock; a different body using the same key fails. Use a separate setup-operation receipt table; do not put a setup ID into `zone_publications.draft_id`, which references `zone_drafts`.

Source replacement is a staged operation. Show the candidate and require explicit confirmation before replacing the acknowledged import. Preserve manually drawn geometry and already adopted geometry as snapshots; flag them “kept from the earlier import” and require reconfirmation. Clear source-role assignments for changed/removed source IDs, preserve assignments for identical content hashes, and never silently replace an edited outline or zone. The preview is bounded and expires with the current page; unconfirmed candidates are not described as saved. The sources endpoint uses `preview=true` for conversion-only, with no persistent operation receipt. It returns a deterministic candidate hash covering base revision/import generation, exact retained-plus-added source bytes and normalized output. Confirmation sends `preview=false`, a new immutable commit request ID, that hash, the same additions and current ETag. Recompute the candidate and compare the hash before storing; different conversion output or a stale base requires a fresh preview. The commit fingerprint excludes the operational preview flag, includes candidate hash/base/files, and is checked only against committed-source operation receipts. A preview can therefore never collide with its confirmation or silently commit a different candidate.

The save queue has one mutation in flight, a 1.5-second debounce and a 10-second maximum wait, following existing zone patterns. Queue snapshots are immutable, account-fenced and sequence-checked. On an uncertain result, GET and compare exact submitted content/revision; retry a publication with its original request ID. Pending local edits are not promised to survive a browser crash. Warn on every leaving path; offer downloadable unsaved geometry/work when a conflict or outage prevents save. Reload restores the last acknowledged server draft, not an invented optimistic state.

### Geometry, map review and publication

Assign source content using stable importer-generated IDs, not filenames or display-name substring collisions. Add QGIS layer IDs to successful layer results **and issues**; scope identity by project fingerprint/import generation so another project reusing an ID cannot inherit assignments. Track immutable source-feature keys in setup metadata using canonical feature content hashes and duplicate-occurrence indexes; do not rely on top-level GeoJSON `id`, which the existing conversion model does not retain. These keys are review identity, separate from durable zone UUIDs. Reordering source layers cannot change their identities. Identical-content duplicates remain separately addressable; no original property is used as an implicit zone UUID.

| Role            | Allowed geometry, matching existing web package display rules | Cardinality/disposition                                                     |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Site outline    | Polygon, MultiPolygon                                         | Exactly one selected feature or one drawn geometry at publish               |
| Ground features | Polygon, MultiPolygon                                         | Zero or more reference features; exclude the chosen outline from this group |
| Zones           | Polygon, MultiPolygon                                         | One or more reviewed zones at publish; zero allowed in draft                |
| Paths           | LineString, MultiLineString, Polygon, MultiPolygon            | Zero or more reference features                                             |
| Trees           | Point, MultiPoint, Polygon, MultiPolygon                      | Zero or more reference features                                             |

A source defaults to one suggested role, but outline selection extracts **one feature**, not the whole source. The remaining features get a visible “Remaining features” group requiring Ground features, Zones, another compatible role or explicit Leave out. Mixed geometry sources split into visible homogeneous geometry groups for review; each feature belongs to exactly one disposition. No incompatible feature is silently removed. Multiple compatible reference sources merge into canonical ground/paths/trees layers with properties preserved. Zone adoption requires explicit feature identity/name/code review; do not automatically promote every polygon to a zone. Unknown/unmatched content remains unresolved until assigned or explicitly excluded. Existing accepted polygon paths/trees stay compatible.

Derive and freeze the initial drawing frame from usable imported WGS84 feature extents. Do not recenter/recompute while editing. Handle degenerate point/line bounds with the existing framing padding; reject nonfinite/out-of-range coordinates. Dateline-crossing content is unsupported: name the source and require an export within the supported geographic span, rather than drawing the wrong hemisphere. Disconnected broad extents show all included data initially and let the manager explicitly zoom to a source; never drop distant features to manufacture a local frame. If no usable feature exists, stop at import recovery. A recognized project with missing/unsupported sources may still save a recovery-only setup and its bounded bundle, but cannot enter boundaries; malformed/unrecognized archives do not replace any saved setup. Read imported outline/zones as candidates; require manager confirmation. Validate full geometry server-side using existing zone validators, including bounds, ring validity, containment, codes, overlap policy and supported geometry types. A shrunk outline can be saved with issues; it cannot publish while zones are invalid. Never clip or repair boundaries silently.

Extend low-level SVG drawing, handles, history, snapping and coordinate table components for an explicit **outline** edit target. Keep outline state separate from `DraftZone[]`; no fake zone ID for the outline and no changes to historical zone identities. Provide keyboard creation via coordinate-entry rows (longitude and latitude), add/remove vertex, close shape, undo and clear labels; reuse `PointsTable` patterns but verify creation as well as editing. Support pointer/touch drawing with equivalent visible controls and reduced-motion behavior. Complete keyboard-only first-map setup is acceptance criteria, not an optional audit note.

On replacement imports, default to keeping existing current zone identities/geometry and outline in the editable setup. Show imported candidates separately and let the manager replace/merge deliberately. Matching codes suggest identity reuse only when unambiguous and same-site; manager confirms the mapping. Renamed/reordered zones retain the selected UUID. Omission/removal is explicit; do not silently restore excluded old zones or assign new identities to renamed zones. Review lists retained, new, changed and removed zones and warns that historical observations remain attached to their recorded version.

Publication assembles the unchanged canonical `PackageRequest`: ground includes exactly one site-outline feature with `kind=site` plus ground reference features; zones come from the reviewed draft; paths/trees remain optional; project metadata and confirmed omissions follow existing archive rules. Reuse `ImportJob`, archive worker, validators and `finalize_zone_package`. A new setup-specific SQL wrapper takes **site lock → setup lock**, checks receipt replay before terminal/revision/current rejection, verifies the reviewed revision and exact request, invokes canonical finalization, and marks setup published/writes its receipt **in the same transaction**. Keep setup receipt identity separate while using a deterministic canonical package-import request ID. Never mark setup published in a later best-effort write. First publish expects null current; updates expect the pinned package. Review approval is invalidated by every edit/import/form/current change.

## Execution and ownership

Apply tests first to the actual missing contracts and user paths; avoid tests that simply duplicate component implementation. Each task includes implementation and tests. The only intended parallel work is after contract decisions are frozen; no two workers own the same file. Workers must preserve each other’s changes. Generated OpenAPI/types have one integration owner. A five-wave limit is deliberate for the small team and shared publication/editor dependencies; inventing 5–8 tasks in every wave would increase merge risk.

| Task                                                   | Wave | Owner/scope                                                     | Depends on              | Estimated hours |
| ------------------------------------------------------ | ---- | --------------------------------------------------------------- | ----------------------- | --------------- |
| T1 Contract and regression fixtures                    | 1    | Integration: schemas, fixture contracts, interface decisions    | —                       | 4–6             |
| T2 Private setup storage and SQL lifecycle             | 2    | Database: forward migration and SQL tests                       | T1                      | 8–10            |
| T3 Import/persistence/publication API                  | 3    | Backend: new setup modules, importer IDs, service integration   | T2                      | 12–16           |
| T4 Outline-capable editor and accessible controls      | 2–3  | Web editor: reusable geometry components and setup editor model | T1                      | 10–14           |
| T5 Project intake, source review and site navigation   | 2–3  | Web workflow: setup shell/picker/copy/routes                    | T1; API wiring after T3 | 8–12            |
| T6 Save/review/publish integration and identity safety | 4    | Integration with backend/editor owners assisting                | T3,T4,T5                | 6–10            |
| T7 Local acceptance, docs and release handoff          | 5    | QA/integration: regression evidence and owning docs             | T6                      | 8–12            |

Critical path: T1 → T2 → T3 → T6 → T7. T4 and T5 can proceed against the frozen contract using test-only fixtures; production screens must use live authorized API data. Hours total 56–80; fix time for issues found is included, external access/deployment waiting is not.

## TODOs

- [x] T1 — Freeze the setup contract and add failing first-map fixtures

**Owner/dependency:** integration owner, wave 1, no dependency; blocks T2/T4/T5. Own proposed `backend/src/fieldmaps_api/map_setup_schemas.py`, schema registration changes and test fixture interfaces. Agree these interfaces before parallel workers begin; the integration owner alone regenerates `contracts/openapi.json` and both app declarations when T3 endpoints exist.

**Work:** codify the aggregate/API decisions above, separate draft-safe geometry from publish-safe geometry, stable source identities, issue codes, limits and role matrix. Add test-only QGIS fixtures independent of existing “fresh site” helpers: `outline-no-zones.qgz`, `references-only.qgz`, `complete.qgz`, `missing-source.qgz`, `remote-only.qgz`, duplicate-name/reordered-layer projects and a GeoJSON-only route. Use a synthetic nonzero WGS84 location and explicit known polygons/points; never reuse an existing first-package fixture as proof of first-map setup.

**References:** `backend/src/fieldmaps_api/zone_draft_schemas.py`, `zone_import_schemas.py`, `zone_response_schemas.py`; `domain/project_import.py`; `web/e2e/packages.spec.ts`; `web/e2e/support/zones.ts`; `contracts/README.md`. New test paths proposed: `backend/tests/test_map_setups.py`, `web/e2e/support/map-setup.ts`, `web/e2e/map-setup.spec.ts`, `web/tests/unit/map-setup.test.mjs`.

**Acceptance:** failing tests demonstrate a saveable setup with null outline, zero zones and null form, and reject publication of it; fixtures really omit the named geometry; API compatibility assertions preserve legacy PackageRequest/Publication and collector archive schema. Record expected RED results before implementation.

| QA      | Steps and expected result                                                                                                                                                                 | Evidence                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Happy   | Inspect generated fixture contents and run importer against outline-no-zones and references-only; usable vectors convert, absent geometry is truly absent, no prepublished package exists | `evidence/t1-fixtures.txt`        |
| Failure | Parse malformed coordinates, oversized input and duplicate source display names; bounds errors are explicit and source IDs remain distinct                                                | `evidence/t1-contract-errors.txt` |

**Commit:** none without explicit authorization; keep one coherent reviewable diff.

- [x] T2 — Add private persistent setup and atomic SQL lifecycle

**Owner/dependency:** database owner, wave 2, depends T1; blocks T3. Own a new timestamped migration under `supabase/migrations/`, proposed `database/tests/map-setups.sql`, `database/tests/map-setup-publication.sql` and SQL test-runner registration. Do not edit the baseline migration.

**Work:** add aggregate/source/operation-receipt tables, active-site uniqueness, role-scoped policies/functions, revision checks, retention cleanup and finalization wrapper. Use site→setup lock order consistently. Keep published-package constraints and existing zone publication enum/FK intact. Test receipt replay before stale/terminal checks, expected-null first publish, setup/source/save/publish races and rollback of every failed finalization. Cover account deletion and membership loss using existing product cleanup semantics without deleting historical attribution.

**References:** `supabase/migrations/20261012120000_current_baseline.sql` functions `finalize_zone_package`, `zone_import_input`, `zone_validation`; `database/tests/zone-first-upload.sql`, `zone-publication.sql`, `zone-concurrency.mjs`, `account-deletion-recovery.sql`; `database/README.md`.

**Acceptance:** `pnpm db:test ZONE_REHEARSAL=1` passes including new registered tests on disposable local PostGIS. Observer/cross-project access is denied; incomplete setup never changes `current_package_id` or collector reads; one active setup is enforced; archive insertion/current update/setup receipt transition are one transaction.

| QA      | Steps and expected result                                                                                                                                                                                                                                        | Evidence                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Happy   | Create an empty-site setup, persist no outline/zones/form, reload, add valid geometry/form, publish, replay original request: one v1 archive and same receipt; source and heavy import data cleared only after commit                                            | `evidence/t2-lifecycle.txt`    |
| Failure | Run concurrent source update/save/publish; publish two independent workflows against null/current v1; inject archive/finalization failure: exactly one winner, stale work retained, no deadlock/partial publication; forbidden caller cannot inspect setup blobs | `evidence/t2-races-access.txt` |

**Commit:** none without explicit authorization.

- [x] T3 — Implement import recovery, durable API and publication assembly

**Owner/dependency:** backend owner, wave 3, depends T2; blocks T6. Own proposed `routers/map_setups.py`, `services/map_setups.py`, `repositories/map_setups.py`, `queries/map_setups.py`; importer result additions and integration with `main.py`. Integration owner handles shared generated declarations after endpoint completion.

**Work:** implement the specified endpoints and source candidate preview/confirmed replacement, carry stable QGIS layer IDs through successful layers and issues, validate submitted source references and sanitize bounded paths. Persist only after manager recheck. Compile reviewed roles/geometry/identity map into the existing publication job. Add revision-bound preflight including project/archive limits and form/current checks; finalization rechecks all authoritative facts. Handle online-basemap consent by stable source ID and translate into the unchanged legacy deduplicated-name field only after all same-name sources are explicitly acknowledged. Keep raw sources out of normal reads; expose only filenames, sizes and normalized vectors needed for review.

**References:** `services/project_import.py`, `domain/project_import.py`, `domain/project_worker.py`, `domain/project_files.py`, `services/zone_publication.py`, `domain/zone_archive.py`, `domain/zone_archive_jobs.py`, `routers/zones.py`, `repositories/zones.py`, `queries/zones.py`; `backend/tests/test_project_import.py`, `test_zone_api_publication.py`, `test_bound_uploads.py`, `test_mobile_package_api.py`.

**Acceptance:** `pnpm backend:test ZONE_API_REHEARSAL=1` and generated contract checks pass. Save/load works before form selection; source retries after reload succeed from retained bundle; loss of access during conversion denies persistence. Duplicate request with identical bytes replays; changed bytes fail. Source preview never mutates an acknowledged draft. Final archive stays within existing limits and format.

| QA      | Steps and expected result                                                                                                                                                                                                                                                   | Evidence                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Happy   | Import missing-source fixture with one usable layer, reload, add its named GeoPackage, confirm candidate, save outline/zones, validate and publish; GET reflects each acknowledged revision and package contains expected features                                          | `evidence/t3-import-publish.txt` |
| Failure | Test missing sources with zero usable geometry, malformed ZIP/CRS, worker timeout/busy, 16MiB output/24MiB draft/8MiB project/16MiB final archive limits, lost publish reply and revoked manager role: actionable typed failure, no draft/current loss or duplicate package | `evidence/t3-failure-matrix.txt` |

**Commit:** none without explicit authorization.

- [x] T4 — Add outline editing with keyboard and touch parity

**Owner/dependency:** web editor owner, waves 2–3, depends T1; blocks T6. Own reusable changes under `web/src/features/zones/editor/` and proposed `web/src/features/map-setup/BoundaryEditor.tsx`, geometry state/history modules. Coordinate exported interface with T5; do not alter T5 shell/routes.

**Work:** extract reusable drawing geometry without weakening the published-zone editor; add separate outline edit target, imported-candidate confirmation, stable frame, outline→zone task sequence and shared map reference rendering. Provide keyboard coordinate-based polygon creation, editing, closing and deletion with explicit lon/lat labels, plus touch drawing controls. Preserve undo/redo/selection and existing zone identity properties. Draft saves may include invalid/incomplete work, while visible checks explain publication blockers. A role geometry mismatch never silently drops individual features.

**References:** `ZoneEditor.tsx`, `DrawLayer.tsx`, `Handles.tsx`, `PointsTable.tsx`, `state.ts`, `history.ts`, `checks.ts`, `projection.ts` in `web/src/features/zones/editor/`; `web/src/lib/plan.ts` functions `fitFrame`, `toPlan`, `fromPlan`; `web/e2e/zones-editor.spec.ts`; `DESIGN.md` Maps/accessibility sections.

**Acceptance:** editor unit checks and existing zone editor browser scenarios pass. From references-only import, draw one valid outline and zone using keyboard only and again with touch; points retain expected geography, frame stays stable, outline is never serialized as a zone. Invalid containment prevents publication, not recovery editing or partial save. Before T3/T6 integration, exercise new editor behavior in a test-only component harness with serialized snapshot round trips; this proves geometry interaction, not live persistence. The reload/acknowledged-save scenario below is rerun against the actual API in T6/T7 before feature acceptance.

| QA      | Steps and expected result                                                                                                                                                                                                        | Evidence                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Happy   | On reference-only map, create outline by coordinate rows, create labelled zone, undo/redo a vertex and reload after acknowledged save; repeat pointer workflow at 390px: same geometry and identity persist                      | `evidence/t4-outline-zone.webm`, `evidence/t4-keyboard.txt`          |
| Failure | Draw bow-tie, shrink outline outside zone, use point-only extent and invalid/dateline-spanning input: issues focus correct object, no invented rectangle/coordinate, no silent clipping; long labels and 200% zoom remain usable | `evidence/t4-geometry-errors.png`, `evidence/t4-geometry-errors.txt` |

**Commit:** none without explicit authorization.

- [x] T5 — Replace confusing upload paths with clear setup navigation

**Owner/dependency:** web workflow owner, waves 2–3, depends T1; backend wiring waits T3; blocks T6. Own setup shell, intake/source-role review, route pages and Sites/Site/Zones entry states. Proposed route: `…/sites/[site]/map-setup/[setup]/[step]`, with `step` constrained to `add-map`, `boundaries`, `review`. The entry route `…/map-setup/new/add-map` reads the active summary: redirect to the existing setup if present, otherwise show the unpersisted file picker. On successful POST import, replace the URL with the returned setup ID; “new” is a reserved route segment, never a database identifier. No empty-draft creation endpoint is needed. Use existing packages route for history and deliberate advanced legacy input.

**Work:** implement the exact product flow/copy above. Replace the attachment-only Ready path; single intake auto-reads and names missing dependencies. Show source assignments beside map selection/highlight, friendly Ground features explanation, source exclusions and supported/unsupported facts. Missing zones is a normal next step, not an import failure. Form selection belongs only to review. Add Resume map setup and clear current-map continuity in all entry points; retain deep-link role guards and failed-read states. Ordinary read/render paths never leak setup/source data to observers.

**References:** `web/src/features/packages/UploadStep.tsx`, `ProjectImport.tsx`, `project-import.ts`; `web/src/features/sites/SitesScreen.tsx`, `SiteScreen.tsx`; `web/src/features/zones/ZonesScreen.tsx`; `web/src/lib/api/browser.ts`, `lib/workspace/access.ts`; routes under `web/src/app/(app)/o/[org]/p/[project]/sites/`; `web/AGENTS.md`, `PRODUCT.md`, `DESIGN.md`.

**Acceptance:** one project selection surface; no required ground/zones/paths/trees upload grid on the normal route; partial form-free setup is resumable; all exact states use existing Contour primitives, token colours and visible focus. Before backend is available use fixtures only in tests; live screens must not fake persistence or successful imports. Task-local completion covers component/state/copy/role-guard tests against the frozen contract; the genuine server resume and read-failure scenarios below run after T3/T6 integration and must pass again in T7.

| QA      | Steps and expected result                                                                                                                                                                                                    | Evidence                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Happy   | Open a truly empty site, select outline-no-zones fixture, review roles, follow missing-zone next step, leave/reopen via Sites then Zones; each entry resumes the same setup and shows acknowledged saved state               | `evidence/t5-novice-flow.webm`                                   |
| Failure | Pick missing-source/remote-only fixtures, an oversized file and mixed incompatible layer; show actual recovery and no false Ready; open setup URL as observer and fail a manager read: no private data, no false empty state | `evidence/t5-intake-access.png`, `evidence/t5-intake-access.txt` |

**Commit:** none without explicit authorization.

- [x] T6 — Integrate safe saves, reviewed publication and map replacement

**Owner/dependency:** integration owner, wave 4, depends T3/T4/T5. Own proposed setup save queue/actions/review modules and API binding; coordinate edits to shared shell with T5 owner. Regenerate contracts and both apps’ declarations once integrated.

**Work:** wire the acknowledged server draft into all steps; save-before-navigation/review, leave guard, uncertain-outcome readback, explicit conflict reconciliation and account fencing. Handle current-map replacement with intentional outline/zone reuse and identity review. Preserve manually edited shapes on reimport; stable generation/source identities prevent accidental cross-project association. Publication captures one reviewed revision/ETag/request ID and never obtains a newer ETag silently. A source/form/geometry/current-map change clears review confirmation.

**References:** `web/src/features/zones/editor/save-queue.ts`, `useDraftSaving.ts`, `conflict.ts`; `web/src/features/zones/DraftEditor.tsx`; `web/src/components/shell/useLeaveGuard.ts`; `web/src/features/forms/lost-reply.ts`; `web/src/lib/action-rejection.ts`; `web/e2e/zones-network.spec.ts`, `zones-conflict.spec.ts`, `zones-account.spec.ts`, `zones-publish.spec.ts`, `packages-identity.spec.ts`.

**Acceptance:** no rejected action unmounts/losses work; confirmed saved state survives reload; pending work has honest leave warning; two managers cannot silently overwrite. One review publishes once even after a lost response. Existing v1 geometry/archive hash/current pointer stay unchanged until accepted v2 publication, and v1 observations retain v1 bindings.

| QA      | Steps and expected result                                                                                                                                                                                                                                                                                     | Evidence                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Happy   | Complete first setup, save/reload, publish/retry same request; then create replacement with renamed zone retaining UUID and publish v2: one version each, stable identities and original v1 hash                                                                                                              | `evidence/t6-publication-identity.txt` |
| Failure | Offline before/after save acknowledgement; drop publish response after commit; edit in second tab; publish existing zone draft while setup review open; switch account; replace project after drawing: local work preserved/fenced, review invalidated, explicit conflict/retry, no silent geometry overwrite | `evidence/t6-recovery-conflict.zip`    |

**Commit:** none without explicit authorization.

- [x] T7 — Complete observed acceptance, documentation and release handoff

**Owner/dependency:** QA/integration owner, wave 5, depends T6. Own final evidence index, affected documentation and canonical component roadmap updates; no production mutation. Build on the scenarios in the final verification section and run tests once more only when fixes/new evidence justify it.

**Work:** run automated suites and the cognitive walkthrough and end-to-end matrices in this plan on the local production build; manually inspect responsive/focus/copy states. Verify collector installation and historical bindings. Update `docs/QGIS-Project-Import.md`, `web/README.md`, `backend/README.md`, `database/README.md`, affected `web/AGENTS.md` honesty wording and owning component plans to match implemented facts; remove stale assertions that first-map boundaries must be authored in QGIS. Do not claim deployed/device acceptance without evidence.

**References:** `scripts/e2e-local.sh`, `web/playwright.config.ts`, `database/mobile-package-rehearsal.sh`, `mobile/src/packages/hosted/installation.test.ts`, `mobile/src/packages/zone-read-models.test.ts`, `mobile/src/session/package-recovery.test.ts`, `mobile/src/packages/hosted/cache-retention.test.ts`, `docs/plan/README.md`.

**Acceptance:** all required local gates pass; independent reviewer agrees no plan requirement/history guarantee was missed; docs reflect tested limits; release handoff names actual pending deployed/physical-device checks. `pnpm plan:check` validates canonical roadmap consistency, not correctness of this standalone plan; independent review covers this plan.

| QA      | Steps and expected result                                                                                                                                                                                                                                 | Evidence                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Happy   | Run local production-build fixture matrix, keyboard/touch walkthrough, first-package install/restart and v1→v2 bound observation scenarios; inspect Day/Dusk screenshots and actual archive manifests                                                     | `evidence/t7-acceptance.md`          |
| Failure | Attempt forbidden-role resume, no-geography import, offline save, competing publication and wrong API capability; honest recovery with no false success/current mutation; verify documentation does not promise unsupported raster/styling/device arrival | `evidence/t7-negative-acceptance.md` |

**Commit:** none without explicit authorization.

### End-to-end acceptance matrix

| Fixture/scenario                | Agent actions                                                                                                            | Binary expected outcome                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Outline, no zones               | Empty site → choose QGZ → confirm outline → draw Zone A/code A → save/leave/reload → select published form → publish     | No separate exports requested; one v1; correct outline/zone survive reload/install                                        |
| Reference features only         | Empty site → choose paths/trees QGZ → assign references → draw outline then Zone A → publish                             | Both missing geometries are authored in app; original included reference features preserved                               |
| Complete imported map           | Choose QGZ with outline+zones → confirm identities → review/publish                                                      | No redundant drawing; imported geometry and agreed UUIDs preserved                                                        |
| Missing sources / no usable map | Add project referencing named absent data, then add file after reload; separately choose remote-only project             | Partial useful draft resumes; source can recover; zero-map case cannot enter blind drawing or claim offline-ready         |
| Replacement/concurrency/failure | Retain v1, draft v2, edit in two tabs, reimport after manual drawing, lose save/publish replies, sign out/switch account | No silent overwrite, lost acknowledged draft, cross-account exposure, duplicate publication or changed historical binding |

## Final Verification Wave

- [x] F1 — Contracts, checks and automated regression suites
- [x] F2 — Real browser and HTTP acceptance, adversarial probes and cleanup
- [x] F3 — Collector compatibility and independent scope/code review

### Verification and release gates

Final verification happens after all implementation tasks, against local synthetic data. Independent reviewers must check plan compliance, source/code quality, observed user flows and scope preservation. Record the result and unresolved blockers; do not mark the feature complete just because a plan or mockup passes review.

| Gate                        | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts, checks and tests | `pnpm contracts:generate` then clean expected generated diff; `pnpm check`; `pnpm --dir web test:unit`; `pnpm backend:test ZONE_API_REHEARSAL=1`; `pnpm db:test ZONE_REHEARSAL=1`; `pnpm --dir mobile test`; `pnpm tokens:check`; `pnpm plan:check`                                                                                                                                                                                      |
| Real browser acceptance     | Local production build using `sh scripts/e2e-local.sh --zones --prod --project=desktop-1440 e2e/map-setup.spec.ts e2e/packages.spec.ts e2e/packages-identity.spec.ts` and equivalent phone-390 run; run affected existing zones-network/conflict/account/access/publish/editor specs. Proposed setup scenarios also exercise tablet sizes with per-test viewport overrides because tablet projects only match honesty/screenshots specs. |
| Collector compatibility     | `sh database/mobile-package-rehearsal.sh -q -s` plus affected mobile package tests; first published setup installs, restart reads the same zones, v1-bound observations remain v1-bound after v2. Distinguish this from physical-device acceptance.                                                                                                                                                                                      |
| Manual agent walkthrough    | Desktop, 768px tablet and 390px phone; Day/Dusk; keyboard-only and touch; 200% zoom; axe and focus/live-status checks; all scenarios below with screenshots and traces.                                                                                                                                                                                                                                                                  |
| Release readiness           | Forward migration/backward-compatible API first, then web; deployed URL/build and API capabilities verified together; signed-in synthetic first-map smoke test on the actual approved URL. Hosted work requires explicit authorization and is not executed by this planning task.                                                                                                                                                        |

Evidence belongs in `docs/reviews/qgis-first-map-setup/` (proposed), with a short index naming commit/build, local URLs, fixture names, commands, results and limits. Do not put private source files/tokens into evidence. A deploy or physical-device check not performed is labelled pending. The earlier uncertainty about Janet’s exact URL remains unresolved; do not claim this plan proves which deployment she saw.

For rollout, the new web must not silently fall back to the broken first-map flow if the setup endpoint is absent: show a truthful unavailable message and preserve selected work. Rollback is application-level and leaves the additive tables/drafts and all published packages intact; do not roll back by deleting data or resetting the database. Recheck the chosen real URL after release rather than assuming the newest PR is deployed there.

## Decision record and completion bar

Defaults chosen within the requested scope: server-persisted setup rather than browser-only work; one active shared setup per site; unchanged collector/archive format; explicit source-role review; no usable vectors means source recovery; Contour rather than a redesign; tests first for lifecycle/concurrency, then actual browser walkthroughs. These defaults require no new user decision to implement.

Metis consultation identified and this plan addresses the site→draft lock order, replay-before-terminal-state semantics, separate setup receipts, bounded source retention for reload/retry, importer/transport/archive limit differences, atomic source replacement, stable duplicate-name source identity, per-feature role disposition, account cleanup, geographic framing edge cases and form/current-map revalidation. Preserve the legacy `leave_out_online_basemaps` names field: translate per-source consent to deduplicated names only after every matching online-basemap source is acknowledged. Do not widen existing publication operation values or draft foreign keys.

### Planning verification record

On 2026-11-09, `pnpm plan:check` passed for 204 canonical tasks across 13 files (69 todo, 32 doing, 101 done, 2 dropped). This proves canonical roadmap consistency only. Existing source references were inspected; proposed files/routes/evidence locations are labelled. The requested using-superpowers, ui-ux-pro-max, anti-ui-slop, cognitive-walkthrough, design-taste-frontend and omo:ulw-plan skills informed this plan; the actual Contour/PRODUCT conventions take precedence over generic font, palette, animation or layout suggestions. Read-only editor/test research and a Metis-equivalent gap review informed the architecture and QA. The independent plan audit **approved** the revised plan after resolving source-preview/commit fingerprint semantics, per-feature role/remainder handling and the unpersisted entry-route lifecycle; no planning blockers remained. No feature code, migration, browser acceptance, hosted deployment or physical-device verification was performed by writing this plan.

The feature is complete when a manager with a usable project containing no outline or zones can import, create both in the app, leave/reload, publish exactly one first map, and install the resulting package through the existing collector pipeline; project/source failures remain understandable; all existing map/history/identity guarantees still pass. No separate ground/zones/path/tree files are demanded when their data is already present or can be drawn. No publication can expose incomplete setup data to observers.

No commit, push, branch or hosted migration/deployment is part of this plan’s execution authorization. The implementation handoff is T1, with the existing checkout inspected before any code change.
