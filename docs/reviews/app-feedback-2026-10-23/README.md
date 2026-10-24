# October 23 app feedback: implementation todo and schema impact

Assessed October 24, 2026 against the current checkout. Sources: the user's 12 numbered requests, all 9 slides and 25 red annotation text boxes in `App review notes 102326.pptx`, and the separately attached form-editor screenshot. The slide screenshots were inspected alongside the annotation text.

**Result: 28 actionable requirements.** The original points 5 and 8 overlap, while several other points contain multiple changes. Additional in-scope requirements include decimal numbers, invitation account handling and bulk entry, report filters, date/time questions, automatic metadata, and form-creation wording. The user deferred both database-backed form templates (R27) and the individual-variable library (R29). Those references remain reserved; other references stay unchanged.

The [approved implementation plan](../../plan/app-feedback-2026-10-23/README.md) and [saved red-note transcription](source-notes.md) accompany this intake. The approved decisions below supersede the initial assessment's open choices; application implementation has not started.

This is a feedback intake and ordered implementation checklist, not a second task-status ledger. No application change or migration was made during this assessment. Scheduled task statuses remain in the owning component `PLAN.md` files. The existing template work appears only in the future-feature note below, not as a feedback implementation task.

## How to read the schema assessment

| Classification | Meaning |
| --- | --- |
| No database schema change | Existing tables, columns and constraints can hold the requested result. Saving a changed form or creating an invitation still writes ordinary data. |
| Shared contract change | The JSON form definition, answer validation or capture behavior must change consistently across web, mobile and backend. This does **not** automatically require new database columns. |
| Database work | New persistent library/template entities, or a changed SQL function/policy, require database work. A function-only migration is distinguished from a table/column change. |

The current database stores form definitions in `fieldmaps.form_versions.definition` and answers in `fieldmaps.observations.answers`, both `jsonb`. Adding a question is not adding a SQL column. Observation metadata already has `created_by`, `observer_code` and `observed_at` columns. These facts explain why many requests can use the current database schema.

## 1. Form editing and identifiers

| Ref | Todo / acceptance requirement | Source | Database schema impact | Implementation scope |
| --- | --- | --- | --- | --- |
| R01 | Drag questions into a different order. Save/reload and the observer preview must retain the order. Provide keyboard controls and an explanation when a move would place a dependent question before its parent. | User 1; slide 1 | **No.** Order is the existing `questions` array. | Web question list/editor. Existing dependency validation must remain effective. |
| R02 | Replace **Question label** with **Question Text** in settings and the add-question dialog, including matching validation/review wording. | User 2; slides 1, 5 | **No.** Display wording only. | Web. The slide suggests “Question Text or Variable Name”; the user's explicit wording takes precedence. |
| R03 | Keep automatic Question ID generation, but let the manager edit the ID in a draft. Renaming must update all conditional references and dynamic-option parent references, preserve selection, reject duplicates and survive save/reload. | User 3; slide 1 | **No table/column change.** Existing definition fields support it. | Web rename operation and definition validation. A rename in a new draft must not rewrite previously published definitions or historical answers. Compare versions explicitly because a renamed ID can otherwise appear to be an unrelated new question. |
| R04 | Replace the Question ID helper with **“Question ID will be the Column title for this variable in datasets”**, and make exports honor the promised relationship. | User 3; slide 1 | **No table/column change.** Existing `id` and `exportColumn` fields can represent it. | Approved: one answer column per Question ID in newly authored versions, including conditional subtypes. Preserve historical mappings, collision/formula safeguards and visibility of any resulting column adjustment. Update export behavior/codebook and QGIS-facing acceptance together. |
| R05 | Replace **Guidance (optional)** with **Instructions to Observers (optional)**. Existing instructions continue to appear in the observer preview/app. | User 4; slide 1 | **No.** Uses existing `hint`. | Web wording. No need to rename the stored property. |

## 2. Answer wording and conditional questions

