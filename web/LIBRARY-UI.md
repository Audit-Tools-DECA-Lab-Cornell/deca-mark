# Web UI plan: variable library and form templates

[Feature brief](../docs/plan/library/README.md) (read first: purpose, usage profile, what is fixed and open) · [Web plan](PLAN.md) (tasks WEB-61 to WEB-72; WEB-71 is dropped) · [Product rules](../PRODUCT.md) · [Design](../DESIGN.md) · Source workbook: `docs/variables/Behavior Mapping Variable Library_ Additional.xlsx`

Agreed with the owner on 2026-11-12. This file holds the frontend design only: what managers see, where it lives and how it behaves. It names what the web needs from the API, the database and the contracts, but defines no `BE-*`, `DB-*` or `CON-*` task; those plans are still to be written. Status lives in [PLAN.md](PLAN.md).

## 1. Outcome

A manager building a form stops retyping questions. They open a panel beside the form, tick the variables they want, and the questions arrive complete: wording, answer options, data column and display rules.

**Version 1 has two parts, in this order:**

1. **Variable library.** Four levels of reusable variables, a Library tab to manage them, and a picker in the form editor.
2. **Form templates.** Named lists of library variables that a new form starts from. Janet's standard forms ship as universal templates.

The feature is not done until both parts work. Type-ahead suggestions come after both (WEB-72).

**Words.** A *variable* is an item in a library. A *question* is what it becomes inside a form. A *form template* is a list of variables. The interface uses these three words and no others for them.

## 2. Decisions

