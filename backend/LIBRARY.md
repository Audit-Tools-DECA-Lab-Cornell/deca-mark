# Variable library and form templates: API implementation plan

Planning only, 2026-11-12. [Brief](../docs/plan/library/README.md) · [Contract](../docs/plan/library/contract.md) · [Database](../supabase/LIBRARY.md) · [Tasks](PLAN.md). This document specifies implementation and tests to do later; it adds no application code, migration or test.

## Verified current system

The following checks cover every fact in brief section 8. They describe repository sources, not a running/hosted deployment.

| Brief fact | Source verification and qualification |
| --- | --- |
| Project forms, version definitions/states | `supabase/migrations/20261012120000_current_baseline.sql`, tables at lines 1875 and 1897: project/organization/form lineage, definition JSONB, draft/published/retired CHECK. Later `20261017050453_form_draft_revisions.sql` adds revision CAS. `routers/forms.py`/`services/forms.py` implement save/discard/publish preconditions |
| Strong draft ETags | `form_preconditions.py` parses only quoted `form-draft:<UUID>:<revision>`; 428 malformed/missing and 412 stale. `queries/forms.py` UPDATE constrains identity, project, state and revision. Do not replace it with a timestamp comparison |
| Canonical definition and source | `contracts/form-definition.schema.json` requires free-text question `source`; generated from `mobile/src/forms/definition.ts`. Both that engine and `domain/form_definition.py` currently declare schema version **2**, also documented in `contracts/README.md`; CON-07's dated evidence refers to version 1, not today's constant |
| Existing templates | Migration `20261028090000_training_seed_and_form_templates.sql` lines 30–51: code PK/title/summary/definition/schema_version, read-only API grant and signed-in RLS. `routers/form_templates.py` → `services/forms.list_templates` → `queries/forms.TEMPLATES`: `GET /v1/form-templates` is **manager-only at API level**, despite the broader signed-in table SELECT policy; checks current schema/canonical definitions |
| Standard/Reliability and Inventory | `mobile/src/session/round-forms.ts` returns inventory only for inventory, otherwise play; `mobile/src/domain/rounds.ts` lists all three rounds and derives `Rel_Round`/`First_Round`. Current package schema has play + inventory bindings, not a third Reliability binding |
| Reset policy | `docs/plan/README.md`, pre-launch section: permission to reset incompatible experimental data until QA-08; after launch preserve data. No hosted state or existence of real users was independently checked |

Additional design-relevant findings: `services/forms.checked_definition` calls `normalize_draft_columns` and canonical validation **on draft save**, not just publish. `domain/form_authoring.py` maps ordinary and dynamic-set export columns to the question ID. `domain/form_references.py` enforces dependency order/cycles and compares choice codes. `web/src/lib/workspace/access.ts` gives web Forms access to viewers/managers, not observers. These facts drive the explicit frontend requests in the contract.

## Module boundaries and delivery order

1. `library_schemas.py` defines bounded requests/responses, entity/link/issue models, opaque ETags and literal errors from CON-08. `domain/library.py` adapts canonical question settings, extracts/rebinds UUID dependencies, and expands template references deterministically. Reuse `domain/form_definition.py`, `form_references.py` and question-kind rules; do not create a second form engine. Maintain independent shared cases for differences between library and concrete-form references.
2. `routers/library.py` exposes the explicit project/org context routes in the contract. `services/library.py` authorizes context, orchestrates transactions and validation, and maps domain refusals. `repositories/library.py` + `queries/library.py` own scoped SQL and private-function calls. The first slice is variables/usage reads over DB-21's approved seed; do not wait for template authoring. Until template storage exists, the implemented usage response's `templates` is empty because no reference templates exist, not because a failing query was swallowed.
3. `library_preconditions.py` follows `form_preconditions.py` exactly for strong-tag syntax/identity/revision; separate variable/template prefixes. Wire source tags through canonical schema-3 form writes/reads, keeping the existing form endpoints and normalizer. DB-22 and MOB-53 coordinate the schema gate before exposing tagged drafts.
4. Add variable create/replace/delete calls after DB-23. No generic repository `save(any_table,any_json)` or field patch endpoints. Whole-object replacement is the use case.
5. Add reference-template routes/services/repositories after DB-24. Extend `FormCreate` as exactly-one-of definition/template_id and keep `forms.create_form` as the only form-creation transaction. Remove `routers/form_templates.py` and its global list service/query/model once BE-30 replaces them; regenerate OpenAPI and both app declarations. WEB-70 replaces the WEB-56 client. No old-route alias, redirect, compatibility payload or copied-definition template survives this replacement.

