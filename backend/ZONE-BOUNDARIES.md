# Backend plan: one zone-aware API

[Master plan](../docs/plan/zone-boundaries/README.md) · [Canonical contract](../docs/plan/zone-boundaries/contract.md) · [Backend task status](PLAN.md)

This is the current CON-06 behavior specification. DB-19’s baseline and BE-22’s sole `/v1` implementation have local acceptance, recorded in their owning [plans](PLAN.md#be-22-serve-one-zone-api-path). BE-18 to BE-20’s dated `/v2` and feature-flag descriptions are historical and superseded by BE-22. This specification does not establish hosted deployment or client acceptance; follow the [current roadmap](../docs/plan/current-state.md).

The only API prefix is `/v1`. The only package archive has `format: 1` and contains zone identities, full geometry and bound forms. Map versions `v1` and `v2` mean successive per-site packages; both use the same API.

## Integration and ownership

Read the backend [README](README.md), the full canonical contract, and the focused schemas, routers, services, repositories and queries for sites, collection, zones and observation analysis. Preserve thin routers, services owning domain decisions, repositories owning SQL and request-local authenticated transactions. The API role remains restricted by database authorization.

BE-22 consumes DB-19’s baseline; OpenAPI-derived client types were regenerated with a stable second run as recorded in [PLAN.md](PLAN.md#be-22-serve-one-zone-api-path). Regenerate together after future contract changes. Clients runtime-parse downloaded and cached data. No client enables a path merely because a specification or generated fixture exists.

## Package creation and discovery

Both layer upload and manager draft publication use one database finalizer under the site lock. Conversion through `POST /v1/projects/{p}/packages/import` saves nothing. The follow-up package upload supplies the site UUID, request UUID, exact source-feature identity map, published play form, optional inventory binding and expected current package.

The first upload uses `expected_current_package_id: null` and creates map `v1`. A successor creates the next version only if the current pointer matches. A known zone UUID keeps its site and code; a new UUID creates a new identity. A matching label or code never proves continuity.

The finalizer rechecks authority, forms, geometry, identity mapping and preconditions, inserts the immutable archive and snapshots, then moves the current pointer atomically. Blocked packages never become current. Publication is available whenever its authorization, validation and concurrency requirements pass.

Archive construction preserves the package's ground, paths and trees and embeds exact play/inventory bindings. Manifest and zones-layer UUIDs, codes, labels, counts, anchors and digests must agree with the database snapshots. The server computes each display anchor once. Missing full geometry fails readiness.

Site discovery uses the contract's single site shape, addressed by UUID. It returns current package metadata, zone summaries and the authorized editing hint together. A member may read an exact superseded package for offline recovery. Missing or hidden resources return the documented error; discovery never substitutes another API or package.

## Draft editing and publication

Draft create clones one ready package of the same site. Full replacement echoes structurally valid geometry exactly as submitted, while validation and publication reject invalid topology. Browser previews help the editor; PostGIS is authoritative.

Operations on an existing draft require the exact strong ETag and compare its revision in the database. Publication also checks that its base and expected current package still match the site's current pointer. Draft creation uses its request UUID and ready base package. Draft responses include the ETag, current package version and actor display names. Validation includes normalized summaries, geometry digests and change classifications. Publication returns the committed package, the current pointer and `replayed`.

An identical request replay reauthorizes and returns its stored result. Replaying an earlier success after a newer publication never moves the current pointer back. A stale draft remains readable, exportable and discardable; restoring earlier geometry publishes a new version.

Lock order is caller account, organization, site, then draft and referenced resources. Membership changes and account deletion share the authorization locks. Recheck authority after waits. Archive preparation and compression stay outside the final transaction; finalization rechecks the frozen revision and current pointer.

## Geometry and resource boundaries

Implement the contract's structure, extent and complexity limits before expensive processing. PostGIS validates topology, site coverage and positive-area interior intersections under the trusted publication boundary. Shared edge or vertex contact is valid; containment, identical polygons and interior overlap fail.

Normalize only as the canonical contract specifies. Never repair, buffer, simplify, clip or round accepted geometry. Point coverage uses `ST_Covers` with the explicitly selected zone, including boundary cases. Inventory represents the whole recorded zone.

Enforce decoded-body limits with and without Content-Length, refuse encoded bodies, bound concurrent validators and serializers, and apply operation deadlines and rate limits. Errors carry safe coded issues and paths. Logs contain operation, result, duration and safe counts, without geometry or research answers.

## Observation upload

`PUT /v1/projects/{project_id}/observations/{observation_id}` accepts only the canonical nested-answer envelope. Site, package and zone UUIDs are required. Standard/Reliability requires hand placement, coordinates and a strict first-round boolean. Inventory requires zone placement and omits coordinates and first-round.

Resolve tenant, owner, site, ready package, zone and exact form server-side. A superseded package remains valid for an authorized late upload, including a bound form retired after capture. Reject missing, blocked, cross-site or inconsistent resources and points outside the selected zone.

Use the single observation normalization and JCS hash from the contract. Validate answer values and JSON boundaries without changing answers before hashing. An authorized identical retry returns the original receipt; changed content conflicts. Commit the observation and binding atomically before returning the receipt.

Inventory event geometry is null. Derive its display anchor and zone code from the recorded snapshot. Receipts include observation, project, user, package and zone identities, all of which the collector verifies against its frozen envelope before acknowledging.

## Historical reads and exports

Implement list, detail, summary and export on the canonical `/v1` routes using one authorized filter definition. Register static summary/export paths before the UUID route. Filter before pagination, aggregation and export, and bind cursors to project and normalized filters.

All labels and geometry join the recorded package plus zone, with tenant/site constraints. Zone identity across versions intentionally spans versions only when the caller omits a package filter. An exact package filter selects one snapshot. Inventory has null event geometry and separate whole-zone support.

Use the documented mixed-direction keyset order and exact per-response counts. A complete export includes observations, codebook, metadata, forms and historical zones from one authorized snapshot. Bound row, byte, source and time limits; reject an oversized scope before success starts. Release database sessions, serializer processes and temporary files on cancellation or deadline.

CSV protects spreadsheet text. Exported forms and codebooks retain the definitions used for each recorded answer. A later label, form publication or map publication never reinterprets earlier observations.

## Acceptance and release

Run backend checks, SQL tests and the live local API workflow against the DB-19 baseline. Exercise first upload of map v1 → draft edit → validation → publication of map v2 → delayed map-v1 observation → filtered read/export. Include two managers, lost responses, authorization revocation while waiting, direct-write attempts and shared geometry cases.

`pnpm backend:check`, `pnpm backend:test` and `pnpm db:test` establish their respective local checks only. The coordinator runs `pnpm contracts:generate` twice after BE-22. Use the [failure matrix](../docs/plan/zone-boundaries/verification.md) for browser, physical-device and QGIS acceptance.

Task status lives in [PLAN.md](PLAN.md). Hosted resets, migrations and deployments require approval of the exact target. No documentation or local test result establishes hosted, production or device compliance.
