# WP2 forms progress

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## done
- All screens and pages live: Forms list (+ New form dialog, 3 templates), Form versions (Start new draft, Discard, Retire),
  draft editor (local RawDefinition state, Save draft with 422 placement, leave guard, add/remove question, collector view with
  optional plan), read-only published/retired and legacy views, Publish review (confirm box, notes, delivery copy).
- Server actions: createFormAction, startDraftAction, saveDraftAction, discardDraftAction, publishVersionAction, retireVersionAction.
- Moved components/studio/model.ts -> features/forms/raw.ts (trimmed); components/studio/ removed (no outside importer).
- Deleted store.ts, session.ts, CreateDraftDialog.tsx, parts.tsx.
- Unit tests: tests/unit/forms-model.test.mjs, forms-start.test.mjs (pnpm test:unit: 229 pass).
- Checks: tsc (only stale .next/ validator errors from other agents' removed routes), eslint + prettier clean on my files,
  `pnpm forms:parity` passes, grep for fixtures/preview/usePreview/@/data empty.

## next
- nothing; E2E (forms.spec, honesty scan) needs the local stack and was not run.

## decisions
- Publish wording: a collector gets a play form only through the site's current map package (`package.form_version`);
  a zone-only (Climate/Inventory) form is found by content when a site is downloaded (mobile prepare.ts). The spec line
  "Observers download this version the next time they open the site" is not true for a play form; copy says so.
- Retire warning lists sites whose current package names the version: the app refuses to download a retired form.
- Scan bans the word "preview" and "session": collector preview is renamed "Collector view" / no "session" copy.
- Legacy (shell-v1) versions are detected by question_count === 0 in the list; Start new draft is disabled with a reason.
- "Start new draft" and "Save draft" buttons carry no busyLabel so their accessible names stay exact for forms.spec.
- Protocol notes are shown on Publish but do not block it (the API does not block).
