# Variable library and form templates: database plan

Planning only, 2026-11-12. [Brief](../docs/plan/library/README.md) · [Wire contract](../docs/plan/library/contract.md) · [API plan](../backend/LIBRARY.md) · [Owning tasks](PLAN.md). No SQL migration is supplied or applied by this document.

## Start with the reads

The project Library/picker reads Universal + its Organization + its Project + every Site in that project, with full settings. At the brief's maximum that is about 570 small variables; the organization page reads at most about 320. Select explicit scope predicates, then apply RLS; never select an organization's whole data and filter after serialization. Include sites with no variables so the client can render empty chips.

One SQL statement returns the sites and variables with usage: first restrict form versions to the requested project (organization page: projects of that organization) under existing form-version RLS; expand `definition.questions` once with a lateral JSON traversal, extract `librarySource.variableId` as text, group by variable UUID text and count distinct `form_id`. Left join that grouped result onto visible variables. Avoid per-variable correlated JSON scans and unsafe UUID casts of arbitrary historical JSON. No tags means zero. No definition body is returned as part of usage. Published/retired versions and authorized drafts contribute. Detail usage separately groups the matching versions under form IDs with their route metadata.

Use the same statement snapshot for counts and library data. The entity detail/usage endpoints are separate because usage is not part of an entity's revision. Template list groups item counts; template detail reads references in position order. Neither resolves entire definitions. No read cache, stored count, search extension, replication feed or materialized view.

DB-21/BE-27 must measure this shape with 5,700 visible variables and separately with 10,000 readable versions × 100 questions. The form volume is a synthetic stress assumption, not a brief fact. Record EXPLAIN ANALYZE under the restricted API role, rows visited, size and p95; target budgets are in the contract. This plan makes no measured performance claim.

## Tables, keys and indexes

### `fieldmaps.library_variables`

| Column | Meaning/constraint |
| --- | --- |
| `id uuid` | PK; server-allocated fresh UUID for every app create; developer-fixed for Universal; never reused |
| `level text` | CHECK in universal/organization/project/site |
| `organization_id uuid null` | FK organizations; required except Universal |
| `project_id uuid null` | Composite FK `(organization_id,project_id)` to projects `(organization_id,id)`; required for Project/Site |
| `site_id uuid null` | Composite FK `(organization_id,project_id,site_id)` to sites `(organization_id,project_id,id)`; required exactly for Site |
| `code text` | Immutable, case-sensitive; contract grammar/length; no hierarchy shadowing |
| `group_name text` | Trimmed nonempty text, 1–100 characters; no group table |
| `section text` | CHECK against the seven canonical section names |
| `settings jsonb` | Whole canonical settings object described by the contract; references in `dependsOn.question` / `dynamicFrom.question` are UUIDs |
| `revision bigint` | Starts at 1, positive and no greater than 9,007,199,254,740,991; increment once per save |
| `created_at`, `updated_at timestamptz` | Server times, finite; update time changes with revision |

Exact ownership CHECK uses four disjoint cases: Universal has all three null; Organization has only organization; Project has organization and project, null site; Site has all three. This CHECK matters because ordinary composite FKs do not reject partially-null tuples. No polymorphic `owner_id`; no separate library-container table. Reuse the verified existing `projects_organization_id_id_key` and `sites_organization_id_project_id_id_key`; no new parent unique indexes are required. Parent deletion uses RESTRICT, not cascade that could bypass reference validation. Existing account deletion is independent of these organizational rows.

Partial UNIQUE indexes: `(code)` where Universal; `(organization_id,code)` where Organization; `(project_id,code)` where Project; `(site_id,code)` where Site. These intentionally do **not** make data columns globally unique: Age1 and Age2 are alternatives. Ordinary indexes `(organization_id,level)`, `(project_id,level,site_id)` cover scope lookups/lineage; review redundancy against actual plans before adding more. The site-code unique index also serves site lookups. No JSON GIN or text-search index initially.

Settings stay JSON because writes replace the whole object. Do not split option labels, bounds or condition junctions into tables. Check object type and byte bound in the table. Required shape and the UUID reference AST are validated in the private write function before graph evaluation; API canonical-kind checks cover detailed format settings. Store no `librarySource` inside a variable: its own identity is the source for a later copy.

### `fieldmaps.form_templates` (reshaped)