Only the API calls private mutations, through `user_transaction` setting `fieldmaps.user_id`. Browser role checks are hints; backend context checks/private DB checks are authoritative. No service-role connection and no Data API bypass. Existing `main.py` includes new routers; OpenAPI operation IDs are stable and distinguish org/project operations, such as `listProjectLibraryVariables` and `listOrgLibraryVariables`.

## Main read and usage

Resolve the requested context and permission first using existing tenancy functions. Execute one SQL statement returning scoped sites/variables/counts, with the form scan scoped before JSON expansion. JSON-tag joins use UUID text equality without casting untrusted definition strings. The entire `Library` response is assembled from that statement's snapshot; no per-variable reads, permissions calls or counts. Bound/validate JSON input on writes, not by silently truncating reads. Request-size limits do not imply a truncated library response.

`GET variable` returns just the entity and its strong ETag; `GET variable/usage` computes counts/links plus `can_edit`. Counts in both list/detail use the same definition of “form”: distinct form IDs with any matching **readable** version in the route context. The detail links every matching readable version, grouped by form. Use existing form/version RLS so viewers never infer drafts. Retired copies count. Variable source edits/deletes do not alter the tags in a form. Tags may be user-declared; this read reports their usage, not independently authenticated provenance.

Template lists return metadata plus `count(items)`, not resolved definitions. A template detail remains a stable metadata/reference representation even if a variable changes. The form-start path supplies the strong currentness guarantee; there is no promise that a browser preview remains current during editing.

Record query time, response size and number of SQL statements in implementation evidence for the 10× fixture; do not add counters/indexes/caches just because the word “usage” sounds expensive. If slow, first inspect scope predicates and the single grouped JSON scan.

## Mutation pipeline and refusals

The common order is authenticate → resolve visible context → action-role precheck → parse/bound body and If-Match → database lock → recheck active role → read current entity/revision → validate proposed state → mutate once → commit → serialize. A malformed header cannot leak a hidden entity's revision. Lock timeouts remain sanitized retryable storage errors; do not mislabel them as successful or stale saves.

| Refusal | Detection/report |
| --- | --- |
| No access / wrong level | Existing tenancy helper; 404 for invisible context/entity, 403 for insufficient action role in a visible context. Repeat in private functions after lock wait; Universal app writes always 403 |
| Unknown/extra immutable request field | Strict wrapper models; malformed envelopes use existing 422 `validation_failed`; replacing code/scope is not supported |
| Duplicate code on create | Named uniqueness constraint inside transaction → 409 `library_code_conflict` with safe existing ID. Persistent IDs are server-generated; supplied IDs are malformed input, never an upsert or resurrection. Never return a foreign row's identity/label |
| Bad settings/bounds/type/size | API canonical setting adapter with a synthetic ID and section/code; enforce body and per-settings byte limits before full processing; 413 `payload_too_large` or 422 `library_invalid` typed issue paths. Do not parse a dependent variable in isolation as a complete one-question form |
| Missing/foreign/cross-level parent | Private validator resolves targets in ownership ancestry, including same-action new row; 422 `library_invalid`, `reference_unavailable` or `reference_scope`. Missing/foreign refs expose no discovered metadata |
| Wrong operator, missing answer, invalid dynamic set key | Validate `dependsOn` operator against parent kind and declared options; `dynamicFrom` parent must be one-choice with matching static parent option keys. Never treat a pending/empty list as proof an option exists. Create/own-rule edit → 422; breaking an existing child → 409 `library_dependency_conflict` naming it |
| Cycles/self references | Walk proposed graph of `dependsOn` and `dynamicFrom` edges with a visited/visiting set; 422 for new invalid graph; 409 if a proposed edit invalidates existing dependent objects. No maximum library hierarchy depth other than cycle prohibition; condition AST bounds are separate |
| Stale save/delete | Parse one strong ETag, compare UUID and revision after lock; 428 malformed/missing, 412 different identity/revision. Entity gone → 404. No merge or automatic reread-and-retry |
| Variable delete with dependents/items | Private incoming reference scan + template-item FK; 409 `library_in_use` with complete authorized variable/template blockers; existing forms do not block |
| Variable edit breaks a template | Re-evaluate every affected template with proposed column/rule/options/section, including newly required ancestors, ordering, collision and canonical prospective-form eligibility. 409 `library_dependency_conflict` names templates; store nothing |
| Invalid template body | Check allowed levels/same org, distinct IDs, complete transitive closure, exact order parent-before-child, no repeated export column (including dynamic mappings), and nonempty bounded list. 422 `library_invalid`; do not silently add/reorder/drop references |
| Bad copied form | Existing `checked_definition` validates after copying. Before normalizing current form writes, reject duplicate nonempty submitted export columns across distinct questions (including dynamic sets), regardless of knownExportCollisions; do not change historical form interpretation. Body must not bypass collision detection by normalization/suffixing. Existing form save errors remain `validation_failed`, with the normal problem list; no special library-linked form state |

