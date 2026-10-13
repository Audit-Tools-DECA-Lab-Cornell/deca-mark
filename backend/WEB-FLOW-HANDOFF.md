# Live web workspace: backend handoff

This document describes the implemented API, not the broader endpoint roadmap. Use the
generated [OpenAPI contract](../contracts/openapi.json) for exact schemas and operation IDs.
Implementation status and verification belong to [BE-17](PLAN.md#be-17-complete-the-backend-contract-for-the-live-web-workspace).

## Integration boundaries

Claude owns web routes, components, server-only API wrappers, Server Actions, browser
transfers, UI permission states, cache invalidation, aggregate calculations and export
formatting. Backend changes preserve current upload and list shapes. Client declarations
are generated contract artifacts, never hand-authored application code.

API org/project parameters are UUIDs, not URL slugs. Resolve org slugs and project codes
from `/v1/me` and accessible lists. Site and form-version routes use their existing codes.
Do not substitute the sample project or a hard-coded user when a lookup is empty or fails.

## Flow-to-endpoint checklist

All application routes require a valid non-anonymous Supabase access token. “Member” below
means a project manager, observer or viewer, including inherited manager access for an
organization owner/admin. Training records remain restricted to their creator.

| Web flow | Existing API | Access and interpretation |
| --- | --- | --- |
| Header, switchers, home resolution | `GET /v1/me`, `GET /v1/orgs`, `GET /v1/projects` | Any active account; Training is identified by `is_training`. No study membership is a legitimate empty state. |
| Real profile | `PATCH /v1/me` | Caller only; `display_name`, `observer_initials`, `locale`; omitted means unchanged, null clears. Email comes from authenticated Supabase user claims, not this API. |
| Org projects | `GET/POST /v1/orgs/{org}/projects` | GET returns accessible projects; POST needs owner/admin. |
| Org details/settings | `GET/PATCH /v1/orgs/{org}` | Owner/admin. Ordinary members can resolve their organization using memberships and lists without calling this admin route. |
| Org team | `GET/PATCH/DELETE /v1/orgs/{org}/members[/{user}]` | Owner/admin; owner/admin role changes have additional owner protections. |
| Transfer ownership | `POST /v1/orgs/{org}/transfer-ownership` | Owner; body `{ "user_id": "…" }`; last-owner protection remains enforced. |
| Project settings | `GET/PATCH /v1/projects/{p}` | Member reads; manager writes `name`, `description`, `timezone`, `status`. |
| Project team | `GET/PATCH/DELETE /v1/projects/{p}/members[/{user}]` | Manager; PATCH `{ "role": "manager\|observer\|viewer" }`; no direct add-member operation. |
| Invitations | `POST/GET /v1/{orgs\|projects}/{id}/invitations`, `DELETE …/invitations/{invite}` | Authorized org owner/admin or project manager. Create returns token and code once; lists contain neither. |
| Join/invite | `POST /v1/invitations/preview`, `POST /v1/invitations/redeem` | Signed-in caller; send exactly one of `{ "token": "…" }` or `{ "code": "…" }` in the body. |
| Sites | `GET/POST /v1/projects/{p}/sites`, `GET/PATCH …/sites/{code}` | Member reads; manager creates/edits. New sites can have null package/extent/centre and empty zones. |
| Packages | `POST/GET /v1/projects/{p}/packages`, `GET …/packages/{uuid}`, `GET …/packages/{uuid}/archive` | Manager prepares; members read/download ready packages. List optionally filters by `site` code. |
| Forms | `GET/POST /v1/projects/{p}/forms`, `POST …/forms/{code}/versions` | Members see published/retired versions; managers also see drafts and author forms. |
| Form version | `GET/PUT/DELETE …/form-versions/{code}`, `POST …/form-versions/{code}/{publish\|retire}` | Member reads published/retired; manager reads/writes drafts and changes lifecycle. |
| Data and reports | `GET /v1/projects/{p}/observations` | Member reads; capped array, semantics below. |
| Observation direct link | `GET …/observations/{uuid}` | Member reads; includes historical form/site/round metadata even outside the list cap. |
| Health | `GET /health`, `GET /ready` | Public; readiness verifies database and identity-key availability. |

## Direct observation response

All previous fields remain. Added fields match the list response:

```json
{
  "observation_id": "70000000-0000-4000-8000-000000000001",
  "project_id": "10000000-0000-4000-8000-000000000002",
  "observer": "OB",
  "coordinates": [-76.4857, 42.4483],
  "answers": { "note": "Synthetic record 1 — 🌿" },
  "observed_at": "2026-10-07T14:00:00Z",
  "revision": 1,
  "site_code": "fall-creek",
  "site_name": "Fall Creek test site",
  "form_version": "workspace-check-v1",
  "received_at": "2026-10-08T17:00:00Z",
  "zone": "A",
  "round_type": "standard",
  "first_round": true,
  "placement": "hand"
}
```

These IDs/timestamps illustrate the shape; the local seed manifest supplies actual project
IDs. Fetch `form-versions/workspace-check-v1` to label this record. Never use the latest
published version or package to interpret old answers. Legacy forms can contain `fields`
rather than canonical `questions`; support that existing representation. A retired version's
definition remains the immutable historical definition; its row `state` is authoritative.

## Bounded reports and exports

- List query: `site`, `round_type`, `since`, `limit` (1–500; default 500). Unknown query fields are rejected. `since` compares `received_at >= cutoff`; it is not an observed-date filter.
- Ordering: observation time descending, UUID ascending for ties. Response: an array, with no cursor or total. At exactly 500 rows, treat results as potentially limited.
- Site/round/since filtering happens before limiting. Browser zone/observer/date/search filters see only the returned subset. Describe capped exports and aggregates accordingly, including when browser filtering leaves fewer than 500 displayed rows.
- A site's `observation_count` includes all accessible, non-deleted records at that site. Sum site counts for an unfiltered project count only when all accessible sites are represented. Do not compare that exact count with a filtered/capped report as if their scopes matched.
- Date grouping belongs in the project's IANA timezone, using `observed_at`. `received_at` is useful for upload activity; it can be much later after offline collection. DST boundaries must not be treated as fixed 24-hour local days.
- Legacy null rounds read as Standard; their zone/first-round/placement remain null. Keep unassigned and historical zones in counts/exports even if absent from the newest package.
- Coverage means records present by zone and round type, not completion against an expected schedule. Timestamp-derived recent activity is not an audit log.
- Server summaries, full-data exports and pagination are not implemented in this release. There is no live QGIS database access API. Web CSV/GeoJSON/codebooks use the accessible list and historical form definitions.

## Mutation and transfer behavior

- A new form returns its first draft. `POST …/forms/{code}/versions` with `{}` or `{"definition":null}` copies the newest version. An explicitly empty `{"definition":{}}` is invalid and returns 422.
- Save uses `PUT …/form-versions/{code}` with `{"definition":{…}}`. Publish leaves older versions published. Retire preserves queued mobile uploads against that version. Published definitions cannot be edited or discarded.
- If another manager publishes while save/discard is underway, the losing operation returns 409; if the version disappeared, 404. Concurrent version creation can return 409; refetch before retrying. No successful discard is reported for a version that was published concurrently.
- A site's current package is its highest-version **ready** package. A later blocked package remains in history with checks but does not become current or download. Version selection is per site.
- Package bodies allow 24 MiB; stored archives have their existing 16 MB limit. Use browser-direct authenticated transfers. Archives return `application/zip` and a quoted SHA-256 `ETag`, exposed through CORS. The frontend can name downloads from known package IDs; `Content-Disposition` is not currently exposed cross-origin.
- Invites do not send email. Preview consumes no use; redeem changes membership atomically. Repeated redemption by an existing member is an error and does not consume another use. Preview and redeem share a per-user rate bucket; handle 429 using `Retry-After`.
- Archive is currently a stored project status, not a security revocation or a write lock. Archived projects remain accessible and pending offline uploads are accepted. Unarchive changes the status back to active. Do not promise that archiving prevents collection.
- Permission changes apply to subsequent API requests through database role checks. Refresh `/v1/me` and invalidate workspace data after membership/ownership changes.

Errors use the existing envelope, for example:

```json
{"error":{"code":"validation_failed","message":"Request validation failed","details":{"fields":[{"id":"timezone","problem":"Use a valid IANA timezone"}]}}}
```

Handle 401 as sign-in required, 403 as denied, 404 as absent/inaccessible, 409 as a conflict,
413 as oversized input, 422 as validation failure, 429 as throttled, and 503 as temporarily
unavailable. Invitation expiry can return 410. Unexpected 500 responses are sanitized and
now retain CORS headers and `X-Request-Id` for an approved origin. Rejected CORS preflights
retain the middleware's plain-text 400 behavior. Do not turn a failed fetch into an empty list.

## Repeatable local browser acceptance

Start local Supabase with `pnpm db:start`. Run the API from `backend/`:

```sh
DECAMARK_CONFIG=config.auth-local.json uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src --port 8001
```

Then, from the repository root:

```sh
node --test database/seed-web-workspace.test.mjs
node database/seed-web-workspace.mjs
```

The seed obtains local runtime keys from pinned Supabase CLI status in memory, refuses
hosted origins/redirects, and ignores hosted environment variables. It creates confirmed
synthetic Auth accounts and uses authenticated API calls for application data. Re-running
preserves existing data and replays the same eight observation IDs without duplication;
it does not reset the database or overwrite a changed role or retired fixture form.

Accounts are `owner`, `admin`, `manager`, `observer`, `viewer`, `outsider`, `joiner` and
`other-owner` at `@fieldmaps.test`. Their public test password is
`FieldMaps-local-only-42!`. The joiner/outsider have no study access; other-owner owns a
second organization. Org owner/admin access is inherited, with no explicit project
membership required. Profiles have distinct real test names.

`database/.local/web-workspace.json` contains public configuration, IDs, account emails,
record IDs and expected baseline counts. It contains no access tokens or admin keys.
Configure the web app against its local Auth/API URLs and public key using Claude's
normal configuration flow. The workspace route is `/o/web-acceptance/p/play-study`.

Initial dataset (current contract, 2026-10-12): two sites (Fall Creek and an empty site),
one ready map-v1 package, a published synthetic test form and a draft, and eight observations on
2026-10-07: four Standard, two Reliability, two Inventory, all in Zone A. They are not
Janet's real research data. Browser mutation tests should create their own resources or
account for additional records; rerunning the seed deliberately does not erase them.
The current seed supplies UUID site/package/zone bindings, nested answers and an
explicit Inventory form binding. Point locations use the recorded zone's display
anchor; inventories have no coordinates. Invalid imports are rejected rather than
persisted as blocked fixture packages. Existing browser specs remain unchanged;
their API consumers must follow BE-22's current contract through WEB-36/WEB-39/WEB-42.

`sh scripts/e2e-local.sh --zones` also seeds the separate synthetic zone-review project.
See [the local database guide](../database/README.md#schema-and-access) for its 520-row
history fixture, public accounts and `E2E_ZONE_MANIFEST`.

## Release checklist

- No new database migration is required by these backend changes. Existing site/form migrations must already be present on the target.
- Regenerate and verify OpenAPI and both app declaration files together. Deploy a compatible API before relying on the new detail fields in the frontend.
- Run API/SQL and mobile compatibility checks locally. Claude owns integrated browser E2E, copy, accessibility and screenshots.
- For separately authorized hosted deployment: confirm the restricted database role, readiness, approved browser origins, actual DECA Lab / Play Study memberships and browser upload/download behavior. Do not run the local seed against hosted services or create a duplicate study.
- Hosted readiness, Janet's account access and device/browser acceptance are separate evidence; local test results do not establish them.

## Verification (2026-10-08)

Baseline: master `380a626` (the only upstream change since the planning checkout was a mobile
version bump). Verified in the managed local workspace:

| Check | Result |
| --- | --- |
| Full FastAPI suite against local Supabase | 293 passed; existing Starlette/SQLAlchemy deprecation warnings |
| SQL application tests, Auth-hook tests, hosted verification script against local DB | Passed; transactional SQL fixtures rolled back |
| Ruff and BasedPyright from `backend/` | Passed, no type errors or warnings |
| Mobile Vitest | 433 passed across 40 files |
| Mobile typecheck and lint | Passed; five existing informational Biome suggestions |
| Form engine parity | Passed |
| Generated OpenAPI and app declarations | Regenerated; app declaration files identical; API contract test passed |
| Node script/seed guard tests | Four passed (two existing script tests, two seed guard tests); included in CI |
| Plan consistency and whitespace checks | Passed |
| Seed repeatability | Two successful runs, eight unique observations; 4 Standard / 2 Reliability / 2 Inventory |
| Running API + real local Auth | Readiness, sign-in, inherited owner/admin management, viewer/observer restrictions, unrelated-tenant denial, CORS upload preflight, archive response headers and SHA-256 passed |

The CORS regression was reproduced before the fix. New database regression tests cover
499/500/501-row boundaries, deterministic timestamp ties, historical definitions, Unicode,
received-time filtering and an observed timestamp at a DST boundary, revoked access,
archive/offline-upload behavior, blocked-package selection, and concurrent form/package
mutations. The four initially failing race tests used an unsupported local role switch;
they now connect as the actual restricted API role on a separate transaction and pass.

Environment notes: local Supabase CLI 2.118.0, Postgres image 17.6.1.171, Auth and the API
ran locally. The pinned Postgres filesystem was flattened into one Docker layer to fit this
environment's VFS storage; no schema or image application files were changed. Optional
Studio, Realtime, Storage and Edge services were not needed for this backend acceptance.
Email delivery, frontend browser rendering, physical devices and hosted deployment were
not verified. No production account, credential, study data or hosted configuration was changed.
