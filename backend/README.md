# DECA Mark observation API

Transactional email uses Brevo REST with a durable private outbox; authentication
uses Brevo SMTP through Supabase. See [email setup and delivery](../docs/Brevo-Email.md)
for shared Contour templates, required host variables, hosted setup, and verification.

The [live web workspace handoff](WEB-FLOW-HANDOFF.md) documents current endpoint roles,
recorded observation metadata, cursor/summary/complete-export semantics and local browser fixtures. The [current roadmap](../docs/plan/current-state.md) separates source/local acceptance from hosted/client release gates.

FastAPI, SQLAlchemy, and PostgreSQL/PostGIS implement the first authenticated, append-only upload slice. The mobile app saves to SQLite first. MOB-29 implements immutable bound foreground uploads, exact observation/account/project/package/zone receipt checks, structured rejection retention and reconnect/resume/retry. Disposable loopback API/SQLite acceptance passes actual install, save, restart, newer publication, replay, conflicting-body 409 and point/Inventory export; native QGIS demo/live-export readback also passes. The physical iPad/Android collector scenario remains pending. See [current acceptance evidence](../docs/reviews/mob29-2026-10-15/README.md). QGIS can consume the same committed database records through a scoped GIS view. QGIS itself is not the synchronization server.

## Run locally

Start Docker Desktop, then run from the product root:

```sh
pnpm db:start
pnpm backend:test
```

From `backend/`, start the API with `uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src --port 8000`. Stop any existing API on that port first. `config.local.json` points to local Supabase port 54322 and its generated ignored password file. `pnpm db:stop` preserves local database volumes; `pnpm db:reset` explicitly recreates the local schema and fictional fixtures.

Tests use ephemeral signing keys and fictional accounts on local Supabase, with real RLS through `fieldmaps_api`. `config.local.json` retains the hosted identity provider for existing development installs. To use local Auth as well as local Postgres, start from `backend/` with `DECAMARK_CONFIG=config.auth-local.json uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src --port 8001`. Set the web server's `DECAMARK_API_URL` to `http://127.0.0.1:8001`. HTTP identity URLs are allowed only on literal loopback hosts. There is no test-user bypass in the running API. `/health` is liveness. `/ready` checks the database, the current site/package read helpers and the cached signing-key set; it returns 503 when any is unavailable. Startup refuses database roles that are superusers or can bypass row security.

Both local configurations set `email_delivery_allowed: false`. The API ignores provider
settings for these configurations, even when `EMAIL_ENABLED=true`, and never starts its
delivery worker. Invitations remain available for manual sharing. Local Supabase Auth
mail is captured by Mailpit. Hosted configurations retain provider-controlled delivery.

Observation list, summary and export accept `bbox=west,south,east,north` in WGS84 degrees,
for example `bbox=-77,42,-76,43`. Bounds are finite, within longitude/latitude limits,
and require west < east and south < north; crossing the antimeridian requires separate
requests. Point boundaries are inclusive. Inventory records have no event geometry and
are excluded from viewport queries; their display anchors are not point observations.
The viewport shares all other filters and is part of the cursor's scope, so changing it
requires a new first page. Exports retain the viewport in their metadata.
The spatial predicate preserves existing RLS. In the restricted-role local plan,
PostgreSQL uses a project index before evaluating `ST_Intersects`; the geometry GiST
index is not selected under the current policies.

`make -C database api-build api-test` builds separate runtime and test images and runs the API suite against the existing local database. The test image includes pytest and Docker tooling for SQL fixtures; the runtime image contains neither and runs as UID 10001. Runtime-mounted password files must be readable by that user. The runtime health check uses the configured `PORT` and calls `/health`.

For the separate API connected to hosted PostGIS, use [Supabase setup](../docs/Supabase-Setup.md).

## Configure a development identity provider

Create/select a Supabase development project, use its asymmetric JWT signing key (ES256 or RS256), and create a test email/password account through its Auth dashboard. Configure the project's public values in `backend/config.local.json`:

```json
{
	"database_url": "postgresql+asyncpg://fieldmaps_api@127.0.0.1:54322/postgres",
	"database_password_file": "../database/.local/fieldmaps-api-password",
	"issuer": "https://YOUR_PROJECT.supabase.co/auth/v1",
	"jwks_url": "https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json",
	"audience": "authenticated",
	"browser_origins": ["http://localhost:3000", "https://decamark.vercel.app"],
	"browser_origin_pattern": "https://deca-?mark-[a-z0-9-]+-audit-tools-web-apps-deca-lab-at-cornell\\.vercel\\.app"
}
```

