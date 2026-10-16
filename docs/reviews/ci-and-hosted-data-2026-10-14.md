# CI and hosted data diagnosis — October 14, 2026

> Historical evidence for the date/revision below. It is not a current task board or hosted-health check. See [current position and next work](../plan/current-state.md) and the owning plans for later implementation and remaining acceptance.

## Findings

At master `4eaf103af0e8a0c200935546e5d9bebbddac549f`, both web and mobile
[CI jobs pass](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/38508485708).
Earlier web failures used removed fields such as package `version` and zone `id`
after the current contract renamed them. Earlier mobile failures referenced the
removed `UploadReceipt` OpenAPI model. Master already contains those consumer fixes.

The remaining backend CI failures include loopback HTTP and direct SQL clients
that construct a passwordless connection. Ordinary CI starts local Supabase with a
generated restricted-role password. The disposable rehearsal uses trust, which hid
the omission. All test clients now share the same settings and connection builder.

The 10,000-record export also exceeded its ten-second deadline. Its query now
materializes authorized observations once and deduplicates form/zone references
before joining protected metadata. The real HTTP CSV export completes in **1.574
seconds**, with all 10,000 rows and the existing limits intact. The index-plan test
also accepts the equally selective site index for a one-zone site; PostgreSQL's
choice can change with statistics after repeated test runs.

The Vercel site is deployed, and the Render API responds to `/health`, `/ready`
and `/openapi.json`. HTTP 200 for a Next.js page or RSC response does not establish
that its backend reads succeeded: the page renders `LoadFailure` for those reads.

Read-only inspection of **DECA Mark GIS**, Supabase project
`lezmqhuucfwqknspgcdy`, found an incomplete transition to the current contract:

- `fieldmaps_private.zone_package_metadata(uuid)` is absent.
- `fieldmaps_private.zone_authoring_available(uuid,uuid)` is absent; only older
  three- and four-argument overloads exist.
- Both helpers are present in the current checked-in baseline and used by the
  current API's site/package queries.
- Play Study has two older map packages without the new form bindings or saved
  site boundaries. Neither is selected in `site_zone_state`.
- All 13 observations lack the package/zone capture binding required by the
  current response models. Left joins return null binding fields, explaining
  response-validation failures; the observations have not been deleted.
- The hosted migration history still lists the old incremental schema. Replacing
  the local migration files with a baseline did not update the hosted database.

`/ready` previously checked database connectivity and signing keys alone. It now
also checks the required helper signatures, so this schema mismatch returns 503.

## Requests and logs

The screenshots show a regular approximately five-second sequence of 200 responses
with `duration_ms: 0`. This is consistent with hosting health probes; the old logs
omit operation names, so those particular requests cannot be positively attributed.
The container separately probes `/health` every 30 seconds. There is no recurring
workspace-read timer in the web app.

The initial screenshot also shows repeated Next.js RSC prefetches for navigation
targets. Workspace tabs, menus, breadcrumbs, action links and table/card links now
disable speculative prefetching. Successful health/readiness probes log at DEBUG;
failed probes remain visible. Request logs include static operation IDs and HTTP
methods, without actual URLs, query strings, headers or bodies.

## Hosted rollout requiring an explicit target decision

The [pre-launch policy](../plan/README.md#pre-launch-compatibility-policy-2026-10-11)
calls for replacing incompatible experimental data rather than restoring old
formats. Adding just the missing helper functions would leave the incompatible
packages and observations unresolved. Do not apply the fresh-install baseline on
top of existing application schemas.

The proposed reset target is **only** Supabase project `lezmqhuucfwqknspgcdy`.
At inspection its application schemas hold 3 organizations, 4 projects, 5 sites,
2 packages and 13 observations. A schema replacement also clears application
profiles, memberships, forms, invitations, drafts and the email outbox. The 5 Auth
accounts and their sign-in credentials should be retained, along with hosting
configuration and restricted database-role credentials.

Before an approved reset, export the application schema/data and record counts,
Auth-hook configuration and role grants for recovery. Quiesce API writes and email
workers. Replace only the five application schemas (`fieldmaps`,
`fieldmaps_private`, `fieldmaps_meta`, `fieldmaps_auth_hooks`, `gis`) transactionally
with the canonical baseline plus the email-outbox migration. Keep Supabase-managed
Auth/Storage schemas and database roles. Reconcile migration history with that
baseline; verify Auth hooks, grants and application queries before commit.

Deploy the matching API and web revision together. Require `/ready` to succeed,
then recreate the study and memberships, publish forms, prepare new format-2 map
packages and collect new bound observations. Verify counts, coverage and an export
through the signed-in web app. This is a deliberate clean baseline; it does not
reconstruct the missing historical attribution of the 13 older observations.

No hosted reset, migration, deployment or credential change was performed during
this investigation. No existing `.env` or credential file was inspected.

## Validation

- Web: production build, TypeScript, ESLint, 351 unit tests and 84 CI auth/account/
  error tests passed.
- Mobile: TypeScript, Biome and 554 active tests passed (one existing skip).
- Backend: Ruff/BasedPyright and 46 focused unit tests passed. The affected
  export, historical-analysis, readiness, live HTTP and authorization-race cohort
  ran with SCRAM password authentication enabled: 86 passed; the remaining
  index-choice assertion was corrected and all three database tests rerun.
- The initial full backend run passed 627 tests and isolated the export deadline
  failure; the subsequent export and affected-path checks verify its repair.
- Plan validation and `git diff --check` passed. Validation above is local; check CI separately for the pushed revision.
