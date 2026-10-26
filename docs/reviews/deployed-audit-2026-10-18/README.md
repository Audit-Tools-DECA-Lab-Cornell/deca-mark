# Deployed release assessment — October 18, 2026

> **October 20 update:** [Recovery activation verification](../deletion-recovery-activation-2026-10-20/README.md)
> confirms approved `0279fd3` live, enabled startup, healthy endpoints and restricted
> grants. Preview isolation and provider/device/ownership gates remain open; the
> earlier disabled-startup findings below remain historical evidence.

**The audited code is deployed, but the audit cannot close.** Read-only hosted
checks confirm the release, migration ledger, security grants and current server
inventory. The observed API startup explicitly disables account-deletion recovery.
Real-provider recovery acceptance, the physical-device/queue census and named
monitoring/custody owners remain outstanding. An empty backlog is not recovery
acceptance. No production changes or account deletions were made in this assessment.

This updates the [consolidated assessment](../consolidated-audit-2026-10-17/rollout.md).
The subsequent [concrete recovery configuration proposal](../deletion-recovery-enablement-2026-10-18/README.md)
is prepared for explicit production approval; it has not been applied. Its
[short owner/authorization checklist](../deletion-recovery-enablement-2026-10-18/owner-checklist.md)
keeps the user's three ownership roles explicitly unassigned.
Earlier dated reports remain historical evidence. [Machine evidence](evidence.json),
[instrument parser results](forms-summary.json), [preservation hashes](preserved-readers-contracts.json)
and the exact read-only SQL are alongside this report. Times below are October 18
in **America/New_York (EDT, UTC−04:00)**; machine evidence retains UTC timestamps.

## Release and migration identity

| Component | Independently observed state |
| --- | --- |
| API | Render `Decamark`, `srv-dapctm7f3r2c73c9mi50`, deployment `dep-dbajjb8jgiss739hjmvg`, **live**, commit **7264f8408683de549dc66bf7572a5e69e69a8246**; finished 17:28:08 EDT. |
| Web | Vercel `deca-mark`, `prj_PfiR0vGpFniJUhQZi6qoVeLDZE68`, deployment `dpl_CxDyRfmRswwiqQc9obo7azQ1WNEz`, **production READY**, same commit; ready 16:00:00 EDT. `decamark.vercel.app` and the custom domain alias target that deployment. |
| Source | PR #30 is merged. Deployed `7264f84` and tested review HEAD `1dee69edafb8d0e8cd3d850766097b76979a0181` have identical whole-tree SHA **5c91e9c9149c84c760868c5a08efa2d29b7c9b5d**. `git diff HEAD origin/master` is empty. |
| Checkout | Branch `review/account-deletion-recovery`, HEAD `1dee69e`, initially clean. Only documentation/evidence is added here; no branch switch, commit or push. |
| Database | Existing **DECA Mark GIS**, project **lezmqhuucfwqknspgcdy**. SQL used `postgres` with BYPASSRLS, inside explicit `BEGIN READ ONLY`/timeouts/`ROLLBACK`, so the application-schema inventory is not observer-scoped. |

Supabase's migration ledger lists all five expected entries, in order:

1. `20261012120000_current_baseline`
2. `20261012142629_transactional_email_outbox`
3. `20261017000657_observation_creator_visibility`
4. `20261017050453_form_draft_revisions`
5. `20261018030756_account_deletion_recovery`

The separate application ledger contains `0001_current_baseline` and
`20261018030756`, consistent with which migrations write that ledger. Do not repair
it into a duplicate of Supabase's ledger. Catalog inspection confirms the actual
ownership policy, revision column/conditional publication function and recovery
table/trigger/grants, rather than relying solely on migration names.
The ledger inspection does not establish the wall-clock migration/deployment order.
No migration was applied or reapplied by this assessment.

## Health, errors, recovery and grants

- Public API `/health` and `/ready`: **200**, `running`/`ready`. Web homepage: **200**.
  These are availability checks, not a signed-in workflow or worker-readiness proof.
- Hosted OpenAPI equals `contracts/openapi.json` as a JSON object; advertised version
  is the unchanged `0.1.0`, so the deployed Git SHA identifies the release more precisely.
  An unauthenticated forms GET returns **401**. Browser preflight from the production
  web origin returns **200** and permits `if-match`, authorization and content-type.
- Render now reports plan `0.5c-512mb`, one configured instance, not its earlier free
  plan. Instance metrics report one after the deployment transition. This is a point
  sample, not an uptime guarantee or proof of configured reconciliation.
