# Durable account-deletion recovery — October 17, 2026

## Verdict and scope

**Durable recovery is implemented and locally verified.** A committed local forgetting
now also commits recoverable external-deletion work. The actual API lifespan worker
resumes it without the deleting person's session or another request.

This resolves the local implementation gap recorded in the
[consolidated assessment](../consolidated-audit-2026-10-17/rollout.md) and
[published-form addendum](../published-form-compatibility-2026-10-17/rollout.md).
Those reports remain unchanged historical evidence. This is not hosted acceptance,
deployment authorization or an unconditional release verdict. Target permissions,
database/issuer pairing, key injection, monitor ownership and actual provider behavior
still need separately authorized acceptance.

**Fields-only and stored canonical compatibility remain.** Target/device inventory and
research-owner retention/protocol decisions for unsatisfiable observation queues stay
open. No historical definition, package, observation body, fingerprint or compatibility
reader was changed here.

Starting HEAD is **b93a2b2456cf5d7dc96cfc2fc3eaf5174bc34f4c**, branch work, clean before
creating evidence. That commit includes the prior fixes; 577959a is no longer this
checkout. No commit, push, branch switch, provisioning, deployment, existing-database
reset, configured-secret inspection, real provider call or hosted data access occurred.

## Changed files and preservation

- Production: backend/src/fieldmaps_api/{main.py,routers/identity.py,
  services/account_deletion.py}; new account_deletion_worker.py,
  repositories/account_deletions.py and queries/account_deletions.py.
- Schema: the one new recovery migration named below; no prior migration was edited.
- Tests: existing test_account_deletion.py, test_account_deletion_admin.py and the
  original crash-boundary assessment; new test_account_deletion_recovery.py,
  database/tests/test_deletion_recovery_migration.py and account-deletion-recovery.sql.
  database/tests/run.sql includes the new SQL cases and expects the new ledger row.
- Current instructions: backend/README.md, database/README.md and this evidence directory.

Of 1,715 pre-existing tracked files, **1,706 remain byte-identical**, nine change
intentionally and none disappear ([preservation](preservation.json)). Prior reports,
compatibility implementations, contracts and generated clients stay identical.
Production plus migration changes add 245/remove 13 lines across seven files
([exact patch](production-change.patch)); size describes scope, not correctness.

## Atomic pending work and recovery

Migration: `supabase/migrations/20261018030756_account_deletion_recovery.sql`.
It creates private `account_deletions`, keyed by the existing profile UUID with
ON DELETE CASCADE. It stores only requested/last/next attempt times, a bounded attempt
counter, one safe failure class and an optional lease token/expiry. No email, profile
content, provider body, bearer token or key is retained in a job.

An AFTER INSERT/UPDATE OF deleted_at trigger inserts the job inside forget_user's
existing transaction. Commit establishes both facts; rollback removes both, and a
trigger failure prevents forgetting from committing. The migration transactionally
backfills every retained tombstone. The existing forget_user function, locks and
owner/manager protections are unchanged. Old writers using it also enqueue after
the migration, closing the crash window during a rolling runtime update.

The worker/request claims one due row with FOR UPDATE SKIP LOCKED, records a fresh
60-second lease and attempt timestamp, then **commits before provider I/O**. Completion
deletes only the row matching that token. Failure updates only that token and schedules
another attempt. Stale workers cannot overwrite or delete a replacement claim. After
interruption, the lease expires and another worker can claim. If real Auth deletion
cascades the profile/job before acknowledgement, zero-row completion is safe.

Provider calls retain five-second I/O timeouts, ten-second overall deadlines, at most
two calls per claim, bounded pools, no redirect forwarding and no proxy-environment
trust. The request selects Auth API version 2024-01-01. Only 200/204 or a 404 carrying
code/error_code `user_not_found` confirms completion. Generic proxy/route 404,
redirects, 202 and malformed bodies remain pending. 401/403 are `permission`;
unexpected non-transient statuses are `configuration`; timeouts/network/408/429/5xx
are `provider_unavailable`. Neither response bodies nor exception details are logged.

Transient backoff persists: 30, 60, 120, 240, 480, 960, 1920, then at most 3600 seconds.
Configuration/permission failures stay pending with a one-hour retry. There is no
terminal discard or age-based deletion. Counters saturate safely and arithmetic stays
bounded. Each worker processes at most ten due jobs, then sleeps five seconds; errors
also sleep before another pass. Failed jobs move behind other due work, and live
leases/locks do not block another account.

The route derives the UUID only from the verified JWT and validates key configuration
before forgetting. It attempts only the caller's due work. It returns 204 after confirmed
completion or when no pending row remains (already completed, concurrent completion,
or actual Auth cascade); otherwise it returns `202 {"status":"pending"}`. Repeating
DELETE cannot bypass backoff or another worker's lease. A crash/DB error can still yield
an unconfirmed 5xx after commit, but durable work now drives completion independently.

