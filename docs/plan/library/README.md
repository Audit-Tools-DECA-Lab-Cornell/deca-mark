# Variable library and form templates: feature brief

Written 2026-11-12. This is the entry point for every plan of this feature. It says what the feature is for, how it will be used, what is fixed, what is open and what to leave alone. It designs no screen, table or endpoint.

| Document | Authority |
| --- | --- |
| This brief | Purpose, usage profile, fixed and open decisions, scope, future direction |
| [Web UI plan](../../../web/LIBRARY-UI.md) | Screens, flows, wording, decisions L1 to L17, what the web needs from the API |
| [Web tasks](../../../web/PLAN.md) | WEB-61 to WEB-72 and their status (WEB-71 is dropped) |
| [Backend planning prompt](backend-prompt.md) | The handoff that asks for the database, API and contract plans |
| Database, API and contract plans | [Database](../../../supabase/LIBRARY.md), [API](../../../backend/LIBRARY.md), [wire contract](contract.md): proposed implementation, with owner/Janet decisions and owning tasks |

## 1. Why the frontend was planned first

The web plan was written before any backend plan, on purpose. The backend plan is derived from how managers will use the feature, so effort goes where the interface needs it. Read the web plan as a direction, not a fence: it says where the feature is going, and the backend may choose any design that serves it and leaves the listed future directions open.

## 2. What the feature does

Managers build observation forms from reusable variables instead of retyping questions.

- **Variables** live in four libraries: Universal (ours, read-only), Organization, Project and Site.
- **In the form editor** a manager ticks variables in a side panel and they are copied into the draft as ordinary questions.
- **Form templates** are ordered lists of Universal and Organization variables. A new form starts from one.

Version 1 is the variable library and then form templates. Type-ahead suggestions follow version 1.

## 3. How it will be used

These are planning estimates for the first year, not measurements.