- **Recovery startup logs at 17:27:28 and 17:27:58 explicitly say
  `account_deletion_recovery_configured enabled=False`.** The latter instance is the
  one with continuing resource samples in the inspected window. No enabled startup
  or provider completion was demonstrated. The bundled public `config.render.json`
  lacks `auth_admin_key_file`; effective runtime settings/secrets were not read.
  Source starts reconciliation only when issuer and that path are configured. With
  missing configuration, source returns 503 before local forgetting; that authenticated
  deletion response was not exercised on this target.
- At **17:31 EDT**, pending deletion rows, due/unleased work, active/expired leases,
  permission/configuration failures and retained tombstones are all **zero**.
  This establishes no current backlog at that instant, not successful provider deletion.
- Restricted `fieldmaps_api` is non-superuser and has no BYPASSRLS. Recovery-table RLS
  and the enabled tombstone trigger are present. The role has SELECT/DELETE and UPDATE
  only on the six recovery metadata columns; no INSERT, identity/request-time UPDATE,
  or callable enqueue-function privilege. `anon`, `authenticated` and `service_role`
  have none of those table/function privileges. The trigger function has an empty
  search path and SECURITY DEFINER, as designed. Catalog checks are not an actual
  hosted claim/expiry/restart test.
- Render's inspected app error/critical scan and request-5xx log search return no rows
  for **17:27:37–17:33:30 EDT**. Metrics nevertheless contain **one 503 in the
  17:28:08 transition bucket**, and two 404 counts across the first two buckets;
  later supplied 503 buckets are zero. Request detail was not returned to attribute
  the transition 503. It is not silently classified as an application success.
- Vercel's completed-release log window exceeded Hobby retention. A successful
  **recent 30-minute** error/fatal/warning query returned no groups. Earlier web
  runtime errors cannot be excluded using that retained window.
- Supabase **17:27–17:34 EDT** aggregation shows one Auth info/200 and ten edge/200
  entries. Postgres includes one **42703** error; this assessment's initial read-only
  preflight used `p.id` instead of `p.user_id` and received that error. The corrected
  query passed. No writes occurred. Log counts are not acceptance of Auth deletion.
