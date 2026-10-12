# Zone boundary contract

[Master plan](README.md) · [Shared cases](../../../contracts/zones/README.md) · Tasks CON-05 (frozen 2026-10-10) and CON-06 (single-path rewrite, 2026-10-11) in [contracts.md](../contracts.md)

This contract follows the owner's [pre-launch compatibility policy](../README.md#pre-launch-compatibility-policy-2026-10-11). There are no real users, server and device data are reset when the schema changes, and nothing here exists to keep old data, old clients, old formats or an older API version working. The 2026-10-11 rewrite replaces CON-05's dual-path design. Until BE-22 and DB-19 land, the committed backend (BE-18 to BE-20) still serves the old dual paths; the [cleanup](#what-the-rewrite-removed) lists what goes. Any change to this contract needs a coordinated update of backend, database, both clients and the shared cases.

## What the rewrite removed

Every item below is deleted. None is retained or emulated:

- **Second API version:** the `/v2/` routes. Their behaviour moves to the existing `/v1/` paths, and the old `/v1/` site-list, observation-upload and observation-list behaviour is deleted.
- **Second package format:** format 1 as a separate older format, and `supported_format` filtering.
- **Legacy observations:** unversioned and legacy rows, `assignment_basis`, `legacy_unversioned`, `legacy_zone_code`, `spatial_support: legacy_unknown`, `legacy_count`.
- **Legacy site handling:** `legacy_package_id`, the frozen legacy package for old site lists, and unmanaged-site uploads.
- **Adoption bootstrap:** drafts based on a format-1 package, `legacy_codes_requiring_mapping` and `legacy_mapping_required`.
- **Old upload protocol:** `upload_protocol`, `upload_hash_version`, the v1 fingerprint and its goldens, `schema_version` in the upload envelope and receipt.
- **Metadata that only told formats apart:** `zone_contract_version` and `map_revision`.
- **Publication switch:** `zone_publication_enabled`, a rollout guard for old clients. Publication is always on.
- **Old-client tests:** mobile capability detection and older-server fallback, and every test that preserves an older schema or older client behaviour.

## Names and versions

There is one of everything, and every counter starts at 1:

| Thing | Name | Meaning |
| --- | --- | --- |
| API | `/v1/…` | The only API version. A future breaking change replaces it while pre-launch. |
| Map package version | `package_version`, shown as `v1`, `v2`, … | Per-site counter. A site's first package is `v1`; each publication or upload adds one. A reset starts every site at `v1` again |
| Package archive format | manifest `format: 1` | The only format: the zone-aware archive below. Readers reject anything else |
| Observation fingerprint | `canonicalization_version: "observation-jcs-1"` | The only upload hash |
| Contract | this document | No version number is carried on the wire |

Examples use `v1` and `v2`. Earlier drafts said `v7` and `v8` only to illustrate a site with history.

## Identity vocabulary

| Field | Meaning |
| --- | --- |
| `site_id` | Site UUID. Every API path and body addresses a site by UUID. `site_code` is a unique human field used in web addresses and labels, never as an API identifier |
| `package_id` | Immutable package UUID; the boundary-set version identity |
| `package_version` | Per-site integer, from 1 |
| `zone_id` | Stable zone UUID within one tenant, project and site |
| `zone_code` | Immutable human code of a zone identity |
| `zone_label` | Label frozen in the referenced package, never taken from a later package |
| `draft_id`, `revision` | Mutable manager draft identity and its monotonic concurrency revision |
| `spatial_support` | `point` (Standard, Reliability) or `zone` (Inventory) |

Do not trust submitted labels, versions or project or organization identifiers. Derive them from authorized package and zone rows. UUIDs identify; foreign keys and RLS authorize.

## Geometry

Published geometry is GeoJSON Polygon or MultiPolygon, 2D `[longitude, latitude]`, EPSG:4326.

- **Reject:**
  - NaN or infinity;
  - out-of-range coordinates;
  - extra dimensions;
  - empty components;
  - unclosed rings;
  - rings with fewer than three distinct vertices;
  - zero-area rings;
  - invalid holes;
  - self-intersections;
  - invalid multipart topology.
- **Normalize** Polygon to MultiPolygon on the server without changing its area. Normalize ring orientation and order deterministically at publication (normalization rules below).
- **Precision:** keep full accepted precision in storage and archives; round only UI text.

Publication requires every zone to be covered by the package's site polygon: the `ground` feature whose `kind` is `site`. Positive-area interior intersections between zones are forbidden, including one zone inside another. Boundary-only touching is valid. Use a tested interior-intersection predicate (DE-9IM), not `ST_Overlaps` alone. No silent buffer, `ST_MakeValid`, simplification or clipping. A correction is always an explicit manager edit followed by validation.

Gaps in site coverage (`site_gap`) and zones under 1 m² (`small_zone`) are warnings. Readers display holes and MultiPolygon losslessly. Publication supports latitudes from −85 to 85 inclusive and a site and zone set whose unwrapped bounding box spans at most 1° on either axis. Antimeridian-crossing, polar, global and larger shapes are refused as `unsupported_extent`; coordinates are never wrapped to pass.

Input bounds, inclusive, counting every ring, part and closing position:

| Bound | Limit |
| --- | --- |
| Zones per package | 250 |
| Positions per zone | 2,000 |
| Positions per package | 20,000 |
| Draft replacement body (decoded UTF-8, `Content-Length` or not) | 4,194,304 bytes |

Encoded request bodies are refused. Structural limits apply at draft save and again at publication. An empty draft can be saved; publication needs at least one zone. Topology checks have bounded CPU time and use spatial-index candidate reduction. The editor never uploads raster data.

**Point attribution:** `ST_Covers(selected_zone.geom, point)` on valid geometry. It includes outer and hole edges, but not hole interiors. On a shared edge the explicitly selected covering zone is accepted; there is no implicit first match. Client membership math must agree with the shared cases. Near-edge points are never snapped or toleranced by validation.

**Inventory:** references the whole zone snapshot. The upload sends no coordinate. Reads return event `geometry: null` and the snapshot's `display_anchor`. GIS and exports use the zone geometry or a null event geometry, never a fabricated point. The form must match the package's inventory binding and the round type.

## Packages: how a site gets versions

A site has no zone versions until its first package. Two writers create packages, and both go through one finalization path under the site lock: QGIS upload, and draft publication. Blocked packages never become current. There is no separate adoption or activation step.

### QGIS upload

`POST /v1/projects/{p}/packages/import` stays a conversion-only helper: it converts QGIS layers and saves nothing.

`POST /v1/projects/{p}/packages` creates the next version from layers:

```json
{
  "site_id": "uuid",
  "request_id": "uuid",
  "expected_current_package_id": "uuid or null for the first package",
  "form_version": "play form code",
  "inventory_form_version": "inventory form code, null for none, omitted to inherit",
  "layers": { "ground": {}, "zones": {}, "paths": {}, "trees": {} },
  "zone_identity_map": [{ "source_feature_id": "A", "zone_id": "uuid", "zone_code": "A" }],
  "change_note": ""
}
```

- **Identity map:**
  - Source IDs are the exact zones-layer `properties.id` strings (1–200 code points). Each is mapped exactly once; a missing, duplicate or unused mapping fails `identity_conflict`.
  - A known UUID must stay in the same site with its original code. An unknown UUID creates a new identity; continuity is never inferred from a label or code.
  - On a first upload every entry is a new identity. The map selects identity, and the feature's `name` supplies the label.
- **Preconditions:** `expected_current_package_id` must equal the current package, `null` meaning "no package yet". A mismatch is 409 `publication_conflict`, and a missing field is 428 `precondition_required`. `request_id` replay returns the original result without moving the current pointer.
- **Forms:**
  - `form_version` selects a published play form.
  - `inventory_form_version` selects a published inventory form; `null` disables Inventory, and omission inherits the current binding (none on a first upload).
  - The latest form is never chosen implicitly.
  - A form version still bound by a current package cannot be retired (409 `conflict`): publish a successor first.

### Archive

Every package archive keeps the layer paths `layers/{ground,zones,paths,trees}.json` and a manifest:

```json
{
  "format": 1,
  "site_id": "uuid",
  "site_code": "riverside",
  "package_id": "uuid",
  "package_version": 1,
  "forms": {
    "play": { "form_version_id": "uuid", "form_version": "study-play-v1" },
    "inventory": { "form_version_id": "uuid", "form_version": "study-inventory-v1" }
  },
  "zones": [
    { "zone_id": "uuid", "zone_code": "A", "label": "North meadow", "bbox": [0, 0, 0, 0],
      "display_anchor": [0, 0], "geometry_sha256": "hex" }
  ]
}
```

- **Zones layer:** each feature is the canonical MultiPolygon with properties `{zone_id, zone_code, name, display_anchor, geometry_sha256}`.
- **Consistency:** manifest and layer must agree on UUID, code, label, count, anchor and digest. There is no bounding-box geometry fallback.
- **Inventory binding:** `forms.inventory: null` means Inventory is unavailable on this map; readers never search for another form.
- **Anchor:** `display_anchor` is computed once by the server with `ST_PointOnSurface` on the normalized snapshot, then reused everywhere. Clients never compute their own anchor.

### Reads

| Route | Result |
| --- | --- |
| `GET /v1/projects/{p}/sites` | Array of `{site_id, code, name, description, created_at, observation_count, current_package_id, package, zones, extent, centre, zone_editing_available}`. `package` is the current package's summary, or null; `zones` are its zones with `zone_id`, `zone_code`, `label`, `bbox`, `display_anchor`, `geometry_sha256` |
| `GET /v1/projects/{p}/sites/{site_id}` | One site, same shape |
| `GET /v1/projects/{p}/packages?site_id=` | Every package of the site with `{package_id, site_id, package_version, state, prepared_at, archive_bytes, archive_sha256, forms, zone_count, change_note, published_by, source: upload \| draft}`, plus the site's `current_package_id` |
| `GET /v1/projects/{p}/packages/{package_id}` and `/archive` | Any project member, including observers, for recovery of an older version. The archive response carries its SHA-256 as a strong ETag |
| `GET /v1/projects/{p}/sites/{site_id}/zones?package_id=` | `{site_id, package_id, package_version, zones:[{zone_id, zone_code, zone_label, geometry, display_anchor, geometry_sha256}]}`. Omitting `package_id` means current. Superseded packages stay readable; draft or blocked package IDs are invalid |

`zone_editing_available` is true only for an authorized manager (including inherited organization admins) on a site whose current package has a usable site polygon and published forms. It is a display hint; every write re-checks authority. Package changes are discovered by refreshing the site list. No subscription is required, and collection makes no network call per point.

## Manager drafts

All paths start with `/v1/projects/{project_id}/sites/{site_id}`. Every mutation requires manager ability, including inherited organization-admin ability. No browser access to Supabase tables is introduced.

| Method and path | Request | Result |
| --- | --- | --- |
| `POST /zone-drafts` | `{request_id, base_package_id}` | 201 with a draft cloned from a ready package of the site (its zones, ground, forms and other layers); an identical replay returns 200 with the same draft |
| `GET /zone-drafts?state=draft\|published\|discarded` | — | Every draft summary of the site (all managers' drafts), `state` defaulting to `draft` |
| `GET /zone-drafts/{draft_id}` | — | Full draft and `ETag` |
| `PUT /zone-drafts/{draft_id}` | `{zones, change_note}` with `If-Match` | Whole-draft compare-and-swap; new revision and `ETag` |
| `POST /zone-drafts/{draft_id}/validate` | `If-Match` | Issues, warnings, per-zone summaries and readiness for that revision; never changes the revision |
| `POST /zone-drafts/{draft_id}/publish` | `{request_id, expected_current_package_id}` with `If-Match` | 201 with the new package; an identical retry returns the original result with 200 |
| `DELETE /zone-drafts/{draft_id}` | `If-Match` | 204; soft discard |

**Draft fields:**

- `draft_id`, `site_id`, `base_package_id`, `base_package_version`, `current_package_id`, `current_package_version`;
- `revision`, `etag` (the same string as the header), `state`, `zones`, `change_note`, `forms`;
- `created_at`, `created_by`, `updated_at`, `updated_by`;
- display names for both people, inherited admins included;
- `published_package_id` (nullable).

A summary omits `zones`.

**Zone entries:** `{zone_id, zone_code, zone_label, geometry}`.

- New entries carry a client-generated lowercase UUID, which stays stable through local undo and retries. The server checks that a UUID is new or already belongs to the site with the same code. Only publication makes an identity durable.
- Labels are trimmed and 1–200 code points. Codes are case-sensitive ASCII, 1–100 characters, matching `[A-Za-z0-9][A-Za-z0-9_.-]*` in full.
- Duplicate UUIDs or codes fail. An identity omitted from a draft is absent from the next version only. A zone reshaped or relabelled keeps its identity; a split or merge creates new identities.

**Saving:** structurally valid but topologically invalid shapes are saved, so work is never lost; validation and publication reject them.

- **Structural validity:** finite 2D in-range coordinates, non-empty components, and closed rings of at least four positions with three distinct vertices.
- **Not saved:** null geometry and unfinished drawing gestures stay in the client.
- **Echo:** the server stores and returns geometry exactly as submitted, keeping the same type, ring order, start vertex and numbers. It only trims labels and lowercases UUIDs. Normalized geometry appears only in validation summaries and published packages.
- **Change note:** trimmed, at most 2,000 code points, required in every replacement (an empty string is allowed).

**Preconditions:**

- The strong ETag is exactly `"zone-draft:<lowercase draft UUID>:<revision>"`, starting at revision 1.
- Every write, including validate and discard, refuses a missing, malformed, weak, wildcard or multiple ETag with 428 `precondition_required`. A valid ETag for another revision is 412 `revision_conflict`.
- A missing `expected_current_package_id` is 428, while a malformed value is 422.
- A draft can be published only while its base is the current package and `expected_current_package_id` matches. Otherwise the answer is 409 `publication_conflict`, whose details carry the current package and its version.
- A stale draft stays readable, exportable and discardable. Restoring older boundaries means creating a new draft from current, writing the older zones into it and publishing it as a new version. There is no automatic merge or rebase.

**Idempotency and locking:**

- Request IDs are scoped to caller, project and operation, and stored with the normalized request. Reuse with a different request is 409 `idempotency_conflict`.
- A publication replay resolves the stored result first and never moves the current pointer again. Its response says `replayed: true` and carries the site's `current_package_id`, so a client never presents an old result as current.
- Authorization is checked on every replay.
- Mutations take the caller's account advisory lock, then the project's organization lock, then site and draft row locks. Membership changes and account deletion share those locks, so a publication either commits before a revocation or is refused without side effects. Archive building happens outside these locks and is rechecked at finalization.

**Validation response:** `{draft_id, revision, ready, issues, warnings, zones, site_gap_area_m2}`.

- Zone summaries are `{zone_id, area_m2, extent, display_anchor, geometry_sha256, change}`, with `change` one of `added`, `removed`, `geometry_changed`, `label_changed` or `unchanged` against the current package. They are null where the zone is invalid.
- A removed-zone summary describes its retained current-package snapshot; other summaries describe the proposed zone. If geometry and label both change, `geometry_changed` takes precedence.
- `extent` is `{west, south, east, north}`; anchors are `[longitude, latitude]`; areas are geography square metres.
- `ready` covers that exact revision and never bypasses revalidation at publication.

**Publication response:** `{site_id, draft_id, package, current_package_id, replayed}`, where `package` is a ready package summary.

## Observation upload

`PUT /v1/projects/{project_id}/observations/{observation_id}` is the only upload. Point example (synthetic identifiers):

```json
{
  "site_id": "10000000-0000-4000-8000-000000000001",
  "package_id": "20000000-0000-4000-8000-000000000001",
  "zone_id": "30000000-0000-4000-8000-000000000001",
  "form_version": "study-play-v1",
  "round_type": "standard",
  "first_round": true,
  "placement": "hand",
  "coordinates": [-76.48, 42.44],
  "observer": "AB",
  "observed_at": "2026-10-10T14:00:00Z",
  "answers": {}
}
```

**Variants:**

- Inventory uses `round_type: inventory` and `placement: zone`, omits `coordinates` and `first_round`, and uses the package's inventory form.
- Point variants (`standard`, `reliability`) require `placement: hand`, finite coordinates and a strict boolean `first_round`.
- All shown fields are required, and none has a default. Extra fields are refused, including a null `coordinates` or `first_round` on Inventory. Answers live only in `answers`.

**Answers:** strings, finite JSON numbers (|x| ≤ 9,007,199,254,740,991) or arrays of strings, with at most 200 keys.

- Booleans, nulls and objects are refused.
- Duplicate JSON keys and invalid Unicode are refused at the boundary.
- `observed_at` is an RFC 3339 string with a timezone and at most six fractional digits.

**Server checks:** the server resolves tenant, site, package, zone and form. It checks that the package is ready, that the zone belongs to it, and that the point is covered (or that the inventory semantics hold). Then it stores the observation and its binding atomically before the receipt.

- The package need not be current: superseded packages stay valid for authorized late uploads.
- Draft, blocked, missing or cross-site packages never bind.
- The server derives `zone_code` and the inventory anchor; clients never assert them.

**Fingerprint:** SHA-256 over the [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) JCS bytes of `{canonicalization_version: "observation-jcs-1", observation_id, project_id, user_id, payload}`.

- The identities come from the path and the authenticated user.
- Normalization: lowercase hyphenated UUIDs, trimmed observer only, `observed_at` as UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ`, and answers unchanged (no trimming, Unicode normalization or pruning before hashing).
- Key order, equivalent timezone notation, integer versus integral float and negative zero do not change the hash. Answers, array order, binding, owner, project and observation identity do.
- The same UUID, owner and payload returns the original receipt; a different payload is 409 `conflict`. An existing receipt is checked before mutable publication state; authorization is still required.

**Receipt:** `{observation_id, project_id, user_id, accepted_revision, received_at, package_id, zone_id}`. The collector verifies every identity against its stored record before marking it uploaded. The collector stores the exact envelope at record creation and retries that same body.

## Observation reads, filters and exports

| Route | Result |
| --- | --- |
| `GET /v1/projects/{p}/observations` | `{items, next_cursor, total_matching, generated_at}` |
| `GET /v1/projects/{p}/observations/summary` | `{groups, total_matching, generated_at}` |
| `GET /v1/projects/{p}/observations/export?format=csv\|geojson` | One ZIP |
| `GET /v1/projects/{p}/observations/{observation_id}` | Detail |

Static routes are registered before `/{observation_id}`.

**Filters**, shared by list, summary and export:

- `site_id`; `package_id`; `zone_id`, repeatable and ORed together, at most 500 values;
- `round_type`; `observer` (exact recorded string, 1–12 characters);
- `observed_from` (inclusive) and `observed_before` (exclusive), as aware UTC timestamps;
- on the list only, `cursor` and `limit` (1–500).

Rules:

- Different dimensions AND together.
- Zone filters need one `site_id`, and a `package_id` must belong to it. Package plus zone is an exact snapshot; a zone without a package intentionally spans versions.
- Invalid combinations or intervals are 422 `invalid_filter`.

**Items:** observation fields plus the following:

- `site_id`, `site_code`, `site_name`;
- the recorded binding: `zone_id`, `zone_code`, `zone_label` (from the recorded snapshot), `package_id`, `package_version`;
- `spatial_support`; `geometry` (a Point for point events, null for inventories) and `display_anchor` (inventories only);
- `answers`, `form_version`, `observer`, `observed_at`, `received_at`, `revision`, `round_type`, `placement`, `first_round`.

Detail adds the stored form definition JSON. A label is never taken from the current package.

**Paging:** keyset order is `(observed_at DESC, observation_id ASC)`. The cursor carries both values and is bound to the project and the normalized filters (sorted unique zone IDs, normalized UTC bounds); `limit` may change between pages. The predicate is `observed_at < t OR (observed_at = t AND observation_id > id)`. A malformed or mismatched cursor is 422 `invalid_cursor`. `total_matching` is exact for that response's snapshot; later pages may see late uploads, so clients de-duplicate by ID.

**Summary:** `groups` are keyed by `{site_id, package_id, package_version, zone_id, zone_code, zone_label, round_type, spatial_support}`, each with a `count`. Empty results return empty groups and zero counts.

**Export:**

- **Contents:** one `application/zip` holding `observations.csv` or `observations.geojson`, plus `codebook.csv`, `metadata.json`, `forms.json` and `historical-zones.geojson`, all from one authorized snapshot.
- **Metadata:** the project timezone, the UTC interval interpretation, the normalized filters, the generation time, the matching count and the package versions in scope.
- **Forms and codebook:** the exact form definitions used to read the answers. The codebook keeps each version's option meanings.
- **CSV:** neutralizes spreadsheet formula prefixes in text cells.
- **GeoJSON:** null geometry for inventories, joined to the zone file by package plus zone UUID.
- **Limits:** 10,000 records, 33,554,432 uncompressed bytes, 33,554,432 archive bytes and 10 seconds, with a 67,108,864-byte source budget. Exceeding a limit returns 422 `validation_failed` with issue `export_scope_too_large` before any success starts. `cursor` and `limit` are invalid on summary and export.

## Errors

The envelope is `{error: {code, message, details}}`.

**Issues:** geometry and binding issues live in `details.issues: [{code, zone_ids, path, message}]`.

- `path` is an RFC 6901 pointer into the submitted body or stored draft. Point it at the ring or vertex where it is known, and at least at the zone.
- `zone_ids` is empty when no submitted authorized zone can be named.

Issue codes:

- **Geometry:** `invalid_structure`, `self_intersection`, `invalid_topology`, `zero_area`, `outside_site`, `interior_overlap`, `unsupported_extent`, `too_complex`, `empty_zone_set`.
- **Identity:** `duplicate_code`, `duplicate_zone_id`, `identity_conflict`.
- **Binding:** `point_outside_zone`, `package_not_in_site`, `package_not_ready`, `zone_not_in_package`, `form_not_in_package`.
- **Reads and export:** `invalid_filter`, `invalid_cursor`, `export_scope_too_large`.
- **Warnings:** `site_gap`, `small_zone`.

| HTTP and code | Meaning | Client action |
| --- | --- | --- |
| 401 `unauthenticated` / `token_invalid` | Sign-in needed | Pause uploads, keep local data, sign in |
| 403 access codes | Not permitted now | Keep the draft or record and explain |
| 404 `not_found` | Missing or hidden | No existence disclosure; on the site list this means no access |
| 409 `publication_conflict`, `idempotency_conflict`, `conflict` | Concurrent publication or a changed retry | Keep local work and show the conflict |
| 412 `revision_conflict`, 428 `precondition_required` | Stale or missing write precondition | Reload metadata, keep edits |
| 413 `payload_too_large` | Over a body limit | Show the size problem, keep data |
| 422 `validation_failed` | Invalid shape, binding or filter | Show the issues; uploads become needs attention |
| 429 `rate_limited`, 503 `storage_unavailable` | Temporary | Retry with backoff (`Retry-After`), keep data |

Conflict details carry only authorized `draft_id`, `revision`, `etag`, `current_package_id` and `current_package_version`. Error copy is local UI text, never a discriminator. Logs never contain shapes or answers. Validate is limited to 30 requests a minute; publication and uploads of packages to 10 a minute.

## Normalization

**Geometry.**

- **Steps after topology validation:**
  1. Turn every Polygon into a MultiPolygon.
  2. Remove consecutive duplicate positions.
  3. Orient shells counterclockwise and holes clockwise.
  4. Rotate each open ring to its lexicographically smallest `(longitude, latitude)` sequence, breaking ties by full rotation, and close it once.
  5. Sort holes by their canonical sequence, and parts by shell then holes.
  6. Turn negative zero into zero.
- **Unchanged:** nothing else is altered: no simplification, clipping or rounding.
- **Digest:** `geometry_sha256` is SHA-256 of the RFC 8785 bytes of the normalized GeoJSON.
- **Recheck:** PostGIS validates the normalized result again and proves coverage is unchanged. Retraced segments that break topology are not repaired.

**Observations.** See the fingerprint rule above. There is no second algorithm.

## Shared cases

`contracts/zones/geometry.cases.json`, `publication.cases.json` and `upload.cases.json` hold independently authored expected results on synthetic fixtures. Map examples begin at version 1. Cases cover explicit identity mapping on first upload, publish replay with `replayed: true` and a live current pointer, all five validation `change` values, nested-answer uploads and one canonical fingerprint.

CON-06 verifies these artifacts without claiming production runtime compliance. DB-19 and BE-22 consume them in SQL/API acceptance. The backend owns Pydantic and OpenAPI; BE-22 runs `pnpm contracts:generate` twice and checks that the second run is stable. Clients validate downloaded and cached data at runtime. Generated OpenAPI and TypeScript are never hand-edited.

## Data reset

Implementing this contract resets server data (DB-19 squashes migrations into one baseline) and local device data (the collector drops its database on a schema mismatch, MOB-28). Seeds create fresh sites whose first package is `v1`. Hosted resets and deployments still need explicit approval of the exact target.
