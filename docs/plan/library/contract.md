# Variable library and form templates: wire contract

Planning only, 2026-11-12. Read the [brief](README.md), then this contract, the [database plan](../../../supabase/LIBRARY.md) and [API plan](../../../backend/LIBRARY.md). Implementation note (2026-11-14): BE-27 implements only the six variable list/entity/usage GET routes below. Mutation/template interfaces remain proposals, and form schema stays 2 until the separate source-tag slice. The source snapshot is `master` commit `54338e5265c353a726499c5d73399acb99303c8a` (recorded in the downloaded source archive); no hosted state was inspected.

## Owner and Janet decisions (recommendations, not approvals)

1. **Owner — data columns:** keep today's question-ID column rule. When copying a variable, use its data column as the new question ID and `exportColumn`, with its library code kept separately. Do not suffix a conflicting column. This preserves workbook columns without changing recording or export. Accept the UI clarifications listed at the end rather than introducing independent editable export mappings.
2. **Janet — identifiers and missing content:** approve the row-by-row corrections/holds in the database plan: distinguish the two `EnvZone3` rows, supply `Gender1`'s column, fix `LooseParts14`'s column, supply missing choices, and settle the subtype mismatch. Recommended: seed only approved, fully usable variables; never invent research options or silently seed broken templates.
3. **Janet — standard forms:** approve one named Universal notes variable for “Open field”, the needed parents for the Short Form, and the Long Form's subtype and Wildlife predicates. Recommended: references to actual library variables with dependency closure, even when the count differs from the UI's illustrative “18 questions”. Exact proposed sequences and unresolved cells are in the database plan.
4. **Owner/Janet — metadata and workbook wishes:** omit zone/subzone questions from standard seeds unless Janet supplies a usable manual definition; the collector already records zone identity. Do not implement automatic zone answers, inventory inheritance, all-zones collection or default-No answers. Use existing `captureTime` and `observerCode` only where approved. Recommended: keep those broader workbook wishes outside this feature.
5. **Owner — usage scope:** “Used in N forms” means distinct forms within the current project, or across the current organization on its page, counting only versions the caller may read. Include retired versions and group their links under the form. Recommended: label this scope; never show a Universal variable's usage across organizations.
6. **Owner — saving parents:** keep the one-or-two-variable atomic create. If a question needs several unsaved ancestors, save those parents first, or explicitly remove the dependent rules. Recommended: explain this limit in the dialog rather than building a general bulk importer now.

**Status, 2026-11-13:** the owner accepted decisions 1, 5 and 6 together with the five frontend changes at the end of this file. Decisions 2, 3 and 4 still wait for Janet.

Proceed on these assumptions for implementation planning. Affected research rows/templates remain held from the production seed until Janet resolves them. Other approved rows can unblock the read and picker first. No unanswered question authorizes changing the UI plan or inventing a seed answer.

## Screen-first request map

`P = /v1/projects/{project_id}/library`, `O = /v1/orgs/{org_id}/library`; all path IDs here are UUIDs. The two contexts are explicit, not inferred from the caller's last project. Every row of the UI section 8 needs table is covered:

| Screen/action | Request and response | Storage/work |
| --- | --- | --- |
| Library page and picker | `GET P/variables` or `GET O/variables` → `Library` | One scoped variables query, plus one grouped scan of readable form-version tags in the same SQL statement; all full settings, no N+1 reads |
| Variable page | `GET {P|O}/variables/{id}` → `Variable`; `GET …/{id}/usage` → `VariableUsage` | Entity read and occasional derived detail; split so usage changes do not invalidate the entity's strong ETag |
| Create variable, including parent | `POST {P|O}/variables` → `CreatedVariables` | One transaction, one or two rows and validation of the resulting dependency graph |
| Save variable | `PUT {P|O}/variables/{id}` → `Variable` | Whole settings replacement, CAS revision and affected graph/template checks |
| Delete variable | `DELETE {P|O}/variables/{id}` → 204 | References checked atomically; forms are not blockers |
| Templates view and New form | `GET {P|O}/templates` → `TemplateSummary[]` | Scoped template rows and grouped item counts, no definitions |
| Template page/editor | `GET {P|O}/templates/{id}` → `Template` | Ordered item references; settings come from the existing library read |
| Save/delete template | `POST O/templates`, `PUT O/templates/{id}`, `DELETE O/templates/{id}` | Atomic whole-list replacement, closure/order/column checks; no project mutation route |
| Add variables to form | Existing `PUT /v1/projects/{project_id}/form-versions/{version_code}` with `{definition, schema_version?}` | Browser inserts copies; existing draft save validates and stores them with its current `If-Match` |
| Start form from template | Existing `POST /v1/projects/{project_id}/forms` with `{code,name,template_id}` | Server expands current variables and inserts one independent draft in the same transaction |

