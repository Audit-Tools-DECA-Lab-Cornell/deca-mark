# App feedback: implementation plan and execution handoff

Approved scope: October 24, 2026. Planning base: `bc52cac658af280c0a97d6ab22422f5d90f55cd2`. Delivery branch: `docs/app-feedback-2026-10-23-plan`.

Implement **28 requirements** from the [feedback inventory](../../reviews/app-feedback-2026-10-23/README.md). Exclude R27 (database-backed whole-form templates) and R29 (individual-variable library). Both are future features. Keep their existing roadmap separate from this implementation.

Source implementation and automated checks are complete locally. The separately
approved local schema-2 migration passed on October 25, 2026; real web/API browser
and physical-device acceptance remain pending. Use [CURRENT.md](CURRENT.md) for the
verified continuation point. Component plans retain canonical task status; the
ledger records work-packet ownership, evidence and recovery pointers.

## Start or resume

1. Read [CURRENT.md](CURRENT.md), [ledger.json](ledger.json), and the recorded Git revision. Reconcile actual disk contents before changing anything.
2. Read the root/component instructions and owning READMEs; use [work-packages.md](work-packages.md) for lanes and [recovery.md](recovery.md) for recovery rules. Generated completed-work snapshots are excluded from Git.
3. Resume only the pending acceptance packet; do not restart completed waves. Use
   [claude-ui-review-prompt.md](claude-ui-review-prompt.md) for a later independent review.

## Settled decisions

| Topic | Required behavior |
| --- | --- |
| Exports | A question's ID determines its answer column in newly authored versions, including conditional subtypes. Historical definitions and exports retain their meaning. Reserved/formula-sensitive headers remain protected; show the actual adjusted header where necessary. |
| Observer identity | Use authenticated account ID as stable Observer ID. Keep existing initials/code available alongside it. No new study-specific identifier system. |
| Numbers | Whole number is the default. Decimal mode accepts any finite JSON number without rounding or a fractional-place restriction. Bounds are optional; do not impose 0–100. |
| Date/time | Manual entry is the default; managers may choose automatic capture time. Automatic values freeze in the observation capture context and survive offline restart, retry and upload unchanged. |
| Scope and usage | Defer both templates and the variable library. At most three concurrent workers. Stop new dispatch at 20% reported remaining quota or context; checkpoint and stop safely. No automatic paid overage. |

## Current-checkout reconciliation

