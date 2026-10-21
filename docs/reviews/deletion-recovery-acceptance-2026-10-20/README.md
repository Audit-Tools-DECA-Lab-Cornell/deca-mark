# Deletion recovery acceptance — October 20, 2026

**The deployed healthy deletion and isolated failure/restart acceptance passed.**
One new hosted disposable account was created and deleted under the user's explicit
authorization. No production fault, restart, configuration change or redeployment
was performed. The original audit remains open for operational ownership and
device/queue accounting; the server inventory cannot establish offline queue state.

Times use America/New_York (EDT); machine evidence preserves UTC. Initial checkout:
`89a7ca75e06ab1e2b122488ce7277380a269b3bd`, clean worktree, branch
`review/account-deletion-recovery`. Application/migration/client source stayed
unchanged. Both compatibility readers and the earlier audit fixes remain intact.

## Actual hosted provider acceptance

Target: existing Render **Decamark**, API `https://field-maps.onrender.com`, Supabase
project **lezmqhuucfwqknspgcdy**. Live deployment **dep-dbbun21srm7s73d74ahg** runs
**0279fd38f732eb3167fb174b9c2c19e177c273b1**, with the same application tree as the
previously tested `1dee69e`. Reuse the [enabled-startup, migration and restricted-grant
checks](../deletion-recovery-activation-2026-10-20/README.md); no schema or grants changed.

The only hosted account created/deleted was
**5bee300b-7ded-48ec-99ac-403908a82d1a**. Transactional administrative SQL provisioned
only its synthetic, email-confirmed `auth.users` row and matching email identity.
An ordinary password grant then obtained a **real Supabase-issued session**; its
subject and `/auth/v1/user` matched that UUID. This is administrative test-user
provisioning, **not signup/email-delivery or confirmation-hook acceptance**. No
existing Admin key, password, session, secret file or environment file was read.
The new password and session remained transient and are absent from evidence.

| Check | Observed result |
| --- | --- |
| Real password login and Auth user read | 200; verified subject/UUID |
| Own API bootstrap/profile update | GET/PATCH 200; one Training membership, no organization membership |
| Own account deletion, issued once | **204**, at **20:25:49 EDT**, request `cd03172a-da0a-4ac5-be5e-38c34340d3e5`; Render access log confirms 616 ms |
| Old token after deletion | Own GET and PATCH both **403 account_deleted** |
| Subsequent password login | **400 invalid_credentials** |
| Read-only account check at 20:26:22 EDT | Auth user absent; identities, sessions, profiles, memberships and recovery jobs all zero for that UUID |
| Whole deletion backlog | **0** at the same sample |
| Preservation | All **72 observations**, all form definitions, package metadata and all three actual archive hashes unchanged; other account IDs, profiles and project memberships unchanged |
| Public service smoke afterward | Health and readiness both **200**; error/critical scan 20:20:00–20:33:27 EDT returned no rows |

This proves the deployed credential path is readable and its key/issuer/permission
pairing can complete the real Auth operation. Enabled startup alone did not prove
that. The account had **no authored observations**: creating hosted research or other
test users was outside this authorization. Hosted preservation compares existing
records read-only; creator-owned history/read/export preservation is demonstrated
by the earlier disposable acceptance, not a newly executed hosted export scenario.

[Sanitized hosted evidence](hosted-evidence.json) contains before/after fingerprints,
account absence, actual HTTP results and request log. [Read-only snapshot SQL](preservation-readonly.sql)
records the exact comparison inputs. It never selects password/token/credential values.
These whole-row fingerprints establish equality, not independent scientific validation
of the underlying records. Provider audit-log retention is outside account absence checks.

## Actual Auth HTTP failure/restart acceptance, isolated

The [reproduction](isolated_auth_http.py) starts a fresh PostgreSQL/PostGIS + pg_cron
container and **GoTrue v2.197.0**, on a Docker **internal** network. Database/Auth
publish no host ports; the test API and fault gateway bind loopback. It applies the
five repository migrations and public synthetic seeds only to that new database.
All test-generated credentials stay in memory/container configuration; no deployed
configuration is loaded. All owned containers/network are removed afterward.

The normal production app factory, uvicorn processes, lifecycle worker, restricted
database role, transactions and Auth HTTP client execute. The isolated gateway
forwards Admin HTTP only to the disposable GoTrue instance. Test API JWTs use the
existing RSA test-signer convention with the production verifier; local gateway
translation supplies a disposable service-role JWT to raw GoTrue. **This gateway is
a test boundary, not a new application component.** Hosted genuine-JWT/key injection
was verified separately above.