One library fetch per visit/first panel open; filtering/grouping/searching/site counts happen in the browser. Variable detail uses two small reads deliberately; templates do not make the main library read dependent on template implementation. No paging, search, sorting or filtering query parameters, cache, queue, stored usage count or extra “add variable” endpoint. The site link's count is derived from the library response, not persisted.

## Identity and permissions

A variable has one globally unique UUID. Code is case-sensitive, unique within exactly one library (Universal, this organization, this project, or this site). Same code at different levels is permitted; there is no overriding or shadowing. IDs are never reused, even after delete. Level, ownership, code and ID are immutable. Group is plain text, not an entity. Template identity is also UUID; template names need not be unique.

An ancestor is defined by ownership, not merely a numerical level: Organization variables can reference Universal or the **same** organization; Project variables can additionally reference the **same** project; Site variables can additionally reference the **same** site. No sibling project/site or other organization's reference. Universal references Universal only.

| Context/action | Caller |
| --- | --- |
| Read project variables/templates/usage | `has_project_role(project, ['viewer','manager'])`, including inherited owner/admin authority |
| Read organization variables/templates/usage | `has_org_role(org, ['owner','admin'])` |
| Create/edit/delete Organization variables | Owner/admin of that organization, through either context |
| Create/edit/delete Project or Site variables | Manager of that project, including owner/admin; project context only |
| Create/edit/delete Organization templates | Owner/admin, organization context only |
| Universal writes | No app caller, including an owner; developer seed/update only |
| Create/save form or start from template | Existing project manager check |

Observers do not open Forms on the web (`web/src/lib/workspace/access.ts`); they receive no library API access. Existing collector form access stays unchanged. No new role, anonymous access or browser Data API grants. Every request rechecks active caller/roles. Missing or inaccessible tenant/object is `404 not_found`; a caller who can access the context but lacks the required action gets `403 role_required`. A viewer cannot write by taking an editable-looking object from another context.

## Shapes

API envelopes use snake_case, with canonical question settings retaining their existing camelCase names. All unspecified optional properties are omitted, not null. `Variable` includes nullable ownership fields explicitly. Unknown wrapper fields are refused. Library settings accept only the supported canonical fields listed below; canonical form definitions retain their existing input/default behaviour.

**Variable**:

```json
{
  "id": "<uuid>", "level": "site",
  "organization_id": "<uuid>", "project_id": "<uuid>", "site_id": "<uuid>",
  "code": "LocalTree1", "group": "Natural Features", "section": "Setting",
  "settings": {
    "label": "Tree interaction", "exportColumn": "Tree_Interaction",
    "kind": "one", "options": [{"code":"yes","label":"Yes"},{"code":"no","label":"No"}],
    "required": false, "source": "Added in DECA Mark"
  },
  "revision": 1, "etag": "\"library-variable:<uuid>:1\"",
  "created_at": "<UTC timestamp>", "updated_at": "<UTC timestamp>"
}
```

`level` = `universal | organization | project | site`. Universal has all ownership fields null; Organization has organization only; Project has organization/project; Site has all three. The server derives lineage from the route/site, never trusts client organization IDs. `section` is exactly `Child | Social | Play | Setting | Climate | Inventory | Record`.

`settings` is the canonical Question **without** `id`, `code`, `act` or `librarySource`. Required: `label`, `exportColumn`, `kind`, `source`. Optional/defaulted fields are exactly `hint`, `role`, `numberMode`, `valueSource`, `dateTime`, `options`, `columns`, `required`, `dependsOn`, `openedBy`, `dynamicFrom`, `placeholder`, `rows`, `maxLength`, `min`, `max`, `protocolFlag`, `optionsPending`, using the current five kinds and their existing meanings. For a library variable, every `dependsOn.question` and `dynamicFrom.question` is a **variable UUID**, not a code or a form question ID. This small reuse of the existing AST avoids a second expression language. Option codes remain strings. Conditions are never executable workbook text. `answered` permits any kind; `includes` requires many-choice and a declared possible option; equals/notEquals require one-choice with a declared possible option, or text/dateTime with a literal valid for that parent's bounds/temporal format. Numeric parents use answered only, matching the current condition editor. A pending choice list never makes an arbitrary option valid. `dynamicFrom` requires a one-choice parent, each set key must be one of its static option codes, and all set export columns equal this variable's data column. Distinct static option codes and distinct codes within each dynamic set are required. These library admission rules do not tighten historical form/observation validation.

