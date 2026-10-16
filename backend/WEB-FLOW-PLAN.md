# Backend plan for web flow completion

Historical proposal — 2026-10-08; reconciled 2026-10-15. **The original proposal body below is retained as history, not active implementation instructions.** BE-17 delivered the original scoped backend work; BE-20/BE-22 subsequently replaced the capped array, route shapes and compatibility policy with the sole zone-aware `/v1` contract. Use [the current API handoff](WEB-FLOW-HANDOFF.md), [backend task status](PLAN.md) and [current roadmap](../docs/plan/current-state.md) before starting work. In particular, do not preserve/reintroduce the old 500-row array or add a second API version.

Prepared 2026-10-08 from the supplied Claude plan and local checkout `a226634fdadf210103850bf297855fdf1f659d0d`.

This was a scoped execution proposal under the [production plan](../docs/plan/README.md). Task status remains in [backend/PLAN.md](PLAN.md), [supabase/PLAN.md](../supabase/PLAN.md), and the other owning plans. It does not mark existing roadmap tasks complete or duplicate their task definitions. Recheck the implementation against current master before starting; this review did not fetch the remote or verify the deployed service.

## Goal and scope

Give Claude a reliable API and database foundation for the live web workspace: Janet can access her existing DECA Lab / Play Study project, manage sites, packages, forms and people, and read real observations. Fix backend defects that prevent those flows. Preserve compatibility with the existing mobile collector.

Use the scope in the supplied plan: reports and exports initially operate on at most the newest 500 accessible observations and disclose that limitation. Complete-project reporting is a separate follow-on below. Removing the preview and web setup does not require deleting the existing organization-creation API, real study data, local test fixtures, or Training infrastructure.

Implementation was authorized after this proposal. Its backend status is tracked by BE-17
in [backend/PLAN.md](PLAN.md); see the [implemented contract and verification handoff](WEB-FLOW-HANDOFF.md).

## Ownership agreement

| Area | Owner and boundary |
| --- | --- |
| FastAPI routes, schemas, services, repositories and validation | ChatGPT/Codex in `backend/` |
| SQL migrations, RLS, database functions and database tests | ChatGPT/Codex in `supabase/` and `database/`, only where needed for these flows |
| OpenAPI and backend contract documentation | ChatGPT/Codex; generate `contracts/openapi.json` from the API, never hand-edit it |
| Local API acceptance data and backend CI checks | ChatGPT/Codex; coordinate shared scripts and CI files before either implementation edits them |
| Everything in `web/`, including server components, API wrappers, Server Actions, cookies, cache invalidation and browser transfers | Claude |
| Screens, navigation, identity presentation, copy, icons, onboarding removal and frontend fixture cleanup | Claude |
| Browser E2E, accessibility and screenshots | Claude, using the agreed local API fixtures |
| Generated app API declarations | Regenerate mechanically with the OpenAPI change to keep CI consistent; app owners handle runtime integration, with no hand-edits to generated declarations |
| Shared product decisions and runbooks | Coordinate specific sections; backend edits cover API/database facts only |

The fact that Next.js code executes on the server does not move it into the backend assignment. No mobile feature work belongs in this scope; mobile compatibility checks do.

## Findings from the current code

These are source findings, not fresh test results or claims about production.

| Flow | Current support | Backend action |
| --- | --- | --- |
| Real identity and workspace access | `/v1/me` returns profile and memberships, including inherited manager access for org owners/admins | Verify role and account isolation; Claude derives UI identity and reads email from authenticated Supabase claims |
| Organizations, projects and team | Management, invitations, ownership transfer, timezone and archive status already exist | Exercise the existing flows and fix demonstrated failures; do not rebuild the endpoints |
| Sites and packages | Site CRUD subset, package checks/history/archive, exact site observation counts; current package is newest ready version | Verify direct browser transfers, scope, validation, concurrency and package selection |
| Forms | Create, draft, save, discard, publish and retire already exist | Verify lifecycle races, immutable published definitions and compatibility with late mobile uploads |
| Observation list | Bare array; `site`, `round_type`, `since`, `limit`; maximum 500; ordered by observation time and ID | Keep the response compatible and document its exact limits |
| Observation detail | Returns answers but no form version, site or round context | Add the metadata needed to render a direct detail link with the correct definition |
| Summaries and complete exports | No summary or server export routes in the current collection router | Keep Claude's bounded derivation for this release; schedule full-data analysis separately |
| Hosted DECA Lab / Play Study | The user reports it already exists | Verify deployment and accessible resources during authorized release acceptance; do not bootstrap a duplicate study |