Replace the old two whole-definition seed rows and old table shape, retaining this useful table name. Columns: `id uuid PK`, `level text CHECK universal|organization`, `organization_id uuid FK null only for Universal`, `name text` (1–200), `description text` (0–1,000), `round text CHECK standard|inventory`, `revision bigint`, `created_at`, `updated_at`. Names are not identifiers and need not be unique. No code, definition, schema version, draft state or publication state. Index `(organization_id,level)` for org lists; Universal's small partial set needs no special search index.

`fieldmaps.form_template_variables`: `template_id uuid`, `position integer CHECK >=0`, `variable_id uuid`; PK `(template_id,position)`; UNIQUE `(template_id,variable_id)`; FK template ON DELETE CASCADE, FK variable ON DELETE RESTRICT. Index `(variable_id,template_id)` for reverse lookup/delete protection. Whole replacement validates 1–300 items, distinct IDs and dense zero-based positions, then replaces item rows within the same transaction. No individually addressable item endpoints.

Use join rows over an array because PostgreSQL can protect identity/deletion with FKs and directly answer which templates list a variable. Ordering is explicit, not dependent on UUID/code sorting. Variables still reference other variables in their bounded settings JSON: at these sizes a scoped graph scan is simpler than maintaining a duplicate edge table. No question-copy relation is added to forms.

### Existing form storage

No library FK on `form_versions.definition`. A deleted variable's tag stays usable as provenance. Existing forms/form versions, revision CAS and immutable publication stay. Existing project/form indexes should constrain usage before JSON expansion; if the measured plan requires it, a plain `(project_id,form_id)` form-version index is the first candidate, not a JSON search index.

DB-22 advances the canonical schema number to 3 under CON-07. It preflights unknown `librarySource` properties, advances all supported stored form rows (and the old definition templates if still present), updates defaults and reestablishes the frozen-definition trigger. It does not rewrite answers, question IDs, columns, option codes, package bindings or observation fingerprints. No source tag is backfilled by guessing code equality. A pre-launch reset may replace incompatible experimental data only when its target is separately authorized; after QA-08 use a preserving forward transition. DB-24 removes the obsolete template definitions without adding a compatibility reader.

## Permissions and RLS

Follow current tables: RLS enabled; policies `TO fieldmaps_api`; revoke table/function access from PUBLIC, anon, authenticated and service_role. Use `fieldmaps.request_user_id()`, `fieldmaps_private.assert_active_user()`, `has_org_role` and `has_project_role` with caller identity. Never use user metadata or a membership query lacking the caller predicate.

`library_variables` SELECT policy:

- Universal: active caller is owner/admin of some organization or viewer/manager of some project. Do not expose it to unauthenticated or observer-only callers.
- Organization: own organization's owner/admin, **or** viewer/manager of a project in that organization. Use a narrow private helper for the membership set if needed to avoid recursive policies, using existing role semantics.
- Project/Site: `has_project_role(project_id, ARRAY['viewer','manager'])` (owners/admins inherit manager).

Queries additionally restrict to their requested org/project context. A viewer of project A cannot fetch Site B's variable by substituting its UUID. Organization visibility does not imply access to other projects' variables, forms or usage.

Templates' SELECT uses the same Universal/Organization predicates. Item SELECT requires a readable parent template; it does not recursively query the items table. Invariants ensure all referenced variables are also visible in the template's context.

Grant the API SELECT only on these tables; mutation is through narrowly granted private functions. There are no API INSERT/UPDATE/DELETE policies or direct DML grants. This is a deliberate difference from simple existing form drafts: these writes must atomically validate reverse references, not just the row being edited. A new private SECURITY DEFINER function is justified only for this controlled write/hidden-dependent check. Set `search_path=''`, fully qualify names, revoke default PUBLIC EXECUTE, grant only the intended entry points to fieldmaps_api. Internal graph validators have no API execute grant. Do not give a generic “run SQL”/arbitrary-table function.

Every mutation derives ownership, checks its route context, locks, then rechecks active caller and role after waits. Organization mutations require owner/admin; Project/Site require project manager; Universal mutation is unavailable to application roles. Submitted IDs cannot retarget a scope. No writable owner/code/level columns in the replace body. Private mutation functions return only IDs/revisions or explicitly sanitized authorized blocker data; privileged reads never become unscoped lists.

## Private functions and validation boundaries

Planned entry points (names are proposals; parameters prefixed `p_`):