Library `exportColumn` must be nonempty (1–100 characters); code is 1–100 ASCII letters/digits/underscore/hyphen, beginning with a letter; group 1–100, label 1–200, source/hint each at most 2,000 characters. Settings are at most 32 KiB encoded JSON, a mutation body at most 128 KiB, 200 static options or dynamic sets and at most 200 options per set within that byte limit; condition depth at most 8, 64 leaves. These are proposed safety bounds, not measured capacity. Revisions are positive safe JSON integers. Canonical number/time/text constraints still apply. No global count limit on libraries.

**Library** = `{context:{organization_id,project_id?},sites:[{id,name,code}],variables:[{variable:Variable,used_in_forms:int,can_edit:boolean}]}`. Organization context returns `sites:[]`; project context includes all its readable sites, even empty ones. Universal/Organization/Project/Site rows all appear without code deduplication. Stable serialization order is level then site ID then code then ID; it is not a user sorting API. `can_edit` includes owner/admin Organization editing from inside a project.

**VariableUsage** = `{can_edit,used_in_forms,forms,templates,dependent_variables}`:

- `forms:[{form_id,form_code,name,project_id,project_code,organization_id,organization_slug,versions:[{version_id,version_code,version,state,title}]}]` gives actual web link targets, grouped once per form. Count distinct form IDs across readable draft/published/retired versions, not question occurrences or versions. Include every matching readable version, newest first; duplicate tags in a version count once. Removed drafts stop contributing; published/retired copies remain.
- `templates:[{id,name,level,organization_id}]` names visible templates that list the variable. These are direct references; dependency closure means transitive parents are also listed.
- `dependent_variables:[{id,code,label,level,organization_id,project_id,site_id}]` are direct incoming `dependsOn` or `dynamicFrom` references in the read context. `openedBy` is text, never a reference.

Counts/links are context-scoped and subject to form-version RLS. Universal usage never reveals other organizations. Organization writes check all their organization's dependents, including other projects; a project-context usage preview is informational and may be narrower than a subsequent refusal. No stored usage table or FK from forms to variables.

**TemplateSummary** = `{id,level,organization_id,name,description,round,variable_count,revision,etag}`; `level` = `universal | organization`; `round` = `standard | inventory` (UI labels Behaviour / Inventory and Conditions). **Template** adds `variable_ids:[uuid,...]`, `created_at`, `updated_at`; order is significant, IDs cannot repeat. Summary count is item count. Name 1–200, description 0–1,000 characters; 1–300 references; no empty saved template (Blank is the existing custom-form flow). There is no definition or schema version on a reference template. Each reference points to current data, not a revision. Round is a picker classification, not a site/package binding.

## Endpoints and preconditions

All endpoints require authentication and the context permission above. All reads return 200, are private/no-store, and may return `401 unauthenticated/token_invalid`, `403 account_deleted/role_required`, `404 not_found`, or sanitized `503 storage_unavailable`. All mutations additionally accept the applicable errors below. Existing platform rate limits/envelope still apply; no feature-specific queue or throttling service.

| Method/path | Request | Success | Additional errors/preconditions |
| --- | --- | --- | --- |
| `GET {P|O}/variables` | none | `Library` | No precondition or aggregate ETag |
| `GET {P|O}/variables/{id}` | none | `Variable`, ETag header | Exact entity only; no usage/capabilities in its ETagged representation |
| `GET {P|O}/variables/{id}/usage` | none | `VariableUsage` | No ETag; invisible/deleted variable → 404 |
| `POST {P|O}/variables` | `{items:[VariableCreate]}` (1 or 2) | 201 `{variables:[{client_key,variable:Variable}]}`, in request order | 409 `library_code_conflict`; 422 `library_invalid`; 413 `payload_too_large`; no If-Match |
| `PUT {P|O}/variables/{id}` | `{group,section,settings}` | `Variable`, new ETag | Required entity If-Match; 422 `library_invalid`; 409 `library_dependency_conflict`; 413 |
| `DELETE {P|O}/variables/{id}` | no body | 204 | Required entity If-Match; 409 `library_in_use` |
| `GET {P|O}/templates` | none | `TemplateSummary[]` | No paging/filter parameters |
| `GET {P|O}/templates/{id}` | none | `Template`, ETag header | Only ordered references, no resolved settings |
| `POST O/templates` | `{name,description,round,variable_ids}` | 201 `Template`, ETag header | 422 `library_invalid`; 413; no If-Match |
| `PUT O/templates/{id}` | same whole body | `Template`, new ETag | Required template If-Match; 422 `library_invalid`; 413 |
| `DELETE O/templates/{id}` | no body | 204 | Required template If-Match; existing forms never block |
| `POST /v1/projects/{project_id}/forms` | Existing `{code,name,definition,schema_version?}` **or** `{code,name,template_id,schema_version?}`; exactly one source | 201 existing `FormVersionDetail`, including schema version and draft ETag | Existing validation/conflict/schema errors; unknown/invisible template 404; no If-Match, reads current template at action time |
| `PUT /v1/projects/{project_id}/form-versions/{version_code}` | Existing `{definition,schema_version?}` with tagged questions | Existing `FormVersionDetail` | Existing strong draft If-Match, 428/412/409/422; no library lookup/precondition |

