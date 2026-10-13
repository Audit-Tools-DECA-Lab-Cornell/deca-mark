# Database plan: one immutable zone baseline

[Master plan](../docs/plan/zone-boundaries/README.md) · [Canonical contract](../docs/plan/zone-boundaries/contract.md) · [Database task status](PLAN.md)

CON-06 defines the current contract. DB-19 replaces the experimental schema with one baseline and fresh seeds; BE-22 then implements the API against it. Earlier DB-15/DB-16 and GIS-09 evidence does not establish compliance with this baseline. Hosted reset or deployment remains a separately approved operation.

Map versions v1 and v2 are successive per-site packages, both served through the only API prefix, `/v1`. Every archive uses the single zone-aware `format: 1`.

## Ownership and starting points

Read the [database README](../database/README.md), the full canonical contract, `supabase/migrations/` and the current SQL access, lifecycle and geometry tests. The database owner writes the baseline, seeds, restricted functions, indexes and GIS projections. Component specs and generated examples never substitute for real SQL acceptance.

DB-19 squashes the schema into one current baseline rather than carrying a conversion chain. Seeds create fresh sites with map v1 as their first package. Local reset commands are explicit. Hosted operations require approval of the exact target and must not be inferred from local test authorization.

## Current-schema target

Tenant keys mean organization, project and site where relevant. Composite keys enforce those relationships.

| Object | Required purpose | Invariant |
| --- | --- | --- |
| `zone_identities` | Stable zone UUID and immutable scoped code | Identity and code never move between sites or imply geometry continuity by name |
| `package_zones` | Package+zone snapshot, full MultiPolygon, label, anchor and digest | Exact immutable geometry and label; composite foreign keys to the same-site package and identity |
| `site_zone_state` | Explicit current package pointer and concurrency revision | Only a ready finalized package becomes current |
| `zone_drafts` | Base package, frozen ground/forms, zones, note, revision, actors and state | Manager-only whole-draft CAS; published drafts are frozen |
| `zone_publications` | Caller/project/operation request identity and committed result | Exact replay returns the original result without moving the pointer |
| `observations` | Required site/package/zone/form binding, answers and immutable receipt identity | Every observation references its recorded snapshot; event geometry follows its spatial support |

Site packages retain the site boundary, exact play form and nullable inventory binding as authoritative columns alongside immutable archive content. The manifest, zones layer and database snapshots come from the same canonical finalization input. The finalizer checks counts, identities, anchors and digests before changing current state.

Observation point geometry is present for Standard/Reliability and null for Inventory. Inventory references the whole package-zone snapshot; its display anchor comes from that snapshot. First-round is a strict boolean for point records and null for Inventory. A stored anchor never stands in for an event location.

Historical label and code reads join the exact package-zone snapshot. Submitted labels, package versions and organization/project claims cannot override authorized database relationships.

## Trusted geometry and insert boundaries

Every published snapshot must satisfy the canonical structure, topology, extent and complexity limits. Require valid nonempty 2D MultiPolygon in SRID 4326 with finite in-range coordinates. Reject null geometry explicitly, and require the canonical anchor to lie in its snapshot.

Site coverage uses the actual retained site polygon, including holes, rather than its box. Reject positive-area interior intersections, including containment and identical polygons; allow boundary touching. Cross-row geometry checks run under the site lock and cannot be replaced by ordinary CHECK constraints or API-only validation.

Normalization follows the canonical contract and is rechecked by PostGIS for validity and unchanged coverage. No automatic repair, buffer, clipping, simplification or precision reduction is allowed.

Observation insertion verifies same-site package-zone-form relationships, current authorization, round coherence and `ST_Covers` for points. A superseded ready package and its retired bound form remain eligible for authorized late upload. Inventory derives its anchor and zone code from the selected snapshot. A foreign key alone is insufficient spatial validation.

## One package finalizer

Both first layer upload and draft publication use the same trusted finalization boundary. Conversion-only QGIS import never creates or activates a package.

