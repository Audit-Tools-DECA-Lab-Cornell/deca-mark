# DECA Mark database tests

Planning checkpoint: [current roadmap, 2026-10-15](../docs/plan/current-state.md). DB-19/BE-22 and DB-18 provide current local fixtures; hosted schema reconciliation and integrated QA-07 remain open.

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

The starter waits up to 120 seconds for an already-running database container whose
health check is still `starting`, then invokes the CLI. A failed start prints the CLI
error; successful CLI output remains hidden because it includes local credentials.

`pnpm db:test` runs the SQL suite and `hosted/verify.sql` on the local database. Fixtures and temporary role grants roll back. API tests use generated UUIDs and the restricted runtime login; their committed observations/packages remain until an explicit local reset. No integration test silently skips when the stack is unavailable.

DB-19 replaces the old migration chain with one current baseline. Later feature
migrations (such as the email outbox) follow that baseline. Validate them from scratch
without changing the persistent local database:

```sh
pnpm db:reset --disposable
pnpm db:test ZONE_REHEARSAL=1
```

Both commands use `database/baseline-rehearsal.sh` and a fresh isolated PostgreSQL 17/PostGIS
container from the cached Supabase image. The first applies the single baseline and seeds;
the second independently applies them and runs current SQL, Auth-hook-role and verification
checks, coordinate/digest comparisons and restricted-role publication/CAS/import races.
Only the command's own test container is removed. No ports, existing volumes, passwords or
hosted services are used. Synthetic Auth-user fixtures do not exercise the Auth HTTP service
or replace real API acceptance. Ordinary start/test commands still never reset a database.

The separate Auth-hook suite connects through Docker as local `supabase_admin`, then switches to the actual restricted Auth role for behavioral checks. Supabase reserves that role, so the ordinary `postgres` test connection cannot grant itself membership. Application SQL tests and the hosted verification script still run as `postgres`.

### API startup fails with a missing email outbox

Local databases created before 2026-10-12 may lack `fieldmaps_private.email_outbox`.
If API startup reports `UndefinedTableError` for that table, apply the pending email
outbox migration from the product root, with the local stack running:

```sh
pnpm dlx supabase@2.118.0 migration up --local
```

This applies pending local migrations without a reset and preserves existing records.
Restart the API after it succeeds. Do not use `pnpm db:reset` to repair this error.

## Applying the form revision schema change

`20261017050453_form_draft_revisions.sql` is a forward migration after the current
baseline and email outbox migration. It initializes existing form rows at revision 1,
advances draft revisions in the existing immutability trigger, and replaces the
unconditional publication function with a required revision argument. It preserves
published definitions, attribution, records, RLS and grants; no data reset is needed
for an installation already on the supported baseline.

Apply this pending file through the normal migration workflow only when the target
installation is explicitly selected and authorized. For an existing **local** Supabase
installation, the reviewed command is `pnpm dlx supabase@2.118.0 migration up --local`.
Coordinate migration, API and web rollout with form writes paused; older API publication
calls deliberately no longer work. Existing editor tabs must reload. Hosted installations
must first satisfy the current-baseline preflight and use the separately approved hosted
migration/release workflow. The explicitly authorized DECA Mark GIS application is
recorded separately in the [hosted rollout evidence](../docs/reviews/form-revisions-2026-10-16/hosted-rollout.md).

Disposable rehearsals accept `DECAMARK_REHEARSAL_IMAGE` to select an available local
PostgreSQL 17/PostGIS image containing pg_cron. The default remains the pinned Supabase
image. Alternative-image runs use synthetic Auth tables and do not prove full Supabase
Auth/Storage service behavior. See [form revision evidence](../docs/reviews/form-revisions-2026-10-16/README.md).

## Canonical synthetic forms and existing targets

