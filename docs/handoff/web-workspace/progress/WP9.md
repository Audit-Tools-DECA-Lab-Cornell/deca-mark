# WP9 progress (E2E harness)

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.
## Done
- (attempt 2) Found prior attempt's files: scripts/e2e-local.sh, web/playwright.config.ts, web/e2e/** (14 specs + support/*), web/.gitignore entries. No earlier progress log.
## Next
- Review support/*.ts + specs; align config/script with task (port, dev default, --prod).
- Bring stack up, run sign-in + honesty specs, write notes/e2e.md.
## Decisions
- backend/config.auth-local.json browser_origins = only :3000 (localhost/127.0.0.1) -> web must use :3000, not :3100 (task: use an allowed port, don't edit backend config).
- Started dockerd (setsid nohup, log database/.local/e2e/dockerd.log) and `pnpm db:start` (bg).
- Verified Next 16.2.7: dev distDir = .next/dev, build cleans .next except ^(cache|dev|lock) -> dev and build coexist; only ONE `next dev` per web/ (lock .next/dev/lock). `--hostname 127.0.0.1` is auto-allowed for dev resources. `__NEXT_PROCESSED_ENV=true` skips .env loading.
- Prior specs reviewed: all 14 specs + support look right; to tighten accessible names to the spec's exact ones.
## Plan for script rewrite
- flags: --prod (build+start), --reuse-web, --skip-seed, --stop-web, --stop (only stop web); rest -> playwright. Default dev. Port 3000 (only allowed origin). E2E_WEB_MODE passed to config for longer dev timeouts.
## Milestone 2 (done)
- Rewrote scripts/e2e-local.sh: flags --prod/--reuse-web/--skip-seed/--stop-web/--stop, rest -> playwright; default next dev on 127.0.0.1:3000; warms pages; E2E_WEB_MODE to config.
- playwright.config.ts: dev-mode timeouts, screenshot only-on-failure (honesty scan saves its own), comment on :3000.
- Specs tightened to exact names: "Upload a new version", "Start new draft", "Save draft" (+API check of saved wording), "Publish", "Invite", "Revoke", "Export"; question field = textbox /^question label/i.
- tsc: no e2e errors; eslint clean; prettier clean (e2e + config).
- Run 1 (bg): stack up (docker, supabase, API pid file database/.local/e2e/api.pid), seed OK, next dev on :3000; setup sign-in works; (app) layout currently fails to compile (PreviewFooter missing; WP0B in flight) -> data, not harness.
## Next
- Wait run1 result; run honesty scan (desktop) -> record summary; stop web (scripts/e2e-local.sh --stop); write notes/e2e.md.
## Milestone 3
- Run 1 result (sign-in spec, desktop, next dev): setup 8/8 sign-ins OK; 12 passed, 2 failed (data): fresh manager sign-in landed on /account (expected project); observer /o/web-acceptance/collect still the old sample page (Play Study, DECA2026, "Proposal U3") - WP7 not rebuilt.
- notes/e2e.md written (run + restart commands).
- Added: removed-routes.spec.ts + REMOVED_ROUTES in routes.ts; scan routes verify, reset-password, /o/deca 404; status-code pattern no longer flags plain numbers; primary count uses data-variant only once any element has it; SAMPLE adds DECA / "Play Study" / "Proposal U3" markers.
- Run 2 (honesty, desktop+phone) running in bg -> scratchpad/e2e-run2.log (started before the scan.ts edits).
## Next
- Summarise run 2; stop web (sh scripts/e2e-local.sh --stop); final tsc/eslint/prettier on my files; StructuredOutput.
## Milestone 4
- Run 2 (honesty desktop+phone, 70 scans): screenshots written web/e2e/screenshots/{desktop-1440,phone-390}/{day,dusk}/*.png (35 each). Found: project-overview renders "This page is not on the map" with 200 -> scan now flags NotFoundView/LoadFailure/ErrorView words (NOT_THE_PAGE).
- scan.ts: legal pages (privacy, delete-data) copyRules:false (jargon skipped; sample/axe kept); DECA/Play Study only flagged on signed-in pages (HARD_CODED, workspace option); axe excludes nextjs-portal; dev indicator hidden in screenshots.
- Run 3 subset: removed-routes 8/8 pass; scan changes behave.
## Next
- Final: rerun sign-in spec (desktop) once more for current data; stop web (sh scripts/e2e-local.sh --stop); update notes/e2e.md with results; StructuredOutput.
