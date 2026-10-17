# Authorized hosted rollout — observation authorization

This records the subsequent user-authorized database application and master release.
The earlier implementation report describes the completed local phase.

## Database application

- Target: **DECA Mark GIS**, project `lezmqhuucfwqknspgcdy` (us-east-1), confirmed healthy.
- Preflight migration history contained `20261012120000_current_baseline` and
  `20261012142629_transactional_email_outbox`, matching the local migration chain.
- The hosted observation SELECT policy and the three tenancy/role helpers matched
  the vulnerable source examined during local verification. RLS was enabled;
  `fieldmaps_api` was neither superuser nor permitted to bypass RLS.
- Supabase MCP successfully applied the exact reviewed policy SQL under migration
  name `observation_creator_visibility`. Its generated recorded version is
  **`20261017000657`**.
- The local migration was renamed from
  `20261016164152_observation_creator_visibility.sql` to
  `20261017000657_observation_creator_visibility.sql` to match that recorded version.
  The SQL is byte-for-byte unchanged from the locally verified candidate. No applied
  baseline or earlier migration was edited.
- A proposed hosted migration-ledger version update was rejected by automatic
  approval review as an unauthorized production metadata edit. It was not executed
  or retried. The hosted ledger remains at the tool-assigned version; aligning the
  local filename avoids a duplicate pending migration without changing that ledger.
- Post-apply catalog inspection confirmed the corrected SELECT expression and the
  unchanged INSERT policy. History readback confirmed the new recorded migration.

## Verification and release

The hosted administrative connection cannot `SET ROLE fieldmaps_api`. A read-only
hosted role-scope check failed at that permission boundary and made no persistent
application changes; no role grants were changed to enable it. The local restricted
role/API tests remain the behavioral evidence: 729 backend tests, focused 65-test
acceptance, the full SQL/Auth suite, 2,545 coordinate comparisons and seven
concurrency scenarios passed. Ruff and BasedPyright passed. Only the migration
filename and rollout documentation changed after those checks.

Hosted `/health` and `/ready` both returned success after migration application.
Authenticated hosted role-matrix acceptance still requires an authorized signed
observer/viewer/manager/admin session; no production signing credentials or real
user tokens were obtained.

Before publication, the local branch was fast-forwarded to remote master
`6f1ac1fe730f8ea2514c56a888fe2ba553f3e920`, preserving its newer mobile-only change.
That commit changes no backend source or migrations relative to the locally
verified base. The release mechanism is the user-requested push of this scoped fix
to `origin/master`, using the existing automatic deployment integration. Final push
and deployment status are reported in the accompanying chat.

No existing database was reset, research rows modified, Auth users created, real
emails sent, unrelated migrations applied, or hosted role grants altered.