| Quantity | Expected |
| --- | --- |
| Universal variables | about 110 now (Janet's workbook), under 300 |
| Organization variables | 0 to 20 per organization |
| Project variables | 0 to 50 per project |
| Site variables | 0 to 20 per site, 1 to 10 sites per project |
| Templates | about 7 Universal, 0 to 20 per organization |
| Organizations | tens |
| People who change a library | 1 to 5 managers per organization |
| Library writes | a few per week per organization |
| Library reads | once per Library page visit and once per form-editing session |

What follows from that:

1. **The data is small.** Everything one project can see fits in one response of a few hundred items. The web loads it once and filters, searches and groups in the browser.
2. **Reads matter more than writes.** The one read that must be quick and complete is "every variable this project can see, with full settings". The picker and the Library page both use it.
3. **The picker writes nothing.** Adding variables to a form happens in the browser. The draft is then saved through the existing form-draft endpoint. No endpoint is needed for "add variable to form".
4. **Writes are rare and whole.** A save sends the whole variable or the whole template. Two people editing the same variable at once is unlikely; a stale save needs a clear refusal, not a merge.
5. **The parts that must be exact** are identity (what a tag or a template reference points at), permissions by level, and the rules that keep a template valid. Usage counts are information only and may be computed on read.

## 4. What is fixed

Decisions L1 to L16 in the [web UI plan](../../../web/LIBRARY-UI.md#2-decisions) were made with the owner. The ones that shape storage and the API:

- Four levels. Universal is seeded by the developer and cannot be changed in the app.
- A form holds copies. Each copy carries a source tag naming its variable. Library edits never reach a form.
- Templates hold references, never copies, and only to Universal and Organization variables. A template always reads the variable as it is now.
- A variable listed in a template, or needed by another variable's display rule, cannot be deleted.
- A display rule may point only at a variable on the same level or a higher one.
- A form, and a template, never holds two variables that write the same data column.
- Permissions follow existing roles. No new role.
- Starting a form from a template produces an independent draft.

## 5. What is open

The backend plan decides these. The web plan states the outcome it needs and has no opinion on the mechanism.

| Topic | What the web needs | Open |
| --- | --- | --- |
| Storage shape | Variables at four levels with one identity scheme | One table with a level, or several; how Site and Project ownership is expressed |
| Source tag | A question records its variable, level and code, and whether it was edited in the form | Field names and shape in the form definition; whether it also records which revision was copied |
| Usage | "Used in N forms" with links, per variable | Derived from source tags on read, or tracked |
| Template references | Ordered list, always current | Join rows or an array |
| Stale saves | A refusal the web can explain | The same `If-Match` pattern as form drafts, or something lighter |
| Starting a form from a template | A new draft with tagged copies | The web composes the definition and calls the existing create-form endpoint, or the server expands the template |
| Seeding Universal | Janet's workbook as rows, including her templates | Format of the seed and how the developer updates it later |
| Existing `form_templates` table and `GET /v1/form-templates` | Replaced by reference-based templates | Reuse, reshape or drop (pre-launch reset is allowed) |

## 6. What not to build

Nothing below appears in the version 1 interface. Each item says whether it is postponed or excluded, because the two need different treatment: keep a postponed item possible, and do not shape anything around an excluded one.

**Excluded from the feature.** Do not design for these.

- **Version history** of variables or templates, and drafts or publishing for them. A variable is whatever it was last saved as.
- **Live links from a form to the library.** A form holds copies (L3), so a library edit never changes a form, draft or published. This exclusion is about forms only. Form templates are the opposite and are part of version 1: a template holds references (L12) and always reads each variable as it is now (L13).
- **Real-time co-editing** or merging of concurrent edits. A stale save is refused.
- **Sharing between organizations**, other than Universal.

**Engineering techniques, not features.** Add one only when a measurement shows the plain approach fails.

- **Caches, queues, search indexes, vector storage, stored counters.** A project's whole library is a few hundred small rows, and plain PostgreSQL reads are enough.
- **Field-level patches.** A save sends the whole variable or template.

**Postponed.** Not in version 1. Keep them possible; build none of them.

- **Server-side search, filtering, sorting and paging** of variables. The browser does all of it in version 1. Revisit when type-ahead (WEB-72) is measured, or if a library grows far past a few hundred variables.
- **Moving a variable** between levels, or a Site variable between sites.
- **A group management screen.** Until then a group is a text value on a variable.

## 7. Where it may go later

Also postponed, and likelier than the items above. Keep these possible; build none of them.

1. **Spreadsheet import** in Janet's column layout: many variables created in one reviewed action.
2. **A curator for Universal**: Universal variables edited in the app by one named role, so Universal should be data, not code.
3. **Type-ahead with ranking** by a manager's recent and most used variables (WEB-72).
4. **"Update this draft"** after a library edit: the manager chooses to pull a changed variable into a draft. It needs to know what was copied and when.
5. **Saving a form as a template**, and templates at more levels.
6. **Archive and restore** in place of permanent delete.

## 8. Facts about the system today

Rechecked in the newly pushed master source snapshot on 2026-11-12; evidence and qualifications for every item are in [the API plan](../../../backend/LIBRARY.md#verified-current-system). These are source facts, not hosted verification.

- **Forms** belong to a project: `fieldmaps.forms` and `fieldmaps.form_versions` (`definition jsonb`, states draft, published, retired). Drafts save with a strong ETag and `If-Match` (`backend/src/fieldmaps_api/form_preconditions.py`).
- **Form definitions** follow `contracts/form-definition.schema.json` under CON-07's schema-version rule. A question already carries a free-text `source` for provenance. The current source schema version is 2 (CON-07’s dated version-1 evidence is historical); accepting the typed source tag requires the planned schema-3 consumer update, even though collection behaviour does not change.
- **Templates today** are whole definitions in `fieldmaps.form_templates` (code, title, summary, definition, schema_version), global and read-only, served to callers who manage an organization or project by `GET /v1/form-templates` (DB-20, BE-25). The API is manager-only; its table SELECT policy is broader, permitting signed-in API callers.
- **Rounds** are `standard`, `reliability` and `inventory`. A site package binds one form version for Standard and Reliability together, and one for Inventory. The collector stamps `Rel_Round` and `First_Round` from the round; they are not questions (`mobile/src/domain/rounds.ts`).
- **Pre-launch policy:** no real users, so incompatible data may be reset and no compatibility path is kept, until QA-08 passes (`docs/plan/README.md`).

## 9. Reliability rounds need nothing new

Decided 2026-11-12 (L17). An automatic Reliability twin form was considered and dropped: the system already runs Reliability rounds on the Standard form and records `Rel_Round` itself, so the two data sheets match with no second form. Site packages, collection behaviour and observation upload do not change for this feature. The canonical source-tag/schema-version acceptance change is tracked by MOB-53; it adds no collector library feature. `RelRound1` and `FirstRound1` are not seeded as Universal variables, and templates that list them in the workbook are seeded without them.