- `create_library_variables(context, items)` — exactly one or two same-destination rows; allocate fresh persistent UUIDs and resolve request-local keys; all-or-nothing parent-first insertion.
- `replace_library_variable(context, id, expected_revision, group, section, settings)` — whole replacement and affected graph/template check, revision increment.
- `delete_library_variable(context, id, expected_revision)` — no incoming rule/dynamic reference and no template item; delete permanent.
- `create_library_template(org, body)`, `replace_library_template(org,id,expected_revision,body)`, `delete_library_template(org,id,expected_revision)` — organization-only mutations; replacements retain metadata and items atomically.
- `lock_library_write(org)` — shared global Universal-update advisory lock, then the **existing organization advisory lock key convention** used by membership/site authoring. Recheck permissions after acquiring it. This helper is also used by the API's server-side template expansion inside form creation. It must not create a second caller identity convention.
- Internal `validate_library_graph` / `validate_library_templates` inspect a proposed final state before commit. Internal seed validation can inspect all organizations for Universal changes; application calls cannot invoke that mode.

No public write function for Universal. A reviewed developer seed/update runs as the database operator with the global lock exclusive, applies its proposed changes in a transaction, runs the same invariant validators, and commits only if the resulting graph/templates are valid. This prevents Universal edits racing any organization's saves or form expansion. All app writes take the shared global lock **before** the organization lock; Universal updates take global exclusive before any org locks, sorted if required. Reads remain ordinary MVCC and do not block on this advisory protocol. No lock table, queues or long-lived edit locks.

The organization lock is intentionally coarse: a few writes per week across 1–5 managers do not warrant per-edge locking. It also closes write skew (A adds dependency on B while B is deleted or changes options; two edits introduce a cycle; variable changes column while a template is saved). Lock every relevant scope before reading validation state, use fresh statements at READ COMMITTED after waits, and retain locks until commit. Membership-changing functions already use the org lock convention; recheck that fact when implementing new entry points.

| Invariant | Authority and why |
| --- | --- |
| UUID PK, unique code within library, ownership shape, lineage, positive revision, length/size, valid level/section | Table CHECK/UNIQUE/FK constraints; cannot be defeated by API races |
| Immutable scope/code/identity/creation time, revision advances once | Private write allowlist plus guard trigger; rejects accidental maintenance DML that violates lineage |
| Detailed canonical kind/settings validity (number bounds, timezone, automatic sources, etc.) | API canonical validator reused; avoids reimplementing the full form engine in SQL. Seed tool uses this validator too. Private functions still validate the structural fields needed to safely evaluate graph rules, including distinct option codes, reference UUIDs and AST limits |
| Reference target exists and is same library or ownership ancestor | Private function over proposed state, inside locks; level rank alone is insufficient |
| No self/dependency cycle; every option/type reference resolves | Private graph validator, covering `dependsOn` and `dynamicFrom`; includes `answered`, comparison operator kind compatibility, static/dynamic option codes, valid text/dateTime comparison literals and dynamic-set keys, following the contract operator matrix. Cannot hide a missing choice option behind `optionsPending` |
| Template only Universal/same Organization, all transitive parents included, no repeats, dense positions, parent before child, one data column per question | Private template validator plus join constraints/FKs. Validate all referenced settings as a canonical prospective form at API creation/expansion too |
| Changing parent kind/options/rule/column/section cannot break existing children/templates | Private mutation computes affected incoming dependents and containing templates against proposed state; checks new transitive closure and order as well as duplicate columns. Reject entire save with named blockers |
| Variable deletion cannot break any incoming rule or template | Private graph scan and item FK RESTRICT, inside same locks; forms are deliberately not blockers |
| Authentication/context/role | API precheck plus RLS/private-function recheck; service role bypass is not a solution |
| Source tag on form copy | Canonical form schema structural validation only, API; no DB lookup/FK or library revision check |
| Existing form dependency/order/column validation | Existing canonical form validator; applies on save and publication; server expansion uses it before insert |

When a variable has dynamic choices, all its dynamic sets use its one data column. To test comparisons to dynamic parents, consider the union of their declared possible codes, not hypothetical runtime answers. No satisfiability solver. `openedBy` and free-text source/notes do not affect graph edges. A rule's parent may be earlier/later in library presentation (libraries are unordered); only instantiated forms/templates require parent order. Do not restrict ordinary library creation based on today's section order.

