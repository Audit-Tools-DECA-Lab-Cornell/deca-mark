# Recovery activation observed — October 20, 2026

**The approved API release is live and deletion reconciliation is configured and
enabled.** The operator completed deployment; no additional deploy was necessary
or triggered by the assistant. This establishes enabled startup and health, not
real-provider deletion acceptance or audit closure.

Times below use America/New_York (EDT). [Read-only evidence](evidence.json) retains
UTC timestamps. This supersedes the pending activation status in the
[October 18 proposal](../deletion-recovery-enablement-2026-10-18/README.md), while
preserving its approval, earlier disabled-startup and operator-prerequisite evidence.

## Newly verified

- Render **Decamark**, `srv-dapctm7f3r2c73c9mi50`, is live on explicitly approved
  **0279fd38f732eb3167fb174b9c2c19e177c273b1**. Deployment
  **dep-dbbun21srm7s73d74ahg** finished at **18:31:08 EDT**.
- That deployment's new instance `srv-dapctm7f3r2c73c9mi50-dhfpk` reports
  **`account_deletion_recovery_configured enabled=True`** at **18:31:02 EDT**.
  Two preceding October 20 startup records also reported enabled. An earlier
  manual configuration deployment failed; subsequent deployments, including the
  currently live one, succeeded. The failed attempt is not counted as acceptance.
- The user's screenshot shows the approved `DECAMARK_CONFIG` path and all three
  expected filenames: `database-password`, `decamark-runtime.json`,
  `supabase-secret-key`. Contents stayed hidden and were not read.
- `/health` and `/ready` return **200**. Hosted OpenAPI returns **200** and equals
  the unchanged checked-in contract as a JSON object.
- Read-only SQL at **18:31:45–18:31:49 EDT** confirms recovery migration recorded,
  RLS/atomic enqueue trigger and restricted non-superuser/no-BYPASSRLS API role.
  Runtime has SELECT/DELETE and UPDATE on only the six recovery metadata columns;
  no INSERT, identity/request-time UPDATE or enqueue-function EXECUTE. Public
  application roles and service_role have no recovery-table/function privileges.
- The corrected observation policy and revision-conditional publication entry point
  remain present; the unconditional publication function remains absent.
- Pending deletion jobs and retained tombstones are **zero** at that sample.
  The latest deployment's app error/critical scan returned no rows for
  **18:30:32–18:31:50 EDT**. This short window is not an all-time error-free claim.

## Remaining configuration and acceptance

**PR previews still report Automatic.** Set this existing service's
**Previews → Pull Request Previews → Manual**, as already approved. Render previews
inherit base-service configuration; no production-connected preview should receive
the Admin credential or become a fault-test target. The connected tools cannot change
this setting. The documentation PR retains `[skip preview]`, its commit skip phrase
and the existing Vercel branch guards; do not merge it automatically.

With zero pending jobs, the worker has not demonstrated a credential read or actual
Auth Admin operation in this verification. Enabled startup does not validate the key's
contents, file readability at attempt time, project permission, provider absence
response or lost-success acknowledgement. No key was read and no real account was
deleted. Use the [prepared acceptance plan](../deletion-recovery-enablement-2026-10-18/provider-acceptance.md)
after explicit disposable account/project authorization. Inject failures/restart
faults only in an isolated test environment; never disrupt production Auth.

Keep monitoring ownership explicitly **unassigned to a named deployment/Auth operator**,
device census **unassigned to a named collection lead**, and unsatisfiable-queue
decisions **unassigned to a named research/data owner**. The prior server inventory
does not establish a complete device/offline-queue census or zero unsatisfiable records.
Both compatibility readers, immutable history and queued bodies remain unchanged.

**Audit disposition:** hosted recovery configuration/startup gate is now verified;
preview isolation, real-provider acceptance, monitoring ownership, device accounting
and retention decisions remain open. Reuse the existing code/CI acceptance rather
than repeating expensive suites for this documentation-only evidence update.