Memberships disappear and personal profile fields clear before external I/O. GET/PATCH
and rejoin stay forbidden. Recovery never clears deleted_at, restores memberships,
recreates a profile or changes research records. Only real Auth hard deletion cascades
the profile. If a confirmed remote absence leaves a local synthetic/development
profile, its tombstone continues revoking access after completed retry metadata is removed.

## Exact runtime and permission requirements

Use the existing API entry point from backend/, with the normal approved configuration:

```sh
uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src --port 8000
```

This documents the command; it was not run against configured services here. No new
cron or general workflow platform is needed. create_app's real lifespan checks schema
availability and starts reconciliation in its existing AnyIO task group. Shutdown
cancels work and disposes the engine.

Keep **at least one API process running** with the correct database/issuer pairing and
runtime-managed Auth Admin key file. Every configured replica can run safely. Restart
resumes due work. Downtime, suspended services or database unavailability delay external
completion while work remains durable. A configured but unavailable/invalid key file
records a pending configuration failure. With no key setting, startup logs recovery
disabled and new HTTP deletion returns 503 before forgetting; operators must restore
the configured runtime for any old pending work.

The migration grants trusted `fieldmaps_api` SELECT/DELETE and column-limited UPDATE
on recovery metadata. There is no INSERT or identity/UUID UPDATE grant: enqueue is
trigger-only. RLS is enabled; PUBLIC, anon, authenticated and service_role have no table
access. The private trigger function has empty search_path and no public/runtime
callable EXECUTE grant. It runs as its migration owner for that trigger only. Runtime
remains non-superuser without BYPASSRLS, as startup already enforces. Scanning needs no
user JWT. Credentials are read at attempt time and never persisted.

## Operator detection and safe retry

Assign an operator and response deadline before enabling reliable deletion on a target.
Use an explicitly authorized SQL connection with private-table read permission; expose
no browser endpoint. Verify database/issuer pairing and assessment scope first:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT user_id, requested_at, attempts, last_attempt_at, last_error,
       next_attempt_at, lease_until, now() - requested_at AS pending_age
FROM fieldmaps_private.account_deletions
ORDER BY next_attempt_at, user_id;
ROLLBACK;
```

Investigate pending age over 24 hours, every permission/configuration failure, repeated
provider_unavailable, overdue due times and expired leases unclaimed for several polls.
Check `account_deletion_recovery_configured enabled=True`,
`account_deletion_retry ... code=...`, completion events and
`account_deletion_worker_unavailable`. Existing sanitized pending Sentry events remain.
A crash can miss logs; SQL state is authoritative. External alert routing/ownership is
a target operational requirement, not provisioned by this change.

For configuration/permission failures, verify the approved issuer/base route, target
pairing and managed key permissions/injection. Never put credentials in SQL, jobs,
reports or logs. Repair the cause; the worker rereads the key on later attempts.
Waiting for the due time is safe. After separately authorized repair, an operator may
expedite one explicitly selected user without clearing an active lease:

```sql
BEGIN;
UPDATE fieldmaps_private.account_deletions
SET next_attempt_at = now()
WHERE user_id = 'EXPLICITLY_SELECTED_USER_UUID'::uuid
  AND (lease_until IS NULL OR lease_until <= now())
