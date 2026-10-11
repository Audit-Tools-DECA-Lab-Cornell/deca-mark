# Backend plan: zone drafts, publication and bound observations

[Master plan](../docs/plan/zone-boundaries/README.md) · [Canonical contract](../docs/plan/zone-boundaries/contract.md) · Tasks BE-18, BE-19 and BE-20 in [PLAN.md](PLAN.md).

## Existing integration points

Read `src/fieldmaps_api/{schemas,site_schemas,errors,body_limits}.py`, routers/services/repositories/queries for `sites` and `collection`, and `domain/{packages,geojson,project_import}.py`. Preserve thin routers, services owning domain decisions, repositories owning SQL and request-local authenticated transactions. Keep existing API error envelope and receipt-after-commit behavior.

The current observation hash is `sha256(payload.model_dump_json(exclude_unset=True))`; do not change its field order/default handling or rewrite historical data. The current list is an array capped at 500. The importer converts vector sources but does not save packages. Existing package creation immediately exposes highest ready version; managed-site finalization must replace that implicit behavior.

## BE-18: authoring and publication

Implementation handoff (2026-10-11): focused `zone_*_schemas.py`, `routers/zones.py`,
`services/{zones,zone_publication,zone_discovery,zone_archives}.py`, `repositories/zones.py`
and `queries/zones.py` implement the frozen authoring contract. Format-2 archive building
lives in `domain/zone_*`; format-1 generation remains unchanged. The forward migration
`20261011124000_zone_api_validation.sql` adds restricted manager validation/capability
wrappers over the DB-16 helpers; every activation calls the existing database finalizer.

Publication defaults off through `zone_publication_enabled`. Tests enable it only on
disposable databases. Exact retries reauthorize and return the original committed result
before checking mutable state or the operational gate. Archive subprocess preparation
finishes before the final transaction rechecks revision/current package and commits. V1
site/package discovery stays on the frozen legacy version; v2 exposes UUIDs, current
package and capability metadata. Existing web/mobile error adapters recognize the additive
codes; the clients still use v1 discovery until their own dependency tasks are complete.

Reproduce acceptance with `pnpm backend:test ZONE_API_REHEARSAL=1` and
`pnpm db:test ZONE_REHEARSAL=1`, both against newly created disposable containers. The
loopback HTTP driver uses signed JWTs and the restricted API role. It covers authoring,
publication, history, old late uploads and competing managers. BE-19 below adds strict
bound v2 uploads; BE-20 adds filtered historical reads and complete bounded exports. The client-parity
test runtime-parses actual v1 site/archive bodies with the existing mobile Zod schemas
and web archive reader, and parses v2/history bodies with the new response models. Full device/browser/QGIS
release acceptance remains QA-07; no hosted migration or publication gate was enabled.

Create focused zone request/response schemas and a zone service/repository module rather than enlarging collection code with editor state. Expose draft create/list/get/replace/validate/discard/publish and historical zones exactly as CON-05 freezes. Every read/write checks project/site and role before expensive geometry work. Draft mutation preconditions are database compare-and-swap; reading a revision then writing without a condition is insufficient.

Build one canonical geometry validation path backed by PostGIS. Python validates input structure and resource limits; PostGIS evaluates geometry validity/topology/coverage. Return precise safe issues by zone UUID and geometry path. Offline/browser preview validators provide immediate help but are never authoritative. Do not add Shapely solely to duplicate PostGIS unless a measured offline preprocessing requirement justifies it and parity tests exist.

Reuse package archive generation for format 2, preserving ground, paths, trees and frozen forms. Use normalized accepted polygons to generate both archive layer and DB snapshot inputs. Put stable UUID, legacy code, label, anchor and geometry-contract version in the manifest/layer. Test archive polygons equal database snapshots geometrically and hashes/ETags match their documented content. Preserve byte-identical generation for unchanged legacy format-1 submissions; add a new format path rather than silently changing old archive identity.