`browser_origins` names the origins the management application is served from. Both configurations list localhost as well as the deployed site, because `pnpm api:hosted:up` runs this API on the development machine against the hosted database — a browser on `localhost:3000` is a normal caller of either one. `localhost` and `127.0.0.1` are different origins to a browser, so both are listed. A browser
preflights any cross-origin call carrying an `Authorization` header, and the default is an empty
list — no origin allowed — so base map upload from the web application fails until its origin is
named here. It is an allowlist by design: a wildcard would let any page a signed-in manager has
open spend their token.

`browser_origin_pattern` covers the origins that cannot be listed one by one — Vercel names a
preview deployment `<project>-git-<branch>-<team>.vercel.app`, a new host per branch. The pattern
must match the whole origin (Starlette applies `fullmatch`), and the team slug is what makes it
safe: a host ending in someone else's team, or in a suffix like `.vercel.app.evil.invalid`, does
not match. Escape the dots. A pattern the regex engine cannot compile is refused at startup, not
per request.

These issuer/JWKS values are public. JWT verification needs no Supabase secret key. Account deletion separately requires the optional Auth Admin key described below. It validates the JWT signature, expiry, audience, and issuer and derives the user UUID from the signed subject. Legacy HS256 projects must switch to a supported asymmetric signing key before using this verifier. See [Supabase JWT documentation](https://supabase.com/docs/guides/auth/jwts).

Tenancy functions create organizations, projects and memberships. `GET /v1/me` now creates an active caller's profile and Training membership; organization and project management endpoints are available through the API. For manual local provisioning, create the matching Auth and profile rows before inserting a membership. Signing in alone grants no study-project access. From an authorized local administrator SQL session, replace `AUTH_USER_UUID` in this statement:

```sql
INSERT INTO fieldmaps.project_memberships (user_id, organization_id, project_id, role)
SELECT 'AUTH_USER_UUID'::uuid, organization_id, id, 'observer'
FROM fieldmaps.projects
WHERE id = '10000000-0000-4000-8000-000000000002'
ON CONFLICT (user_id, project_id) DO NOTHING;
```

Rebuild/restart the API after public config changes. Configure the same provider and project in [mobile connection settings](../mobile/README.md#enable-the-connected-development-slice), then rebuild the native development client for SecureStore and NetInfo. The Supabase account's database is not used by this local slice: Supabase supplies identity; observations remain in local PostGIS.

## Deploy it

The image carries every configuration it might run under and picks one at startup from the
`DECAMARK_CONFIG` environment variable. Unset, it reads `config.local.json`, which is the local
development file and names localhost Supabase — so a deployed container that does not set this
variable cannot start unless its configured local database is reachable with a restricted role.

On [Render](https://render.com/docs/docker), deploying `backend/Dockerfile`:

| What | Where | Value |
| ---- | ----- | ----- |
| Environment variable | `DECAMARK_CONFIG` | `config.render.json` |
| Secret File | `database-password` | the `fieldmaps_api` role's password, nothing else in the file |

That is the whole list. Everything else — the pooler URL, the TLS settings, the CA path, the
identity provider, the browser origins — is public and lives in `config.render.json`, which
differs from `config.hosted.json` only in where the password is read from: Render mounts Secret
Files at `/etc/secrets/<name>`, and `make api-hosted-up` mounts a volume at
`/run/fieldmaps-secrets`.

`PORT` is set by the host and the container honours it, falling back to 8000. Choose a region
close to the database; this configuration points at `aws-0-us-east-1`.

Two things a deployment still needs that are not in this repository: the web application's
origin must appear in `browser_origins` before a browser there can call the API, and
`NEXT_PUBLIC_DECAMARK_API_URL` in the web deployment must name the API. Missing either one and
base map upload fails in the browser rather than at the API.

Successful `/health` and `/ready` probes are logged at DEBUG, so normal INFO logs do not fill with host probes. Failed probes remain at INFO. Other request logs include the static operation ID and HTTP method, without URL values, query strings, headers or bodies. The container probes `/health` every 30 seconds; the hosting platform also runs its own checks. A steady stream of zero-millisecond 200s can be probes rather than workspace reads.

## Organizations, projects and invitations

`POST /v1/orgs` accepts `{"name":"Field Study","slug":"field-study","project":{"name":"First survey","code":"first-survey","timezone":"America/New_York"}}`. It atomically creates the organization, its owner membership and first project. An account may own at most three organizations. Read them with `GET /v1/orgs`, and their accessible projects with `GET /v1/orgs/{org}/projects`.

Owners/admins can edit organization details and create projects. Managers can edit project details and manage project members. Membership changes and ownership transfers use database functions that enforce the caller's role and prevent removing the last required owner/manager. People join through invitations rather than direct membership insertion.

Organization and project invitation endpoints create, list and revoke invitations. Creation returns the token and short code once; stored hashes and credentials never appear in lists. `POST /v1/invitations/preview` and `/redeem` accept either `{"token":"…"}` or `{"code":"…"}`. Preview reveals the destination and role without consuming a use or exposing a bound email. Redemption checks email binding, expiry and remaining uses atomically. Invitations default to one use and seven days. Revocation and member mutations return 204.

## Account deletion

`DELETE /v1/me` requires a runtime-mounted Supabase secret key (`sb_secret_…`). Set the optional `auth_admin_key_file` configuration field to that file's path, for example `/etc/secrets/supabase-secret-key` on Render. It is used only for the Auth Admin deletion call and never committed. Only `sb_secret_` keys with a nonempty, header-safe ASCII suffix are accepted; publishable keys and legacy JWT keys are rejected. Missing, unreadable or malformed configuration returns `503 storage_unavailable` before account data changes.

The API commits `forget_user()` first, removing memberships and clearing personal profile fields. A sole owner with other organization members, or the last project manager, receives `409 sole_owner` with no account change. It then calls the configured issuer's `/admin/users/{user_id}` endpoint with the key in `apikey`. Each request has a five-second I/O timeout and ten-second overall deadline, with one retry. Redirects are refused. Success or an already-absent Auth user (404) returns an empty 204.

If both attempts fail, the API returns `202 {"status":"pending"}`. The profile's `deleted_at` persists, prevents rejoining or restoring the account, and remains until Auth deletion cascades the profile away. Clients can repeat DELETE before signing out; GET/PATCH remain forbidden. ERROR logs and Sentry contain only the pending event and user UUID, without the key, upstream response body or exception detail. Pending profiles require operator follow-up if clients stop retrying; automated reconciliation is not implemented. Staging and production still require the runtime Secret File and deployed acceptance verification.

Local Supabase Auth may use HTTP only on literal `localhost`, `127.0.0.1` or `[::1]`. Other identity-provider hosts require HTTPS.

## Contract and guarantees

### Zone drafts and versioned packages

Zone draft create/list/get/replace/validate/discard/publish use
`/v1/projects/{project_id}/sites/{site_id}/zone-drafts`; site IDs are UUIDs. Managed
package publication and successor imports use `POST /v1/projects/{project_id}/packages`
with a required `expected_current_package_id`, request ID and explicit zone identity map.
The first package supplies a null expected-current value; successors supply the exact
current package ID. QGIS source conversion remains a separate
`POST /v1/projects/{project_id}/packages/import` operation. Package and site reads use the
same `/v1` API, including historical `/sites/{site_id}/zones?package_id=…` reads. There is
no `/v2` zone or observation API and no runtime publication gate. Display capability hints
do not replace server-side role, package-state or geometry validation. See [the zone
handoff](ZONE-BOUNDARIES.md) and [frozen contract](../docs/plan/zone-boundaries/contract.md)
for bodies and preconditions.

A managed successor import selects its published play `form_version`; omitted
`inventory_form_version` inherits, null disables, and a published code replaces inventory.
Retire a bound form only after replacing it in all current managed packages; old packages
retain their historical bindings. Historical package snapshots and observation attribution
remain immutable.

Draft replacement bodies have a 4 MiB streamed limit and refuse unsupported content encoding.
Validation permits 30 requests/minute per verified user; publication and package submission
share 10 requests/minute. These token buckets and the two-worker geometry/archive capacity
are per process. Zone work has a 45-second deadline; SQL statements have 20 seconds and locks
3 seconds. Archive subprocesses have a 30-second deadline with cancellation and, on Linux,
20-second CPU, 1 GiB address-space and 16 MiB output-file ceilings. Temporary work occurs
outside publication row locks. Overload/timeouts leave drafts and current packages intact.
Access logs add static operation IDs and safe zone/archive counts without geometry or answers.

Run `ZONE_API_REHEARSAL=1 pnpm backend:test` for a fresh disposable PostgreSQL/PostGIS API
rehearsal without using local database password files. Observation uploads use
`PUT /v1/projects/{project_id}/observations/{observation_id}` with nested answers and exact
published package/zone IDs. Authorized uploads may reference superseded packages and retired
frozen forms. Point coverage and Inventory anchors are enforced by PostGIS; clients cannot
supply a substitute Inventory coordinate. A retry authorizes again and returns the original
receipt only for the same owner, project and immutable body. Upload identity uses RFC 8785
canonical bytes before answer pruning. Duplicate JSON keys, invalid Unicode and encoded bodies
are rejected; observation bodies retain the 256 KiB limit.

Observation reads expose paginated lists, historical detail, summaries and complete exports
under `/v1/projects/{project_id}/observations`. Lists use mixed-direction keyset cursors bound
to the project and normalized filters; each page's rows and exact count share one SQL snapshot.
Later pages may include new uploads. Site, historical package, zone, round, observer and
half-open UTC date filters apply consistently to lists, summaries and exports. Recorded
package/zone labels and form definitions remain historical; Inventory event geometry is null
and its display anchor is explicit.

RLS limits research observers to their immutable `created_by` user ID, including counts,
summaries and the invoker-scoped GIS observation views. Observer initials are a research
label and never establish ownership. Viewers/managers and inherited organization
owners/admins can review all permitted research records. Training always stays
creator-only, including for reviewers. Current project access is still required for
creators; revocation hides their records and denies retries.

Exports require a research viewer or manager (including inherited organization
owner/admin authority). Observers and all Training projects receive `403 role_required`.
Missing project access retains the normal `404 not_found` response.

`/export?format=csv|geojson` returns a ZIP containing observations, a codebook, scope
metadata, frozen forms and separate historical-zone GeoJSON. Export limits are 10,000
records, 32 MiB of combined uncompressed assets, 32 MiB of ZIP bytes and 10 seconds;
the source snapshot has a separate 64 MiB limit. Oversized scopes return a structured
422 requiring narrower filters. Two serializer processes may run concurrently per API
process; exhaustion returns 429 with `Retry-After: 2`. Disconnects and deadlines cancel
work and release sessions, subprocesses and temporary files. Local API acceptance does
not establish device retention or release readiness.

Requests have an `X-Request-Id`, echoed in responses. Access logs contain that identifier, response status and elapsed time, never request bodies, tokens or answers. `SENTRY_DSN` optionally enables sanitized API error events; no DSN is needed locally. Database errors are mapped by SQLSTATE: permission and validation failures retain their proper status, transient failures return 503, and unexpected errors return a sanitized 500.

Bodies are limited before JSON parsing: managed package submissions and QGIS source imports
have 24 MiB, sync uploads 256 KiB, zone draft replacements 4 MiB, and other requests 256 KiB.
Oversized managed package, upload and draft streams return
`413 payload_too_large`, even if the Content-Length header is absent or incorrect. Per-user
token buckets allow five organization creations/hour, 60 invitation creations/hour, ten
combined invitation previews/redemptions per ten minutes, and three account-deletion requests
per hour. Exhaustion returns `429 rate_limited` with `Retry-After`. These limits are in memory
per API process, suitable for the single-instance pilot; multiple workers or replicas require
shared limit storage. Restarting the process resets its buckets. The deletion policy applies
to `DELETE /v1/me`.

The app factory in `main.py` includes identity, tenancy, collection and site routers. Routers keep authenticated transactions open around services; they complete the transaction before returning a response. `deps.py` sets the caller's database identity for each transaction. Services own validation, preparation and conflict decisions; repositories perform typed SQL access through matching `queries/` modules. Pure form and map-package logic lives under `domain/`.

`make -C backend openapi` exports sorted `contracts/openapi.json` using dummy configuration, without reading secrets or opening database/network connections. `pnpm contracts:generate` also regenerates each app's TypeScript declarations. CI checks these artifacts for drift. JWT verification permits 30 seconds of clock skew and rejects anonymous tokens.

`GET /v1/me` returns `profile`, `organization_memberships` and `project_memberships`. Organization owners/admins see their inherited projects with the manager role. `PATCH /v1/me` returns the profile; omitted fields are unchanged and explicit null clears nullable fields. Display names are trimmed to 1–100 characters, observer initials use 1–10 uppercase letters/digits, and locales are trimmed to 1–100 characters. Forgotten profiles and missing Auth users return `403 account_deleted`. All identity database scenarios passed against local Supabase on 2026-10-03.

API exceptions use one response envelope, also declared in OpenAPI:

```json
{"error":{"code":"validation_failed","message":"Request validation failed","details":{"fields":[{"id":"coordinates","problem":"Field required"}]}}}
```

Missing credentials use `unauthenticated`; rejected tokens use `token_invalid`. Both remain HTTP 401 with a Bearer challenge. Validation responses contain field identifiers and messages without the submitted input or validation context. Unexpected failures return a generic HTTP 500 response. Rejected CORS preflights retain the middleware's existing plain-text HTTP 400 response.

Success bodies, URLs, status codes and archive headers are unchanged by BE-03. Web and mobile now parse the error envelope through their typed API helpers, using local user copy and error codes for retry/sign-in/rejection. Unrecognized responses remain retryable on mobile to preserve collected records.

| Endpoint                                         | Behavior                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `GET /v1/me`                                    | Bootstrap/read the caller's profile and memberships                |
| `PATCH /v1/me`                                  | Update only the caller's display name, observer initials or locale |
| `DELETE /v1/me`                                 | Forget the account, then delete its Auth identity; 202 if pending |
| `GET /v1/projects`                               | Projects visible to the verified account                          |
| `PUT /v1/projects/{project}/observations/{uuid}` | Validate and commit a new point or acknowledge an identical retry |
| `GET /v1/projects/{project}/observations/{uuid}` | Read a permitted observation                                      |
| `POST /v1/projects/{project}/packages`            | Validate and publish a zone-bound package version                 |
| `POST /v1/projects/{project}/packages/import`     | Convert uploaded QGIS vector sources for review without saving a package |
| `GET /v1/projects/{project}/packages`             | List published package versions and their state                   |
| `GET /v1/projects/{project}/packages/{package}`   | Read one package's manifest and every check it ran                |
| `GET /v1/projects/{project}/packages/{package}/archive` | Download the zip; the ETag is its `sha256`                  |

The observation PUT body is bound to `site_id`, `package_id`, `zone_id`, `form_version`, `observer`, timezone-aware `observed_at`, and an `answers` object. Standard and reliability rounds also send `round_type`, `placement: "hand"`, `first_round` and coordinates; Inventory sends `round_type: "inventory"` and `placement: "zone"` without coordinates or `first_round`. The server resolves the site, immutable package, zone and form, checks point coverage or Inventory semantics, and validates answers against the package's form definition. Unknown fields and invalid bindings are rejected; answers are never accepted as top-level fields.

The collector stores and retries the exact envelope for an observation. The server fingerprints the canonical request, authorizes every retry, and returns the original receipt only for the same observation, owner, project and body. Form definitions remain attached to the published package snapshot, so later form changes do not reinterpret historical observations.

A package submission carries a UUID `site_id`, the selected form versions, the GeoJSON layers (`ground` and `zones` required, `paths` and `trees` optional), an explicit zone identity map, a request ID and the expected current package ID. An optional `.qgz`/`.qgs` project file is base64 encoded, so no multipart dependency is needed. The server validates and prepares the archive before publication; failed checks return a structured error and leave the current package unchanged. Only a ready package is published and downloadable. Network tile sources are rejected unless redistribution is permitted. The archive carries no clock, so its `sha256` is a content identity: identical content produces stable bytes and an ETag. Preparation time lives in the response and package row, not inside the zip. Published rows are immutable and require manager authority.

The upload receipt includes observation, project and user UUIDs, original `received_at`, `accepted_revision: 1`, `package_id` and `zone_id`. New uploads return 200 after commit. Identical retries return the original receipt with 200; conflicting content returns 409 and preserves the original. A lost response can therefore be retried without duplicate records.

Project membership is enforced in both the API lookup and database row policies. The API uses a restricted non-owner role with transaction-local identity, preventing pooled connections from retaining another account's context. It can select permitted rows and insert observations; it cannot edit/delete observations or grant membership. The SQLite queue keeps records until matching receipt verification and never uploads unassigned practice records.

## Form draft preconditions

Form summaries and details include `revision` and `etag`. Detail GET and successful PUT
also return the ETag header. A new draft starts at revision 1; every successful edit,
including a save with identical content, advances it. The strong precondition is
`"form-draft:<version UUID>:<revision>"`, so a discarded/recreated version code cannot
reuse an earlier draft's precondition.

Send that exact value in `If-Match` for draft PUT, DELETE and POST `/publish`.
Missing, weak, wildcard, list or malformed preconditions return 428; a changed revision
or draft identity returns 412. Existing 403/404 authorization and 409 frozen-version
protections remain. There is no unconditional write fallback.

Save and discard compare identity, draft state and revision in their SQL mutation.
Publication validates the definition at the requested revision, then checks that revision
again while holding the version row lock before freezing it. A competing edit either
advances the revision first and prevents publication, or waits behind publication and
cannot edit the frozen version. Publication retains creator/publisher attribution and
leaves historical definitions and observation/package bindings intact.

Use the returned ETag after saving. A publication request must carry the ETag belonging
to the displayed review, without a last-minute fetch to adopt newer content. On 412,
reload/reconcile edits or review the current draft explicitly; never automatically retry
with a fresh precondition. See the separate [remediation evidence](../docs/reviews/form-revisions-2026-10-16/README.md).

## QGIS conversion

`POST /v1/projects/{project}/packages/import` accepts `files`, an array of base64 `ProjectFile` objects. Managers can upload one `.qgz`/`.qgs` with its sources, optionally in a ZIP. The response returns the original `.qgs` as `project_file`, converted `layers` (`name`, `collection`), and per-layer `issues`. It neither creates a site nor saves a package. Clients review and assign the converted layers, optionally replace them with GeoJSON, then submit a package using `site_id`, `zone_identity_map`, `expected_current_package_id` and the other publication fields.

Fiona's bundled GDAL reads only uploaded GeoPackage, shapefile and GeoJSON datasets through a fixed driver list. A layer's QGIS CRS assignment takes precedence over dataset metadata; coordinates are converted to EPSG:4326. Remote sources are not fetched. Missing/ambiguous sources, unsupported providers, raster layers and filtered layers return actionable issues. The original project remains available for preparation checks, including imagery policy. Uploaded ZIP paths, symlinks, encryption, duplicate paths and XML entities are rejected. The standard inert QGIS DOCTYPE is allowed without fetching its URL.

Conversion runs in a temporary subprocess with no inherited credentials, at most two simultaneous conversions per API process and a 45-second overall deadline. Limits are 16 MB of selected inputs, 64 MB of counted archive expansion, 256 archive members, two archive levels, 64 layers, 20,000 features per layer and 16 MB of result data. Linux also applies CPU, memory and file-size limits. These are resource and format restrictions, not an operating-system sandbox. Install the locked Fiona dependency in the API deployment; no QGIS Desktop installation is needed.

## Verification and limits

`pnpm backend:test` exercises real local Supabase, including token rejection, membership checks, connection-pool isolation, conflicting/concurrent retries, input boundaries, and restricted GIS readback. It also covers the error envelope, framework errors, sanitized failures and OpenAPI responses. Run `pnpm backend:check` for Ruff and BasedPyright. Current SQL verification is recorded in [the database README](../database/README.md). Native sign-in, mobile-to-running-API reconnect, and QGIS Desktop refresh still need a configured account/device acceptance run.

This is a local development service. Local Supabase is development infrastructure and must not be deployed as a production database. Production rollout still needs approved region/retention choices, a public HTTPS API deployment, managed secret injection, network restrictions, backups, monitoring, and API resource limits. The API has no attachments, update/delete synchronization, incremental sync-download cursor, or closed-app mobile background synchronization yet. Package manifests and archives are available through the versioned API; archive bytes remain transactional in the database and are capped at 16 MB. Mobile offline pinning, retention and restart behavior still require the dependent mobile implementation and device acceptance.

Use QGIS read-only access for this slice; arbitrary GIS edits do not yet synchronize back to devices. The local database listens on port 54322; a QGIS Desktop login is not provisioned by these commands. The GIS test validates the database view, not the desktop application's behavior.

References: [FastAPI typed responses](https://fastapi.tiangolo.com/tutorial/response-model/), [Supabase mobile auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [PostGIS](https://postgis.net/).
