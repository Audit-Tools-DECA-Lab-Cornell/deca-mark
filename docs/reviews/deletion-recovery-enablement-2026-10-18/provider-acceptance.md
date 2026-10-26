# Provider acceptance prepared; account authorization outstanding

No new account creation, deletion, failure injection or infrastructure provisioning
has been performed. Production configuration approval and account-test approval are
separate. Use [the existing recovery runbook](../account-deletion-recovery-2026-10-17/rollout.md),
not a new workflow mechanism. Keep the complete device census and research retention
decisions open.

## Existing evidence and exact coverage gaps

| Evidence | Tied to what artifact | Demonstrated / missing |
| --- | --- | --- |
| [Final PR CI](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/39159850774) | `1dee69e`; whole tree identical to deployed `7264f84` | Six jobs pass; backend 864 plus separate forward-migration case, pinned database image and synthetic Auth boundaries. Does not demonstrate a real Auth Admin endpoint, credential injection or physical collector. Do not repeat this suite just to prepare deployment. |
| [Deployed audit evidence](../deployed-audit-2026-10-18/evidence.json) | Render `dep-dbajjb8jgiss739hjmvg`, Vercel `dpl_CxDyRfmRswwiqQc9obo7azQ1WNEz`, both `7264f84` | Release identity, migration/catalog, healthy public endpoints, server form/package/receipt inventory. Startup is disabled. No provider deletion or restart/failure acceptance. |
| [Current enablement evidence](evidence.json) | Same live Render release | Reconfirms disabled logs and 17:46 EDT zero backlog plus restricted role/grants; validates public JSON locally. No production mutation or secret validation. |
| [Recovery acceptance](../account-deletion-recovery-2026-10-17/rollout.md#locally-executed-failurepreservation-evidence) | Earlier same production implementation | Actual API lifespan/disposable transactions with mocked provider: outage/restart, lost acknowledgement, lease expiry/fencing, duplicate execution and retained research. Not real hosted provider/network acceptance. |
| [Hosted form rollout](../form-revisions-2026-10-16/hosted-rollout.md) | Earlier `4075c5e` | Hosted migration/catalog/public smoke. Does not cover signed-in editing/role tests on `7264f84`. |
| [Android hosted report](../mob29-2026-10-15/device-hosted.md) | October 15 development build 0.2.1/build 1 | Device/project visibility only. Package/offline/retry/readback/export/QGIS story explicitly unfinished; not this release. |
| [Manual/device checklist](../../qa/device-checklist-2026-10.md) | Dated pending checklist | Test instructions, not completed acceptance. No completed device census, current release physical queue exercise or owner-approved unsatisfiable-record disposition supplied. |

No completed release-specific provider or physical-device acceptance record was
found in these deployment records/repository reports. No such record was supplied
by the user. Record later evidence with exact build, target, account scope and time.

## Lane A: real hosted Auth, healthy path only

**Target:** existing API `https://field-maps.onrender.com` and Auth project
`lezmqhuucfwqknspgcdy`, after approved configured startup. No production outage,
forced shutdown, permission sabotage, endpoint rewiring or altered retry timestamps.

Required explicit authorization:

- A named synthetic project UUID and test-account UUID allowlist; permission to
  create the accounts if they do not exist. No current/personal/demo account may
  substitute. Do not infer disposability from a label or historical report.
- An operator-approved synthetic manager/viewer and a disposable observer. The
  account to delete must not be a sole organization owner or last project manager.
- Permission for synthetic membership/observation creation and exactly one own-account
  `DELETE /v1/me` per selected disposable observer. Use approved test sessions/UI;
  never retrieve browser tokens or secret files to manufacture a session.
- Read-only inspection of the allowlisted Auth-user existence, profile/membership,
  selected recovery rows and retained synthetic research/package/receipt metadata.

Execution record, once approved:

1. Record the deployed API SHA/deploy ID, enabled startup, web build, target and
   allowlisted UUIDs. Verify the account's own session identity and lack of real
   queued work. Take a restricted before-snapshot of its synthetic historical
   observation answers/creator, exact form/package/zone metadata/archive digest and
   durable upload hash/receipt. Preserve associated package/form metadata.
2. From that observer's authenticated client issue its own `DELETE /v1/me` once.
   Record status and sanitized response/request ID. **204** means confirmation;
   **202 pending** means not complete. Never report an unexplained 202 as success.
3. Read only the selected UUID's tombstone/job state and Auth-user existence. Verify
   local membership removal/anonymization or actual Auth cascade, continued denied
   application access with old credentials, and eventual provider absence. Do not
   depend on immediate JWT-signature invalidation; application account revocation
   must hold even while an old token remains cryptographically valid.
4. Compare the retained synthetic research/package/receipt snapshot and authorized
   manager/viewer detail/CSV/GeoJSON/codebook metadata. Original creator/form/package/
   zone meaning must remain. Account deletion must not rewrite research records.
5. If a natural transient failure gives 202, observe the durable due/attempt/lease
   state and later worker outcome without further deletion requests. Configuration/
   permission failures remain pending and are actionable. Do not clear jobs, shorten
   retry times, rotate keys or force a production failure to finish this test.
6. Record actual results. Healthy-path success proves that selected key/endpoint/
   permission/cascade behavior, not outage, process-crash or device acceptance.

## Lane B: failure/restart acceptance in isolation only

**Target:** an explicitly approved, fresh disposable local Supabase/PostgreSQL and
actual Auth service (or an already existing truly isolated test target), with
synthetic data, separate test credentials and loopback-bound API. This is not a
request to create a hosted staging environment. A Render PR preview that inherits
the production database/issuer is **not isolated** and must not be used.

The existing disposable backend acceptance mocks the provider. Reuse its completed
lease/backoff/state-machine evidence. Any additional actual-Auth HTTP rehearsal needs
explicit approval of the isolated target, throwaway accounts, temporary proxy/network
fault boundary and process-stop scope. No fault action may reach production Auth,
production sessions or the production database. This isolated setup/harness has not
been provisioned or executed in this task.

Before executing, document the isolated database identity, API/issuer/JWKS URLs,
test-only credential custody and egress isolation. A loopback proxy is not enough if
it forwards Admin calls to production; use the isolated Auth upstream. The provider
client has `trust_env=False`, so setting `HTTP_PROXY` does not inject a failure.
Use an explicitly controlled isolated endpoint/proxy and paired test issuer/JWKS,
not a production issuer rewrite. No generic queue/workflow platform is required.

| Case | Isolated action | Required observation |
| --- | --- | --- |
| Outage → later recovery | Block only the test Auth Admin boundary; commit a selected synthetic deletion, then restore test connectivity | 202/durable job, immediate local denial, persisted backoff, later worker completion without another request. |
| Crash after local commit | Stop only the isolated API after forgetting commits and before provider I/O; restart it | Pending row survives; restarted lifespan claims and completes it. |
| Provider succeeded, acknowledgement lost | Test proxy permits actual isolated Auth deletion but drops its response | Durable pending work retries; explicit confirmed absence completes safely. Dropping only the client-to-API response is a different case. |
| Lease expiry / restart | Stop a claimed test worker; restart after actual expiry or approved synthetic-clock control | Lease expires, fresh token owns recovery, stale token cannot complete/retry over it. |
| Duplicate workers / non-starvation | Two isolated replicas, multiple allowlisted jobs including one failing account | One live claim per job; healthy work proceeds; bounded batches and due times prevent tight loops. |
| Permission/configuration failure | Use an isolated test credential/route intentionally lacking the needed permission | Remains pending with safe failure class/hourly retry; no false completion or response/credential leakage. |
| Preservation | Compare the synthetic snapshots for every case | Research answers, original creator and exact package/form/zone/archive/receipt identities unchanged; account never reactivated. |

Do not repeat already demonstrated pure/mock cases without a changed source or a
specific real-provider boundary question. Record actual-Auth HTTP, mocked provider,
synthetic clocks, OS termination and normal lifespan cancellation distinctly.

## Production boundary and remaining decisions

Enabling the configured worker permits real user-requested pending deletions to
finish; therefore inventory pending rows immediately before activation. Any unexpected
existing UUID requires explicit handling approval. A synthetic account-test allowlist
does not authorize deleting other accounts manually.

Deletion-backlog alerts: **unassigned operator with deployment/Auth access**.
Device/queue census: **unassigned collection lead**. Unsatisfiable queue decisions:
**unassigned research/data owner**. Real/offline queued records must not be cleared,
rewritten, rebound or run through account-removal cleanup for acceptance. Both
historical readers stay. Publishing a successor only helps later collection.