| Case | Newly executed result |
| --- | --- |
| Actual HTTP outage, API kill/restart, later worker recovery | Gateway returns 503 twice; API returns **202 pending**, local GET/PATCH 403, Auth user remains and durable job records `provider_unavailable`. SIGKILL/new process preserves backoff. After the actual 30-second delay, the worker calls restored Auth and completes without another user request. No database clock manipulation. |
| Kill after local commit, before provider call | An isolated router hook pauses exactly at the post-commit reconciliation boundary. SQL sees an unleased pending job with zero attempts. Real **SIGKILL** interrupts the request; normal new app startup removes the Auth user/job without another user request. |
| Auth succeeds, provider acknowledgement lost | Actual GoTrue deletes the synthetic user (200); the gateway drops that acknowledgement. The bounded retry receives actual **404 user_not_found**, and API returns **204**. Restart/duplicate execution leaves the user absent and performs no extra work. Actual FK cascade removes the local profile/job on the first successful deletion. |

All three cases pass; all three **local** synthetic users and all recovery jobs are
absent afterward. Seeded research/form/package snapshot is unchanged.
[Machine results](isolated-auth-http.json) identify images, migrations and assertions.
The final script was executed again after moving/formatting it to verify reproduction
from this committed path. Earlier bootstrap-only attempts exposed internal-network
port publishing and GoTrue `auth` search-path requirements; they were corrected in
the disposable harness before any fault case passed. They were not production failures.

The database is the cached alternate **PostgreSQL 17.5/PostGIS 3.5.2 + pg_cron**
image, not the pinned full Supabase DB/Storage stack or hosted-version parity. Auth
is the actual public GoTrue image (`v2.197.0`, registry digest
`sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`).
Reuse [prior CI](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/39159850774)
for the unchanged full backend/forward/contract/client regressions and earlier
disposable lease-expiry, stale-worker, concurrency, permission/configuration and
creator-history cases. Those suites were **not rerun or relabeled as new hosted tests**.

To repeat locally after inspecting the script, use repository Python tooling and
Docker with the cached `decamark-cleanup-tests:local` image (PostGIS 17 + pg_cron):

```sh
docker pull supabase/gotrue:v2.197.0
backend/.venv/bin/python docs/reviews/deletion-recovery-acceptance-2026-10-20/isolated_auth_http.py \
  --output work/isolated-auth-http.json
```

The alternate DB build is documented in the [earlier image definition](../form-revisions-2026-10-16/Dockerfile.tests).
The CA mount there is the build trust bundle, not application credentials. The
reproduction never resets/reuses an existing database or calls production Auth.

## Preview setting and remaining assignments

**Confirmed: Render PR previews are still Automatic**, not Manual. The service
listing including previews shows only the production DECA service, with no active
DECA preview. PR #31 retains `[skip preview]`, its commits retain `[skip render]`,
and both Vercel configs disable this branch. Connected tools cannot change Render's
preview mode; no deployment is needed for the acceptance results.

Only these assignments/decisions require the user's input:

- **Name the deployment/Auth operator and backup**, alert destination and response
  deadline. That owner must also finish the already approved Render **Previews →
  Pull Request Previews → Manual** setting and verify it. Maintain pending-age,
  overdue/expired-lease, worker-disabled and permission/configuration alerts using
  the [existing operational runbook](../account-deletion-recovery-2026-10-17/rollout.md).
- **Name the collection lead** and authorize/co-ordinate read-only census of active,
  offline, retired and unavailable devices: build/schema, exact installed package/
  form IDs, queue bodies and fingerprints, receipt/replay state and custody. A server
  count cannot establish this. Physical-device end-to-end evidence belongs in that census.
- **Name the research/data owner** to decide custody, retention and any later
  correction/recollection protocol for each unsatisfiable queued observation found.
  Affected device UUIDs/counts remain unknown pending census; zero is not established.
  Do not discard, rewrite or rebind records. A canonical successor supports future
  collection; it does not repair an old queue. Keep both historical readers.

**Disposition:** recovery activation and the scoped hosted/isolated acceptance are
verified. No code repair, migration or redeployment was needed. Full audit closure
awaits the above owned preview/monitoring action and device/retention evidence.