Evidence: `backend/src/fieldmaps_api/{identity_schemas.py,schemas.py,main.py}`, `queries/{identity,tenancy,collection,sites}.py`, `services/{forms,sites}.py`, `routers/{collection,sites}.py`, and `backend/tests/test_workspace_api.py`.

The original claim that the API has “everything needed” needs one correction: the detail response cannot identify the stored form definition. Looking up the record in a capped list is not a reliable substitute, because older records can still have valid direct links.

## Delivery sequence

### 1. Establish the API contract and local acceptance baseline

**Work**

- Reconcile current master with the supplied frontend plan and make a flow-to-endpoint checklist. Classify each flow as existing, defective or missing, using source and tests rather than roadmap status alone.
- Give Claude a compact contract handoff: routes, identifiers, request/response examples, role requirements, nullability, error codes, limits and unsupported operations.
- Preserve UUIDs at API project/org boundaries and codes at existing site/form boundaries. Slug resolution and remembered-project routing remain in Claude's web layer.
- Establish a repeatable local Supabase + API fixture setup using the existing test/bootstrap tooling where suitable. Guard it against hosted targets and keep production credentials and data out of fixtures.
- Use synthetic owner, admin, manager, observer, viewer and outsider accounts; a second organization; an account with no study membership; multiple sites and form versions; ready/blocked packages; and all three round types.
- Provide a small browser E2E dataset with known counts, plus dedicated backend boundary cases for 499, 500 and 501+ observations, equal timestamps, retired forms and timezone/DST boundaries. Do not make every browser test load the larger fixture.

**Done when:** Claude has stable example responses and a documented local seed command; the API test baseline is recorded, including any pre-existing failures. Local fixtures never modify Janet's real workspace.

**Dependencies:** first step. Claude can continue existing endpoint integration once the handoff is available.

### 2. Make direct observation details self-contained

**Work**

- Extend `GET /v1/projects/{project_id}/observations/{observation_id}` additively with `site_code`, `site_name`, `form_version`, `received_at`, `zone`, `round_type`, `first_round` and `placement`, using the same meanings as the list response.
- Keep every existing field, identifier and error behavior compatible. A missing legacy round remains `standard`, matching the list; nullable fields remain null where appropriate.
- Resolve the form from the record's stored form-version relationship, never from the latest package or latest published form. Claude can then fetch the existing form-version endpoint to label answers.
- Preserve tenant scoping and deleted-record exclusion. Published and retired versions used by readable records remain readable under existing permissions.
- Update the documented endpoint contract first, then implementation and generated OpenAPI. Check app parsing compatibility before the additive response ships.

**Done when:** a direct link to a record older than the first 500 has enough data to render its site, round and historically correct answers. Tests cover canonical and legacy forms, retirement, missing records and cross-project access. No observation or form data is rewritten.

**Dependencies:** contract baseline. This is the primary known API change needed by Claude's Data/detail work.

### 3. Verify identity, permissions, membership and invitations

**Work**