CON-07 landed in the planning base with version 1. The implemented feedback contract
now serves version **2**, beside the definition, never inside its document. Both
engines retain `FORM_SCHEMA_VERSION`, `parseServedDefinition`,
`UnknownSchemaVersionError`, and `isUnknownSchemaVersion`. See the
[contracts guide](../../../contracts/README.md#form-schema-version).

Producer/consumer wiring remains in BE-24, MOB-43 and WEB-56. Before extended types are enabled, reconcile the narrowly necessary wiring with those owning tasks. Do not pull in deferred templates, the whole pilot-readiness program, database resets or unrelated legacy cleanup. [D36 and the deployment hold](../pilot-readiness.md) apply if that prerequisite is implemented; a planning branch does not authorize API deployment or master changes.

The extended definitions target form schema version **2**. Follow the existing single-current-schema/forward-migration rule. Do not introduce simultaneous old/new serving paths or a second form engine. A structural migration must preserve existing question IDs, authored export mappings, historical answer meaning, record attribution and unsent work; only newly authored versions adopt the new Question ID/export rule. Use the existing schema-version column, not a version property in definition JSON. Prepare necessary migrations as source; applying database migrations is outside this execution authorization. Coordinate schema changes, API validation, generated schema, shared cases and client guards as one reviewed release unit.

## Product and UX boundaries

Use Contour, the current primitives, and the existing draft/save/publish model. Avoid a broader visual redesign. Keep ETag preconditions, role checks before reads, failed-read states, account fences, immutable recorded bindings, frozen upload bodies and receipt checks. Published versions remain immutable. A new draft does not rewrite historical answers or send a new form to observers automatically.

Read `PRODUCT.md` and `DESIGN.md` before UI changes. Explain controls using researcher language. Favor recognition over remembering IDs: show question text alongside IDs, clear condition summaries, visible defaults, recoverable errors and stable focus. Do not advertise the deferred Library. Review actual interaction and responsive behavior, not just source structure.

## Form authoring requirements

- **R01–R05:** pointer/touch drag handles plus keyboard move controls; save/reload preserves order and selection. Refuse a move that puts a child before its parent, with a clear explanation. Apply Question Text, editable generated Question ID, the requested column helper, and Instructions to Observers. An ID rename uses Apply/Cancel, validates uniqueness, and updates conditional/dynamic parent references atomically. Publication review explains old/new IDs and the dataset effect.
- **R06–R10:** use the inventory's descriptive answer labels and required wording. Provide “Show this question”: Always or Conditions. Conditions expose the existing answered/comparison/multiple-selection rules and nested All/Any groups, using only earlier eligible questions and valid choices. Provide editable dependent option sets grouped by controlling answer. Expose minimum only, maximum only, both or neither; reject reversed bounds.
- **R12–R15:** newly added questions always default to single response, including after adding/canceling another question. Keep the existing starter Notes question unless separately changed by an explicit task. Use “Question will be added to this draft. Save the draft to keep it.” Replace confusing format/option-code helpers with plain explanations of the actual editing restriction; preserve validation feedback.
- **R28/R30:** rename Blank to Custom, using truthful custom-question wording without a Library promise. Rename Code to Form Code; explain project uniqueness and its use in version names, while retaining editable automatic generation.
- Draft option relabels preserve option codes. Adding an option creates a unique code. Removing an option requires resolving affected conditions/sets before save; do not silently delete dependent questions or rules. For newly authored versions normalize ordinary and dynamic-set export mappings to the question ID, preserving historical mappings. Keep collision/formula protections and show actual protected headers. Update preview, codebook and QGIS-facing export acceptance together.

## Invitations and reports

- **R16/R17:** default invitation expiry to 14 days in UI first-open/reset and API omission paths. Use the inventory's exact role descriptions in creation and acceptance. These are wording changes, not permission changes; do not imply that a new record-approval workflow exists.
- **R18:** show the signed-in account beside Join and offer a prominent switch. Retain the invitation across switching and wrong-account refusal. Do not turn a generic invalid-invitation response into a misleading already-member result, or confuse the invited role with the signed-in person's current role. Recipient/mismatch preview data, if necessary, is an explicit API/SQL-function change with authorization tests.
- **R19/R20:** accept at most 25 unique comma-separated email recipients. Validate before submission, deduplicate, and use at most three concurrent existing create requests. Show per-recipient success, definite failure, or not-confirmed outcomes. Retry only definite failures; reconcile uncertain outcomes before resending. Separate Invite by email from Create a shared join code; show usage limits only for shared codes. Do not send real provider email in tests.
- **R21/R22:** remove the irrelevant promotional/status panel from invitation/join pages. Do not silently expand the change to other authentication pages or rename actual collector queue states.
- **R23/R24:** Reports uses Date Range with All observation dates / Custom observation dates, revealing From / To for Custom. All clears the active date filter. Rename Round to Round Type. Preserve project timezone, inclusive end date, URL state and print/export scope.

## Shared contracts and collector extensions

- **R11:** add `numberMode: integer | decimal`, default integer. Decimal answers and bounds must be finite, with no rounding or fractional-place limit; integer questions retain existing whole-number guarantees. Fix native input handling so it does not strip negative signs or decimal points. Blank/transitional editing text must not become a valid zero/NaN answer.
- **R25:** add a date/time question kind with date-only, time-only and combined modes. Store dates as `YYYY-MM-DD`, times as `HH:mm:ss`, combined values as UTC ISO timestamps. Offer ISO/month-first/day-first date display and 12/24-hour time; default ISO and 24-hour. Record project timezone in the published date/time configuration. Reject nonexistent local times; require an occurrence/offset choice for ambiguous daylight-saving times. Formatting must not change stored values.
- **R26:** add explicit sources: manual, account ID, observer code and capture time. Identity sources apply to text questions; capture time applies to date/time questions. Populate automatic values from the observation's capture context, freeze them once, show their source, and validate account attribution against the authenticated record owner. Never replace them with the current profile or syncing account later.
- Use the same validation and visibility semantics in both previews and native collection. Hand-author expected cases before implementation. Generate the JSON Schema and API/client declarations through their existing generators; never hand-edit generated files.
- Wire schema version beside served definitions and through cached form metadata. Refuse unsupported versions before package installation/collection. Reuse the existing guard API and single-current-version policy; keep exact existing package/form identity, retained drafts and immutable upload bodies.

## Test and acceptance matrix

| Surface | Required scenarios |
| --- | --- |
| Editor | Reorder/save/reload; duplicate/renamed ID with multiple descendants; dynamic options; hidden-answer pruning; optional bounds; unsaved-work retention on conflict; publication review; actual exported headers and codebook. |
| Contracts | Integer/decimal parity, invalid types, finite bounds, decimal/sign input, invalid dates/times, timezone/DST boundaries, automatic source restrictions, unknown schema refusal, reproducible generation. |
| Invitations | Different signed-in account, successful switch, existing membership, credential retention, 14-day UI/API defaults, duplicate/invalid recipients, partial success, definite versus uncertain outcomes, no unauthorized role or recipient use. |
| Offline | Real local create → publish → download → capture offline → restart → resume → reconnect → upload → export, with identical automatic identity/time values and exact recorded bindings. |
| UX | Browser 390/768/1024/1440 CSS px; Day/Dusk; keyboard and touch reorder; 200% zoom; focus/error recovery; native phone/tablet portrait/landscape where available. Record screen-reader and physical-device checks separately. |

Use `web/e2e/forms.spec.ts`, `web/e2e/invite-viewer.spec.ts`, report/QGIS specs, the existing definition/shared cases, and backend export/upload tests. Add focused behavioral regressions, not tests that merely repeat copy. Run owning app checks per packet; serialize the integrated parity, generation, token and plan checks after each wave stabilizes. Reading source and passing compilation do not establish surface acceptance.

Evidence records command, exit code, tested input hashes/revision, environment, log/screenshot path and whether acceptance was automated, browser, simulator, physical-device, hosted or QGIS Desktop. Never present a pending surface as passed. Do not discard meaningful failing acceptance because it also fails at the starting revision.

## Safety and completion

This handoff authorizes source implementation and ordinary existing local checks.
On October 25, 2026 the user separately approved applying schema 2 to the existing
local Supabase database and requested production instructions; that local application
is verified. Production application remains separately authorized through the
[rollout procedure](../../../database/hosted/form-schema2-rollout.md). Secrets access,
resets, volume deletion, hosted changes, real invitations, deployments and releases
remain outside this authorization. On October 25 the user additionally authorized
committing all feedback changes and creating a PR. Source and master integration
are pushed; [PR42](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/pull/42) remains a draft pending acceptance.

Node 24 and pnpm 10.17.1; each application retains its own dependency installation. Apply relevant installed skills, but do not import COPA/Playspace architecture or paths from generic examples into DECA Mark.

Completion means all 28 requirements have implemented behavior, valid tests/surface evidence, specification compliance review and quality review with no unresolved acceptance defect. If an external prerequisite is unavailable, checkpoint and report it precisely while completing independent work. A quota stop is a continuation state, not completion.

## Sources for execution mechanics

The approved plan used official [Claude subagent model selection](https://code.claude.com/docs/en/sub-agents), [command hooks](https://code.claude.com/docs/en/hooks), and [usage/cost guidance](https://code.claude.com/docs/en/costs), inspected October 24, 2026. Check the installed client's supported features before configuring it. Subagents share account limits; model selection/context isolation alone does not guarantee lower total spend. Session-end hooks are supplemental and cannot guarantee a last write after a hard stop.