| Ref | Todo / acceptance requirement | Source | Database schema impact | Implementation scope |
| --- | --- | --- | --- | --- |
| R06 | Use descriptive answer-format labels: **Allow single response only**, **Allow multiple responses**, **Open text field response**, and **Number response**. Keep wording consistent in add/edit/review surfaces. | User 6; slide 2 | **No.** Existing `one`, `many`, `text`, `number` values remain valid. | Web labels. The final number label is a wording recommendation; the slide says “Numbered response.” |
| R07 | Change the required control text to **Response required when question is visible**. Requiredness applies only while its visibility rule matches. | User 6; slide 2 | **No.** Existing `required` plus visibility behavior. | Web wording; retain current engine behavior. |
| R08 | Add a clear visibility editor to every custom/new question: always visible, another question answered, specified choices selected, and combinations of conditions on multiple earlier questions. Show a readable rule summary and let the manager edit/remove rules. | User 5, 8; slides 2, 9 | **No.** Existing `dependsOn` supports `answered`, `equals`, `notEquals`, `includes`, `all`, `any`. | Web authoring UI using the existing contract and engines. Keep earlier-question ordering, valid option references, cycle checks and hidden-answer pruning. |
| R09 | Make parent-dependent option lists discoverable and editable: show the controlling question, each triggering parent choice, and its follow-up options. Allow managers to inspect and change those sets in a draft rather than seeing only “options follow the earlier question.” | User 8; slides 2, 9 | **No.** Existing `dynamicFrom.question` and `sets` hold the structure. | Web settings/raw edits/review. Keep option codes and dependent conditions coherent when an option changes or is removed. Published versions remain immutable. |
| R10 | Expose optional **Minimum** and **Maximum** restrictions for number questions. Allow either bound, both, or neither. Reject minimum greater than maximum and enforce saved bounds in preview, collection and upload. | User 7; slide 4 | **No.** Existing `min` / `max` are already validated. | Web controls for currently supported whole numbers. The slide proposes 0–100 defaults; the user's explicit optional-bounds request takes precedence, so do not silently impose that range. |

## 3. Numeric behavior and form-editor explanations

| Ref | Todo / acceptance requirement | Source | Database schema impact | Implementation scope |
| --- | --- | --- | --- | --- |
| R11 | Offer **Whole number** or **Decimal number**, with appropriate optional bounds. Decimal input must remain a numeric value through offline storage, upload and export. | Slide 4 | **No table/column change required; shared contract change required.** Current definitions/bounds and answer validation assume integers. | Approved: any finite decimal, with no fractional-place limit or silent rounding. Whole number remains default; decimal bounds must be finite. Update contracts, web, mobile, backend and export/QGIS conversion; retain whole-number guarantees. |
| R12 | Every newly added question opens with **Allow single response only**, including after adding/canceling another question. A previous choice must not become the next default. | User 9; slide 5 | **No.** Initial UI state only. | `AddQuestionDialog` currently initializes and resets to `text`; change both paths. Separately, the current Blank form includes a text Notes starter; do not silently change its existing content under this request. |
| R13 | Change add-question dialog copy to **“Question will be added to this draft. Save the draft to keep it.”** | User 10; slide 5 | **No.** Wording only. | Web dialog. |
| R14 | Replace or remove the confusing answer-format explanation **“Open while the question is new. It cannot change once a version with it is published.”** Explain the actual edit restriction in ordinary language where it matters. | Slide 4; related slide 2 screenshot | **No.** Wording only. | Web settings. Explain the distinction between changing a draft and changing a previously published version. Existing format/option edit locks are product behavior, not a reason to imply that the whole editor is read-only. |
| R15 | Replace or remove **“Codes follow the labels until a version with this question is published.”** Managers should understand what option text they can change without needing to understand internal codes. | Slide 3 | **No.** Wording only. | Web options editor. Preserve the validation error in this location when an option is invalid. |

## 4. Invitations and role descriptions