Use existing FM006/007 for access/missing and FM009/FM010 for revision/precondition refusals, as defined in `20261017050453_form_draft_revisions.sql`. Allocate unused library SQLSTATEs at implementation after scanning the migration chain; map them to the four literal wire codes in the contract. Store structured blocker JSON in exception DETAIL, never interpolate user prose into a magic English error string. Validate/filter that detail in the API. Expected uniqueness violations must map by constraint name, not all IntegrityErrors to “code taken”.

## Universal seed and subsequent developer updates

Source inspected: `docs/variables/Behavior Mapping Variable Library_ Additional.xlsx`, sheets **BehMapApp Variable Library** and **BehMapApp Form Library**. XML inspection found **109 variable rows, 108 distinct codes, no hidden variable rows**, and seven named Standard/Inventory templates. These are facts about this workbook, not the older workbook's 112 rows/12 hidden rows. Excluding row 25 `RelRound1` and row 28 `FirstRound1` leaves 107 candidate rows before defects/holds. Do not turn answer continuation rows into variables.

Plan a reviewed, hand-maintained data manifest at `contracts/library/universal.json` with stable assigned UUIDs, source sheet/cell coordinates and approved normalized settings/references. It is seed input, never a runtime substitute for database data. Give each logical variable an ID once; renaming/reordering an Excel row must not reassign its ID. Do not derive IDs from mutable code strings. Keep unresolved entries in a separate review section/document, not live rows with invented settings. The developer's conversion/check command is a development tool only, not spreadsheet import for users.

For initial seed, validate approved rows through the canonical settings validator, resolve approved references, check graph integrity, then insert by stable ID. Templates follow in DB-24 once their variables are approved. Keep a hash/source revision for the reviewed manifest in the seed evidence; no version-history table. Later updates are explicit reviewed deltas with expected current revisions, not a startup upsert that silently overwrites content. Update changed Universal rows in place, increment revision, preserve UUID/code; a corrected code after first seed requires a consciously new identity since app-visible codes are immutable. Unchanged rows keep revisions. Deletion uses the same reference guards. Show all affected organizations' templates to the developer in a local review report; never return that cross-tenant report to app callers. Failed validation rolls back the complete update. No cache invalidation infrastructure: subsequent reads see committed rows.

| Workbook column | Stored field / conversion |
| --- | --- |
| A Variable Group | `group_name`; carry forward the nearest actual group heading, not arbitrary blank-cell contents |
| B Variable Code | Immutable `code`; required and unique after Janet resolves collisions |
| C Variable Name | `settings.label`; keep approved wording/capitalization; do not reuse option continuation labels |
| D Instructions | `settings.hint` when meaningful; “automatic/not needed” is a source note, not help text |
| E Variable Column Name | `settings.exportColumn`; no automatic repair of blanks/collisions; copied question ID initially equals this |
| F Answer format | Map to existing one/many/text/number/dateTime plus approved settings; prose is not executable |
| G Answer Options | Static `options` with reviewed stable codes; continuation rows belong to the preceding B row; approved maxLength/bounds where present. Semicolon/comma parsing alone is not a reliable research-data conversion |
| H Notes or Visibility Logic | Retain sheet/range and original wording in manifest provenance; translate only approved rules to `dependsOn`/`dynamicFrom` UUID AST; `source` identifies workbook/sheet/row. Do not treat a wish about automatic behaviour as an implemented rule |
| No column | Proposed section mapping below, Universal level, fixed UUID, server revision/times |

Suggested section mapping for Janet review: Date/Time + Observer + Environmental zone → Record; Climate → Climate; Loose Parts Inventory → Inventory; Play Summary → Play; Target Child → Child; Peer/Adult → Social; Play Type + Activity/Risk/Communication → Play; Fixed/Natural/Designed/Loose environmental/Wildlife/Shade/Topography → Setting. Groups remain the workbook's text, even when several groups share a section. Preserve template order instead of sorting this mapping into a new question order.

### Rows needing Janet's decision before seeding

Coordinates below refer to the **Additional** workbook unless explicitly marked Test/older Library. This list is the detailed evidence behind the grouped questions at the top of the contract.