| # | Decision | Consequence for the interface |
| --- | --- | --- |
| L1 | Four levels: Universal, Organization, Project, Site | Every variable shows one level badge. Filters use the same four names everywhere. |
| L2 | Universal is seeded by the developer and read-only in the app. No curator role yet | Universal variables show a lock and no edit controls. |
| L3 | Adding a variable to a form copies it and tags the copy with its source | The question is fully editable in the form. Later library edits never change a form. |
| L4 | In a project's form editor the picker shows every level, with the project's sites grouped by site | No "choose a site first" step. |
| L5 | Picking a variable whose display rule needs another variable adds that one too, and says so before confirming | The manager cannot build a rule that points at nothing. |
| L6 | Variables enter a library two ways: "Save to library" on a form question, and "New variable" on the Library page | No copy-between-levels command and no spreadsheet import in version 1. |
| L7 | Library is a top-level tab: the ninth project tab and the fourth organization tab | One rule to learn: the Library tab changes the library; the form editor changes only that form. |
| L8 | The picker is a side panel in the form editor with multi-select | "Add a question" stays as it is for new questions. |
| L9 | A variable that writes to a data column the form already uses is blocked, with the reason | Age2 cannot join a form that holds Age1 (both write `Child_AgeRange`). |
| L10 | Permissions follow existing roles | Organization level: owners and admins. Project and site levels: that project's managers, and owners and admins. Everyone who can open Forms can read every level. |
| L11 | The Library page shows where each variable is used. Delete is permanent and leaves forms untouched | Edit and delete dialogs say that existing forms keep their copy. |
| L12 | Form templates hold references to variables, not copies. Templates exist at Universal and Organization level only | A template may list Universal and Organization variables only. |
| L13 | Editing a variable changes what a template produces next time. Deleting a variable that a template lists is blocked | The edit dialog names the templates affected. The delete dialog lists them and offers no delete button. |
| L14 | Each variable has a Group (Janet's names, or one the manager types) and a Form section (one of the seven the editor already has) | Group organizes the library. Form section decides where the question lands in a form. |
| L15 | A template cannot contain a question that is not a library variable | The template editor has no "Add a question"; it links to "New variable" instead. |
| L16 | Starting a form from a template copies the variables as they are at that moment | The new draft is independent of the template and the library. |

| L17 | No separate Reliability form (decided 2026-11-12, replacing an earlier choice of an automatic twin) | Reliability rounds keep using the Standard form, as they do today. See 6.4. |

**Out of version 1:** spreadsheet import, copy between levels, archive and restore, a curator screen for Universal, saving an existing form as a template, updating drafts after a library edit, server-side or learned search.

## 3. Where it lives

```
/o/[org]
├── Projects · Members · Library · Settings            (organization tabs; Library is new)
│   └── /o/[org]/library                                Variables: Universal + Organization
│       ├── /library/variables/new
│       ├── /library/variables/[variable]
│       ├── /library/templates                          Form templates: Universal + Organization
│       ├── /library/templates/new
│       └── /library/templates/[template]
└── /o/[org]/p/[project]
    ├── Overview · Data · Sites · Forms · Library · Team · QGIS · Reports · Settings
    ├── /library                                        Variables: all four levels for this project
    │   ├── /library/variables/new
    │   ├── /library/variables/[variable]
    │   └── /library/templates                          read-only list, "Start a form from this"
    ├── /forms/versions/[version]                       draft editor gains "Add from library" and "Save to library"
    └── /sites/[site]                                   one link: "Site variables (n)" to /library?level=site-<id>
```

| Page | URL | Who can open | Who can change |
| --- | --- | --- | --- |
| Organization library | `/o/[org]/library` | owners, admins | owners, admins (Organization level only) |
| Organization form templates | `/o/[org]/library/templates` | owners, admins | owners, admins (Organization level only) |
| Project library | `/o/[org]/p/[project]/library` | everyone who sees Forms | project managers, owners, admins (Project and Site levels) |
| Project form templates | `/o/[org]/p/[project]/library/templates` | everyone who sees Forms | nobody here; it links to the organization page for those who may edit |

Navigation rules:

- Library sits directly after Forms in the project tabs. The tab bar must still fit at 768 px; if it does not, the bar scrolls sideways inside its own frame, as the Data table already does.
- Filters live in the URL: `?level=universal|organization|project|site-<id>&group=<slug>&q=<text>`. A filtered view is a shareable link.
- `/o/:org/library` currently redirects to the organization (`next.config.ts`). Remove that redirect. D21 already reserves the `library` slug.
- ⌘K gains "Library" for the project and the organization. The `g l` shortcut returns.
- An organization owner editing a variable from inside a project stays in the project: Organization-level rows on the project page open the same detail page with editing enabled for owners and admins.

## 4. Variable library

### 4.1 What a variable holds

| Field | Janet's column | Notes |
| --- | --- | --- |
| Code | Variable Code (`Age1`) | Unique within its own library (one organization's, one project's or one site's). A project may have its own `Age1` beside Universal's; the level badge tells them apart, and L9 stops both entering one form. Not editable after first save. Tags, display rules and templates point at the variable itself, never at its code. |
| Name | Variable Name | The label observers read. |
| Instructions | Instructions | Help text under the label. |
| Data column | Variable Column Name (`Child_AgeRange`) | Alternatives may share one. This is what L9 checks. |
| Answer format and its settings | Answer format, Answer Options | The same five formats and editors the form editor has. |
| Display rule | Notes or Visibility Logic | May point only at a variable on the same level or a higher one, so the parent is always available wherever the child is. |
| Group | Variable Group | Pick an existing group or type a new one. |
| Form section | none | Child, Social, Play, Setting, Climate, Inventory or Record. |
| Level | none | Fixed at creation. A Site variable also names its site. |

### 4.2 Library page (project and organization)

One page, two views switched by ink tabs: **Variables** and **Form templates**.

Variables view:

- **Header:** "Library", one sentence on what it is, and one primary button "New variable" (hidden for people who cannot add at any level shown).
- **Filters:** level chips with counts (All, Universal, Organization, Project, then one chip per site), a group select, a format select and a search box. Search matches code, name, data column and option labels.
- **Table:** Code, Variable, Group, Format, Level, Used in. Universal rows carry a lock. A row opens its detail page.
- **Empty states, one per level:**
  - Project: "This project has no variables of its own. Save one from a form question, or create one here."
  - Site: "No variables belong to this site."
  - Organization: the same pattern, naming who can add them.
- **Loading and failure:** the page's existing skeleton and "We could not load the library" with Try again. Nothing is shown from memory.

### 4.3 Variable page

Three columns on desktop, stacked on narrow screens:

1. **Settings.** The form editor's own pieces reused: wording, answer format, options, number bounds, date and time, data column, display rule. Plus Group, Form section and Level.
2. **Preview.** The collector preview showing this one question.
3. **Usage.** "Used in 3 forms" with links to those versions, and "Listed in 2 form templates" with links.

Behaviour:

- Saving is explicit: Save and Discard, with the leave-page dialog the editors already use.
- "New variable" asks for the level first (preselected from the filter the manager came from), then opens the same page.
- **Edit note:** "Forms that already use this variable keep their copy. Only future use changes." When templates list it: "2 form templates will use the new version: Standard Short Form, Standard Long Form."
- **Delete:** a confirm dialog with the same sentence about forms. When a template lists the variable, the dialog instead says "Remove it from these templates first" with the list, and has no delete button. The same applies when another variable's display rule needs it: "FixedNat4's display rule needs this variable. Change that rule first."
- **A save that would break something else is refused, naming what:** removing an answer that another variable's display rule uses, or a change that leaves a template with two variables on one data column. The web shows the variables or templates named in the refusal.
- **A stale save is refused:** "This variable changed since you opened it. Reload to see the latest." The manager's edits stay on screen. Nothing is merged.
- **Read-only** (Universal, or no permission): the same page with facts instead of inputs and one line: "Universal variables are the same for every organization and cannot be changed here." No disabled buttons.

## 5. Form editor

Today the draft editor has three columns: Questions, Question settings, Preview. Under the question list is one button, "Add a question".

### 5.1 Add from library

A second button, "Add from library", sits beside "Add a question". It opens a Library panel that takes the place of the settings and preview columns, so the question list stays visible. Below 1024 px the panel is a full-height sheet.

```
┌ Questions ───────────┐┌ Library ─────────────────────────────── Close ┐
│ 1 Age range          ││ [Search variables.......................]     │
│ 2 Play type 1        ││ All · Universal · Organization · Project · Sites▾ │
│ 3 Play summary       ││ ▾ Climate Conditions (3)                      │
│                      ││   ☑ Climate1  Current weather   Many · Universal │
│ [+ Add a question]   ││   ☑ Climate2  Current wind      One  · Universal │
│ [+ Add from library] ││   ☐ Climate3  Shade conditions  One  · Universal │
│                      ││ ▾ Target Child Details (4)                    │
│                      ││   ✓ Age1      In this form                    │
│                      ││   – Age2      Same data column as Age1        │
│                      ││ ▸ Natural Features (6)                        │
│                      ││ Also adds FixedNat1, needed by FixedNat4      │
│                      ││                     [Cancel] [Add 3 questions]│
└──────────────────────┘└───────────────────────────────────────────────┘
```

Rows and their states:

| State | Shown as | Can tick |
| --- | --- | --- |
| Available | checkbox, code, name, format, level badge | yes |
| In this form | check mark and "In this form" | no |
| Blocked by data column | "Uses the same data column as Age1 in this form. Remove Age1 first." | no |
| Needs a parent | under the row: "Also adds FixedNat1, needed for its display rule" | yes |
| Parent already in the form | nothing extra; the rule connects to the existing question | yes |

- A row expands to show its options, data column and display rule in words, so the manager can check before adding.
- Ticking two variables that share a data column blocks the second with the same sentence, naming the first.
- The footer counts what will be added, parents included: "Add 3 questions".
- After adding, the panel closes, each question lands at the end of its Form section, the new rows are marked like any unsaved change, and the first one is selected. The draft is still unsaved; the existing Save applies.
- If a parent already in the form was edited so the rule's answer no longer exists, the question is added and the existing problem list reports it. The publish gate already blocks on problems.

### 5.2 Source tag

A question that came from a library shows one line at the top of Question settings: "From the Universal library · Age1", linking to the variable. Once the manager edits the question, the line reads "From the Universal library · Age1 · edited in this form". The tag is information only; nothing is locked. The editor sets the "edited" mark itself the first time the manager changes a tagged question; the server does not compare a question with its variable. If the variable was later deleted, the line reads "From the Project library · Age1 · no longer in the library" without a link.

### 5.3 Save to library

Question settings gains "Save to library" for managers. It opens a dialog:

1. **Level:** Project (default), a site of this project, or Organization (owners and admins only).
2. **Group:** pick or type.
3. **Code:** prefilled from the question; an inline error if the code is taken.
4. **If its display rule points at a question that is not in a library:** a ticked box, "Also save Play type 1, which this question's display rule needs". Unticking saves the variable without the rule and says so.

On success the question gains its source tag and a toast links to the variable. The form is otherwise unchanged.

## 6. Form templates

### 6.1 Templates view

The second ink tab on the Library page. A list: Name, Round (Behaviour, or Inventory and Conditions), Variables (count), Level.

- Universal holds Janet's standard forms: Standard Short Form, Standard Long Form, Climate Conditions, Loose Parts Inventory (Collapsed and Expanded) and the two combined inventory forms.
- On the project page the list is read-only and each row has "Start a form from this", which opens the New form dialog with the template chosen.
- On the organization page owners and admins get "New template".

### 6.2 Template editor (organization)

Two columns: the ordered list of variables on the left, the same Library panel as 5.1 on the right, limited to Universal and Organization.

- Add with the panel; reorder with the move controls the question list already has; remove from a row.
- The same parent and data-column rules apply, from the same code as the picker.
- No "Add a question". One line explains: "Templates hold library variables only. To include a new question, create it in the organization library first.", with a link to New variable.
- A Preview button shows the template as observers would see it, built from the variables as they are now.
- A template whose variable was edited shows nothing special: it always reads the current version.

### 6.3 New form dialog

Today it offers Behaviour mapping, Zone inventory and Custom, compiled into the web. It becomes:

- **Start from:** templates grouped by Round, Universal first and then the organization's, each with its variable count and description; and "Blank".
- Creating the form copies every variable into a new draft with source tags, then opens the draft editor.
- The bundled `contracts/forms/janet-*.json` starting points leave the dialog. WEB-56 already moves templates to the API (`GET /v1/form-templates`, whole definitions in `fieldmaps.form_templates`); the backend plan decides whether that table and route are reshaped or replaced, and WEB-70 builds on the result.
- Either the web builds the draft from the template with the picker's own rules and calls the existing create-form endpoint, or the server expands the template. The dialog is the same both ways.

### 6.4 Reliability rounds (L17)

Nothing is built. A site package already binds one form version for Standard and Reliability rounds together, and the collector records `Rel_Round` from the round type instead of asking it (`mobile/src/domain/rounds.ts`). The two data sheets therefore always have the same columns, which is what Janet's workbook asks for.

Two consequences for the library:

- Universal does not include `RelRound1` or `FirstRound1` as pickable variables, because the round records both. Seeding must leave them out, and Janet's templates that list `RelRound1` are seeded without it.
- A manager who wants a different form for Reliability rounds cannot have one. That would need a third form binding on site packages and a collector change; it is not planned.

## 7. Flows

**Build a form from the library (the main flow).**
1. Forms, New form, choose Standard Short Form, name it. A draft opens with 18 questions.
2. Add from library, search "wildlife", tick Wildlife2. The panel says it also adds Wildlife1. Add 2 questions.
3. Add a question for one custom item. Save the draft. Publish as today.

**Keep a question for next time.**
1. In a draft, select the custom question. Save to library, level Project, group "Site specifics". Save.
2. In any other form of the project, Add from library shows it under Project.

**Set up an organization's standard.**
1. Organization, Library, New variable, "Org account ID", level Organization.
2. Form templates, New template, add Universal variables and the new one, save.
3. In every project, New form now lists that template.

**Change a variable.**
1. Library, open the variable, edit the options, Save. The note says which forms keep their copy and which templates will use the new version.

## 8. Frontend structure

| Area | Location | Notes |
| --- | --- | --- |
| Pure rules | `src/features/library/pick.ts` | Given a form's questions and a selection: which rows are in the form, blocked or need parents, and the questions to insert. Shared by the picker and the template editor. Unit tested without a browser. |
| Model and wording | `src/features/library/model.ts` | Levels, badges, filter parsing, the sentences in this file. |
| Reads | `src/features/library/read.ts` | Server-only, request-cached, one call for everything a project can see. |
| Writes | `src/features/library/actions.ts` | Server Actions: zod input, role re-check, one mutation, `revalidatePath`. |
| Screens | `LibraryScreen`, `VariableScreen`, `LibraryPanel`, `SaveToLibraryDialog`, `TemplatesScreen`, `TemplateEditorScreen` | Built from Contour components already in the repo. No new tokens expected. |
| Reuse from forms | `QuestionSettings` parts, `OptionsEditor`, `ConditionEditor`, `CollectorPreview`, `QuestionList` | A variable is edited as a question with three extra fields. |

**Loading and search.** A project sees a few hundred variables at most. The page and the panel load the whole list once and filter in the browser, so search answers on each keystroke and keeps working on a slow connection. The panel loads on first open, not with the editor.

**What the web asks of the API.** These are needs, not a design. Usage numbers, what is fixed and what is open are in the [feature brief](../docs/plan/library/README.md).

| Screen or action | Needs | How often |
| --- | --- | --- |
| Library page and the picker panel | Every variable the project (or the organization) can see, in one response: full settings, level, site, group, and a count of forms using it. No paging, search or filter parameters | Each Library visit; once per editing session |
| Variable page | One variable, the forms that use it (name and link target), the templates that list it, the variables whose display rules need it, and whether the caller may change it | Occasionally |
| Create a variable | One variable, or two in one all-or-nothing action when "Save to library" brings a parent | A few per week |
| Save a variable | The whole variable. Refused when stale, or when it would break a display rule or a template, with the affected items named | A few per week |
| Delete a variable | Refused with the list when a template lists it or another variable's rule needs it | Rare |
| Templates view and New form dialog | Every template the caller can see: name, description, round, level, variable count | Each visit; each new form |
| Template page and editor | One template as an ordered list of variable references (the variables come from the library read) | Occasionally |
| Save or delete a template | The whole template: name, description, round, ordered references. Refused when it lists a Project or Site variable, lacks a needed parent, or has two variables on one data column | Rare |
| Add variables to a form | Nothing new. The browser inserts the questions and the existing draft save stores them, tags included | Every editing session |
| Start a form from a template | A draft whose questions are tagged copies of the template's variables as they are now | Each new form |

Rules the server must hold, because the browser alone cannot be trusted with them:

1. Who may read and change each level (L10).
2. A display rule points only at a variable on the same or a higher level, and at an answer that exists.
3. Templates list only Universal and Organization variables, include every needed parent and never repeat a data column.
4. Deletes and saves that would break rule 2 or 3 are refused with the items named.
5. Form definitions accept the source tag (level, variable, code, edited mark). This changes `contracts/form-definition.schema.json`; the collector ignores the tag.

Also needed once: Universal variables and templates seeded from Janet's workbook, after its duplicate `EnvZone3` code and blank `Gender1` column are resolved (`docs/QGIS-Field-Collection-Feasibility.md` lists them).

## 9. After version 1

**Type-ahead in "Add a question" (WEB-72).** As the manager types the wording, matching variables appear under the field; choosing one adds it by the same rules as the panel. Start with a typo-tolerant search over the list the browser already holds, ranked by this manager's recent picks. Move search to the server, or to learned ranking, only if measurements on real libraries show the browser search is too slow or misses too much. The suggestion list must never delay typing; on a failed or slow load it stays hidden.

**Later candidates:** spreadsheet import in Janet's column layout, a curator screen for Universal, saving a form as a template, "update this draft" after a library edit.

## 10. Verification

- Unit: `pick.ts` for parents (one and two levels deep), data-column blocks (against the form and inside one selection), already-in-form, an edited parent, and insert position by Form section.
- Browser, at 1440, 1024, 768 and 390, Day and Dusk, with axe: the Library page for each role, the panel in the draft editor, Save to library, the template editor, the New form dialog.
- Honesty scan: no library page shows a control that does nothing, and read-only levels show no disabled buttons.
- Keyboard: the panel is reachable, its checkboxes and group headers work with the keyboard, focus returns to "Add from library" on close.
