# WP7 progress

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.
## done
- everything in the WP7 brief is built; tsc clean for my files, eslint and prettier clean, unit tests added (tests/unit/invitation.test.mjs, 17 pass)
- investigation of the `/account` landing: old `(app)/o/page.tsx` was `redirect("/account")` through e2d2052; rewritten in 1c7076d (homeFor). Nothing in current code sends a fresh sign-in to /account.
- auth cleanup: params.ts, AuthUnavailable.tsx, forms, signed-out pages, AuthHero (words only); PreviewLine and OfflineNote deleted
- invitation: invitation.ts (pure), actions.ts, viewer.ts, AccountChip, InvitationCard, InvitationSignIn, InviteScreen, JoinForm, JoinScreen, route group (join)
- collect page + CollectHandoff, androidApp.ts, home page, not-found
- route group rename checked: only web/PLAN.md (docs, WP10) mentions `(signed-in)`
## next
- nothing; final report sent
## decisions
- rename route group (signed-in) -> (join): the pages also serve signed-out visitors
- /invite and /join are not in the proxy matcher: reported (session refresh, no-store)
- own switchAccount action because lib/auth signOut has no `next`
- git: I ran `git rm --cached` on PreviewLine.tsx by mistake (index only; same net result as the deletion)