The DB finalization service serializes site publications. No archive conversion or long compression should hold a row lock unnecessarily: prepare from a frozen draft revision, then check that revision and expected current pointer again inside the final transaction. If state changed, discard unpublished prepared bytes and return conflict. No pending files become downloadable as a successful package. Current transactional bytea archive is sufficient within existing limits; external object-store orchestration is not part of this feature.

Extend legacy package submission only where a managed site requires explicit expected-current/idempotency/identity mapping. All ways to create a format-2/current package, including QGIS import follow-up and rollback, call the same finalization routine. Ensure an old manager client cannot bypass the editor and implicitly activate a different current version. Maintain unmanaged legacy package behavior until explicit adoption.

Implement the contract's v2 site list for updated clients and freeze a v1-compatible site selection for managed sites. Old clients must not consume format-2 packages via max(version) while stripping their metadata. Return matching package/zone summaries together; test both client generations before enabling publication. This changes package discovery, not late-upload authorization.

Endpoint-specific body limits must admit draft geometry while protecting memory/CPU. Add safe limits for concurrent validation and timeout behavior; 429/503 leave draft content intact. Rate-limit publication appropriately with existing mechanism, documenting that per-process limits are not distributed. Do not log full geometries or research answers. Expose request ID, operation, result code, duration and safe counts for diagnosing failures.

## BE-19: bound uploads and compatibility

Implement a strict nested-answer v2 schema and separate route. Both v1 and v2 call shared answer validation and receipt storage, but use protocol-specific normalization/fingerprint logic. Persist protocol and exact package-zone binding with each new v2 row. Reject ambiguous schemas instead of treating envelope metadata as form answers.

V2 processing: check current access; recognize an exact idempotent replay; resolve immutable package/site/zone/form; validate point coverage or inventory semantics; derive compatibility code/anchor; commit insert; emit receipt with binding. Historical published package remains valid even when superseded. Retirement of a form must not invalidate previously bound offline work; deletion/revocation policies still govern authorization.

Validate Standard/Reliability versus Inventory without assuming a particular form code prefix. Published package explicitly binds form codes/IDs for each role. Current inventory selection happens at download from available forms; format 2 must pin it so a future form publication cannot change a resumed package's inventory questions.

Do not add new metadata to old v1 responses if consumers are strict without testing them; prefer v2 read endpoints for bound metadata. Old v1 requests keep omitted/default fields and hash semantics. Existing UUID with incompatible payload/protocol returns conflict. New v2 record failing against an old server stays queued/needs attention according to capabilities; mobile never silently drops provenance and resubmits it as v1.

Acceptance includes a v1 request accepted before deploy, response lost, identical replay after deploy; an old never-uploaded v1 record after site adoption; and a v2 record captured from v7, uploaded after v8 and form retirement. None may change its UUID, answers or capture context.

The local route delegates to focused bound-upload and shared receipt/answer services.
`domain/zone_upload_fingerprint.py` uses RFC 8785 with the frozen canonical-byte cases,
six-digit UTC capture times and authenticated identities. The additive
`20261011133000_zone_upload_protocol.sql` migration persists and freezes the hash version;
its backfill retains receipt times and revisions. Uploads hold account then organization
locks and refresh authorization after waiting, including exact replays. Missing/hidden
packages return 404; an accessible package from another site returns a structured 422.
New Inventory rows retain only the server-derived snapshot anchor for compatibility;
the v2 event geometry/read semantics remain the BE-20 contract.

Run `pnpm backend:test ZONE_API_REHEARSAL=1` and
`pnpm db:test ZONE_REHEARSAL=1` for disposable local acceptance. The live Uvicorn driver
exercises publication, bound upload, original-receipt replay and legacy readback. Device
queue/retention and historical filtered display remain dependent tasks, not API evidence.

## BE-20: reads, zone filters and complete exports

Add v2 paginated list/detail, summary and export with a single reusable authorized SQL filter definition. Add historical zone fields and `spatial_support`; no current-zone-name join for old rows. Reserve static `/summary` and `/export` routes before the UUID route. Preserve the v1 list's array response and limits for old callers.

