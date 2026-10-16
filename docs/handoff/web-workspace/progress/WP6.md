# WP6 progress (organization pages)

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.
## done
- read brief, spec, data-layer notes, ux checklist, shell notes, org.spec.ts, scan.ts, backend org rules (members, transfer, invitations)
## next
- pure modules (features/org/{slug,timezone}.ts, projects/rows.ts, members/rules.ts, schemas.ts) + unit tests
- actions.ts, read.ts, NoAccess
- projects page + CreateProjectDialog; members page; settings page (+ transfer)
- delete library page and old fixture files; tsc/eslint/prettier/test:unit; grep for fixtures
## decisions
- owner role cannot be given by PATCH (API refuses p_role=owner); owners get admin/member in the select, ownership moves only through Transfer ownership
- admins can only remove plain members (API: non-owner touches only role=member); no role select for admins
- own row in Members is not managed (no Leave); last-owner/admin rules are the API's
- org invitations: roles member/admin only; admin role only offered by owners
- ProjectCreate has no description in the API: dialog omits it
- conflict on createProject -> code field "already used"; conflict on patchOrganization -> web address field
## update 2
- done: features/org/{slug,timezone,schemas,types,actions,read,NoAccess}, projects/{rows,ProjectList,CreateProjectDialog}, members/{rules,MembersScreen}, settings/{SettingsScreen,TransferOwnership}; three pages rewritten; library/ and YourProjects deleted; tests/unit/org.test.mjs (19 pass)
- tsc clean for my files, eslint clean
- next: full unit run, grep fixtures, final review, report
## final
- rules.ts now reads orgAbilities (manageOwners/manage); removed unused roleSummary/OWNER
- checks: prettier --check clean, eslint clean, tsc clean for my files, test:unit 134/134 (19 in org.test.mjs), fixtures grep empty
- ran `next typegen` to clear the stale validator entry for the deleted library page
- SSR smoke render (scratchpad, not in repo) of ProjectList, CreateProjectDialog, MembersScreen (owner/admin), SettingsScreen (owner/admin), OrgNoAccess: no exceptions
- done; only the report is left
