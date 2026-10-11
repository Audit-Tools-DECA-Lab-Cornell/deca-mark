# DECA Mark database tests

`supabase/migrations/` is the canonical PostgreSQL 17/PostGIS schema. Local development and integration tests run the actual Supabase stack, including Auth, Storage and Mailpit. The schema and task specifications are in [supabase/PLAN.md](../supabase/PLAN.md).

## Run locally

From the product root, with Docker Desktop, Node 24, pnpm 10.17.1 and uv installed:

```sh
pnpm db:start
pnpm test
pnpm db:stop
```

The starter runs pinned Supabase CLI 2.118.0 and generates an ignored API password at `database/.local/fieldmaps-api-password` with mode 0600. It does not display credentials. The API connects as restricted `fieldmaps_api` on localhost port 54322. Studio is on port 54323 and Mailpit on 54324.

Local confirmation and recovery templates in `supabase/templates/` display six-digit codes. Read synthetic test emails in Mailpit when exercising the web verification and recovery screens. Template changes take effect after stopping and starting the local stack; volumes are preserved. Hosted email templates and SMTP settings require separate configuration.

`pnpm db:reset` explicitly replaces the local database with the canonical migrations and `supabase/seed.sql`. Start and test commands never reset a database. Stop preserves local volumes. None of these commands targets hosted services.

`pnpm db:test` runs the SQL suite and `hosted/verify.sql` on the local database. Fixtures and temporary role grants roll back. API tests use generated UUIDs and the restricted runtime login; their committed observations/packages remain until an explicit local reset. No integration test silently skips when the stack is unavailable.

For the DB-15/DB-16 migration and publication rehearsal, run `pnpm db:test ZONE_REHEARSAL=1`.
It creates an isolated PostgreSQL 17/PostGIS container using the cached Supabase Postgres
image, applies the canonical baseline, inserts synthetic legacy points/inventories,
blocked packages and duplicate codes across sites, then applies the forward migration.
It compares every original observation/package field and archive byte, runs the SQL,
Auth-hook role and verification-script suites, and removes only its own test container.
It also compares coordinate serialization and geometry checksums with Node 24, exercises
publication/CAS/import races in separate restricted-role sessions with observed lock
barriers, and rechecks historical rows after those committed synthetic operations.
No ports, existing volumes, passwords or hosted services are used. The small Auth-user
table supplies SQL identity fixtures; this rehearsal does not exercise the Auth HTTP
service or replace the full Supabase/API integration gates.

The separate Auth-hook suite connects through Docker as local `supabase_admin`, then switches to the actual restricted Auth role for behavioral checks. Supabase reserves that role, so the ordinary `postgres` test connection cannot grant itself membership. Application SQL tests and the hosted verification script still run as `postgres`.

## Schema and access

For browser acceptance data after starting the local Auth-connected API on port 8001, run
`node database/seed-web-workspace.mjs` from the repository root. It seeds synthetic role
accounts and eight observations through Auth and application APIs, refuses hosted targets,
and can be repeated without a reset. See the [backend handoff](../backend/WEB-FLOW-HANDOFF.md#repeatable-local-browser-acceptance)
for test credentials, exact counts and the generated public fixture manifest. Run its guard
tests with `node --test database/seed-web-workspace.test.mjs`.

The schema now includes profiles linked to Auth users, organizations, organization members, projects, project memberships, invitations, sites, immutable form versions, observations, immutable site packages and package checks. Composite foreign keys enforce project/organization boundaries.

Organization owners/admins act as managers on their organization's projects. Project managers can read their collaborators' profiles and memberships, except Training memberships. Browser roles and `service_role` cannot access application tables or execute application functions. `fieldmaps_api` cannot bypass RLS or directly grant membership. Column-limited grants allow only the documented profile, organization and project edits.

Tenancy writes go through `fieldmaps_private` functions with a fixed empty search path, current-user authorization and organization locks. Invitation redemption checks the current Auth email, confirmation and use limit. Account forgetting removes memberships and leaves a durable anonymized profile marker until Auth deletion.

Profile initialization now enrolls active users in the separate Training project. Training observations are visible only to their creator, including for temporary project managers. Platform organization memberships are forbidden. A daily pg_cron job purges observations received more than 30 days ago from the fixed Training project only. The original practice project is unchanged. See the [Training runbook](../docs/Training-Runbook.md) for retention checks and temporary package-upload access. The Training form is a frozen copy of the canonical Janet definition; its lifecycle and downloadable site package remain later tasks.

`gis.sample_observations` remains a fixed practice-project view, read-only to `fieldmaps_sample_reader`. Its readback tests exercise PostgreSQL, not QGIS Desktop.

The Before User Created hook blocks disposable email domains at signup. Only Supabase Auth can invoke it or read its RLS-protected blocklist; browser and application roles have no access. The hook uses a pinned community list with no network request during signup. See [the email policy](Blocked-Email-Domains.md) for source attribution, updates and hosted activation boundaries.

## Verification

Zone API acceptance can run independently of the persistent local Supabase stack:

```sh
pnpm backend:test ZONE_API_REHEARSAL=1
pnpm db:test ZONE_REHEARSAL=1
```

Each command creates its own disposable PostgreSQL 17/PostGIS container from the cached
Supabase image, applies canonical migrations and synthetic fixtures, and stops only its
own container on exit. It does not reset existing databases or read their password files.
The API harness publishes only an ephemeral loopback port, checks paired local database
overrides, and exercises application SQL as the restricted `fieldmaps_api` role. Auth
tables/signing keys are synthetic; these rehearsals do not exercise the hosted Auth service.

Verified locally on 2026-10-03: all 131 backend tests, the application SQL suite, Auth-hook suite and hosted verification script run against local Supabase pass. The project-list checks now initialize the profile and assert both the study and automatic Training membership, so prior identity test runs cannot invalidate the expected project list. Ruff and BasedPyright pass. Docker Desktop started normally when launched outside the restricted shell; no reinstall, database reset or hosted operation was required.

Verified locally on 2026-09-26: a fresh migration reset, 94 mobile tests, 63 API tests, 88 SQL assertions and 18 hosted-script assertions on the local database. Python lint and type checks pass.

DB-07 verified locally on 2026-09-30: incremental migration, 109 SQL assertions, 23 hosted-script assertions on the local database and 63 API tests. The SQL suite compares the full Training definition with the canonical JSON, tests trainee isolation and executes the scheduled purge command with cutoff and unrelated-project fixtures. All SQL fixtures roll back; no hosted deployment or device acceptance is implied.

DB-08 verified locally on 2026-09-30: 125 SQL assertions and 27 hosted-script assertions on the local database. Real local Auth signup returned the specified HTTP 400 rejection for a blocked address without creating an account, and HTTP 200 with a persisted account for a permanent address. Synthetic signup accounts were removed afterward. Local Auth was restarted without resetting data to load the hook configuration.

The SQL tests cover geometry, immutable forms, replay ledger, restricted GIS reads, private default privileges, tenancy RLS, ownership limits, invitations and account forgetting. API tests cover upload/package regressions, organization-admin access without project membership, simultaneous invitation redemption and simultaneous last-manager demotion.

DB-03 retired the historical Docker migration track after [all five CI jobs passed](https://github.com/Audit-Tools-DECA-Lab-Cornell/Field-Maps/actions/runs/36273492260). See [the canonical-migrations decision](../docs/decisions/0001-canonical-migrations.md).

Hosted migration application remains a separate operation. `hosted/verify.sql` now requires the DB-04 through DB-08 migrations and checks their security boundary; applying files locally does not deploy them or enable a hosted Auth hook.