- Confirm `/v1/me` is idempotent, identifies the caller correctly, and returns org-owner/admin inheritance consistently with actual API authorization. Training stays supported in the backend; hiding it from the management workspace is a frontend choice.
- Exercise organization/project reads and mutations as each supported role, across two organizations. Include a manager who is not an org admin, a viewer, an observer and a user whose membership was just removed or downgraded.
- Verify API role checks and RLS independently of hidden tabs. Keep inaccessible reads and forbidden writes consistent with the existing 404/403 contract.
- Check member names, role changes, removals, last-owner/last-manager protection and ownership transfer, including concurrent changes where existing coverage is insufficient.
- Verify invitation create/list/preview/redeem/revoke; single-use races; expiry; normalized codes; email binding; repeated redemption semantics; and preview/redemption rate limits.
- Preserve one-time plaintext token/code delivery, hashed storage and secret-free list responses/logs. Invite credentials are submitted in request bodies. Fragment handling, copy links and join forms belong to Claude.
- Confirm project description clearing, timezone validation and archive/unarchive persistence. Document existing archive effects on visibility and writes, including queued mobile uploads, before proposing any policy change.

**Done when:** authorized mutations persist and read back correctly; removed or unrelated users cannot retain access through subsequent API calls; failed operations leave no partial memberships or ownership changes. There is no invitation email-delivery feature.

**Dependencies:** local baseline. Primarily verification of existing capabilities, with targeted regression fixes.

### 4. Verify sites, map packages and form lifecycle

**Work**

- Verify site create/edit/read, code collisions, description clearing and exact authorized observation counts.
- Confirm a newer blocked package does not replace the current ready package. Current selection must agree between site responses and package history, and remain scoped to the site.
- Exercise invalid/missing/duplicate zone IDs, published-form requirements, archive checksums, blocked archive rejection, cross-tenant access and the real Fall Creek package fixture.
- Test concurrent package submissions and concurrent draft creation. Preserve a safe, documented conflict response; do not introduce duplicate versions or partial package/check rows. Automatic retry is optional if it materially improves the flow and remains transaction-safe.
- Verify direct browser `OPTIONS`, authenticated upload and archive download against approved origins. Check 24 MiB request limits, stored archive limits, content type and exposed `ETag`, `Retry-After` and `X-Request-Id`. Expose `Content-Disposition` only if Claude uses the server-provided filename. Check CORS on error responses as well as success.
- Verify form creation from supplied definitions, draft copying, save validation, discard, publish and retirement. Invalid definitions must have useful structured 422 errors; conflicts must not appear as successful saves.
- Test draft save/publish/discard races. Published content remains immutable, publishing a new version leaves older versions published, and already-collected observations using retired versions can still upload.
- Keep legacy definitions usable for historical records. Do not invent research questions, rewrite canonical instruments or silently convert legacy forms.

**Done when:** these API workflows persist correctly under manager access, reject unauthorized changes and pass actual database integration tests. Existing archives and mobile uploads remain compatible.

**Dependencies:** local baseline; coordinate upload/download expectations with Claude before changing headers or contracts.

### 5. Lock down bounded-data semantics for overview, reports and exports

**Work**

- Document that `since` filters by **received time**, while list ordering uses **observed time**. It must not silently become an observation-date filter.
- Keep the existing array shape and maximum `limit=500`. No pagination envelope is introduced while Claude implements against the current contract.
- Check that overview, coverage, reports and web-generated CSV/GeoJSON/codebooks have the required source fields and readable historical definitions. Frontend aggregation, filtering, labeling and export generation remain Claude's work in this release.
- Define coverage as records present by zone and round type. Without a rounds plan, it cannot claim expected rounds are complete. Do not create an activity-log API from timestamps.
- Explain which counts are exact: site `observation_count` is calculated in SQL across accessible records; statistics derived from the observation list cover only the returned subset. Project counts derived from site counts must be checked for equivalent scope.
- Document that filtering those 500 rows in the browser searches only that subset. A result with exactly 500 rows must be treated as potentially limited; the existing contract cannot prove that more rows exist.
- Give Claude test expectations for legacy null rounds, multiple form versions, Unicode answers, timezone boundaries and records whose zones are absent from the current package. Missing historical zones must not cause records to disappear from totals or exports.