RETURNING user_id, next_attempt_at, last_error;
COMMIT;
```

Use bound parameters in automation. Zero rows means missing/completed or leased;
inspect instead of forcing it. Do not clear lease tokens, reset counters, alter
requested_at, insert another account, delete pending jobs, remove tombstones or rely
on an end-user session for recovery. Restore an approved configured API if all workers
are down; changing due time cannot run the mechanism by itself.

## Locally executed failure/preservation evidence

[Focused acceptance](evidence/focused.txt): **43 passed in 36.30 seconds**, two existing
dependency warnings. It executes real create_app ASGI lifespan/startup/shutdown and
actual disposable transactions; only the Auth/key boundary is mocked. Cases cover:

- Success with simulated Auth-table cascade; an actual historical observation/package
  snapshot stays byte-identical and manager read/export still works.
- Outage → durable 202/backoff, immediate access revocation, restart honoring due time,
  later startup completion without a user request, and duplicate runs/restarts.
- Interruption after forgetting commits but before the provider call; new application
  startup completes the stored work.
- Provider effect with both bounded acknowledgements lost; later confirmed absence
  completes safely.
- Concurrent claims, stale-token failure/completion fencing, expiry/recovery, and actual
  application shutdown cancelling in-flight provider work followed by restart recovery.
- Configuration, permission and unconfirmed 404 remaining pending; healthy accounts
  proceed past a failing one.
- Another UUID in the body cannot retarget deletion. Sole-owner/last-manager and
  invalid-key/configuration protections remain.

Interruption tests use fault injection and real shutdown/new-instance restart, not an
OS SIGKILL or real Auth service. Synthetic SQL clock advancement makes work/leases due
without long sleeps; tests first prove backoff blocks early retry. Initial development
failures exposed a test formatting mistake: concat(boolean) emits t/f while assertions
used true/false. The test now explicitly casts booleans to text; no production outcome
or data-preservation rule was relaxed.

[Forward rehearsal](evidence/forward.txt): **1 passed in 8.04 seconds**. It loads the
authentic four pre-recovery migration blobs from b93a2b2 into a fresh DB, seeds an old
tombstone and real historical form/package/observation, then applies only the new
migration transactionally. Research/package/profile/membership and existing application
column-grant snapshots remain equal. It verifies backfill, new old-runtime forgetting
enqueue and completion through real startup. [Reproduction](reproduce-forward.sh) and
retained before/after snapshots are included. Direct SQL does not verify Supabase CLI
or hosted migration-ledger orchestration.

The [combined acceptance](evidence/combined.txt) passed **235 tests, 12 existing warnings
in 227.29 seconds**, once after focused development checks. It includes the recovery
cases and retained canonical author/review/publish/package/upload/lost-ack/read/export/
QGIS workflow, observer restrictions and reviewer access, stale preconditions, numeric
validation/nested answer IDs, fields-only and inverted-bound history, delayed uploads,
independent fingerprint goldens and real archive corruption/deadline checks.

Additional checks newly executed here: **84 database-free cases passed in 0.22 seconds**
with database selectors unset and a verification audit hook denying private config,
TCP and Docker; backend and cross-directory migration-test typing both report **0
errors/warnings/notes**. Scoped Ruff and formatting pass. OpenAPI was regenerated into
scratch and byte-compared, unchanged; generated clients/contracts stay byte-identical.
The API schema and existing pending response shape did not change.

The [full SQL acceptance](evidence/sql.txt) applies actual current migrations and seeds
in a different fresh container. Atomic enqueue/rollback, trigger-only grants, RLS,
local hosted-assertion-script checks, coordinate/digest and publication/CAS/retry races
pass. The script's name does not imply hosted access. Earlier reports are historical,
not newly executed checks. Full mobile/web, pinned Supabase and physical-device suites
were not rerun for this backend recovery change.

All DB acceptance uses cached `decamark-cleanup-tests:local`: PostgreSQL 17/PostGIS 3.5
plus pg_cron and synthetic Auth tables, **not pinned full Supabase Auth/Storage**. No
real provider was contacted. TLS, real Auth deletion/FK timing, host credentials/network
permissions, deployment shutdown behavior and target alerts still need authorized
staging/hosted acceptance.

## Migration, release and rollback ordering

1. Select/authorize the target and review its actual schema/ledger. Retain baseline,
   outbox, observer-policy/form-revision migrations and both compatibility readers.
   Do not reapply initialization, reset data or rewrite migration history.
2. Apply **20261018030756_account_deletion_recovery.sql transactionally** after
   20261017050453_form_draft_revisions.sql through the normal approved workflow. It
   backfills tombstones and closes the crash window for older writers. No historical
   research conversion is needed.
3. Release the combined compatible API; drain old handlers. Supply approved runtime
   configuration and keep a configured worker-enabled process alive. A configured new
   API fails startup when recovery schema is missing. Older APIs briefly coexist after
   migration and enqueue, but their requests do not honor the new persistent backoff;
   drain them before claiming that behavior everywhere.
4. Verify enabled startup, restricted grants, backlog/failure visibility and monitor
   ownership. With authorized synthetic target accounts, exercise failure/restart/
   completion, 204 versus 202, local revocation and preserved research/export attribution.
   No web/mobile contract change is required; existing pending/error handling remains.
5. Complete the separate target/device inventory and owner decisions for unsatisfiable
   observation queues. No queue deletion, rebinding, reset or historical rewrite is
   part of account recovery.

Local forgetting and external hard deletion are irreversible. Application rollback
does not restore memberships/profile data/Auth users. Keep schema/trigger/pending jobs
intact: old APIs still enqueue, but rolling back every current worker reopens the
recovery gap. Keep a compatible worker or separately approve a restriction preventing
new forgetting while retaining pending work. Dropping the schema, deleting jobs or
restoring tombstones is not a rollback procedure. If a durable row survives a lost
acknowledgement, retry to confirmed absence safely completes it.
