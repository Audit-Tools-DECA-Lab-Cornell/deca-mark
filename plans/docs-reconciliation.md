# Documentation reconciliation — 2026-10-15

## Goal and acceptance

Reconcile the zone-boundary implementation, historical handoffs, component roadmaps and product entry points, then identify the next dependency-ready work without claiming unperformed hosted/device acceptance.

1. Current entry points describe implemented local behavior and explicitly retain QA-07, hosted rollout and physical-device gaps.
2. Component task status is defined only in its owning `PLAN.md`; implemented work cannot remain described as absent elsewhere.
3. Historical reviews and handoffs retain their dated evidence, with clear links to their current replacements or resolution.
4. The production index gives the actual next sequence: finish zone acceptance and hosted reconciliation, close remaining manager web-flow acceptance, then resume pilot prerequisites in dependency order.
5. Plan graph, local documentation links, targeted stale-claim assertions and a reader navigation walkthrough pass; final strict review is unconditional.

Scope is documentation only. No implementation, environment/secret reads, git mutation, hosted changes or fresh device/production claims.

## Skills

- `implementation-planning`: bounded scope, ownership and dependency order for this reconciliation.
- `docs-sync`: one authoritative home per fact and links from duplicate handoffs. The skill's Playspace/COPA ownership examples do not apply; repository `AGENTS.md` and component plans define ownership here.
- `i-have-adhd`: concise progress and an actionable final sequence.
- `codex-document-control` connector: inspect connected document sessions because explicitly invoked; use only a relevant connected session, without creating unrelated cloud documents.

## Evidence hierarchy

Read owning README, owning plan, current source/tests and dated evidence. A task's `done` label is not proof of hosted/device delivery. Treat the 2026-10-14 CI/hosted diagnosis as dated evidence, not a current verified deployment snapshot. Preserve original logs, SQL transcripts and executable evidence scripts.

Known drift requiring reconciliation includes: root README's Nocturne collector, absent zone editor and newest-500 analysis; production index's proposed-only zone feature and September status block; backend web-flow proposal's bare-array observation contract; the mobile handoff's already-fixed geometry/form/recovered-package findings; old web planning tasks left `todo` despite later implementation. Inspect full task acceptance before promoting a status.

## Ordered execution waves

### Wave 1 — establish acceptance before edits

Primary agent owns baseline and QA artifacts. Record initial `git status --short`; enumerate Markdown in root/component READMEs, all component plans, `docs/plan`, `docs/handoff`, dated reviews and named zone handoffs. Read `web/AGENTS.md`. Inspect matching source/tests only where a documentation claim needs confirmation.

Before implementation, write a documentation acceptance driver with named scenarios below, and capture failing assertions against the unchanged docs. Primary has already recorded this baseline at `docs/reviews/planning-sync-2026-10-15/validate.py`, `red-current.txt` and `red-history.txt`; use that driver rather than creating a second one. Do not change the existing production plan checker to manufacture green results.

### Wave 2 — parallel, non-overlapping ownership

1. **Primary agent:** root `README.md`, `docs/Workspace.md`, every `docs/plan/**` file, `docs/handoff/**`, `docs/reviews/**`, `web/README.md`, `web/PLAN.md`, `web/ZONE-BOUNDARIES*.md`. Reconcile global decisions/architecture/product/operations/sync/contracts/verification when current evidence contradicts them. Do not merely add a new status block above stale active instructions: revise active text or explicitly mark historical sections.
2. **Component worker:** `mobile/**/*.md`, `backend/**/*.md`, `supabase/**/*.md`, `database/**/*.md`, `qgis/**/*.md`, `contracts/**/*.md`, excluding vendored/generated dependency trees. Own all component zone docs, mobile handoffs and their readmes/plans. Preserve dated evidence; turn completed handoff demands into resolved history/current interface links. Report exact proposed dependency changes to primary before changing them.
3. **Librarian, read-only:** inspect repository evidence and current implementation to return a compact claim ledger (claim, authoritative path/line, confidence, remaining gate), plus the next dependency-ready tasks and historical document candidates. External research is unnecessary unless a documentation claim depends on an external contract; no secrets, deployment probes or remote writes.

Every worker receives: “You are not alone in the codebase. Preserve other agents' edits and do not revert them. Edit only your ownership paths. Do not change code, configuration, generated assets, secrets or git state.”

### Wave 3 — integrate and verify