The baseline's fresh synthetic shell INSERT now authors canonical `questions`, preserving
the original two IDs, bounds and export names. This edits initialization source only; do not
reapply the baseline or change migration history on an existing installation. No forward
migration mutates frozen forms. The original historical `fields` reader/validator is retained
for existing packages, records and supported queued uploads. Publishing a canonical
successor does not convert old package bindings. The read-only
[inventory](fields-only-inventory.sql) reports exact form/package references on an explicitly
selected target; it does not discover device queues or authorize hosted access.
See the [compatibility resolution and exact remaining steps](../docs/reviews/fields-only-transition-2026-10-17/README.md).

The [published numeric-bound inventory](published-form-bounds-inventory.sql) separately
identifies canonical `min > max` questions, their exact definitions and server-side
observation/package/draft references. Run it only on an explicitly authorized target
inside a read-only transaction. It cannot account for offline devices. The
[procedure and owner decisions](../docs/reviews/published-form-compatibility-2026-10-17/inventory.md)
accompany the historical reader protection; no conversion migration is required or supplied.
Training's canonical Janet definition, retention, creator isolation and immutable metadata
remain unchanged.

## Schema and access

For browser acceptance data after starting the local Auth-connected API on port 8001, run
`node database/seed-web-workspace.mjs` from the repository root. It seeds synthetic role
accounts and eight observations through Auth and application APIs, refuses hosted targets,
and can be repeated without a reset. See the [backend handoff](../backend/WEB-FLOW-HANDOFF.md#repeatable-local-browser-acceptance)
for test credentials, exact counts and the generated public fixture manifest. Run its guard
tests with `node --test database/seed-web-workspace.test.mjs`.

DB-18 adds an opt-in synthetic zone-review fixture:

```sh
node --test database/seed-zone-review.test.mjs scripts/e2e-local-seed.test.mjs
node database/seed-zone-review.mjs
sh scripts/e2e-local.sh --zones
```

The separate `zone-review-acceptance/zone-review` project has maps v1/v2, a site
without a package, two managers' saved open drafts and 520 observations (260 per
map: 200 Standard, 40 Reliability, 20 Inventory). All records are explicitly
synthetic. Map v1 has a hole and a multipart zone; v2 shrinks and renames the first
zone while retaining its identity. Map-v1 records upload after v2 publication.
Inventory bodies omit coordinates and first-round fields. The seed verifies every
page and the server summary, including recorded labels, package identities and
null inventory geometry. Stable request/record IDs make reruns idempotent; altered
fixtures are refused rather than overwritten.

Public test accounts are `zone-<owner|manager|manager2|observer|viewer>@fieldmaps.test`
with password `FieldMaps-local-only-42!`. Auth keys/tokens stay in memory; application
writes use the real local `/v1` API. The ignored public manifest is
`database/.local/zone-review.json`. The harness exposes it as `E2E_ZONE_MANIFEST`
only with `--zones`; existing specs keep `E2E_MANIFEST` and the normal workspace.
`--skip-seed --zones` skips each seed only when its own manifest exists. Neither
seed resets data or targets hosted services. The API configuration remains
`backend/config.auth-local.json`; publication has no feature switch.

Verified on 2026-10-12 after the approved local reset to DB-19's baseline: two real
Auth/API seed runs produced identical manifests, package IDs, draft IDs/ETags and
520 observation IDs, with every recorded revision still 1. The user also approved
adapting the older browser seed to BE-22: UUID bindings, nested answers, valid
in-zone points and coordinate-free inventories. Existing browser specs are unchanged.
Completion verified on 2026-10-13 after the web contract updates: the final local
desktop/phone browser suite without `--zones` passed **218 tests**, with **30**
intentional zone-only skips and no failures. The user approved the organization
profile visibility fix and current invitation assertion/readback correction that
unblocked full regression. Repeat seeds still preserve all 520 recorded revisions,
package identities and draft ETags. See [DB-18 acceptance evidence](../docs/reviews/zone-boundaries-2026-10-13/db18.md).