Filter before LIMIT and before aggregation. Support stable zone UUID across versions, exact package+zone, explicit legacy code scoped to site, legacy/unversioned basis, round type, observer and UTC date bounds. Validate incompatible filters rather than quietly ignoring them. Make date boundaries half-open; web translates project-local day boundaries to UTC, including DST. Filter labels must distinguish same code on two sites.

Use correct mixed-direction keyset pagination; bind cursor to filters and project without putting confidential payloads into URLs. Count and rows should share a database snapshot within one response. Interactive pages may see new uploads; full export must use a consistent statement/snapshot, obey cancellation, release DB resources, and fail clearly on measured size/time limits. Count/summary includes zero matching records correctly and never counts invisible records under RLS.

Exports add `package_id`, `map_version`, `zone_id`, `zone_code`, `zone_label_at_capture`, `assignment_basis`, `spatial_support`. Legacy code is preserved with unknown version/label, not recast. Preserve form-version codebook behavior and prevent CSV formula injection. GeoJSON event inventories have null geometry plus zone reference; a separate authorized historical-zone layer provides polygons. Do not mix polygon inventory features into the existing point layer without an explicit geometry-type contract.

No viewport query, heatmap, general full-text search engine or asynchronous export job is required. If the map shows one loaded page, the client must label it; exact totals come from summary. Set a tested synchronous export ceiling and give an actionable narrowing error above it rather than introducing an unplanned job platform.

The v2 export delivers an `application/zip` bundle: the selected `observations.csv` or
`observations.geojson`, `codebook.csv`, `metadata.json`, `forms.json` and
`historical-zones.geojson`. Scope metadata uses aware UTC interval bounds and records the
project timezone for interpretation. Frozen form definitions and package-zone polygons
are deduplicated; Inventory events retain null geometry while the zone file carries
historical polygons. Reject page-only cursor/limit parameters on summary/export.

Apply the same snapshot to rows, counts, forms, zones and metadata. The synchronous
ceiling is 10,000 observations, 32 MiB of combined uncompressed assets, 32 MiB of archive
bytes and 10 seconds of export work. Refuse an oversized scope before a successful
response starts; bound the source JSON snapshot separately at 64 MiB. Bound concurrent
serializer processes and terminate work on cancellation
or deadline; release database sessions and temporary files. Record measured row/byte/time
acceptance alongside query-plan evidence before marking BE-20 complete.

## Validation and release

Add shared-case tests in Python for structure/geometry outcomes, real local PostGIS tests for spatial semantics/RLS, API concurrency tests using two authenticated managers and lost-response replay tests. Check missing/stale preconditions, oversized streamed bodies without Content-Length, cancellation, bounded complexity and safe errors. Keep existing form parity/import/upload tests passing.

Run `pnpm backend:check`, targeted backend tests, then `pnpm backend:test` and `pnpm db:test` when required local infrastructure is available. Coordinator runs `pnpm contracts:generate`; both clients compile and runtime-parse examples. A live local HTTP driver must exercise create → edit → validate → publish → historical upload → filtered read/export. Mocked service tests alone do not establish completion.

Backend schema and capability must ship before clients enable v2. Publication remains gated until client retention and historical display are accepted. Do not remove v2 support on operational rollback once a device can hold unsent v2 records. Explicit approval is required for hosted migrations/deployments. No claim of a device or production test follows from local API checks.

### Audit corrections (2026-10-11)

Managed successor imports explicitly select the published play code with `form_version` and may set `inventory_form_version`: omitted inherits, null disables, a published same-project code replaces. Draft edits still inherit exact bindings. Return actionable 409 when retirement would strand a current managed package; historical packages remain readable after retirement. Preserve omitted-versus-null semantics in normalized import requests and reauthorize exact replays. Finalization uses account → organization → site → draft/forms locks with fresh authorization after waits; archive work stays outside finalization. Managed discovery uses stored geometry metadata, and legacy capability caching never caches authorization, form state or the runtime gate.