`VariableCreate = {client_key,level,site_id?,code,group,section,settings}`; no client-supplied persistent ID. A project route can create Organization (admin only), Project or Site; an org route can create Organization only. Universal is forbidden. `site_id` is required exactly for Site. Each item has a request-local `client_key` (unique, `[a-z][a-z0-9_]{0,31}`). In this create request only, a reference string may be `new:<client_key>` instead of a UUID, for example `dependsOn.question:"new:parent"`. The server allocates fresh random UUIDs, resolves these markers before validation/insertion and returns the key-to-variable mapping. Markers never reach stored settings or a read response; missing keys/cycles are refused. Public callers can never resurrect a deleted UUID by submitting it on create; random UUID collisions are handled as allocation failures, not identity reuse. Both rows must target the same library. Existing ancestor UUIDs may also be referenced. The service inserts parent before child after cycle validation; the response retains input order. An invalid item, occupied code or reference rolls back **both** rows. This is not spreadsheet import or a general batch endpoint.

No automatic POST retry after a lost reply: reload the library, locate the destination codes and let the manager inspect/adopt the committed rows before tagging the form. A matching code is not itself proof that this request succeeded. Do not add an idempotency ledger. No automatic PUT retry on stale state.

ETags follow `form_preconditions.py`: exactly one quoted strong value, `"library-variable:<uuid>:<revision>"` or `"library-template:<uuid>:<revision>"`; missing, weak, wildcard, multiple or malformed → `428 precondition_required`; wrong identity/revision → `412 revision_conflict`. Successful whole-object save increments once, including a no-op, and returns the new tag. Identity/created time/settings are immutable for a revision. Detail representations exclude volatile usage and resolved variable content, so these are genuine strong entity ETags. Permission revocation is checked before reporting revision information. Revision parsing/overflow follows form preconditions, bounded to safe JSON integers for this feature.

Template variable edits do not change a template's ETag, because its reference list did not change. A preview may become old; creation always expands the current references under the same library write locks, with no need to send each variable's revision. Returned draft is the authority for what was copied.

## Typed refusals

Keep `{error:{code,message,details}}` and CON-04's code-based handling. Add these literal codes to OpenAPI and both clients; do not branch on English or inspect arbitrary SQL messages.

| Code/status | Meaning and typed details |
| --- | --- |
| `library_code_conflict` / 409 | `{code,level,site_id?,existing_variable_id}` within the authorized destination |
| `library_invalid` / 422 | `{issues:[LibraryIssue]}` for bad settings, forbidden reference scope, cycles, wrong answer/type, missing template parent, repeated ID/column, or parent after child |
| `library_dependency_conflict` / 409 | `{issues:[LibraryIssue],variables:[VariableLink],templates:[TemplateLink]}` when a proposed variable edit would invalidate existing dependents/templates |
| `library_in_use` / 409 | `{variables:[VariableLink],templates:[TemplateLink]}` when delete is blocked; forms omitted since copies are unaffected |
| Existing `precondition_required` / 428, `revision_conflict` / 412 | No automatic retry/merge; keep unsaved input |
| Existing `validation_failed` / 422 | Malformed request envelope or canonical form save; existing form details shape stays intact |

