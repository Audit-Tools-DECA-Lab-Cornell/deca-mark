# Architecture assessment: historical source baseline

[Master plan](README.md). Baseline: local source on 2026-10-10, before zone implementation. This is historical evidence, not the current implementation or task status. CON-06 aligns the recommendations below with the current single-path contract; owning specifications and tasks govern implementation. References can drift. This is a suitability assessment, not a security certification or runtime test.

## Actual data flow

Manager uploads QGIS/GeoJSON layers → API prepares an immutable ZIP/manifest → `site_packages` stores archive and checks → site query chooses highest ready version → mobile downloads/verifies archive and forms → device files keep package → session/draft stores package/code context → SQLite stores observation → foreground queue builds v1 payload → API validates site/form and appends observation → web reads newest 500 → local filters/export and GIS view.

The missing link is between the collected record and the server's historical package: local package context is not sent by the current uploader.

## Findings and required changes

| Surface | Evidence in current source | Judgment and action |
| --- | --- | --- |
| Spatial database | `supabase/migrations/20260923120000_site_packages.sql`: immutable packages and per-site versions; `20261007120000_sites_forms_collection.sql`: nullable zone code/round/placement | Sound package foundation. No actual `zones` table or observation-to-package FK exists. Add normalized immutable snapshots and bindings; DB-12 is a target, not existing schema. |
| API validation | `backend/src/fieldmaps_api/schemas.py::ObservationUpload`, `services/collection.py::upload_observation`, `queries/collection.py::UPLOAD_TARGET` | Baseline validates site/form/answers but lacks package and zone membership/coverage. Replace it with the sole strict nested-answer `/v1` envelope and `observation-jcs-1` fingerprint. |
| Current package | `backend/src/fieldmaps_api/queries/sites.py`, `repositories/sites.py` | Highest ready version implicitly becomes current. Replace selection for managed sites with an explicitly committed pointer and revision; never make a preview current. |
| Package geometry | `backend/src/fieldmaps_api/domain/packages.py`, `domain/geojson.py`, `site_schemas.py::ManifestZone` | Full polygons live in archive; site/manifest zone entries have boxes. Need canonical full geometry plus stable UUID metadata, validity checks and checksummed matching snapshots. |
| Mobile rendering | `mobile/src/packages/hosted/build.ts::siteZone`; `maps/geometry.ts::zoneParts`, `zoneAnchor` | Polygon/MultiPolygon/holes already supported. Preserve those shapes; avoid rebuilding the renderer unnecessarily. Refuse malformed/missing polygon instead of falling back to bbox. |
| Mobile boundary math | `mobile/src/maps/geometry.ts::inRing`, `zoneAt` | Current ray casting explicitly has ambiguous edge membership and first/preferred-zone selection. Share exact boundary cases with PostGIS; display candidates and confirm chosen membership. |
| Record context | `mobile/src/domain/observation.ts::roundContextSchema`; `sync/contracts.ts::uploadPayload` | Baseline uploader strips local package identity. Every current record freezes required site/package/zone UUIDs, exact version/forms and recorded labels; current uploads serialize that one immutable shape. |
| Draft recovery | `mobile/src/session/provider.tsx::resumeRecovered` | Opens original package but falls back to its first zone if chosen zone is missing. New bound drafts must fail recoverably, never silently change zone. |
| Package installation | `mobile/src/packages/hosted/device.ts::writeStoredPackage`, `hasStoredPackage` | Writes JSON directly; existence is weaker than schema/digest readiness. Stage/verify/atomic install and keep a durable selected-package pointer. |
| Package lifecycle | `mobile/src/packages/hosted/provider.tsx::refresh`, `download`, `remove` | Refresh replaces current site metadata; remove deletes current package without checking draft/queue references. Add old-version discovery, leases/references, last-good selection and guarded removal. |
| Account scope | `device.ts::sitesFile`, provider async refresh/download | Site cache uses user/project but not issuer; packages shared by UUID. Use issuer/account/project/package namespaces and async-generation fences. Verify account switch cancellation and cross-scope read authorization. |
| SQLite/outbox | `mobile/src/storage/observation-store.ts`, `draft-store.ts`, `sync-store.ts` | Durable account-scoped queue, retries and receipts are suitable. Reset on schema mismatch and track current references through the existing store boundary; no parallel sync writer. |
| Web data access | `web/src/lib/api/client.ts`, `workspace.ts`, `mutations.ts` | Request-scoped authenticated no-store reads, generated types and timeouts are appropriate. New response shapes need runtime parsing; use mutation invalidation and tenant/version-aware keys if Claude adds client caching. |
| Web zone reads | `web/src/features/data/view.ts::zoneNames`, `applyFilters`, `filterOptions`; `lib/export/columns.ts` | Zone field/filter/export already exist but filter loaded rows and label them from current site zones. Bind historical labels, scope identities by site, move filtering to server and add complete pagination/export. |
| GIS | `supabase/migrations/20260919001016_qgis_training_reader.sql`; `qgis/PLAN.md` | Existing fixed-project point view is not a general historical-zone surface. Preserve access restrictions and separate inventory polygon analysis from point events. |

## Standards comparison and scope control

| Concern | Existing foundation | Needed for this feature |
| --- | --- | --- |
| Offline-first | SQLite before network, foreground retries, stored forms/maps | Package retention, atomic readiness, no hot swap, exact restore |
| Idempotency | Immutable observations and upload fingerprint receipts | One canonical fingerprint and immutable bound queue encoding; durable publication result replay |
| Concurrency | DB transactions and immutable packages | Conditional draft edits, serialized site publication and explicit activation |
| Authorization | Restricted API role, RLS, composite tenant FKs | Same controls for drafts, zones, package membership and historical reads |
| Research reproducibility | Versioned forms/packages | Observation FK to exact zone snapshot; historical labels and complete filtered exports |

There is no single certification called “industry-standard architecture,” and no basis for claiming perfection. The concrete weaknesses above are addressable inside the current stack. A new global state library, bidirectional sync engine, workflow SDK or map provider would not itself resolve them.

Older plan context still discusses PowerSync as target transport and old numeric rounds. D26 establishes Standard/Reliability/Inventory; D27 explicitly ships hosted packages on the current queue. Backend README's “device cannot fetch a package yet” and the `PackageProvider` comment are stale relative to `mobile/src/packages/hosted/`. Correct owning documentation as implementation touches it, without changing unrelated historical evidence.

## Official references used for design

- [PostGIS ST_Covers](https://postgis.net/docs/ST_Covers.html): includes boundary membership; invalid inputs are unsuitable.
- [PostGIS ST_IsValid](https://postgis.net/docs/ST_IsValid.html) and [ST_Relate](https://postgis.net/docs/ST_Relate.html): validity and interior-intersection checks.
- [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946): WGS84 coordinates, polygon/ring conventions and geographic edge cases.
- [HTTP RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html): conditional writes with entity tags and precondition failures.
- [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html), [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): transaction and persistence mechanisms; verify installed SDK behavior before implementation.

These sources support mechanisms. Product policy, such as forbidding interior overlap or retaining old sessions, is a recommendation from this plan, not a vendor requirement. Vercel verification/workflow guidance was inspected; no Vercel Workflow dependency is warranted for this feature.