API checks help produce early, useful errors, but the private transaction's graph/template checks decide whether a write commits. To cover canonical rules without duplicating the full form engine in SQL, the service holds `lock_library_write` for API checks of the affected canonical projections **and** the private mutation; the private function rechecks all graph/identity/template structural invariants. Only this service/validated developer seed receives execute/write authority. The same shared cases must exercise SQL and Python for the cross-object rules implemented in both; no second, subtly different option-reference semantics.

For simultaneous requests, short global-shared/org-exclusive advisory locks serialize affected organization writes and expansion; the operator's Universal update takes global exclusive. All functions use the same lock order as specified in the DB plan. At READ COMMITTED, query validation state after acquiring locks so an earlier snapshot cannot bless a broken graph. This is integrity protection, not co-editing machinery.

Private function exception DETAIL is decoded into `LibraryIssue`/link models. Only recognized SQLSTATE/constraint mappings can produce known user errors; unknown SQL exceptions are sanitized 500s. No arbitrary DETAIL echo, raw SQL, cross-tenant labels or body logging. Update `errors.ErrorCode`, the mapping module, OpenAPI components and both CON-04 client helpers together. Backend-generated OpenAPI is the authority for TS types.

### Atomic Save to library

Accept one/two items with unique request-local keys in the same target library. Allocate fresh server UUIDs and resolve `new:<client_key>` dependency markers before validation; no persistent ID can be supplied or reused by the client. Validate both, resolving references against existing ancestors plus the proposal, before inserting either. Existing parents are reused by UUID. If several unsaved ancestors are needed, reject the request with explicit paths; the frontend recommendation is to save parents first or remove the rule intentionally. No recursive implicit creation, deduplication by label/code, or multi-request partial success for the supported two-row action.

Library creation does not mutate a form. Return committed variables/revisions; browser updates its local source tags and later saves the draft through its existing ETag. A failed form save does not roll back the independent library creation; explain this separation. A lost POST reply requires a scoped read by destination codes and explicit inspection/adoption of the returned rows; do not blindly retry or introduce an operation ledger.

### Template expansion inside form creation

Check project manager, derive organization and acquire the library locks. Fetch exactly one visible template and its ordered current variables. Validate closure/order/settings/columns and construct a canonical definition: server stamps version/status as today; title is the requested form name, summary is template description or its name if blank, source names the template ID, inclusion is a neutral “Questions copied from the selected form template”; `columnNaming:"questionId"`, no known collisions/protocol notes invented. Copy each variable with the contract's question-ID/UUID-rebinding algorithm and timestamp all tags from the same server instant. Call existing form/draft insertion and rollback everything if validation/uniqueness fails. Starting from a template doesn't retain a live `template_id` FK on the form.

Do not add unrequested parents, reorder across sections, substitute a default variable, or silently ignore missing settings. Stored templates should already be valid; if inconsistent data is discovered, fail with a sanitized typed validation error and no partial form, then repair the data. Holding locks through the short insert makes “current” mean the state at this action's serialization point, not when the dialog was opened. A later library edit leaves that draft untouched.

The existing definition-based create is unchanged except schema-3 validation. “Blank” remains the current web-generated initial valid custom form (the canonical schema requires at least one question); no empty-template workaround is added.

## Schema and collector handoff

CON-09 owns the frozen source-tag shape/transition cases, MOB-53 updates the canonical engine copies and generator/consumer gate, DB-22 plans stored metadata transition, BE-28 updates API schema/version/default/normalization paths. `librarySource` is optional on existing questions but fully typed when present; preserve it on save/read and through copy-normalization. `source` remains research provenance prose. Do not trust it for permission checks, compare it with today's library, or introduce a tag FK.