Primary integrates the librarian's claim ledger and component worker's dependency notes. Update cross-links and index phase IDs only as required. Keep task statuses in their owners, and distinguish implementation completion, local acceptance, hosted acceptance and pilot readiness.

Run `pnpm plan:check`; if dependencies changed, regenerate derived Blocks with `pnpm plan:check --fix` and inspect the diff. Run targeted documentation checks, reader navigation and `git diff --check`. No app test-suite run is required for Markdown-only changes; existing test results are cited as historical evidence with dates and scope. If any production logic is unexpectedly changed, stop and restore documentation-only scope.

### Wave 4 — strict review and delivery

Spawn the requested `codex-ultrawork-reviewer` with the user request, this plan, full diff, evidence ledger, notepad and QA artifacts. Fix every concern and resubmit to the same reviewer until approval is unconditional. Report actual current position, remaining gates and the recommended next three bounded work targets. No commit/push is authorized.

## QA scenarios: test first and reader-visible evidence

### D1 — current feature entry point

**Automated test:** acceptance driver criterion `current-zone-status` uses `validate.py current` to reject the proposed-only production-index sentence, require the current-state file and check its essential task/flow references. Root README and current entry-point factual scope are additionally reviewed manually against source; they are not covered by an automated semantic parser. Capture baseline RED and final GREEN.

**Reader scenario:** `mcp__codex_app__open_in_codex({target:{type:"file",path:"/Users/praty/Desktop/StudentJob.nosync/field-ops/docs/plan/README.md"}})` and read the linked zone overview and QA-07 text through file tools. PASS iff a new reader can identify implemented local functionality, missing acceptance and the first next action without consulting chat history. Save the path/text navigation transcript. Opening the user-facing document tab is persistent requested output, not a QA process requiring teardown.

### D2 — historical handoff cannot re-open fixed work

**Automated test:** `validate.py history` asserts every dated zone/CI review has a historical notice and a current-state link. Capture baseline RED and final GREEN. The resolved mobile handoff is checked by the reader scenario and independent source review below, not an automated resolved-marker assertion.

**Reader scenario:** execute `sed -n '1,55p' mobile/MOB-31-HANDOFF.md`, followed by the exact linked resolution sections in `mobile/MOB-33-HANDOFF.md` and `mobile/PLAN.md`. PASS iff fixed requests are visibly resolved while outstanding simulator/device checks remain pending. Save transcript. This is document content, so the CLI/data surface is appropriate.

### D3 — whole-app sequence and adjacent planning consistency

**Automated tests:** `validate.py current` checks essential next-work references; `validate.py links` checks local Markdown file targets, stripping anchors/line suffixes and ignoring external URLs/code examples. `pnpm plan:check` supplies existing owner/definition uniqueness and dependency-graph checks (`docs/plan/check-plan.mjs`). Sequence ordering and meaning are checked by the reader scenario and independent review, not inferred from keyword assertions. Baseline RED is captured for current/history; links and graph are regression checks, with final outputs captured.

**Reader scenario:** navigate `docs/plan/README.md` → current next-work guidance → `docs/plan/verification.md` QA-07 → owning web/mobile/backend plan tasks. PASS iff each next action resolves to an existing owner, its prerequisites are visible, and the document does not equate implemented screens with complete hosted/manager acceptance. Capture exact file paths, task headings and status excerpts. Run `git diff --check` and confirm the changed-file inventory contains documentation only.

## Evidence and cleanup

Record every scenario's command/API invocation, binary outcome, RED artifact, GREEN artifact and reader transcript in the primary notepad. Retain intentional review artifacts in the documentation evidence location chosen by primary; remove temporary scripts/files once their outputs are preserved. No services, browser contexts, containers or ports need to be created for this document-only task. The Codex document tab is the user's deliverable preview.

## Sequencing guardrails

- QA-07 is currently `todo`; do not infer completion from WEB-28/29, BE-18/19/20/22, MOB-30/31/32/33 or GIS-09 implementation alone.
- Mobile simulator/VoiceOver and physical iPad/Android acceptance are separate from local bundling and geometry tests.
- The dated hosted diagnosis records incompatible schemas/packages/observations and an explicit target/reset approval gate. Documentation cannot resolve that gate.
- Existing plans may have implementation that supersedes part of an older task while its Storage, PowerSync or release acceptance remains open. Rewrite the remainder; do not silently mark the whole task done.
- The complete app plan is the master roadmap, the manager web flow is a focused lane, and zone-boundary acceptance is the immediate gate. Avoid introducing another competing master plan.
