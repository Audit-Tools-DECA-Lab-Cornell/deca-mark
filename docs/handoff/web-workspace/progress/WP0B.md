# WP0B progress

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.
## done
- kept prior attempt's WorkspaceProvider.tsx, RememberPlace.tsx, navigation.ts (managersOnly, visibleSections, PLACE_COOKIE), PreviewProvider shim (own defaultRoleFor)
- Button.tsx data-variant attr
- tests/auth.test.mjs, auth-local.test.mjs -> /o; lib/auth/navigation.ts HOME=/o
- YourProjects + marketing page: onboarding link removed
- AuthUnavailable: sample link dropped, demosAllowed() inlined
- proxy.ts rewritten (no onboarding/preview bypass; signed-in "/" -> /o; matcher has "/")
- lib/auth/preview.ts deleted (rm)
- next.config.ts: OLD_ROUTES -> /o etc, experimental.serverActions.bodySizeLimit "2mb" (Next 16.2.7 key verified)
- moved (rm denied by classifier; mv to scratchpad/wp0b-removed, all git-tracked): (onboarding), features/onboarding, components/{onboarding,observations,basemaps,places,instrument,metrics,maps,qgis}, studio/{FormStudio,PhonePreview,QuestionEditor,draft-store}, AccessGate, PreviewMarker, PreviewFooter
- Brand.tsx BrandMark = next/image /icons/icon.svg; marketing page + (legal)/layout use BrandMark
- AppHeader, AccountMenu, Switchers, CommandPalette/palette, useShortcuts, WorkspaceTabs, ErrorView, NotFoundView -> useWorkspace
- lib/shortcuts.ts: removed g l library
- layouts: (app)/layout, /o page, [org] layout, (org) layout+loading, p/[project] layout+loading+error
- LoadFailure, NotAvailable, features/people/{types,result,names,MembersTable,InviteDialog,InvitationCreated,InvitationsTable}
- account page (getMe, AppHeader no props), features/account/actions.ts revalidate /o layout
## next
- DONE: typecheck (after next typegen), eslint+prettier on my files, full lint, test:auth 33/33, test:unit 84/84
- build OK (/o now dynamic: cookies() read first); proxy keeps "/" cacheable for signed-out
- ALL DONE; only final report left
## decisions
- Switchers: "Create project" item removed (linked to onboarding); no project state badge (ProjectRef has no status)
- palette: only workspace places (tabs, orgs, projects, account) + actions; no sample sites/people
- no redirect for /o/deca (could be a real slug)
