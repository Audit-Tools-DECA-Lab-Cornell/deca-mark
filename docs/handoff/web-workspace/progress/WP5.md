# WP5 progress: project team and project settings

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## done
- Read brief, spec, data-layer notes, shell notes, e2e specs (team, settings, scan rules), features/people.

## next
- features/team/{rules,actions,TeamScreen}, team page; features/project-settings/{rules,actions,SettingsScreen}, settings page.
- Delete sample files, settings/rounds, check imports outside area.
- Unit tests, tsc/eslint/prettier.

## decisions
- Viewer opening /team or /settings: page checks projectAbilities(role).manage before any manager-only read; renders PageHeader + LoadFailure no-access.
- Project timezone from getProject (any member may read); zone list built on the server and passed down (no hydration mismatch).
- API Project has no created_at: "Created" fact cannot be shown.

## update 1
- done: features/team/{rules,actions,TeamScreen}, team page; features/project-settings/{rules,actions,SettingsScreen,ArchiveIsland}, settings page; settings/rounds deleted.
- deleted sample files: team/{store,JoinCodeIsland,ReviewRoleDialog,InviteDialog}, project-settings/{RoundsScreen,DangerZone}.
- KEPT (still imported by WP4's old files): features/team/StackedRows.tsx, features/project-settings/store.ts (imports fixtures). Delete once WP4 drops its imports.
- next: tsc/eslint/prettier, unit tests (team + settings rules), final grep.

## update 2 (finished)
- split project-settings/schemas.ts (zod) from rules.ts so the screen bundle stays light; unit tests tests/unit/{team-rules,project-settings-rules}.test.mjs (20 tests, all pass; full test:unit 134/134).
- tsc: no errors in my files; only stale `.next/dev/types/validator.ts` (git-ignored) still names the deleted settings/rounds page.
- eslint + prettier clean on all my files.
- Still to delete by WP4/WP10 once WP4 drops its imports: features/team/StackedRows.tsx, features/project-settings/store.ts (imports fixtures).