The schema now includes profiles linked to Auth users, organizations, organization members, projects, project memberships, invitations, sites, immutable form versions, observations, immutable site packages and package checks. Composite foreign keys enforce project/organization boundaries.

Organization owners/admins act as managers on their organization's projects and can
read their organization members' profiles, including people without a project
membership. Project managers can read their collaborators' profiles and memberships,
except Training memberships. Ordinary members/viewers retain own-profile access;
an organization role does not reveal profiles from another organization. Browser
roles and `service_role` cannot access application tables or execute application
functions. `fieldmaps_api` cannot bypass RLS or directly grant membership.
Column-limited grants allow only the documented profile, organization and project edits.

Observation SELECT RLS limits research observers to their immutable creator user ID.
Research viewers/managers and inherited organization owners/admins retain review access;
organization membership alone grants no project access. Counts, summaries and invoker GIS
observation projections use the same row policy. The API separately restricts complete
exports to research reviewers and rejects Training exports.

`20261017000657_observation_creator_visibility.sql` is an additive policy correction after
the baseline. Existing installations must apply that pending migration through their normal
approved migration process, then deploy the matching API export guard. Do not edit/reapply
the baseline or reset a database to obtain the correction. The migration alters only SELECT
visibility; immutable records, upload grants and retry receipts remain intact. See
[local verification and rollout notes](../docs/reviews/engineering-audit-2026-10-16/implementation.md).

Tenancy writes go through `fieldmaps_private` functions with a fixed empty search path, current-user authorization and organization locks. Invitation redemption checks the current Auth email, confirmation and use limit. Account forgetting removes memberships and leaves a durable anonymized profile marker until Auth deletion.

Profile initialization now enrolls active users in the separate Training project. Training observations are visible only to their creator, including for temporary project managers. Platform organization memberships are forbidden. A daily pg_cron job purges observations received more than 30 days ago from the fixed Training project only. The original practice project is unchanged. See the [Training runbook](../docs/Training-Runbook.md) for retention checks and temporary package-upload access. The Training form is a frozen copy of the canonical Janet definition; its lifecycle and downloadable site package remain later tasks.

`gis.sample_observations` remains a fixed practice-project view, read-only to `fieldmaps_sample_reader`. Its readback tests exercise PostgreSQL, not QGIS Desktop.

The current baseline supplies four read-only views: `gis.recorded_observations`, `gis.point_events`,
`gis.zone_snapshots` and `gis.inventory_records`. They use the existing
`fieldmaps_api` caller identity and underlying RLS; existing GIS reader accounts receive no new
grants. Exact package+zone joins preserve historical labels and polygons. Inventory records
remain separate from point-event counts, with null event geometry and an exact recorded zone reference.
The full projection and QGIS/export workflow are documented in
[qgis/ZONE-BOUNDARIES.md](../qgis/ZONE-BOUNDARIES.md). General scoped GIS login provisioning
remains GIS-01/GIS-02.

DB-19 and BE-22 are locally accepted. To repeat the current signed HTTP/SQL/export agreement fixture after changes:

```sh
sh database/gis09-api-rehearsal.sh -q
```

The API fixture must use the sole `/v1` surface and map versions 1 and 2, upload a delayed
map-v1 event after map-v2 publication, and compare restricted GIS reads with complete API
exports. `database/tests/test_gis09_api.py` selects `test_v1_v2_gis_readback_matches_signed_exports` and exposes its backend fixtures. The scenario publishes/binds synthetic Inventory with revision preconditions and runs the production converter on actual matching CSV/GeoJSON ZIPs. See [the QGIS guide](../qgis/zone-boundaries/README.md) for artifact retention and separate installed-provider checks.
Current SQL acceptance verifies that Training snapshots cannot expose another creator's
activity. These checks do not apply hosted migrations or provision a QGIS database reader.