1. Lock caller account, organization and site, then draft and referenced resources. Check current authority after waits; membership changes and account deletion share these locks.
2. Resolve an authorized exact replay before mutable state checks. Otherwise compare expected current package and draft revision, validate identities/forms and enforce all limits.
3. Allocate the next per-site version under the site lock, starting at 1. Insert archive, checks, new identities, the complete snapshot set and publication evidence atomically.
4. Move the current pointer and freeze the published draft in that transaction. A failure leaves no partial current package or downloadable incomplete success.
5. Return after commit. Replaying an earlier success returns its stored package and the actual current pointer; restoring older geometry creates a new version.

On the first upload, the expected current package is explicitly null and each source feature has exactly one supplied identity mapping. On successors, a known UUID keeps its original site/code; an unknown UUID creates a new identity. Label/code resemblance never supplies a mapping.

The backend may prepare archive bytes outside locks, but finalization rechecks exact revision, current pointer, forms, geometry, identities and manifest/layer/snapshot agreement. SQL need not decompress ZIPs; the API tests actual archive bytes against those same authoritative inputs.

## Restricted SQL interface and RLS

Expose narrowly granted draft create/change/validate/finalize functions and the trusted observation insert boundary to the restricted API role. Direct package, snapshot, current-pointer and publication writes cannot bypass finalization. Publication permissions and validation apply to every site from its first package.

SECURITY DEFINER functions use a fixed empty search path, qualified names and explicit caller lookup. They enforce all tenant/resource relationships themselves; a user-settable flag never grants authority. Prevent INSERT, UPDATE and DELETE against published snapshot sets, including late appends.

Enable RLS on current application tables. Drafts and detailed publication audit data are manager-only. Authorized project members may read ready historical packages and snapshots. Observation access preserves observer-own versus manager/viewer rules and Training creator-only isolation. Browser roles do not gain direct application-table access.

Form retirement is refused while a current package still binds that version; a manager must first publish a successor. Exact historical recovery and late upload use the recorded binding after retirement. Current-form selection never changes an earlier package.

Map SQL failures to the contract's safe error codes and issue envelope, without exposing SQL text, other tenants' identities, shapes or answers. Backend owns HTTP parsing, ETags, answer validation, the single observation hash and receipt-after-commit responses.

## Read indexes and GIS projections

Support exact recorded package+zone joins, scoped site/zone filters and the list's observed-time/ID order. Measure relevant B-tree and GiST plans on synthetic volume rather than adding every index combination. List, summary and export remain subject to RLS.

GIS point events expose only real point geometry. Inventory projections join the recorded whole-zone MultiPolygon or expose a nonspatial record for that join. Zone snapshots stay one MultiPolygon per package+zone, with version, frozen label/code, anchor, digest and actual publication metadata. No multipart expansion may duplicate observation counts.

Database changes do not provision a new Desktop login or widen existing reader access. Coordinate projection requirements with the [GIS handoff](../qgis/ZONE-BOUNDARIES.md).

## Reset and acceptance

DB-19 installs the fresh baseline and seeds on an explicitly selected local test database. Device schema changes are handled separately by MOB-28's collector reset; current-schema restarts retain its offline records and referenced packages.

Test the baseline from scratch: composite tenant FKs, current-role authorization after lock waits, inherited managers, Training isolation, first-upload races, CAS, replay, partial-failure rollback, immutable snapshots, form retirement, geometry boundaries and point/Inventory semantics. SQL/API exports and GIS projections must agree on identities and counts.

Run `pnpm db:reset` and `pnpm db:test` only on the authorized local stack. BE-22 then supplies restricted-role live HTTP acceptance and stable contract generation. [PLAN.md](PLAN.md) owns completion status; the [failure matrix](../docs/plan/zone-boundaries/verification.md) owns required release evidence.

Backups/restores of the current schema must keep archives, snapshots, bindings, receipts and current pointers consistent. Hosted reset, application and release evidence remain distinct from a passing local suite.
