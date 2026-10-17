# Authorized hosted rollout — October 17, 2026 UTC

After the disposable verification, the user explicitly requested committing/pushing
to `origin/master` and applying the Supabase migrations with the matching rollout.
The confirmed targets are Supabase **DECA Mark GIS** (`lezmqhuucfwqknspgcdy`),
Render **Decamark** (`srv-dapctm7f3r2c73c9mi50`) in the confirmed **Audit Tools
Workspace**, and Vercel **deca-mark** (`prj_PfiR0vGpFniJUhQZi6qoVeLDZE68`).

## Database

The hosted ledger already contained the current baseline, transactional email
outbox, and `20261017000657_observation_creator_visibility`. Those migrations
were neither reapplied nor edited. The original audit and its rollout evidence
were left unchanged.

Supabase's `apply_migration` successfully applied `form_draft_revisions`, recording
version **20261017050453**. The local migration filename was renamed to that
recorded version; its SQL bytes remain identical to the disposable-tested file:
SHA-256 `cbe23d1a996fadb356c72aea31068efceb1cc64173fdc14ea95dc2c5c410c468`.
No migration-ledger metadata was edited manually. No reset or data seeding ran.

Read-only catalog/data-aggregate checks before and after confirm:

- All six existing forms remain published, with no drafts at either check.
- Their definition/publisher/timestamp fingerprint remains
  `66da5519f718e92fa18a1a25cb5ac205`.
- Existing versions have revision 1; the new bigint column is non-null with default 1.
- The unconditional two-argument publication function is absent; the conditional
  three-argument function exists and is executable by `fieldmaps_api`.
- The API role cannot directly update the revision column. Form RLS remains enabled.

Security advisors before and after show the same two existing findings and no new
finding: [migration metadata has RLS with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
(INFO), and [leaked-password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
(WARN). Auth settings were not changed as part of this form remediation.

## Application rollout

Both linked services deploy automatically from `master`; before this rollout both
served `bb38f134e461c3a5e5884c7adf23b5a228c8481a`. The schema was applied before
pushing the matching code. During the transition the removed unconditional SQL
publication entry point fails closed. Existing form tabs must reload.

Application deployment and public smoke-check results will be recorded after the
Git-triggered builds complete. Real-user hosted save/publication tests require an
authorized user session; no signing credentials or real-user tokens were obtained.
Atomicity and role behavior were tested in the disposable database suites recorded
in the main evidence and post-merge verification.