| Ref | Todo / acceptance requirement | Source | Database schema impact | Implementation scope |
| --- | --- | --- | --- | --- |
| R16 | Default new invitations to **14 days**, both on first open and after reset; API clients omitting expiry must receive the same default. | User 11; slide 6 | **No.** Existing expiry timestamp and interval handling support 14 days. | Web dialog and backend request default; regenerate API contract/types as needed. Both currently use 7. |
| R17 | Use the same descriptions in the invitation dialog and join confirmation: Observer adds **“Cannot make changes. Cannot review data or reports.”** Viewer uses **“Can review observation data and read reports. Cannot make changes.”** Manager adds **“Can review and export data and reports.”** Retain the existing role responsibilities before the requested additions. | User 12; slides 6, 7 | **No**, for the requested description change. | Web Team descriptions and shared role vocabulary in `contracts/contour.json`; generate its derived files. This is not a request to revoke existing Viewer export access or Observer collection. “Review” means read here; do not imply an unimplemented approval workflow. |
| R18 | Make the account accepting an invitation explicit. If a manager opens an email invitation intended for a different account, offer a prominent account switch and retain the invitation through sign-in. Do not present the invitation's Viewer role as the current Manager's role or discard the credential after a misleading “already on this project” result. | Slide 6; slide 7 result | **No table/column change required.** A recipient/mismatch field added to invitation preview would change the API contract and may require a **SQL function migration**. | Web auth/join flow and possibly backend preview. Current account switching already exists in the header, but is insufficiently prominent; the current client can translate generic invalid-invitation errors into “already member.” Treat that as a source-supported explanation to reproduce, not proof that an account gained unauthorized permissions. |
| R19 | Accept multiple comma-separated email addresses for invitations. Validate and deduplicate them, create a separate email-bound invitation for each, and show success/failure per recipient so retries do not resend successful entries unintentionally. | Slide 6 | **No.** Existing one-recipient invitation rows and email outbox can be reused. | Web batch entry/orchestration can use the existing create endpoint with bounded work. A bulk endpoint is optional API work, not a schema requirement. No emails were sent during this assessment. |
| R20 | Remove the confusing **How many people can use it** question from email invitations. If shared join codes remain, make “Invite by email” versus “Create a shared join code” explicit and describe any use limit only in that mode. | Slide 6 | **No.** Existing `email` and `max_uses` support both modes. | Web invitation flow. The field already disappears after typing an address; the request is to make the distinction understandable before typing. Do not interpret it as permission to create unlimited invitation use. |

## 5. Join-page cleanup, reports and date/time answers

| Ref | Todo / acceptance requirement | Source | Database schema impact | Implementation scope |
| --- | --- | --- | --- | --- |
| R21 | Remove the unnecessary join-page promotional content, including the **Field operations** heading and **“Every observation…” / “Nothing is lost…”** lines. Keep attention on the invitation, account and action. | Slide 7 | **No.** Layout/copy only. | Invitation/join layout and `AuthHero`. The shared hero is also used on sign-in pages; scope the requested removal to invitation/join unless a wider copy change is chosen deliberately. |
| R22 | Resolve the unclear **Saved on this device / Uploaded** explanations on the invitation page. Prefer removing this irrelevant status explainer with the promotional panel; if retained elsewhere, explain local save versus confirmed upload clearly. | Slide 7 | **No.** Wording/layout only. | Web invitation panel. The annotation's placement indicates the status area; this is an interpretation, not an instruction to rename actual collection queue states globally. |
| R23 | Add **Date Range** with **All observation dates** and **Custom observation dates**. Custom mode reveals **From** and **To**, replacing First day / Last day. Switching to All clears the active date filter. | Slide 8 | **No.** Existing report from/to filters and observation timestamps support it. | Web reports and URL state. Preserve project timezone, inclusive end-date behavior and printed/exported scope. |
| R24 | Rename the Reports filter **Round** to **Round Type**. | Slide 8 | **No.** Label only. | Web reports. |
| R25 | Add a **Date/Time** answer format, with Date only, Time only, or Date and time, plus configurable display format. Default to manual entry and offer automatic observation capture time. | Slide 9 | **No table/column change required; shared contract change required.** String answers can be stored in existing JSON, but a real date/time kind and its validation do not exist. | Approved: automatic values freeze across offline restart and upload. The implementation plan specifies canonical date/time representations, project timezone, display formats and DST handling. Existing record-level `observed_at` alone does not fulfill arbitrary custom date/time questions. |

## 6. Automatic data and form creation

