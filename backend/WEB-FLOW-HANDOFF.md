# Live web workspace: backend handoff

Reconciled 2026-10-15. This is the active integration handoff; exact schemas and operation IDs live in the generated [OpenAPI contract](../contracts/openapi.json). BE-22 supersedes BE-17’s original capped-array contract. Task status belongs in [PLAN.md](PLAN.md); the next sequence is in the [current roadmap](../docs/plan/current-state.md). The 2026-10-08 verification section below remains dated evidence, not a current hosted snapshot.

## Integration boundaries

Claude owns web routes, components, server-only API wrappers, Server Actions, browser
transfers, UI permission states, cache invalidation, presentation and download
handling. Backend supplies shared authorized aggregation/export semantics. Client declarations
are generated contract artifacts, never hand-authored application code.

API org/project parameters are UUIDs, not URL slugs. Resolve org slugs and project codes
from `/v1/me` and accessible lists. Site routes use site UUIDs; form-version reads retain their code-based contract.
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
| Sites | `GET/POST /v1/projects/{p}/sites`, `GET/PATCH …/sites/{site_id}` | Member reads; manager creates/edits. New sites can have null package/extent/centre and empty zones. |
| Packages | `POST/GET /v1/projects/{p}/packages`, `GET …/packages/{uuid}`, `GET …/packages/{uuid}/archive` | Manager publishes with explicit identity mapping and expected current package; members read/download ready current or historical packages. List optionally filters by `site_id`. |
| Forms | `GET/POST /v1/projects/{p}/forms`, `POST …/forms/{code}/versions` | Members see published/retired versions; managers also see drafts and author forms. |
| Form version | `GET/PUT/DELETE …/form-versions/{code}`, `POST …/form-versions/{code}/{publish\|retire}` | Member reads published/retired; manager reads/writes drafts and changes lifecycle. |
| Data and reports | `GET /v1/projects/{p}/observations` | Member reads; filter-bound cursor envelope and exact counts, semantics below. |
| Observation direct link | `GET …/observations/{uuid}` | Member reads; includes exact recorded package/zone/form context independently of the visible page. |
| Health | `GET /health`, `GET /ready` | Public; readiness verifies the database, current site/package read helpers and cached identity keys. |

## Recorded observation detail

Read `GET /v1/projects/{p}/observations/{id}` directly; the visible table page is not the source of truth for a deep link. Detail carries exact recorded package/zone/form context, frozen labels and answers. Fetch the bound historical form to interpret answers, including an authorized retired form; never use today’s package or current form selection. Inventory event geometry is null and its recorded display anchor is separate from an event location. See [the canonical read/export contract](../docs/plan/zone-boundaries/contract.md) and [backend guarantees](README.md#contract-and-guarantees).

## Current analysis and exports

- `/v1/projects/{p}/observations` returns cursor pagination with exact matching/point/Inventory counts. Filter before pagination, aggregation and export; bind cursors to the project and normalized filters. A visible page is not the complete dataset.
- `/observations/summary` computes authorized aggregates in SQL. The map, table, summary and export use the same server filter definition. Dates use the project’s IANA timezone; offline `received_at` can differ from observation time.
- `/observations/export?format=csv|geojson` returns a complete authorized snapshot ZIP with observations, historical zones, codebook, metadata and exact forms. At configured record/byte/deadline limits the server refuses explicitly; it never quietly exports the first page. Separate requests during concurrent writes are separate snapshots.
- Inventory references the whole recorded zone and never enters point counts. Historical snapshots use exact package+zone identity rather than current labels or boundaries. Coverage means recorded activity, not protocol completion.
- BE-14 retains broader viewport/domain analysis; BE-15 and GIS-01/GIS-02 retain live reader access. File exports and local QGIS checks do not establish provisioned live GIS access.

## Mutation and transfer behavior

- A new form returns its first draft. `POST …/forms/{code}/versions` with `{}` or `{"definition":null}` copies the newest version. An explicitly empty `{"definition":{}}` is invalid and returns 422.
- Save uses `PUT …/form-versions/{code}` with `{"definition":{…}}`. Publish leaves older versions published. Retire is refused while a current package binds the version; publish a successor first. Exact retired bindings remain readable and valid for authorized delayed uploads. Published definitions cannot be edited or discarded.
- If another manager publishes while save/discard is underway, the losing operation returns 409; if the version disappeared, 404. Concurrent version creation can return 409; refetch before retrying. No successful discard is reported for a version that was published concurrently.
- A site’s current package comes from its explicit `site_zone_state` pointer, updated only by trusted atomic finalization. Ready historical packages remain readable; failed validation cannot activate an incomplete package. Publication replay returns its original package and the actual current pointer without reverting that pointer.
- Package bodies allow 24 MiB; stored archives have their existing 16 MB limit. Use browser-direct authenticated transfers. Archives return `application/zip` and a quoted SHA-256 `ETag`, exposed through CORS. The frontend can name downloads from known package IDs; `Content-Disposition` is not currently exposed cross-origin.
- Email-addressed invitations enqueue transactional Brevo delivery when configured, with explicit `email_delivery` state; code/link creation does not prove delivery. See [email delivery](../docs/Brevo-Email.md). Preview consumes no use; redeem changes membership atomically. Repeated redemption by an existing member is an error and does not consume another use. Preview and redeem share a per-user rate bucket; handle 429 using `Retry-After`.
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

- The target must have the approved current baseline and compatible API. DB-19 replaces the old migration chain; existing hosted schemas/packages require explicit reconciliation before release. The 2026-10-08 no-migration conclusion below does not apply to BE-22.
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