**Done when:** both implementations agree on data scope and error/empty behavior, and the frontend has enough information to avoid presenting a capped export or report as complete. If full-study totals become a release requirement, promote the follow-on analysis work below before accepting those screens.

**Dependencies:** contract baseline and detail contract. This packet documents and tests existing behavior; it does not add a second export implementation.

### 6. Integrate, validate and prepare release evidence

**Work**

- Run the backend acceptance sequence: identity → real accessible project → sites/package upload/download → form draft/save/publish → observer upload → manager list/detail → invitation preview/redeem/revoke → settings readback.
- Repeat the relevant negative paths as viewer, observer and unrelated tenant. Verify removed membership immediately affects new API requests.
- Run required checks on a local test database and regenerate contracts. Give Claude the final OpenAPI artifact and change notes before browser acceptance.
- Run mobile compatibility checks for any affected response or form contract; preserve the existing PUT upload endpoint and receipt semantics.
- Keep deployment evidence separate: code/tests present locally does not establish that the hosted schema, API image, browser origin or study membership is correct.
- Prepare a release checklist for pending migrations, restricted runtime-role readiness, API `/ready`, browser origins and real study visibility. Any hosted migration or deployment remains a separately authorized execution step under root `AGENTS.md`.

**Done when:** backend/SQL/contract checks pass; Claude's integrated browser flows pass against the agreed API; the supported scope and remaining limitations are documented. No hosted or device verification is claimed unless performed.

**Dependencies:** preceding packets. Deliver focused changes by area instead of one mixed frontend/backend change set.

## Validation commands and evidence

Use Node 24, pnpm 10.17.1 and the repository's Python/uv toolchain. Prepare the existing local stack without resetting data as an ordinary setup step.

```sh
pnpm backend:check
pnpm backend:test
pnpm db:test
make -C backend openapi
pnpm plan:check
```

If a shared form or API contract changes, also run the relevant parity and mobile checks:

```sh
pnpm forms:parity
pnpm mobile:test
pnpm mobile:check
```

Coordinate `pnpm contracts:generate` with Claude because it writes declarations under both apps. Confirm generated artifacts do not drift; do not hand-edit declarations. Backend tests run against local Supabase only. Record actual pass/fail evidence when implementation happens; no backend suite was run merely to write this plan.

## Follow-on backend work, outside this release's agreed scope

- **Complete-project analysis — existing BE-14.** Stable cursor pagination, server-side filters, SQL summaries and streamed CSV/GeoJSON across all matching records. Design a compatible opt-in or new response contract; do not replace the existing list array silently. Require tests for timestamp ties, concurrent inserts, filter-bound cursors, timezone/DST, tenant scoping, mixed form versions and export column semantics. Summary and export must use the same filters. This is the next priority after the bounded web flow is reliable.
- **Storage and persisted zone polygons — remaining BE-13.** Keep the current transactional archive path for this release. Moving archives to object storage, signed download URLs and persisted polygons has its own migration and compatibility requirements and must not invalidate existing packages as a side effect of web wiring.
- **Live QGIS connection access — BE-15 and GIS dependencies.** Remains unavailable until reader provisioning and scoped database access exist. File download/export does not imply live database access.
- **PowerSync upload — BE-12.** Remains separate from finishing the management web flows and preserving the existing mobile upload path.
- **New product capabilities.** Saved views, rounds planning, zone editing, record review, device readiness, invitation resending and resource deletion remain excluded, matching the supplied plan. Existing account deletion is not removed by that exclusion.

## Handoff to Claude

Send the contract checklist and fixture instructions first. Call out the observation-detail addition early; the rest of the UI can continue using existing endpoints. Each backend delivery should include the changed contract, example success/error payloads, backend test evidence, any migration requirement and the frontend flows it unblocks. Claude owns UI integration and regenerated web declarations. Preserve this boundary even when a UI bug is discovered during backend testing.