`LibraryIssue = {kind,path,variable_ids?,template_id?,option_code?,data_column?}`. `kind` is a finite enum: `invalid_settings`, `reference_unavailable`, `reference_scope`, `reference_cycle`, `reference_type`, `option_missing`, `parent_missing`, `parent_order`, `duplicate_variable`, `duplicate_column`, `immutable_field`. `path` is an array of string/integer body segments. `VariableLink` carries id/code/label/level and authorized scope IDs; `TemplateLink` id/name/level/organization_id. Shape-check details before serializing SQL errors. An unknown/foreign referenced ID yields `reference_unavailable` with the submitted path, no foreign label or discovered IDs. Blocker lists are complete within the authorized mutation scope, deterministically sorted; no invented totals or hidden-tenant counts.

## Copies, source tags and form schema version

Preserve existing free-text `source`; add optional `librarySource` to a canonical question:

```json
{"librarySource":{"variableId":"<uuid>","level":"universal","code":"Age1","copiedRevision":1,"copiedAt":"2026-11-12T15:00:00Z","edited":false}}
```

All six properties are required when the tag exists; null is invalid. UUID/level/code/revision/timestamp/boolean are structurally validated. A tag identifies the variable UUID; level/code are copied labels that remain readable after deletion. `copiedRevision` and `copiedAt` support a later explicit “update this draft” comparison without storing variable history. They do not promise the old library revision can be retrieved. `edited` is set by the editor on the first edit; neither API nor database compares a question with today's variable. “Save to library” replaces the question's tag with the newly saved variable's identity/revision and `edited:false`; the tag is persisted only by the subsequent ordinary draft save.

These tags are declared provenance, not a trusted audit record or authorization claim. Form saves do not verify that the UUID still exists, read the library, enforce its current column/settings, or require permission to edit the source variable. Thus deletion, changed permissions and library edits cannot invalidate copied forms. Links resolve only through scoped library reads. Never replace UUID identity with code matching.

Copy algorithm: take settings, set question `code` to variable code, `act` to section and `id = exportColumn`, rewrite every UUID reference to the copied/existing parent's actual question ID, add tag. Check both existing questions and the entire new selection for column collisions **before** the current draft normalizer runs. On current form create/save, the API also refuses duplicate nonempty submitted export columns before normalization, including dynamic mappings across distinct questions; `knownExportCollisions` cannot waive this authoring check. Historical immutable form reads/observation interpretation retain their existing rules. Dynamic option-set export columns must equal the variable's single data column; multiple columns per variable are not a new feature. A variable already present is recognized by tag UUID, not its potentially edited code/ID. Existing parent copies retain their edited content. Do not silently repair their missing answer; the normal form problem list and save/publish validator refuse it.

For templates, retain the exact stored list order; all parents must precede children. Do not regroup during server expansion. For insertion into a form, the picker uses section placement, except that a question whose parent would come after it is placed directly after that parent (web plan C3), so insertion never produces a parent after its child. The form save still validates final dependency order. Existing forms are never rearranged or retagged by a library edit.

**Schema 2 → 3 is required.** Verified source constants currently equal 2, despite CON-07's dated task evidence saying 1. Recognizing `librarySource` changes the contract: an old parser strips unknown keys and must not silently discard tags. CON-07 requires one current schema; no schema-2/schema-3 dual reader. Update both canonical engine copies, generated JSON Schema, API models/current-version checks and authored cases together. The collector must accept schema 3 and ignore the tag for rendering/answers; MOB-53 is only that schema-consumer work, not a library UI or collection change.

DB-22 plans the sanctioned schema transition: preserve all question IDs, options, columns, definitions and bindings, preflight any already-present unknown `librarySource` keys before assigning meaning, advance stored schema metadata/defaults to 3 and restore published immutability. Existing untagged definitions remain untagged. Source references never become observation fields, package bindings or export columns. No upload fingerprint or queued body rewrite. Before QA-08 an explicitly authorized incompatible-data reset is allowed; after it, preserve data and use the forward transition. Reference-template replacement needs no legacy adapter. If the old whole-definition table still exists when schema 3 lands, advance its stored schema metadata too; DB-24 removes those definitions later.

## Decisions and alternatives