The strict schema-number gate makes MOB-53 necessary even though no collector rendering change is needed. No new library network calls on mobile, no zone/site-package schema changes, no Reliability form, no observation envelope/export additions. Existing schema-transition/cache rules apply; pre-launch may explicitly reset incompatible caches, after launch preserve drafts/queued immutable bodies and refusal/recovery behaviour. No attempt to keep a second schema reader solely for this feature.

BE-30 removes the global template route, and WEB-70 must be released with it. This deliberate breaking replacement is permitted by the current user-authorized pre-launch policy; it is not hidden behind an alias or dual format. Check QA-08/real release state again before implementation, since all new tasks are Post-pilot and the reset policy ends at launch.

## Test plan (to implement later)

**API tests, real restricted-role transactions:**

- Main list contains all four levels including two sites, same codes at different levels and empty sites; org read contains only Universal/Organization. Assert a bounded query count, full settings and no filters/paging. No fallback empty list on database failure.
- Permission matrix: owner/admin inherited manager, project manager, viewer, observer, non-member, removed/deleted caller; foreign organization/project/site UUID substitutions on every read/write; error bodies reveal no foreign names. A manager can read but cannot edit Organization/Universal. Admin can edit Org from the project context.
- Usage: two tags in one version, several versions of one form, published + retired, a manager-only draft, deleted draft, untagged question, stale source after variable delete, forged/invisible source ID. Count form IDs once and prove every returned version link is readable. Org totals and project totals differ intentionally.
- Whole create/edit/delete and no-op revision advancement; all strong ETag malformed variants; stale save and stale delete retain original data. Deleted entity 404; wrong resource ETag 412; weak/wildcard/list 428. Entity ETag stays unchanged after usage-only changes.
- Two-row parent/child create: either request order; collision/invalid child rolls back parent; existing parent reuse; cross-target batch refused; lost-reply inspection/adoption without assuming code equality proves success; attempted deleted-ID reuse is refused; no form mutation as a side effect.
- Rule graph: static/dynamic codes, answered/equals/notEquals/includes/all/any, missing/foreign sibling/cyclic refs, multi-level ancestry and two-deep closure, edited-parent removal/type change, adding a parent to an already-listed variable.
- Template CRUD: order roundtrip, stale list edits, Project/Site/foreign variables rejected, missing transitive parent, duplicate column and ID, wrong order, dynamic-set columns and role-observer constraints. Deleting a referenced variable names the template; deleting template frees the variable and changes no form.
- Start-form race against template save and variable update: draft contains either complete serial state, never mixed versions. Source labels/revisions/timestamps match copied data; next start sees edit; first draft remains unchanged. Existing create/draft save/publish/discard continue to use their form ETags.
- Route replacement: unscoped old route absent from app/OpenAPI, current scoped routes present; generated TypeScript consumers compile; errors map by code. No compatibility adapter or runtime workbook/bundled-template lookup.

**SQL tests:** the DB plan's constraints, privileges, RLS, mutation guards and two-session races. Include a test that calling mutation functions directly still cannot bypass scope/graph/template rules. Include the existing default-privilege coverage and no direct writes from browser roles/API role. Run seed/transition checks on disposable databases only.

**Shared authored cases:** add `contracts/library/*.cases.json` for ancestor scope, UUID-vs-code identity, dependency closure, parent ordering, exact expansion and duplicate columns; `contracts/forms/definition.cases.json` covers schema 3 and source-tag boundaries. Python, web pure picker and SQL domain cases consume the relevant same expectations; collector only consumes canonical form/tag cases. Cover tags with absent/deleted source, UUID/level/code/boolean/revision/time errors, preserving free-text source, round metadata never becoming questions, and unchanged answer results with/without tags. Expected answers are hand-authored, not generated by implementation.

**Regression/measurement:** existing form parity and API/SQL suites, OpenAPI generation twice with no drift, both TS type checks/error helper tests, and the scoped 10× query/serialization measurement. WEB-67/69/70 own local browser acceptance and wording. These checks are future implementation gates; this planning pass runs only `pnpm plan:check --fix` and `pnpm plan:check` with Node 24/pnpm 10.17.1.