| Rows/cells | Issue; recommendation and seed consequence |
| --- | --- |
| Variables B21/B23, E21/E23 | `EnvZone3` names both primary custom zone and subzone. Approve distinct code (recommend `EnvSubZone1` for row 23) and subzone choices/parent. Hold both ambiguous identity mappings until approved |
| E74, Gender1 (older report says E75) | Blank data column; recommend `Child_Gender` subject to Janet. Hold variable and Standard seeds that reference it |
| E238/E239, LooseParts13/14 | Binary and dependent checklist both use `Nat_LPs_Lrg`; unlike alternatives, these must coexist. Recommend `Nat_LPs_Lrg_List` for row 239; hold child/rules until approved |
| E34/E258, Climate3/Shade1 | Both use `Shade`; retain as alternatives under L9 unless Janet wants them together, in which case she must approve distinct columns. No auto-renaming |
| Variables rows 138–170; Forms C41/C43 | Variable `PlaySubtype1` means Physical slot 1, `PlaySubtype2` means Exploratory slot 1; Form sheet uses them to mean all subtypes for slots 1 and 2. Recommend retain nine category-specific slot-1 variables and explicitly add nine approved slot-2 counterparts with independent columns, plus each needed Other description. Expand the Long template's two shorthand entries to those actual IDs; do not silently repurpose the existing codes or collapse their analysis columns |
| Variables H76, H95, H99; rows 77–118; Forms D33/D37 | Parent gates sit on preceding rows; Short Form omits PeerIntn1/AdultIntn1 but uses their proposed dependents PeerIntn4/AdultIntn3. Recommend one consistent global gate per variable and include its parent in Short, with Janet approving the resulting count. Templates cannot override a referenced variable's rule |
| Rows 100–118 (AdultIntn2/3/4), 184–205 (Risk1/2/4) | “Other” child could depend on either alternative, which shares a data column. Do not require both alternatives via OR (that makes template closure impossible). Recommend bind the existing child to the collapsed Adult / expanded Risk used in standard forms; approve separately named child variants if both alternative families must be seeded |
| Variables H246, rows 247–256; Forms D59 | Wildlife1 is yes/no but its note says “None”; Wildlife2 has categories, not yes/no, yet template says show Wildlife5 on “yes”. Recommend Wildlife2 depends on Wildlife1=yes, Wildlife3 on Wildlife2=other, Wildlife5 on Wildlife1=yes (or an explicitly approved non-none category predicate). Hold ambiguous rules |
| Rows 8,17–23,43/45/47/49/51/53/55,180–183,216–217,222–223,233/235/237/239/241/243/245,255 | Custom time blocks, zone choices, inventory checklists, FMS lists, fixed-feature lists, loose-parts lists and Wildlife4 choices are missing or project-specific. Obtain actual reviewed lists; do not put “list to be provided” into an option. Universal is read-only, so do not seed unusable placeholder choices. Expanded Inventory templates remain held if their lists are missing |
| F183/G183, F205/G205; C/D222 and C/D224 | FMS4 says one-choice but G says text; Risk4 lacks F; designed-feature labels/instructions describe natural features. Recommend text/100 characters for the first two and approved designed wording for the latter two |
| Variables rows 215–245 and relevant H notes | “Likely” gates, default No, optional custom inline Other. Recommend explicit approved parent=yes rules and separate existing text variables for Other; default-No/inline custom-choice widgets are not current settings and are not added by this feature |
| Variables rows 4,6,10–14; Forms D6/D7,D26/D27 | Approve captureTime/observerCode mapping and date display/timezone. Observer name is not an existing automatic source; recommend manual text or omit it from standard forms. No inference that account UUID equals a researcher-assigned observer ID |
| Forms C23/C62 | “Open field” is not a variable code. Approve one new Universal `Notes1`, column `Notes`, text maxLength 1000, section Record, then reference it in both; templates cannot carry an inline custom question |
| Forms D8/D28 and D76; Variables H30/H32/H34/H36 | Automatic zone question, all-zones inventory and propagation to later events are broader collector/protocol wishes. Recommend omit redundant EnvZone1 from standard seeds (hold until approved), retain inventory as zone-based, no inherited answers. Do not change packages/collector/upload |
| Older feasibility report's hidden Test rows 33–40/180–187, quantity-band “YES” notes, E168/E169 collision | Rechecked, not mechanically transferred: this Additional workbook has no hidden variable rows; manufactured E230 is `Mfgd_LP_Intn_Binary`; quantity inventory rows 42–55 have no “YES” gates. Janet must approve the Additional workbook as the seed authority; no inferred hidden/excluded flags from the older file |