The Before User Created hook blocks disposable email domains at signup. Only Supabase Auth can invoke it or read its RLS-protected blocklist; browser and application roles have no access. The hook uses a pinned community list with no network request during signup. See [the email policy](Blocked-Email-Domains.md) for source attribution, updates and hosted activation boundaries.

## Verification

Zone API acceptance can run independently of the persistent local Supabase stack:

```sh
pnpm backend:test ZONE_API_REHEARSAL=1
pnpm db:test ZONE_REHEARSAL=1
```

Each command creates its own disposable PostgreSQL 17/PostGIS container from the cached
Supabase image, applies the current baseline and synthetic fixtures, and stops only its
own container on exit. It does not reset existing databases or read their password files.
The API harness publishes only an ephemeral loopback port, checks paired local database
overrides, and exercises application SQL as the restricted `fieldmaps_api` role. Auth
tables/signing keys are synthetic; these rehearsals do not exercise the hosted Auth service.
BE-22 records its current-baseline local API acceptance in [backend/PLAN.md](../backend/PLAN.md#be-22-serve-one-zone-api-path); no new runtime verification is claimed by this documentation update.

Verified locally on 2026-10-03: all 131 backend tests, the application SQL suite, Auth-hook suite and hosted verification script run against local Supabase pass. The project-list checks now initialize the profile and assert both the study and automatic Training membership, so prior identity test runs cannot invalidate the expected project list. Ruff and BasedPyright pass. Docker Desktop started normally when launched outside the restricted shell; no reinstall, database reset or hosted operation was required.

Verified locally on 2026-09-26: a fresh migration reset, 94 mobile tests, 63 API tests, 88 SQL assertions and 18 hosted-script assertions on the local database. Python lint and type checks pass.

DB-07 verified locally on 2026-09-30: incremental migration, 109 SQL assertions, 23 hosted-script assertions on the local database and 63 API tests. The SQL suite compares the full Training definition with the canonical JSON, tests trainee isolation and executes the scheduled purge command with cutoff and unrelated-project fixtures. All SQL fixtures roll back; no hosted deployment or device acceptance is implied.

DB-08 verified locally on 2026-09-30: 125 SQL assertions and 27 hosted-script assertions on the local database. Real local Auth signup returned the specified HTTP 400 rejection for a blocked address without creating an account, and HTTP 200 with a persisted account for a permanent address. Synthetic signup accounts were removed afterward. Local Auth was restarted without resetting data to load the hook configuration.

The SQL tests cover geometry, immutable forms, replay ledger, restricted GIS reads, private default privileges, tenancy RLS, ownership limits, invitations and account forgetting. API tests cover upload/package regressions, organization-admin access without project membership, simultaneous invitation redemption and simultaneous last-manager demotion.

DB-03 retired the historical Docker migration track after [all five CI jobs passed](https://github.com/Audit-Tools-DECA-Lab-Cornell/Field-Maps/actions/runs/36273492260). See [the canonical-migrations decision](../docs/decisions/0001-canonical-migrations.md).

Hosted schema replacement remains a separate operation. `hosted/verify.sql` requires the current baseline and checks its security boundary; applying files locally does not deploy them or enable a hosted Auth hook.

### Mobile package acceptance

`sh database/mobile-package-rehearsal.sh -q -s` uses Node 24, pnpm and a disposable local PostGIS/API fixture. The current-contract rehearsal passed on 2026-10-13: it installs the zone-aware `format: 1` archive from `/v1` and reopens the exact SQLite/filesystem catalog and form bindings ([evidence](../docs/reviews/zone-boundaries-2026-10-13/mob28-mob33.md)). This verifies package installation/restart, not MOB-29’s bound uploads or physical-device acceptance. No hosted configuration is used. Schema mismatch resets incompatible data under the [pre-launch reset policy](../docs/plan/README.md#pre-launch-compatibility-policy-2026-10-11).
