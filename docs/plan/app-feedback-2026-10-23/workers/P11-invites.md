# P11 invitations — Wave 1

## Intention

Implement R16–R22 within the invitation creation and acceptance surfaces: 14-day defaults, precise role descriptions, signed-in identity beside Join with account switching and credential retention, at most 25 validated unique recipients with three concurrent requests, confirmed/definite-failure/not-confirmed results and safe retries, explicit email/code modes, and no promotional join panel. Permissions and database schema remain unchanged. No provider mail sending, secrets, Git mutation, deployments, or server startup.

## Verification plan

Add behavioral unit regressions for recipients, request concurrency, unknown outcome handling and credential retention; add focused component/action regressions and backend omitted-default tests. Extend existing local browser scenarios for actual invitations. Root will serialize browser/full-stack acceptance. Each checkpoint contains only this worker's exact source/test allowlist.

## Progress

1. Source inspection complete. Existing generic invalid join response is relabeled as already-member based only on names; token is discarded on invalid. Backend preview supplies no recipient identity, so use explicit signed-in identity and safe recovery without a schema change.
2. Implementation and focused verification pending.

## Implementation checkpoint

R16: first-open/reset use 14 days and both API request models inherit a 14-day omitted default. Explicit 1–365-day values retain their meaning. Root owns generated API schema refresh.

R17: Team role choices now read `stateOf(...).allows`, matching acceptance. Exact requested wording was transferred to root for `contracts/contour.json`; this worker made no token edits or permission changes.

R18: the real account from `readViewer` appears beside Join with Switch account. Invalid redemption no longer infers membership from matching project/organization names. Explicit duplicate (409) still offers the proven existing-project path. Generic invalid preview/redemption retains the tab credential. Join codes are also kept in tab storage through account switching. When storage refuses, the beside-Join switch prevents losing the only credential and gives recovery guidance. Joining disables that switch while in flight. Successful joining clears the stored credential.

R19/R20: explicit Invite by email and Shared join code modes. Email mode validates the full comma-separated list, trims and lowercases, deduplicates, and accepts at most 25 unique addresses. Each recipient calls the existing create action with one use; at most three create calls run at once. Shared code keeps its chosen maximum uses. Every recipient has confirmed creation, definite failure, or not-confirmed status; sharing details remain available for successes, and only definite failures are retryable. Unknown responses and lost connections are never automatically reissued. Existing action errors now carry explicit refusal certainty for both project and organization invitations.

R21/R22: AuthHero is removed only from the join/invitation layout. Other authentication layouts and collector queue states are unchanged.

## Executed verification

- 63 focused web unit checks passed: invitation, invitation-batch, invitation-flow, invitation-recovery, invitations, team-rules and org. This includes real dialog/card rendering (visual children replaced), actual invitation server-action branching (request context and network seam replaced), parser boundaries, three-call concurrency, reset, credential retention, and retry isolation. Initial red tests exposed seven-day defaults, absent batch handling and absent remembered-code behavior before implementation.
- `web`: `pnpm exec tsc --noEmit --pretty false` passed after all workers' current changes stabilized. Targeted ESLint passed for all owned TS/TSX source, unit files and the two browser specs. Targeted Prettier check passed after formatting fixes. Earlier global type failures in concurrently edited forms were reported to root and are resolved in the latest run.
- `backend`: `pytest backend/tests/test_invitation_options.py -q` passed 11 tests. `ruff check` and `ruff format --check` passed for the schema and new test. The first cache attempt was blocked by sandbox access to the default uv cache; the same command succeeded using `/private/tmp/fieldops-invites-uv-cache`.
- `git diff --check` passed on the owned paths. Local checkpoints `001100-invites` through `001111-invites` contain exact per-edit source/test allowlists; final checkpoint follows this journal update.

## Browser and dataset acceptance still assigned to root

Updated `web/e2e/team.spec.ts` adds live local invalid-input focus, duplicate normalization, separate recipient rows, one-use email invitations, reopen defaults and shared-code control coverage. Updated `web/e2e/invite-viewer.spec.ts` adds real wrong-account refusal, same-tab switching, successful recipient joining and credential clearing. Existing real single-invitation create/preview/revoke and viewer join scenarios remain.

This worker started no server and ran no browser suite or database mutation. The new unit examples are fictional addresses and fake boundary results; they establish no live dataset, hosted, provider-email, native, physical-device, or screen-reader acceptance. Root must run serialized real local browser acceptance and the 390/768/1024/1440 Day/Dusk/zoom checks. No provider mail was sent by this worker.

Backend preview still does not reveal recipient identity, and its generic 404 does not distinguish wrong email, revocation, exhausted uses or existing membership. The UI presents actual signed-in identity and safe switching instead of inventing recipient detection. The explicit 409 recovery remains available; generic 404 retains an honest refusal and the existing Back to projects action.

## Owned changed files

Source: `backend/src/fieldmaps_api/invitation_schemas.py`; `web/src/features/people/InviteDialog.tsx`, `invitation-batch.ts`, `InvitationBatchResults.tsx`, `types.ts`; `web/src/features/team/TeamScreen.tsx`, `actions.ts`; `web/src/features/org/actions.ts` (invitation function and import only); `web/src/features/auth/AccountChip.tsx`, `InvitationCard.tsx`, `InviteScreen.tsx`, `JoinScreen.tsx`, `actions.ts`, `invitation.ts`, `viewer.ts`; `web/src/app/(auth)/(join)/layout.tsx`.

Tests: `backend/tests/test_invitation_options.py`; `web/tests/unit/invitation-batch.test.mjs`, `invitation-flow.test.mjs`, `invitation-recovery.test.mjs`, `invitation.test.mjs`; `web/e2e/team.spec.ts`, `invite-viewer.spec.ts`.