- Security advisors retain the previously documented [metadata-table RLS/no-policy
  information](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  and [disabled leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  They are existing operational findings, not new recovery-table exposure; Auth
  hardening remains with OPS-13's owner.

## Finding-by-finding disposition

| Finding | Status on this release | Evidence and remaining action/owner |
| --- | --- | --- |
| Observer ownership and review/export authorization | **Fixed in deployed source/schema; hosted role acceptance incomplete** | Live `assigned_observations` retains immutable creator ownership, active membership, research reviewer access and Training isolation. `services/observation_exports.py` retains the reviewer requirement. Reused CI includes `test_observation_authorization.py` and the canonical workflow. QA/release owner must supply authenticated observer/viewer/manager acceptance for this release; a public 401 does not substitute. |
| Current exports rejected by QGIS | **Fixed in deployed source; hosted export/desktop acceptance incomplete** | Production `qgis/zone-boundaries/prepare.py` and consumers match the verified tree. The canonical workflow and retained Inventory-bound `test_gis09_api.py` scenario execute signed CSV/GeoJSON through that CLI in disposable acceptance. The missing/duplicate Inventory-fixture discrepancy was resolved, not skipped. GIS/QA owner must supply current hosted export/converter and required Desktop/device evidence. |
| Stale form saves/discards and reviewed publication | **Fixed in deployed source/schema; hosted interaction pending** | Live revision column and three-argument publisher exist; unconditional two-argument publisher is absent. OpenAPI/CORS agree with clients. `test_form_revisions.py`/canonical workflow and web CI verify rejection without mutation. QA owner must demonstrate two editor revisions/reviewed publication using approved target accounts if no existing release-specific record is supplied. |
| Inverted numeric bounds and independent nested answer IDs | **Fixed for authoring; historical interpretation protected** | Strict `FormDefinition` remains distinct from structurally validated `StoredCanonicalDefinition`; `test_published_form_compatibility.py`, consolidated workflow and client checks cover bounds and independent nested IDs. All five target canonical forms pass strict parsing; target bounds inventory has zero hits. Keep the stored reader; do not change immutable definitions or relax upload answers. |
| Obsolete archive/query/test paths | **Justified cleanup complete, protections retained** | `ExtractJob`, Bootstrap/test-only extract and unused queries stay removed; supported `extract_base_archive`, import/publication, safety/resource/deadline/cleanup checks remain. Authored upload cases exercise production models against independent goldens. Reused CI/combined evidence retains regressions. No further removal is needed to close this finding. |
| Fields-only removal regression | **Mitigated by retained reader; removal gate stays open** | Both compatibility readers and eight protected source/contract hashes are unchanged. `test_fields_only_history.py` and `test_stored_form_compatibility.py` retain delayed uploads, receipt replay, decimal/boolean/blank meaning and exports. One target fields-only definition remains. Research/device owners must complete device/custody accounting before any separately approved removal. |
| Account-deletion crash/outage recovery | **Implementation fixed; hosted configuration/acceptance OPEN** | Migration/table/atomic trigger and restricted grants are present. Real-lifespan disposable failure/recovery acceptance passes; observed hosted startup disables the worker. Deployment operator must configure approved Auth Admin key-file/issuer pairing, then obtain explicit disposable-account/fault-test authorization and demonstrate target recovery. Do not close this from zero pending rows. |

## Target historical-form/package/receipt inventory

The reviewed [historical inventory SQL](historical-inventory.sql) incorporates the
repository's two existing inventory SELECTs unchanged, under read-only transaction
guards. [Package/receipt SQL](package-references.sql) checks references and actual
archive digests. Results cover the target at **17:31–17:33 EDT**, across all tenants:

- **Six published versions**, no inverted numeric-bound hits or unrecognized stored
  formats. All six pass the deployed production stored parser locally using the
  exact selected definitions; all five canonical definitions also pass strict authoring.
  This is interpretation of read-only target definitions, not a hosted authoring write.
- Fields-only **`shell-v1`**, UUID **10000000-0000-4000-8000-000000000004**, has
  **zero observations, packages and dependent drafts**. Its original fields retain
  required integer `people` 0–999 and optional `notes` length 1000. No conversion was made.
- The three retained server packages all bind canonical `janet-test-v1`
  (`ccc1d17a-ce0e-55ca-9023-0ef2725ea8e2`) and `janet-inventory-v1`
  (`48451e7d-bbe1-515a-993a-7ae6765fa376`). Thus **no retained server package is
  identified as affected by either historical-format issue**. Device copies are separate.

| Package UUID | Version/current | Stored observations | Archive SHA-256 |
| --- | --- | --- | --- |
| `52a18aa1-5d4b-4919-9e34-5167542a1b24` | 2/current | 0 | `844218ade3cb62298bf59a6a4e4d8739a74224035a8daf85919a6f9b79632db6` |
| `5ecc1e2d-a329-5c78-9d13-ae3e05761ee1` | 1/superseded | 12 | `fb99a1b7947543dbe871d3bde30394abb8e6bec116f30b041f3bd11924f90815` |
| `a7c42ed9-fe70-56d0-a2b1-bd9cf4485be4` | 1/current | 60 | `8320ba30fb24010d9f735071f0952416d2e8185aadf53a0a99cd710737c03e9a` |

All three archive byte hashes match their recorded digests. All **72** observation
rows have a syntactically valid original upload hash and resolve their exact form,
package and package/zone snapshot. The observation row snapshot SHA-256 is
`f92bcd13d88d0e5d7b5336341edc63833ab936ac1643322a5ee0b1860e49944e`.
This is a current read-only baseline; there is no matching pre-deployment target
snapshot here to prove before/after equality or recompute every original wire-body
fingerprint. Retry semantics are covered by the unchanged local/CI regressions.

**No unsatisfiable queued observation UUID has been established. Their number is
unknown, not zero.** No central device/queue table exists in the application schemas.
Server observations are accepted receipt-bearing rows, not a census of unsent,
needs-attention or accepted-but-unacknowledged device work. The three server
packages do not enumerate every device download or an old/offline package copy.
Use [the device inventory procedure](device-inventory.md); access to actual devices,
consistent read-only copies and their custodians has not been supplied.

Full instrument definitions were used only in ignored, permission-restricted
`work/release-verification/private/forms.json`; they are not copied into this report
or tracked evidence. Stored form IDs, format/results and definition hashes are in
`forms-summary.json`. Keep raw device/answer material in approved restricted custody.

## Acceptance evidence reused and missing

**No expensive suite was repeated.** The deployed tree is identical to final tested
HEAD. [CI 39159850774](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/39159850774)
passed all six jobs: backend, database, contracts, web, mobile and plan. Backend
executed **864 passing cases**, with a separate **one-case forward migration** pass,
using pinned `supabase/postgres:17.6.1.171` and synthetic Auth boundaries. Review
corrections/registry/client prerequisites are recorded in the
[review evidence](../account-deletion-recovery-review-2026-10-18/README.md).

Earlier combined acceptance exercised the complete canonical author/review/publish/
package/upload/lost-ack/reviewer/export/QGIS flow, history/fields-only, bounds/nested
IDs, leases/stale-worker fencing/backoff, crash/restart and supported archive failures.
See the [recovery runbook and evidence](../account-deletion-recovery-2026-10-17/rollout.md).
Its smaller PostgreSQL/PostGIS + pg_cron image limitation remains historical context;
final CI subsequently verified the pinned database image. Neither run exercises real
hosted Auth/Storage, physical collectors, live provider credentials or actual network
faults. Those are not relabeled as newly executed hosted tests.

The available [October 15 Android report](../mob29-2026-10-15/device-hosted.md)
records a Galaxy Tab S5e development build and a visible synthetic project. It explicitly
leaves package publication, offline capture/restart/reconnect, receipts/exports and QGIS
incomplete, and predates this release. The [manual checklist](../../qa/device-checklist-2026-10.md)
and QA-07/MOB-29 also retain pending checks. The earlier
[hosted form-revision rollout](../form-revisions-2026-10-16/hosted-rollout.md)
demonstrates older schema/catalog/smoke checks, not this release's signed-in interaction.
No additional completed release-specific hosted/device acceptance was supplied.

## Remaining owners, authorization and closure requirements

| Required action | Owner and exact missing access/approval | Completion evidence |
| --- | --- | --- |
| Enable reliable deletion on the existing deployment | **Deployment operator, person unassigned.** Separate approval for effective runtime configuration/redeploy: correct existing database/issuer pair, runtime-mounted approved `sb_secret_` Admin credential, and `auth_admin_key_file` pointing to that mount. Do not paste/read the key in chat or evidence. Current read-only authorization does not permit this change. | New configured startup reports `enabled=True`; at least one configured process stays running; old handlers drained. No new environment is required. |
| Real Auth success, outage/restart, lost acknowledgement and grants | **API/Auth acceptance owner, unassigned.** Explicit allowlist of disposable account UUIDs and synthetic project, approval to create/delete only that synthetic scope, and bounded fault/restart scope that does not interrupt other users. Current read-only access is sufficient for catalog/backlog checks, not those mutations. | 204 versus durable 202, immediate local revocation, pending job surviving restart, backoff/claim expiry, confirmed absence after lost success response; unchanged synthetic research/package/receipt/export snapshots. Existing local fault cases need not be rerun. |
| Release-specific role/form/export/GIS flow | **QA/GIS owners, unassigned.** Approved synthetic manager/viewer/observer sessions and scope for any missing publication/collection writes, or existing completed evidence for this exact release. Never obtain tokens from secret files. | Observer own-only/export denial, reviewer access, stale save/discard/publication refusal, exact original receipt on lost-ack replay, signed CSV/GeoJSON through production `prepare.py`, required QGIS readback. |
| Device and unsatisfiable-queue accounting | **Fieldwork coordinator/device custodians and research protocol owner, unassigned.** Full device roster (including offline/retired/unavailable devices), build/schema details, approved consistent copies and package manifests, or an existing complete release-specific census. | Every queue/draft/package accounted for; cross-reference original IDs/digests/receipts without replaying or rewriting. For each genuinely unsatisfiable queue, explicit retained evidence, custody/duration and research disposition. A canonical successor helps future collection only. |
| Monitoring and response | **Named primary/backup operator and alert destination unassigned.** Set an agreed response deadline and approved monitoring access. Render build-failure notification does not cover the private deletion backlog. | Monitor worker-disabled startup, worker-unavailable events, permission/configuration failures immediately, repeated provider failures, overdue jobs/expired leases after several polls, and oldest pending over 24 hours. Use runbook SELECTs and record empty results too. Escalate recurrent 503s; investigate the transition bucket if recurrence or corroborating logs appear. |
| Existing Auth hardening warning | **OPS-13/security owner, unassigned.** Explicitly assess existing leaked-password protection setting separately. | Owner records remediation or justified disposition; no Auth setting changed here. |

Use the existing recovery runbook for migration/runtime order, safe selected-job retry
and irreversible rollback limits. Keep schema, enqueue trigger, pending jobs, conditional
form publication, both compatibility readers and original package/body/fingerprint
semantics. Do not clear queues, reset/upgrade collector storage, rebind observations,
edit historical definitions or restore deleted accounts to manufacture a pass.

**Closure decision: OPEN.** The original code findings are corrected or explicitly
mitigated in the deployed artifact. Closing the original audit still requires the
identified hosted/runtime and device/retention evidence and accountable owners.
Deployment success and passing counts alone do not satisfy those requirements.
