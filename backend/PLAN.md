# API plan (`backend/`)

This file is part of the [DECA Mark production plan](../docs/plan/README.md) and defines the `BE-*` tasks.
- The [web flow completion proposal](WEB-FLOW-PLAN.md) scopes the backend work supporting Claude's live-web implementation; task status remains in this file and the other owning plans.
- **Endpoint shapes and the error envelope** are owned by [contracts.md](../docs/plan/contracts.md). Implement them as written there; if one must change, change contracts.md first.
- **Database objects** these tasks rely on are `DB-*` tasks in [supabase/PLAN.md](../supabase/PLAN.md).
- **Layering and module boundaries** are in [architecture.md](../docs/plan/architecture.md#layering-inside-each-component).

## Context (updated 2026-09-30)

**Code layout**
- `main.py` assembles the app and includes routers for tenancy, collection and sites.
- Routers manage authenticated transactions through `deps.py`; services own use cases and raise domain errors; repositories execute SQL from matching `queries/` modules.
- `errors.py` provides the error envelope, OpenAPI models and exception handler.
- Pure domain modules live under `domain/`: `forms.py`, `packages.py`, `geojson.py` and `qgis_project.py`.

**Routes:** health/readiness, identity, organizations, projects, memberships, invitations, observations and packages. Stable operation IDs and response schemas are exported without database access.

**Authentication** (`auth.py`)
- Verifies ES256/RS256 against JWKS (`PyJWKClient`, cached 300 s).
- Requires `exp`, `sub`, `iss` and `aud`, with 30 seconds of clock leeway.
- Rejects anonymous tokens and malformed anonymous claims.

**Per-request identity.**
- Every request runs in `user_transaction`, which sets `fieldmaps.user_id` (`deps.py`).
- Since BE-16 (2026-09-26), every role-check query names the caller: `m.user_id = fieldmaps.request_user_id()`.
- Correctness no longer depends on the memberships SELECT policy hiding other members' rows. DB-05 widens that policy for managers.

**Operations**
- Readiness checks the database and signing keys; startup rejects privileged database roles.
- Request IDs, sanitized JSON logging, optional Sentry, request-size limits and per-process user rate limits are implemented.
- SQLSTATE determines database error responses; unknown failures are sanitized 500s.
- Separate runtime/test container stages keep test tooling out of the non-root runtime image.

**Forms.** `domain/forms.py` validates the canonical mobile contract with conditions and dynamic choices. `legacy_forms.py` preserves immutable stored field definitions. Shared-case parity and local legacy upload/readback tests pass.

**Tests.** The suite covers real local Supabase plus pure domain and HTTP boundary behavior. BE-03 preserves the existing upload/package scenarios and adds error-envelope coverage.

## Target layout

```
backend/src/fieldmaps_api/
  main.py                 app factory: config, engine, middleware, exception handlers, include_router
  errors.py               domain errors + one handler → error envelope
  observability.py        JSON logging, request id middleware, Sentry init
  deps.py                 authenticate, user_transaction, rate limiter
  routers/{identity,tenancy,sites,instrument,collection,analysis,gis}.py
  services/{…same…}.py    use cases; raise domain errors
  repositories/{…same…}.py + queries/{…}.py   SQL only
  domain/{forms,packages,geojson,qgis_project}.py   pure logic (moved, unchanged APIs)
```

## Tasks

### BE-17: Complete the backend contract for the live web workspace
Status: done (2026-10-08, local backend acceptance) · Phase 3 · Size L · Depends: BE-07, BE-11 · Blocks: none
Verified locally: 293 API tests, SQL/Auth-hook/hosted-verification-on-local suites, Ruff and BasedPyright pass. All 433 mobile tests, mobile typecheck/lint, form parity, generated contract consistency and plan checks pass. The local browser seed ran twice with eight unique records; live HTTP checks verified role inheritance, tenant denial, CORS and archive checksum. See [handoff and release evidence](WEB-FLOW-HANDOFF.md#verification-2026-10-08). No new migration or hosted change; frontend browser/device acceptance remains separate.
Read first: [web flow completion proposal](WEB-FLOW-PLAN.md); `tests/test_workspace_api.py`; the current observation-read contract in `docs/plan/contracts.md`.
Do:
1. Add historical form, site and round metadata to direct observation reads without changing upload or list contracts.
2. Verify role changes, invitations, package selection and form lifecycle; fix reproducible backend failures, including browser-readable errors and draft mutation races.
3. Provide a local-only, repeatable browser acceptance seed and a frontend contract handoff documenting bounded reports/exports.
4. Run API, SQL, contract and mobile compatibility checks; record local evidence separately from frontend and hosted acceptance.
Done when: backend acceptance and isolation checks pass, generated contracts are consistent, and the documented local seed succeeds twice without duplicating observations. Frontend browser acceptance and hosted deployment remain separate handoff steps. Full-data analysis remains BE-14; Storage remains BE-13.
Verify: `pnpm backend:check`; `pnpm backend:test`; `pnpm db:test`; `node --test database/seed-web-workspace.test.mjs`; `pnpm contracts:generate`; `pnpm mobile:test`; `pnpm mobile:check`; `pnpm plan:check`.

### BE-01: Harden the container image
Status: done (2026-10-04) · Phase 0 · Size S · Depends: none · Blocks: OPS-04
Verified locally on 2026-10-04: runtime/test images build and all 214 API tests pass inside the test image. Runtime defaults to UID 10001 and contains neither pytest nor tests. The health check passed on PORT 8181 using a non-root host UID for the local password mount; deployment mounts must be readable by UID 10001.
Read first: `backend/Dockerfile`; `database/Makefile` (targets `api-build` and `api-test`); recent commits "Carry the build metadata into the image the tests run in".
Do:
1. Split the Dockerfile into a multi-stage build:
   - a `test` target, which keeps dev dependencies and `tests/` and is used by `make api-test`;
   - a `runtime` target, built with `uv sync --frozen --no-dev --no-install-project`, without tests, running as a non-root `USER`.
2. Start uvicorn with `--proxy-headers --forwarded-allow-ips='*'`, because Render sits behind a proxy. Keep `PORT` handling.
3. Add a `HEALTHCHECK` that calls `/health`.

Done when:
- `make -C database api-build api-test` still passes;
- the runtime image has no pytest and runs as non-root.

Verify: `docker run --rm <runtime-image> id -u` prints something other than 0; `docker run --rm <runtime-image> python -c "import pytest"` fails.

### BE-02: Readiness, observability, and a safe database-error mapping
Status: done (2026-10-04) · Phase 0 · Size M · Depends: none · Blocks: OPS-04
Verified locally on 2026-10-04: readiness/startup guards, sanitized logging/request IDs and SQLSTATE responses pass, including real deadlock and terminated-connection scenarios. Full API suite: 214 passed.
Do:
1. Add `GET /ready`. It runs `SELECT 1` through the pool and fetches the JWKS (cached), and returns 503 with the error envelope if either fails.
2. At startup, query `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user` and refuse to start if either is true (architecture rule 4). Add a test.
3. Add JSON structured logging and an `X-Request-Id` middleware that accepts or generates the id and echoes it. Never log bodies, tokens or `answers`.
4. Initialize Sentry only when `SENTRY_DSN` is set, with scrubbing that matches OPS-07. The DSN can arrive later; the code must work without it.
5. Map database errors by what they are, never by class alone.
   - `DBAPIError` is the base class of every SQLAlchemy driver error. Under asyncpg it also wraps plpgsql `RAISE EXCEPTION` and RLS violations. Catching it wholesale would turn `sole_owner` into a retryable 503.
   - Read `error.orig.sqlstate` and map it as follows:

     | SQLSTATE | Result |
     |---|---|
     | `FM001`–`FM008` | The code and HTTP status in the [contracts.md table](../docs/plan/contracts.md#error-envelope) |
     | `23505` | 409 `conflict` |
     | `23514`, `23502`, class `22` | 422 `validation_failed` |
     | `23503` | 422 `validation_failed` (a reference to something that does not exist) |
     | `42501`, or an RLS `WITH CHECK` violation | 403 `role_required` |
     | Transient: class `08`, `57P01`, `40001`, `40P01`, `55P03`, `57014`, class `53`, SQLAlchemy pool `TimeoutError`, `InterfaceError`, or a connection that was invalidated | 503 `storage_unavailable` |
     | Anything else | 500 `internal`, sent to Sentry |

Done when: the new tests cover all of these:
- `/ready` failing;
- the bypass refusal;
- a request id on responses;
- an `FM002` raised in the database surfacing as 409 `sole_owner`;
- a CHECK violation surfacing as 422;
- a dropped connection and a deadlock surfacing as 503.

Verify: `pnpm backend:test`; `pnpm backend:check`.

### BE-03: Restructure into routers, services and repositories, with the error envelope
Status: done (2026-10-01) · Phase 0 · Size M · Depends: none · Blocks: BE-04, BE-06, BE-07, BE-09, CON-04, GIS-06
Evidence: routers, services, repositories and query modules preserve all eight routes and twelve SQL statements; pure modules moved to `domain/`. Domain and framework exceptions use the documented envelope and OpenAPI model. The local backend suite passed 74 tests before the final malformed-body case; all 12 final error-boundary tests passed separately. Ruff and BasedPyright pass. The subsequent complete suite passed all 131 tests against local Supabase on 2026-10-03, resolving the earlier Docker verification blocker. CORS preflight responses retain their existing middleware behavior.
Read first: every file in `src/fieldmaps_api/`; [contracts.md](../docs/plan/contracts.md#error-envelope).
Do:
1. Move the code into the target layout above. **This is a behaviour-preserving refactor:** the same routes, status codes and bodies, except that errors adopt the envelope.
2. Create `errors.py` with `DomainError(code, message, status, details)` subclasses, and replace every `HTTPException` raised in the repository code.
3. Register one exception handler that turns every error (including FastAPI's 422) into `{error:{code,message,details}}`. Add the envelope as a component schema in the OpenAPI output.
4. Update the mobile (`mobile/src/sync/upload.ts`) and web (`web/src/lib/packages.ts`) error readers only if they parse bodies. Today they branch on status codes, so nothing breaks.

Done when:
- every existing test passes, with assertions updated only for the error body shape;
- no `HTTPException` remains outside `deps.py`.

### BE-04: OpenAPI export without a database
Status: done (2026-10-01) · Phase 0 · Size S · Depends: BE-03 · Blocks: CON-03
Verified: deterministic offline OpenAPI export, unique operation IDs, typed responses and binary archive metadata pass the contract tests.
Do:
1. Add `fieldmaps_api/openapi.py`, which builds the app with a dummy config and no connection, then prints `app.openapi()` as sorted JSON.
2. Add a `make -C backend openapi` target, or a root `Makefile` target, that writes `contracts/openapi.json`.
3. Give every route an `operation_id`, a response model, and the error responses it can return, so the generated client types stay stable.

Done when: running the target twice produces identical output, with no database or network.

### BE-05: Token checks
Status: done (2026-10-01) · Phase 0 · Size S · Depends: none · Blocks: none
Verified: 18 token-policy tests cover expiry boundaries, anonymous claims, and required identity claims.
Read first: `auth.py`; `tests/test_authentication.py`.
Do:
1. Add `leeway=30` to `jwt.decode`.
2. Reject tokens with `is_anonymous: true` (401 `token_invalid`).
3. Keep requiring `sub` as a UUID, and keep checking `iss`, `aud` and `exp`.

Done when: new tests cover leeway on both sides of 30 s and the anonymous-token rejection.

### BE-06: Identity: `GET /v1/me` and `PATCH /v1/me`
Status: done (2026-10-03) · Phase 1 · Size M · Depends: BE-03, DB-05, DB-06, DB-07 · Blocks: BE-07, BE-08, MOB-04, MOB-06, QA-01, WEB-05, WEB-06
Verified: all 18 identity tests pass, including seven real local Supabase scenarios for bootstrap, idempotence, caller isolation and forgotten/missing Auth accounts. The complete backend suite passes 131 tests. Docker launched successfully outside the restricted shell; no installation repair or database reset was needed.
Read first: the identity rows in [contracts.md](../docs/plan/contracts.md#api-endpoint-catalog-v1); DB-06 (`ensure_profile`).
Do:
1. `GET /v1/me` calls `fieldmaps_private.ensure_profile(null)` and returns:
   - the profile;
   - org memberships `[{org id, slug, name, role}]`;
   - project memberships `[{project id, code, name, org id, role, is_training}]`.
   - It is idempotent.
   - `FM005` becomes 403 `account_deleted`. That covers a forgotten profile, and a token whose Auth user is already gone. It is never a 500. Test both cases here.
2. `PATCH /v1/me` accepts a display name (1–100 characters), initials (the observer-code pattern) and a locale.
3. Add the rows to QA-01's isolation suite.

Done when:
- a first call creates the profile and the Training membership;
- a second call changes nothing;
- the tests pass.

### BE-07: Tenancy: organizations, projects, members, invitations
Status: done (2026-10-04) · Phase 1 · Size L · Depends: BE-03, BE-06, DB-05, DB-06 · Blocks: BE-17, MOB-06, QA-01, WEB-06, WEB-07
Verified locally on 2026-10-04: organization/project lifecycle, membership changes, ownership transfer and invitation lifecycle pass. The two-organization, every-role isolation matrix passes; full API suite: 214 passed.
Read first: the tenancy rows in the contracts catalog; DB-05 and DB-06. Every write goes through a DB-06 function. The API holds no INSERT, UPDATE or DELETE on membership or invitation tables.
Do:
1. **Organizations:**
   - `POST /v1/orgs` calls `create_organization`: 409 `conflict` on a slug clash, 403 `limit_reached` over the limit.
   - `GET /v1/orgs`, `GET /v1/orgs/{org}`.
   - `PATCH /v1/orgs/{org}` changes only `name` and `slug`.
2. **Org members.**
   - `GET /v1/orgs/{org}/members`.
   - `PATCH …/members/{user}` calls `set_org_role`; `DELETE` calls `remove_org_member`.
   - `POST /v1/orgs/{org}/transfer-ownership` calls `transfer_ownership`.
   - There is no POST for members: people join only through invitations.
3. **Projects:**
   - `POST /v1/orgs/{org}/projects` calls `create_project`.
   - `GET /v1/orgs/{org}/projects`, `GET /v1/projects/{p}`.
   - `PATCH /v1/projects/{p}` changes only `name`, `description`, `timezone` and `status`.
   - Fold the existing `GET /v1/projects` into this module; its response only gains fields.
4. **Project members.** `GET /v1/projects/{p}/members` (managers), `PATCH …/members/{user}` calls `set_project_role`, and `DELETE` calls `remove_project_member`.
5. **Invitations**, at `POST /v1/projects/{p}/invitations` (project roles) and `POST /v1/orgs/{org}/invitations` (org roles `member` or `admin`).
   - Both take `{role, email?, max_uses, expires_in_days}`.
   - The server generates a token of 32 random bytes (base64url) and/or an 8-character join code (Crockford base32, about 40 bits, no ambiguous characters). It passes only their sha256 hashes to `create_invitation`, and returns the plaintext **once**.
   - A lowercased email binds the invite.
   - `expires_in_days` is converted to an interval for `create_invitation`.
   - `GET` lists invitations without secrets.
   - `DELETE /v1/projects/{p}/invitations/{id}` and `DELETE /v1/orgs/{org}/invitations/{id}` call `revoke_invitation(org, project, id)`, with the scope taken from the URL.
6. **`POST /v1/invitations/preview`** takes `{token}` or `{code}`, consumes nothing, and calls `preview_invitation`.
   - It returns `{organization name, project name, role, expires_at}`, so clients can ask "Join … as …?" before redeeming.
   - It is rate-limited in the same bucket as redemption (BE-09).
7. **`POST /v1/invitations/redeem`** takes `{token}` or `{code}`. It normalises the code (uppercase, dashes stripped), hashes it, and calls `redeem_invitation`.
8. **Invitation email delivery is out of scope.** The web shows a copyable link and code. Emailing links is post-pilot.
9. Add the rows to QA-01.

Done when: every endpoint passes its tests, including the cross-org negatives in QA-01.

### BE-08: Account deletion: `DELETE /v1/me`
Status: done (2026-10-04) · Phase 1 · Size M · Depends: BE-06, DB-06 · Blocks: MOB-07, OPS-11, WEB-06
Verified locally on 2026-10-04: account deletion commits the durable forgotten state before mocked Admin HTTP; sole-owner rollback, pending retries, missing Auth users, credential privacy and bounded HTTP attempts pass against local Supabase. All 22 account-deletion tests pass, including six invalid-key cases proving rejection before database changes or Admin HTTP. The final Docker API suite passes all 242 tests, including the regenerated OpenAPI contract checks. Ruff, BasedPyright and plan checks pass. Hosted Auth deletion and runtime secret provisioning remain unverified.
Needs user: create the Supabase secret key (`sb_secret_…`) and put it in a runtime Secret File (`supabase-secret-key`) for staging and production. It is never committed.
Do:
1. Add a config field `auth_admin_key_file` (optional). When it is missing, the endpoint returns 503 `storage_unavailable` with an explanatory message.
2. **The flow.** It is safe to repeat.
   1. Call `fieldmaps_private.forget_user()` inside the user transaction. `sole_owner` gives 409. `forget_user` is idempotent, so a repeat call for a forgotten profile goes straight to the next step.
   2. After the commit, call the Supabase Admin API `DELETE /auth/v1/admin/users/{id}` with the secret key, with a timeout and one retry. Treat 404 as already deleted. Return 204.
   3. If step 2 still fails, return 202 with `{"status":"pending"}`. Log at ERROR level and send to Sentry, with the user id only.
      - The durable record is the profile's `deleted_at`. It stays set until the Auth deletion cascades the row away (DB-06), and `assert_active_user()` stops that account regaining any membership in the meantime.
      - `DELETE /v1/me` is safe to repeat. The clients retry it a bounded number of times **before** signing out, while their session is still valid (MOB-07, WEB-06). After that, only the server-side record remains.
      - Operators finish leftovers with the query in `docs/Production-Runbook.md` (OPS-09).
3. Map `FM005` from any DB-06 function to 403 `account_deleted`.
4. The secret key is used by this service function only. Test that it never appears in logs.

Done when the tests (with the Admin API mocked) cover:
- success, and sole owner;
- an Admin API failure returns 202, after which `GET /v1/me` returns 403 `account_deleted` and the user has no Training membership;
- a repeated `DELETE /v1/me` with the Admin API healthy returns 204;
- `DELETE /v1/me` for a token whose Auth user is already gone returns 204: `forget_user` is a no-op and the Admin API answers 404, which counts as already deleted.

### BE-09: Rate limits and body-size limits
Status: done (2026-10-04) · Phase 1 · Size S · Depends: BE-03 · Blocks: none
Verified locally on 2026-10-04: ten request-limit tests pass, including chunked oversized bodies, shared preview/redemption throttling, Retry-After, refill and user isolation. Limits remain per-process for the pilot.
Do:
1. Add a body-size middleware:
   - 24 MB for `POST …/packages`, which carries JSON plus a base64 project file (limits in `domain/packages.py`);
   - 4 MB for `POST /v1/sync/upload`. MOB-10 sizes batches to fit, and treats a 413 as "retry with a smaller batch", never as success;
   - 256 KB for everything else.
   - It rejects oversize bodies **before** parsing, with 413 `validation_failed`.
2. Add per-user token-bucket limits, kept in memory (a single instance for the pilot; document that), on:
   - `POST /v1/orgs`: 5 per hour;
   - `POST …/invitations`: 60 per hour;
   - `POST /v1/invitations/redeem` and `POST /v1/invitations/preview`: one shared bucket, 10 per 10 minutes. Preview reveals names for a guessed code, so it must be throttled like redemption;
   - `DELETE /v1/me`: 3 per hour.
   The response is 429 `rate_limited` with `Retry-After`.

Done when: the tests cover 413 and 429, including 429 on preview.

### BE-10: Canonical form validator
Status: done (2026-10-03) · Phase 2 · Size L · Depends: CON-02 · Blocks: BE-11, BE-12, BE-14
Verified: shared cases pass in Python and mobile, including Unicode whitespace parity. All 131 backend tests pass against local Supabase, including legacy uploads, retries and restricted GIS readback. No hosted data or immutable form definition was changed.
Read first: `contracts/form-definition.schema.json`, `contracts/forms/*.json`, `contracts/forms/cases/*.json`; `mobile/src/forms/engine.ts` (the reference behaviour); `src/fieldmaps_api/domain/forms.py`.
Do:
1. Rewrite `domain/forms.py` to parse the canonical definition with Pydantic models that mirror the JSON Schema. That schema is generated in `io: "input"` mode (CON-02).
   - Use `extra="ignore"` and the same defaults as the zod schema, so the server accepts every definition the device accepts.
2. Evaluate conditions (`answered`, `equals`, `notEquals`, `includes`, `all`, `any`) and dynamic option sets exactly as `engine.ts` does.
3. Validation rules:
   - answers keyed by question `id`;
   - **drop** answers to hidden questions, and report their ids as `pruned` in the per-operation result, rather than rejecting the observation;
     - This matches contract rule 2.
     - A client/server parity bug then loses one hidden answer, never the whole record.
   - require a question only while it is visible;
   - apply type checks for `one`, `many`, `text` and `number`.
4. Run every shared case file from `contracts/forms/cases/` in pytest, and match every expected result.
5. Keep `shell-v1` accepted through a documented adapter that reads its stored `fields` format.
   - A migration must not rewrite it: published definitions are immutable (DB-09).
   - The two verified hosted records must still read back.

Done when: all shared cases pass in both pytest and Vitest (CON-02), and the old upload tests pass.

### BE-11: Instrument endpoints
Status: done (2026-10-07) · Phase 2 · Size M · Depends: BE-10, DB-09 · Blocks: BE-17, WEB-09
What now works (`routers/forms.py`, `services/forms.py`):
- `GET/POST /v1/projects/{p}/forms`, `POST …/forms/{form_code}/versions` (the next draft, copied from the newest version unless a definition is sent), and `GET/PUT/DELETE …/form-versions/{code}` with `POST …/publish` and `…/retire`. Versions are addressed by their code (`inventory-v2`), the name devices and exports already use, so a version id from another project can never be named.
- Every definition is stamped with its code and state and checked by `FormDefinition` before it is stored, and again at publication; a 422 names up to eight problems. Form bodies may be 1 MiB.
- Writes need a manager of the project (403); reads by a non-member are 404, as for every project route.

Verified by: `tests/test_workspace_api.py` (create, edit, refuse a broken definition, publish Janet's inventory definition from `contracts/forms/`, frozen after publication, next draft, discard, retire, observers never see drafts, another organization's manager refused).
Do:
1. `GET /v1/projects/{p}/forms` and `GET …/forms/{f}/versions` are for any member. They list published and retired versions; drafts are listed for managers only (DB-09's policies).
2. `POST /v1/projects/{p}/forms` and `POST …/forms/{f}/versions` are for managers. The second creates a draft from JSON, validated with BE-10's parser, and the response lists every problem found.
3. `POST …/versions/{v}/publish` calls `fieldmaps_private.publish_form_version(p, v)`, passing the project from the URL.
   - The function itself checks the role, the state and that the version belongs to that project.
   - Once GIS-01 lands, it also generates the typed GIS view; nothing changes in the API.
   - `POST …/versions/{v}/retire` calls `retire_form_version`.
4. Add the rows to QA-01, including: a manager of org B publishing org A's version id gets 404.

Done when: the lifecycle is covered by tests, and publishing Janet's definition from `contracts/forms/` succeeds locally.

### BE-12: The sync upload endpoint for PowerSync
Status: todo · Phase 2 · Size L · Depends: BE-10, DB-10 · Blocks: MOB-10, QA-03
Read first: the `POST /v1/sync/upload` semantics in [contracts.md](../docs/plan/contracts.md#post-v1syncupload-semantics); `services/collection.py` and `repositories/collection.py` (the idempotent upload to reuse); [sync-powersync.md](../docs/plan/sync-powersync.md).
Do:
1. **Accept the body as `{operations: [raw objects]}`**, and validate each operation separately.
   - One malformed operation becomes one rejected result.
   - The request itself never fails with 422, because a request-level error gives the client no per-operation answer.
2. **Each operation runs in its own user transaction, committed synchronously.**
   - The observation write runs inside a SAVEPOINT (`session.begin_nested()`).
   - On a validation failure, `IntegrityError`, `DataError` or an RLS violation:
     1. roll back to the savepoint;
     2. insert the `upload_rejections` row in the outer transaction;
     3. commit.
   - After a database error the transaction is aborted (25P02), so the rejection cannot be written without the savepoint. Never raise to reject.
3. **Idempotency by content, not by body hash.** When the insert affects no row, load the existing row.
   - It is an **accepted replay** when `created_by` is the caller, `project_id` matches, and either:
     - the canonical content matches: `site_id`, `form_version_id`, `observed_at`, the point, `observer_code` and the pruned answers, compared after BE-10 normalization. `device_id` and `app_version` are excluded, because they vary between attempts; or
     - the stored row came from the legacy `PUT` (`device_id IS NULL`), **and** its content matches once both sides are normalized through BE-10's `shell-v1` adapter. That adapter maps the stored code-keyed answers (`people`, `notes`) to question ids, and the envelope's numbers to JSON numbers. A record that MOB-11 re-sends after a lost response matches this way, even though it can never match the old body hash.
   - Otherwise, including a legacy row whose content differs, it is rejected with `conflict`, and the stored row is not modified.
   - Do not compare `upload_hash`. It hashes the raw request body (`services/collection.py`), so an envelope can never match a row written through the legacy `PUT`.
   - An accepted upload or replay sets `resolved_at` on **every** unresolved rejection for (caller, observation id).
4. **Rejected results.** Map each of these to a `rejected` result with its code:
   - validation (BE-10);
   - no membership or wrong role;
   - an unknown site or form version;
   - the same id with different content, or created by another user (`conflict`, step 3);
   - an unsupported operation or table (`unsupported_operation`);
   - any other unexpected, non-transient per-operation exception (`internal`, also sent to Sentry). An operation that always fails would otherwise hold back every later record from that user, because PowerSync uploads in order.
   - **Transient faults are never rejections.** On a BE-02 transient SQLSTATE, stop and answer 503; operations committed earlier in the batch stay committed. The client retries, and the replays are accepted.
   - A rejection names `project_id` and `organization_id` only when the caller is a member of that project. Otherwise both are NULL, so nobody can plant rows in another tenant's view (DB-10).
5. **Retired form versions are accepted** (DB-09 step 7). Only an unknown version is rejected.
6. **Each per-operation result** carries `{id, status, code?, pruned?, user_id}`. The client checks that `user_id` is the account the database belongs to (sync-powersync.md).
7. **Return 401 for an invalid token and 503 for storage failures only.**
8. Keep `PUT /v1/projects/{p}/observations/{uuid}` working until MOB-10 ships.
9. Add rows to QA-01 (cross-org operations are rejected), and add a batch-replay test.

Done when the tests cover:
- a mixed batch: accepted, replayed, rejected by validation, rejected by a constraint violation placed **before** a valid operation (both get results, and the rejection row exists), and unsupported;
- an observation created through the legacy `PUT`, then replayed through `/v1/sync/upload` as the faithfully mapped envelope, is accepted, and no rejection is written;
- the same legacy id sent with changed answers or placement is rejected as `conflict`, and the stored row is unchanged;
- the same envelope sent twice with a different `app_version` is accepted both times;
- a user from org B naming org A's project gets a rejection with a NULL project, and A's manager sees nothing;
- a deadlock mid-batch returns 503, and the earlier operations stay committed;
- a malformed operation in the batch still gets a 200;
- rejections are readable by their owner and their project's managers only.

### BE-13: Sites, zones and packages in Storage
Status: doing (step 1 in place 2026-10-07; Storage remains) · Phase 2 · Size L · Depends: DB-12 · Blocks: DB-14, GIS-07, MOB-14, OPS-15, WEB-08
Zone-feature integration (2026-10-10 proposal): BE-18 owns managed-site geometry publication, historical zone reads and serialized version allocation under [ZONE-BOUNDARIES.md](ZONE-BOUNDARIES.md). Those rules supersede the mutable-zone/current-pointer and retry-max-version steps below for managed sites. Storage migration must retain/rehome every referenced historical archive; do not return 410 for a package needed by a draft or observation merely because it predates Storage.
Done so far: `GET/POST /v1/projects/{p}/sites` and `GET/PATCH …/sites/{code}`. A site reports its newest ready package, that package's zones, extent and centre (from the manifest, still bounding boxes) and its observation count, which replaces the planned `…/zones` route until step 2 stores real polygons. A package can only be prepared with a published form version (422 on `form_version` otherwise).
Needs user: a Storage S3 access key (Project Settings → Storage), provided as a runtime Secret File. It is never committed.
Read first: `domain/packages.py` (`469-478` bounding-box zones; `31` the empty allow-list); `services/sites.py` and `repositories/sites.py` (`prepare_package`, `read_package_archive`); DB-12.
Do:
1. `GET/POST /v1/projects/{p}/sites`, where POST creates a site and requires a manager, and `GET …/sites/{s}/zones`.
2. On a successful prepare:
   - write the archive to `site-packages/{org}/{project}/{site}/{version}.zip` in Storage (a sha256-named key is fine);
   - store `storage_path` and `archive_bytes`, and **stop writing `archive`**:
     - remove it from `INSERT_PACKAGE` (`queries/sites.py`);
     - read `archive_bytes` from its column instead of `octet_length(archive)` in `PACKAGES` and `PACKAGE_DETAIL`;
     - make `PACKAGE_ARCHIVE` read `storage_path`;
   - insert the `zones` polygons from the `zones` layer (real geometry, not bounding boxes);
   - set `sites.boundary` from the ground feature;
   - set `sites.current_package_id` when the state is `ready`.
3. `GET …/packages/{id}/download` returns `{url, sha256, bytes, expires_at}`, a signed URL valid for 10 minutes.
   - `GET …/archive` streams from Storage for the web.
   - A package with `storage_path IS NULL` (from before BE-13) answers 410 `archive_unavailable` on both. DB-14 then retires the column.
4. Make the imagery allow-list configurable through config (`imagery_hosts: []`).
5. Fix the version race: on a unique violation, retry `max+1` once, then return 409.
6. Upload the Training site package (sample geometry from `mobile/src/maps/sample-site.ts`, exported as GeoJSON layers) through the normal pipeline to staging (**Needs user**). Record it in DB-07's notes.

Done when:
- the tests use a Storage stub;
- a package can be prepared, downloaded through a signed URL, and its sha256 matches;
- the zones table holds real polygons.

### BE-14: Analysis: observation list, summary, exports
Status: doing (a first list 2026-10-07; cursor, summary and exports remain) · Phase 3 · Size L · Depends: BE-10, DB-10 · Blocks: WEB-10, WEB-11, WEB-12
Zone-feature integration (2026-10-10 proposal): BE-20 owns the version-safe paginated v2 list/summary/export subset. Preserve the shipped v1 array response and reuse BE-20's filter definitions instead of implementing competing semantics. Remaining broader analysis, viewport and other unimplemented filters stay here; see [ZONE-BOUNDARIES.md](ZONE-BOUNDARIES.md).
Done so far: `GET /v1/projects/{p}/observations` filtered by `site`, `round_type` and `since` (received), newest first, `limit` at most 500, each row with its site, form version, zone and round context. No cursor yet.
Do:
1. `GET /v1/projects/{p}/observations`:
   - cursor on `(observed_at, id)`, with `limit` at most 500;
   - filters: `site`, `zone`, `round`, `form_version`, `observer`, `from`, `to`, `bbox` (a `ST_Intersects` on `geom`, using the GiST index);
   - returns the envelope plus `received_at` and `revision`.
2. `GET …/summary` returns counts by site, zone, round, form version and day, plus the latest `received_at`, computed in SQL. Coverage "by zone and round" is J1 step 6.
3. `GET …/exports?format=csv|geojson&…filters` streams the result:
   - CSV columns come from the form version's `exportColumn`s (the codebook order);
   - GeoJSON is a FeatureCollection;
   - each export is audited (DB-13, once it exists; until then, logged).
4. Everything requires viewer or higher. Add the rows to QA-01.

Done when: the tests cover paging stability, the bbox filter, and CSV column order.

### BE-15: GIS access information
Status: todo · Phase 3 · Size S · Depends: GIS-02 · Blocks: WEB-12
Do: add `GET /v1/projects/{p}/gis-access` for managers.
- It lists that project's reader grants (role name, created, expires, revoked) and the public connection settings (host, port, database, service name, view names), with **no passwords**.
- It reads `fieldmaps.gis_reader_grants` through the manager policy that GIS-01 adds for `fieldmaps_api`.

Done when: the tests pass, and the response never contains a secret.

### BE-16: Name the caller in every role-check query
Status: done (2026-09-26) · Phase 0 · Size S · Depends: none · Blocks: DB-05
What now works:
- **Role checks name the caller.** `PROJECTS`, `UPLOAD_TARGET` and `PACKAGE_TARGET` in `backend/src/fieldmaps_api/queries/{tenancy,collection,sites}.py` filter on `m.user_id = fieldmaps.request_user_id()`. The API's role checks stay correct when DB-05 lets managers read other members' rows. Without this, a viewer on a project that has a manager passes the manager check; that was reproduced against real PostGIS.
- **The package list works.** `GET /v1/projects/{p}/packages` failed on every call with 503, because asyncpg cannot infer a type for the bare `:site IS NULL`. It now casts the site filter to text.
- **The SQL suite is green again.** `database/tests/run.sql`'s ledger assertion expected three migrations, and had been failing since `0004`. It now asserts the exact ordered version list.

Verified by:
- the 19 local SQL assertions;
- all 59 API tests, via `make -C database api-build api-test`;
- Ruff and BasedPyright.

### BE-18: Expose persisted zone drafts and publication
Status: done (2026-10-11; source and disposable local acceptance only) · Phase 3 · Size L · Depends: DB-16 · Blocks: BE-19
Verified: Persisted manager draft lifecycle with strong ETags/CAS, authoritative PostGIS validation, bounded archive subprocesses, shared atomic finalization for draft publication and managed imports, immutable historical-zone reads, v2 capabilities and frozen v1 package discovery. Actual format-2 ZIP geometry/anchors/digests match DB snapshots; retained ground/paths/trees bytes and old archives/observation hashes/receipts stay unchanged. Publication replays return the original result after later publication and reauthorize the caller. The 503-test full backend suite passed against fresh restricted-role PostgreSQL/PostGIS; 14 final focused checks passed after rehearsal isolation guards and both client runtime parsers were tightened. Database rehearsal passed 417 SQL/Auth-hook assertions, six separate-session races and 2,545 Node 24 coordinate comparisons. Ruff/BasedPyright, both client typechecks, 241 web unit tests, 51 mobile compatibility tests, client adapter lint/format checks, stable repeated OpenAPI/type generation, shell syntax and diff checks passed. Live loopback HTTP used signed JWTs and competing managers. Specification/code-quality self-review resolved raw managed geometry preservation, authorization, stale-base/replay order, legacy discovery/import races and hard cancellation. `zone_publication_enabled` remains false in runtime defaults; per-process limits require shared storage before multiple replicas. BE-19 owns strict bound v2 upload/fingerprints/receipts; BE-20 owns complete filtered reads/exports. Hosted migrations, browser/device/QGIS acceptance and publication rollout remain separately gated. No commit, persistent database reset, secret access or deployment.
Correction acceptance (2026-10-11): F1–F4 of the principal audit now have durable regression coverage: signed HTTP revocation/publication races in both orders, draft-create/publication lock ordering and replay, explicit successor play/inventory bindings and retirement guards, exact string import IDs with unchanged state on refusal, and metadata-only managed discovery plus bounded legacy caching outside transactions. Contract/OpenAPI/client declarations describe the new optional managed-import inventory choice. The final disposable full suite passed 549 tests; Ruff/BasedPyright and both client typechecks passed. Suite and quality evidence are recorded in [the correction report](../docs/reviews/zone-boundaries-2026-10-11/fixes.md). Publication defaults remain disabled; hosted deployment and feature browser/device/QGIS acceptance are separate.

Owner: API agent.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md) and [component specification](ZONE-BOUNDARIES.md).
Do: Implement draft lifecycle, conditional writes, geometry validation, publication, history/capabilities and format-2 archives; unify managed import activation.
Done when: Live local HTTP workflow persists and publishes; conflicts/replays preserve current state; archive and DB shapes agree.
Verify: pnpm backend:check and backend:test; contract coordinator regenerates OpenAPI/types.

### BE-19: Bind new uploads to historical zone packages
Status: done (2026-10-11; source and disposable local acceptance only) · Phase 3 · Size L · Depends: BE-18 · Blocks: BE-20, GIS-09
Owner: API agent.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md) and [component specification](ZONE-BOUNDARIES.md).
Do: Implement strict v2 upload, package/zone/form checks, point coverage, inventory semantics and bound receipts; preserve v1.
Done when: v7 upload after v8 and old lost-receipt retry pass; cross-site and protocol conflicts fail safely.
Verify: Backend checks and local API/SQL tests with old/new payloads.
Verified: Strict v2 uploads bind the exact historical package/zone/form, use frozen RFC 8785 fingerprints before answer pruning and return receipts after commit. Superseded packages, retired frozen forms and archived projects accept authorized late work; point coverage and Inventory anchors remain server-authoritative. V1 hashes and lost-receipt replays remain unchanged, including pre-adoption records. Both protocols reject owner/project/protocol/content collisions and recheck authorization under account/organization locks. Disposable full backend rehearsal passed 604 tests; 15 affected API/live-HTTP tests passed after the final nullable legacy-package readiness correction. SQL rehearsal passed 425 assertions, 2,545 coordinate comparisons and six publication races. Ruff/BasedPyright, both client typechecks, stable contract regeneration, specification review and code-quality review passed. [Acceptance evidence](../docs/reviews/zone-boundaries-2026-10-11/be19.md) records the boundaries. Hosted rollout, device retention and browser/QGIS acceptance remain separate; publication defaults off. BE-20 is now unblocked for historical reads and complete exports.

### BE-20: Add historical-zone queries and complete exports
Status: done (2026-10-11; source and disposable local acceptance only) · Phase 3 · Size L · Depends: BE-19 · Blocks: QA-07
Owner: API read agent.
Read first: [Master plan](../docs/plan/zone-boundaries/README.md) and [component specification](ZONE-BOUNDARIES.md).
Do: Implement v2 list/detail/cursor, common server filters, summary and consistent bounded exports.
Done when: More than 500 matching records are queryable/exportable without hidden truncation; historical labels and inventory support remain correct.
Verify: API tests for filters, cursor ties, RLS, dates, export limits and query plans.
Verified: V2 historical list/detail, mixed-direction cursors, exact same-statement counts, shared authorized filters, grouped summary and complete snapshot ZIP exports. Recorded labels, raw form definitions, Inventory null geometry and explicit anchors remain historical; v1 behavior stays unchanged. Fresh specification review corrected per-version/set codebooks, extension-property preservation, reserved answer columns and source-size gating before SQL row rendering. Disposable isolated full backend rehearsal passed 678 tests in 368.15 seconds; final focused acceptance passed 73 tests in 88.87 seconds. Ordinary HTTP CSV exported 10,000 rows in 6.977 seconds; 10,001 rows failed explicitly. Actual 32 MiB asset/archive guards and one-byte excesses, 64 MiB source refusal, restricted-role query plans, concurrent snapshot consistency, Training RLS and signed disconnect/deadline cleanup passed. SQL rehearsal passed 425 assertions, 2,545 coordinate comparisons and six publication races. Ruff/BasedPyright, both client typechecks, stable contract regeneration, fresh specification and code-quality reviews, formatting and plan checks passed. [Acceptance evidence](../docs/reviews/zone-boundaries-2026-10-11/be20.md). Hosted/browser/device/QGIS acceptance remains QA-07 and publication defaults off. WEB-39 now needs WEB-36 before adopting these reads; WEB-41 follows WEB-39 for summary/export integration.

### BE-21: Rename the API's internal FieldMaps identifiers
Status: todo · Phase 4 · Size M · Depends: DB-17 · Blocks: none
Needs user: the same window as DB-17. Render's `database_url` user and its Secret File change with it.
Read first: DB-17; `backend/README.md` (Deploy it).
Do:
1. Move `backend/src/fieldmaps_api/` to `decamark_api/`. Update the imports, the module paths in `Dockerfile`, `Makefile`, `scripts/e2e-local.sh` and the READMEs, and the `backend/src/fieldmaps_api/…` paths that web, mobile and QGIS comments cite. Rename the `fieldmaps-api` project in `pyproject.toml` and regenerate `uv.lock`.
2. Point every `config*.json` `database_url` at the renamed role, and rename the `fieldmaps-api-password` and `/run/fieldmaps-secrets` paths. Set the `decamark.*` request settings that DB-17 introduces.
3. Rename the internal names: the `fieldmaps-test.invalid` and `fieldmaps-web.invalid` test origins, the `fieldmaps-import-` temporary prefix, the `fieldmaps_request_id` scope key, and the container's `fieldmaps` user.
4. Run `pnpm contracts:generate`.

Done when: `pnpm backend:check` and `pnpm backend:test` pass against a local stack carrying DB-17, and `grep -rni fieldmaps backend` finds only history.

### BE-22: Serve one zone API path
Status: done (2026-10-12; source and disposable local acceptance only) · Phase 3 · Size L · Depends: CON-06, DB-19 · Blocks: DB-18, MOB-29, MOB-33, WEB-28, WEB-29, WEB-35, WEB-36, WEB-39, WEB-42
Owner: API agent; the contract coordinator regenerates types.
Read first: [contract](../docs/plan/zone-boundaries/contract.md) (whole document); [pre-launch policy](../docs/plan/README.md#pre-launch-compatibility-policy-2026-10-11); `backend/src/fieldmaps_api/routers/{sites,collection,zones,observation_analysis}.py`.
Do: Move the `/v2` behaviour onto the `/v1` paths and delete the old `/v1` site-list, observation-upload and observation-list behaviour, `LEGACY_SELECTION`, format-1 preparation and `supported_format`, unmanaged uploads, the adoption bootstrap, `assignment_basis` and legacy filters, the v1 fingerprint and `schema_version`, and `zone_publication_enabled`. Address sites by UUID on every route. Add the contract's new fields: draft `etag`, `current_package_version` and display names; validation `geometry_sha256` and `change`; publication `current_package_id` and `replayed`; package list `site_id` filter and publication metadata; `GET /sites/{site_id}`; first-upload identity mapping with `expected_current_package_id: null`. Rename the zone `DraftCreate` models so OpenAPI names do not collide. Delete tests that assert removed behaviour.
Done when: OpenAPI has no `/v2` path; the live local workflow (upload v1, edit, publish v2, bound upload, filtered read and export) passes against the DB-19 baseline; `pnpm contracts:generate` is stable on a second run.
Verify: `pnpm backend:check`, `pnpm backend:test`, `pnpm db:test`, and the coordinator's regeneration.
Verified: The runtime and OpenAPI expose only the current `/v1` zone API; the local suite covers package import, draft edit/publication, bound upload, historical reads and exports. OpenAPI and both generated client declarations stayed byte-identical after a second regeneration. Backend checks passed; the disposable full backend suite passed 600 tests before final review fixes, and the post-fix focused API/OpenAPI suite passed 58 tests. The disposable PostgreSQL 17/PostGIS baseline rehearsal passed its SQL, geometry and publication-race acceptance. Web and mobile typechecks still identify consumer updates in their dependent tasks. No hosted deployment or client-device acceptance was performed.