Intentional repeated alternative columns also include Age1/Age2, AdultIntn2/3, CARS1/2, Risk1/2 and EnvZone1/2/3. Retain these collisions in the **library**; reject selecting both into a template/form. RelRound1/FirstRound1 are excluded by L17, not questions awaiting Janet. Form sheet rows 66–69 request Reliability twins; L17 supersedes them.

### Seven template seed recipes (ordered references)

Keep exact approved order, not alphabetical/group order. Codes below are review notation only: resolve to manifest UUIDs at seed time, fail on ambiguity/missing code. Metadata descriptions must be reviewed text, not guessed research instructions.

1. **Standard Short Form / standard**, source Forms B5,C6–C23: DateTime1, Observer1, EnvZone1, RelRound1, PlaySummary1, Age1, Gender1, PeerIntn4, AdultIntn3, PlayType1, PlayType2, FixedNat1, FixedNat4, FixedDes1, FixedDes4, LooseParts1, LooseParts2, Open field. Remove RelRound1 by L17; proposed omit EnvZone1, substitute approved Notes1, insert PeerIntn1 before PeerIntn4 and AdultIntn1 before AdultIntn3 if their approved global rules require them. **Held** for those decisions and Gender1.
2. **Standard Long Form / standard**, B25,C26–C62: DateTime1, Observer1, EnvZone1, RelRound1, PlaySummary1, Age1, Gender1, PeerIntn1, PeerIntn2, PeerIntn3, PeerIntn4, AdultIntn1, AdultIntn3, AdultIntn4, PlayType1, PlaySubtype1, PlayType2, PlaySubtype2, CARS2, Risk1, Risk4, PlayComm1, PlayComm2, FixedNat1, FixedNat4, FixedDes1, FixedDes4, LooseParts3, LooseParts4, LooseParts5, LooseParts6, Wildlife1, Wildlife2, Wildlife5, Shade1, Topography1, Open field. Same round/zone/notes actions; replace subtype shorthand only with Janet-approved ordered blocks. Include any additional ancestors demanded by approved rules. **Held**, especially subtype and Wildlife decisions.
3. **Climate Conditions / inventory**, B77,C77–C79: Climate1, Climate2, Climate3. No carry-forward-to-events behaviour.
4. **Loose Parts Inventory (Collapsed) / inventory**, B81,C81–C84: LP_Inventory3, LP_Inventory4, LP_Inventory5, LP_Inventory6. Approve whether text details are conditional on their preceding binary.
5. **Loose Parts Inventory (Expanded) / inventory**, B86,C86–C99: LP_Inventory7 through LP_Inventory20 in numeric order. **Held** for actual checklist options; do not invent quantity-to-boolean predicates.
6. **Climate Conditions & Loose Parts Inventory (Collapsed) / inventory**, B101/C101: sequence 3 followed by sequence 4, flattened to UUID items, not nested templates.
7. **Climate Conditions & Loose Parts Inventory (Expanded) / inventory**, B103/C103: sequence 3 followed by sequence 5, flattened. **Held** with sequence 5.

Every recipe must pass final closure, order and column checks before appearing as a seed row. Do not advertise a held template with variables silently removed. The two old whole-definition template seeds are not the new seed recipes; discard/replace their data under the allowed pre-launch policy, without migrating their codes into a second API identity scheme. Production completion of DB-24 requires all seven approved recipes, while the earlier library read can ship with approved variables.

## Verification planned (not run)

SQL suites cover scope/lineage/unique keys, role inheritance, observer and foreign-tenant denial, direct-DML denial, private-function privilege/default-grant coverage, incomplete graph and option/type failures, template order/closure/collisions and delete restrictions. Exercise real two-connection races for parent-delete vs child-create, option-edit vs template-save, cycle vs cycle, Universal update vs org save and role revocation while waiting. Only one same-revision save may commit.

Seed checks compare exact approved IDs/order/options/columns, prove no excluded round variables/references, validate every template expansion using canonical schema 3 and verify rerunning the initial seed/check produces no content/revision change. Test schema transition with frozen forms and unknown-key preflight; assert observation bytes/IDs/bindings unchanged. Run only on disposable/local databases during implementation, never hosted from automated tests. No tests or migrations were written as part of this planning task.