| Ref | Todo / acceptance requirement | Source | Database schema impact | Implementation scope |
| --- | --- | --- | --- | --- |
| R26 | Let managers identify which values DECA Mark records automatically, particularly Observer ID, instead of making observers retype them. Show their sources and include them predictably in datasets. | Slide 9 | **No new column needed for existing account ID, observer code and observation time.** A configurable field source/prefill rule requires a **shared contract change**. | Approved: stable authenticated account ID plus existing initials/code, with no new project-specific assignment system. Freeze attribution at capture; do not substitute the profile of the account syncing later. Update web authoring, capture, backend validation and exports together. |
| R28 | Rename **Blank** to **Custom**, using truthful wording about the manager's own custom questions. | Slide 9 | **No.** Wording only. | The requested Library description is deferred with R29; do not advertise that path until it exists. |
| R30 | Rename the new-form **Code** field to **Form Code** and explain its purpose with a concrete example: it identifies the form and appears in version names such as `play-study-v1`. Keep automatic generation editable and explain uniqueness within the project. | Slide 9 | **No.** Existing form code and validation. | Web new-form dialog and helper. |

## Future features: excluded from feedback implementation

Database-backed whole-form templates are already on the roadmap in [CON-07](../../plan/contracts.md#con-07-one-form-definition-format-and-its-schema-version-rule), [DB-20](../../../supabase/PLAN.md#db-20-seed-training-and-form-templates-in-the-current-form-format), [BE-25](../../../backend/PLAN.md#be-25-form-templates-come-from-the-database), and [WEB-56](../../../web/PLAN.md#web-56-forms-in-one-canonical-format-templates-from-the-api). The slide 9 request for additional ready-to-use combinations, including short and expanded children's play sets, belongs with that future feature and is not added to this feedback work. The reviewer will supply the research content when that feature is taken up. Forms must also support other populations and subjects.

Reviewer wording: **“Database-backed form templates are already planned for a future update, including support for additional ready-to-use form sets.”**

**R29 is also deferred at the user's direction.** It is a separate individual-variable library, not delivered by the existing whole-form template plan. Its original request is to search/select approved preset variables or create custom ones, importing parent/option dependencies without ID collisions. A curated catalog could avoid new tables; an editable shared library would need ownership/versioning and persistent storage design. Neither variant is part of this implementation. The existing template roadmap is unchanged.

## Source reconciliation and decisions that affect implementation

| Topic | Working interpretation / decision needed |
| --- | --- |
| User request versus attached document | The user's direct requests control. Red annotations are feedback evidence, not repository/tool instructions. Use “Question Text” and optional numeric bounds as explicitly requested. Do not impose the slide's 0–100 range. |
| Published forms | Edits happen in a draft. Nothing in the feedback authorizes changing already published versions in place or rewriting historical observation answers. R03/R09 must explain how the next version differs. |
| Question ID versus dataset column | Approved: Question ID controls one answer column per question in newly authored versions, including conditional subtypes. Historical mappings remain meaningful; reserved/formula protection remains visible. |
| Library and automated Observer ID | Library deferred. Automatic Observer ID uses existing authenticated account identity, with existing initials/code alongside it; no new study-ID assignment system. |
| Numeric/date formats and usage | Approved: any finite decimal without rounding/place limit; manual date/time default with optional frozen capture time. The saved plan fixes representation/display rules. At most three parallel workers; stop new dispatch at 20% reported remaining quota/context and retain durable checkpoints. |

## Current-code evidence

| Evidence | What it establishes |
| --- | --- |
| [Definition schema and validators](../../../web/src/lib/forms/definition.ts), [Python definition](../../../backend/src/fieldmaps_api/domain/form_definition.py), [contracts guide](../../../contracts/README.md) | Four current answer kinds; optional integer bounds; conditional and dynamic-option structures; ordering/reference validation. |
| [Question settings](../../../web/src/features/forms/QuestionSettings.tsx), [question list](../../../web/src/features/forms/QuestionList.tsx), [raw edits](../../../web/src/features/forms/raw.ts), [add-question dialog](../../../web/src/features/forms/AddQuestionDialog.tsx) | Read-only ID, no reorder action, no visibility-rule authoring controls, options editable only for newly added questions, number bounds not exposed, text as add-question default/reset. |
| [Export planning](../../../backend/src/fieldmaps_api/domain/observation_export_plan.py), [column naming](../../../backend/src/fieldmaps_api/domain/observation_export_columns.py), [collector record builder](../../../mobile/src/domain/build-observation.ts) | Explicit export columns take precedence over question IDs; dynamic sets can allocate columns; reserved/formula-sensitive headers are protected; observer code can come from a form question or account initials. |
| [Invitation dialog](../../../web/src/features/people/InviteDialog.tsx), [request schema](../../../backend/src/fieldmaps_api/invitation_schemas.py), [auth actions](../../../web/src/features/auth/actions.ts), [invitation card](../../../web/src/features/auth/InvitationCard.tsx), [account switch](../../../web/src/features/auth/AccountChip.tsx) | Seven-day defaults; one email per create request; header account switching already exists; the already-member fallback can obscure a wrong-account failure and the card currently forgets its token in that case. |
| [Reports](../../../web/src/features/reports/ReportsScreen.tsx), [current templates](../../../web/src/features/forms/templates.ts), [starter form](../../../web/src/features/forms/starter.ts), [database baseline](../../../supabase/migrations/20261012120000_current_baseline.sql), [DB-20](../../../supabase/PLAN.md#db-20-seed-training-and-form-templates-in-the-current-form-format) | Report filters already exist; templates are currently compiled from canonical files; Blank starts with a Notes question; JSON storage and observation metadata already exist; persistent templates are planned rather than implemented. |

## PowerPoint coverage check

| Slide | All red feedback mapped to |
| --- | --- |
| 1 | R01 reorder; R02 question wording; R03 editable generated ID; R04 ID helper/columns; R05 observer instructions. |
| 2 | R06 all four answer labels; R07 required explanation; R08/R09 custom questions and subquestions with clear display logic. |
| 3 | R15 unclear option-code helper below the option editor. |
| 4 | R10 bounds and proposed defaults; R11 decimal choice; R14 unclear answer-format helper. |
| 5 | R12 new-question default; R13 modal sentence. |
| 6 | R16 expiry; R17 roles; R18 wrong signed-in account; R19 multiple recipients; R20 invitation use-count confusion. |
| 7 | R17 same role descriptions on acceptance; R18 already-member result; R21 promotional copy removal; R22 unclear save/upload explanation. |
| 8 | R23 Date Range, both choices, From and To; R24 Round Type. |
| 9 | R08/R09 integrated conditions; R25 Date/Time and formats; R26 automatic Observer ID/metadata; R28 Custom; R30 Form Code. R27 prepared sets/general use and R29 individual-variable Library are deferred; both original requests remain documented under Future features above. |

The separate screenshot shows a **Published** version. Its read-only controls are expected on that surface; the deck also shows draft controls, so the missing draft authoring capabilities above are separate findings.

## Implementation order and acceptance

1. **Copy and defaults:** R02, R05–R07, R12–R17, R21–R24, R30; ship R28's rename with truthful text. Check the dialogs, Day/Dusk layouts, repeat-open defaults, and report filter URL/print behavior. Estimated implementation and focused verification: 4–8 developer hours.
2. **Existing-format form authoring:** R01, R03–R04, R08–R10. Use the approved Question ID/export-column rule. Verify reorder/rename/dependencies, save/reload, conditional preview, min/max, changed-parent pruning and exported headers with the real local API. Estimated implementation and verification: 2–4 developer days.
3. **Invitation flow:** R18–R20. Reproduce two-account acceptance locally; verify switching retains the invitation, recipient matching and existing roles are enforced, bulk results identify each recipient, and retries do not repeat successful work. Estimated implementation and verification: 1–2 developer days.
4. **Extended answer types and automatic fields:** R11, R25–R26. Use the approved semantics and define shared cases before changing all parsers, preview/capture, offline persistence, upload and export paths. Include decimal bounds, invalid dates, timezone changes and immutable capture attribution. Estimated implementation and verification: 3–6 developer days. Templates and variable-library implementation remain deferred.

Use existing `web/e2e/forms.spec.ts`, `invite-viewer.spec.ts`, report/QGIS specs, form-definition/shared cases and export tests for the relevant slices. New subtle behavior boundaries need targeted cases; wording changes do not need tests that merely repeat the text. Run `pnpm forms:parity` and the affected app checks when engines/contracts change. API shape changes require generated contracts and matching client coverage. Run `pnpm plan:check` when scheduling in component plans. Local checks do not establish deployed, physical-device or QGIS Desktop acceptance.

**Next implementation slice:** the saved plan's specification review and recovery setup, followed by existing-format editor, invitation and report lanes. Contract-dependent UI waits for its shared prerequisites.