| Choice | Chosen; alternative rejected and why |
| --- | --- |
| Persistent identity | Server-assigned UUIDs, with temporary keys for atomic parent/child create. Accepting caller UUIDs would allow reuse after delete and make old source tags point at another variable; tracking all deleted IDs would add an unnecessary tombstone table. |
| Four levels | One variable table with explicit nullable lineage and checked scope shape. Four tables repeat every query, validator and mutation; a polymorphic owner ID loses ordinary FKs. No library-container entity is needed. |
| Settings | Canonical question settings JSON plus a few scope/lookup columns. Normalizing options/rules into many tables adds whole-save orchestration to a few hundred objects. A generic entity/document store loses useful scope constraints. |
| Ordered templates | Join rows `(template_id,position,variable_id)` with FKs. UUID arrays need manual integrity/deletion rules; relational items make “listed in” and deletion protection direct. |
| Usage | Count distinct forms from source tags, scoped before JSON expansion. A maintained association/counter duplicates form state and creates write coordination for an informational read. |
| Validation | DB constraints for keys/shape/FKs, private atomic functions for graph and template invariants, API for shape/limits/canonical form checks. API-only read-check-write races on parent edits; JSON-Schema-in-SQL for all canonical rules needlessly duplicates the form engine. |
| Concurrency | Entity revision ETags plus short organization write serialization and a shared Universal update lock. Timestamps can collide; merge protocols and per-edge locks solve contention absent from this usage profile. |
| Start a form | Expand references on the server inside creation. Browser-only expansion is easy but may silently use an editing session's old variables, contradicting “as they are now”. No new start-form endpoint. |
| Universal data | Reviewed manifest with stable UUIDs, mapped by developer into data using the same integrity checks. Parsing Excel during app startup or shipping only code constants makes updates fragile and a future curator harder. |
| Old templates | Replace contents/shape of `fieldmaps.form_templates` with reference templates, remove unscoped `GET /v1/form-templates`. Retaining a whole-definition response or dual route creates a compatibility path the pre-launch policy explicitly rejects. WEB-70 replaces the old consumer. |
| Strong ETags | Separate entity GET and usage GET. Putting mutable counts in an entity response with a revision-only strong ETag would be incorrect; hashing all usage would cause unrelated stale-save refusals. |

## Requests to change the frontend plan

Accepted by the owner on 2026-11-13 and applied to `web/LIBRARY-UI.md` as C1 to C5 (its section 2.1). Two were applied in a stricter form than requested: the picker blocks a variable whose parent lost the needed answer instead of adding it and failing the save (second item), and the picker places a child directly after its parent instead of reporting a problem (third item). The server rules below are unchanged by either.

- Clarify 4.1/5.1: the data column becomes the copied question ID; the library code stays in `code`/the source tag. Today `normalize_draft_columns` always makes columns equal IDs. Keeping independent editable data columns would require changing canonical form authoring and export semantics, outside this request. The recommended approach loses an independently chosen initial question ID, not Janet's column.
- Clarify 5.1: an edited parent with a missing option blocks **Save as well as Publish**, matching today's validator. Accepting invalid server drafts would split the current form validation path; the alternative loses only the ability to persist that invalid intermediate state.
- Clarify section placement/reordering: when a dependency would end up after its child, show a problem and require reordering or a different section. Silently topologically sorting would contradict explicit template order; supporting order-independent evaluation would change the form engine. The interface loses unrestricted reorder/save of invalid dependencies.
- Add scope wording to usage and the one-or-two-row parent-save limit from questions 5–6. Global counts risk tenant disclosure; general recursive multi-row saving adds an import-like transaction/UI. Broader dependency sets remain possible by saving parents first.
- Replace seed promises based on raw workbook counts with approved sequences, and make template creation/preview use the server's current references. All seven templates are the target; unresolved content is not a reason to silently drop a question or fill a list with invented answers.

## What to revisit as it grows

- Measure the plain scoped read at roughly 5,700 variables (10× the maximum estimate: 300 Universal + 20 Org + 50 Project + 10×20 Site) and realistic readable version/question counts before adding anything. Proposed acceptance budget: p95 under 500 ms database time and under 1 s API serialization excluding network, on a documented local fixture. These are targets, not measurements. At multi-megabyte payloads or measured browser ranking trouble, add server filtering/paging; preserve UUIDs and scope rules.
- Usage cost grows with form versions, not just variables. At tens of thousands of versions or measured scan failure, consider an indexed derived source-tag relation maintained on form save, before counters or caches.
- If independent managers regularly wait on the organization lock, measure then narrow locks. A Universal curator would use the same data/invariants with new authorization; do not build that role now.
- Spreadsheet import may reuse validation with a separate reviewed batch workflow. Moves require explicit descendant/template scope checks; group management can later assign IDs to today's text values. More template levels reuse UUID items but need new scope rules. Saving a form as a template must first resolve every copied/custom question to a variable. Archive/restore can add state while keeping stable IDs. Recent-use ranking and explicit draft refresh can use IDs/revisions/times; neither is implemented here. No future direction requires variable/template history or live form links.
