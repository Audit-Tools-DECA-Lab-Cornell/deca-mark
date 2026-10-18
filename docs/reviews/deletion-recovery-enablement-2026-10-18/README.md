# Deletion recovery enablement — production approval required

> **Approval received:** The user subsequently approved this proposal. See
> [activation status and exact remaining operator prerequisites](activation-status.md).
> Activation is not yet applied; the historical preparation record below is retained.

October 18, 2026, America/New_York. **Prepared, not applied.** The user explicitly
requires approval of the concrete production configuration before mutation. This
document is the approval artifact; committing it does not enable recovery.

Target: existing Render **Decamark** (`srv-dapctm7f3r2c73c9mi50`) in **Audit Tools
Workspace** (`tea-da4bmt0n74is738uagpg`), paired with Supabase **DECA Mark GIS**
(`lezmqhuucfwqknspgcdy`). Preserve deployed source
**7264f8408683de549dc66bf7572a5e69e69a8246** and the current Docker entry point.
During pre-push inspection, master advanced through `86d2e59` to
**0279fd38f732eb3167fb174b9c2c19e177c273b1** (Supabase local configuration changes
with no net tree change). That tip, deployed `7264f84` and tested `1dee69e` have
the identical whole-tree SHA **5c91e9c9149c84c760868c5a08efa2d29b7c9b5d**.
Approval may therefore cover either existing `7264f84` build or that exact equivalent
`0279fd3` source for platform-triggered file-install deploys. Any different source
tree requires renewed review; do not blindly deploy a later master tip.
No new staging service, schema migration, application change or Vercel change is
needed for this proposal.

## Why it is disabled; prerequisite inventory

`account_deletion_worker.enabled()` requires both `issuer` and
`auth_admin_key_file` to be non-null. `Settings` is a frozen Pydantic **BaseModel**
read from the JSON named by `DECAMARK_CONFIG`; arbitrary environment names do not
override those JSON fields. Adding an `AUTH_ADMIN_KEY_FILE` environment variable
alone would have no effect.

The bundled public `backend/config.render.json` has the correct target issuer and
JWKS URL but **no `auth_admin_key_file`**. Its parsed worker predicate is false.
The current live release's startup logs also say `enabled=False`. Earlier `/ready`
returned 200, which proves configured JWT verification/JWKS availability, not the
worker key, Admin permission or exact effective configuration-file identity.
The effective `DECAMARK_CONFIG` setting and Secret File inventory are not exposed
by the available read-only management tools; they were not guessed or fetched via
a secret-bearing environment listing.

| Prerequisite | Observed status / required confirmation |
| --- | --- |
| Deployed recovery implementation | **Present**, live `7264f84`; whole tree equals tested PR tip. |
| Matching schema and restricted worker grants | **Present**. Recovery migration, RLS and non-superuser/no-BYPASSRLS runtime reconfirmed at **17:46 EDT**. No runtime INSERT/identity-update/enqueue-execute privilege. The preceding full grant catalog remains in the deployed audit evidence. |
| Existing pending work before activation | **Zero pending and zero retained tombstones at 17:46 EDT**. Rerun `preactivation.sql` immediately before activation; new hits require an explicit inventory/authorization rather than assuming they are disposable. |
| Issuer / JWKS / audience | Public proposal retains `https://lezmqhuucfwqknspgcdy.supabase.co/auth/v1`, its `/.well-known/jwks.json`, and `authenticated`. No change to identity provider. Runtime file selection/pairing must be confirmed through the approved public config, not secret inspection. |
| Admin key-file setting | **Missing from bundled Render config**, so default None disables the worker. Exact proposed addition is below. |
| Actual mounted credential | **Unconfirmed**, not assumed absent. An operator must privately confirm/create the selected file using the correct project's approved Auth Admin `sb_secret_` key; a publishable key or legacy JWT key is rejected. No key was retrieved, generated, read, printed or committed. |
| File readability | **Unconfirmed** for the new mount. API image runs UID/GID **10001:10001**; both mounted config and key must be readable by that user. Existing database-secret success does not prove every new file's mode. Render documents group-1000 permission considerations; if the mount is unreadable, stop and review that specific permission/image change separately. Do not broaden credentials to world-writable or run the API as root. |
| Admin endpoint / real permission / TLS | **Not verified by a JWKS GET or local predicate check**. Successful deletion of an explicitly approved disposable account is required. No real provider request is made as part of preparation. |
| Worker process lifetime | Paid `0.5c-512mb`, one configured instance; retain at least one configured running process. Multi-worker leases already exist; do not add a queue platform. |
| PR-preview inheritance | **Automatic previews are currently on.** Render documents that previews copy base-service settings. No DECA Mark preview service is currently listed. Before adding production Admin configuration, set this service's PR previews to **Manual**, with no manual preview allowed to inherit production DB/Auth credentials. The review PR itself also uses its existing suppression guards. This setting change is included in the approval request. |
| Monitoring / device / retention owners | **Explicitly unassigned by the user.** See `owner-checklist.md`; enablement approval does not assign owners or close these gates. |

## Exact proposed production change

Use the service's existing **Render Secret Files** mechanism, already used by
`database-password`. Do not modify or replace that database file or unrelated
environment settings. This avoids changing the application image and uses its
existing JSON configuration loader.

0. After approval, set **Previews → Pull Request Previews → Manual** on this one
   service and verify no DECA Mark preview is active. Do not turn a production-
   connected preview into a failure-test target. Keep master auto-deploy unchanged.
   This prevents adding a production Admin credential while future PRs automatically
   inherit the base service configuration. It is not a new staging environment.
1. After explicit production approval, a Render/Auth operator privately confirms
   or installs **Secret File `supabase-secret-key`**, mounted at
   `/etc/secrets/supabase-secret-key`. Contents are the approved Auth Admin key for
   this exact Supabase project, with no JSON wrapper. **Never send the value in
   chat, PRs, shell arguments, screenshots, logs or evidence.** If an existing
   file uses a different approved name, revise/reapprove the path in this proposal
   instead of silently overwriting or rotating it.
2. Install **Secret File `decamark-runtime.json`**, mounted at
   `/etc/secrets/decamark-runtime.json`, containing the exact
   [credential-free proposed JSON](decamark-runtime.proposed.json). This file has
   only existing public connection settings and the new credential **path**.
   Do not put the key or database password in that JSON.
3. Merge the one service environment setting:

   ```text
   DECAMARK_CONFIG=/etc/secrets/decamark-runtime.json
   ```

   The only application-setting delta from the bundled JSON is:

   ```diff
   + "auth_admin_key_file": "/etc/secrets/supabase-secret-key"
   ```

4. Apply pending configuration with **Save and deploy** of the existing approved
   build. A plain **Restart service** retains the old user-defined environment and
   is not the documented method for activating newly saved configuration. Capture
   the resulting deploy ID and verify its source is one of the two exact approved,
   tree-identical SHAs above.

Render's current docs say **saving Secret Files itself starts a deploy**. Approval
must cover those file-install deploys too, not just the final environment switch. Stage
both files while the old disabled configuration remains selected, wait for each
required deploy to finish, then switch `DECAMARK_CONFIG`. Never race several deploys
or select a different source tip inadvertently. If the current selector is not the
documented bundled config, or another deployment/source change occurs, stop and
reconcile the non-secret settings before continuing.

The full public proposal was validated using repository Python and production
`Settings`/`enabled`: old predicate false, proposed true; all existing settings
remain equal. No app lifespan, key read or provider call ran. **`enabled=True`
alone does not validate file existence, key syntax or provider permission**, because
the worker reads the credential only when it claims work.

The mounted JSON becomes the approved runtime config source of truth. Future
changes to bundled `config.render.json` must be deliberately reconciled with it;
do not assume an image redeploy updates an external mounted copy. No overlapping
Blueprint/config source is introduced. No `render.yaml` exists in this repository.

## What can be applied with connected tools

Available Render tools can merge the non-secret `DECAMARK_CONFIG` key with
`replace=false` and request a deploy. They **cannot list/create Secret Files or
change the PR-preview setting**, and
no browser-control tool is available. Therefore production approval also needs an
operator to set previews Manual and install/confirm the two file **names and
readability**, without sharing their credential contents. This is a tool capability limit, not a request to export
credentials into another channel.

No call to update environment variables, upload files, deploy, restart or delete
an account has occurred. The application, schema, both historical readers and all
queued bodies stay unchanged.

## Verification after explicit approval and file confirmation

1. Recheck the intended service/build, approved public file content and
   `preactivation.sql`. Verify no unapproved pending UUIDs appeared. Preserve all
   jobs/tombstones; do not clear a backlog to obtain a pass.
2. Activate the config using the approved deployment sequence above; wait for the
   specific resulting deploy to be **live**, not merely queued. Capture its ID,
   source SHA and **new instance's** `account_deletion_recovery_configured enabled=True`.
   Verify older handlers have drained.
3. Check `/health` and `/ready` return 200. Compare the deployed OpenAPI with the
   unchanged contract. Rerun the existing read-only
   [full catalog/grant SELECT](../deployed-audit-2026-10-18/catalog.sql), confirming
   SELECT/DELETE plus only six metadata UPDATE columns, no INSERT/identity/time
   UPDATE/enqueue EXECUTE, and no browser/service-role recovery-table access.
4. Check worker-unavailable/retry logs and read the backlog, including safe failure
   class/attempt/due/lease metadata. An empty backlog confirms no current work;
   the separately authorized real-provider healthy acceptance below must verify
   credential and endpoint behavior. Do not inject failures into production.
5. Append actual results to a new dated verification record. If steps cannot run,
   retain their status as pending. Do not overwrite earlier disabled-startup evidence.

Changing the selector back to the old public config and deploying would disable
reconciliation again; it is not a safe general rollback while work is pending.
Retain schema/trigger/jobs and a compatible configured worker, or obtain a separately
approved restriction on new forgetting. Local forgetting and Auth hard deletion are
irreversible; changing config cannot restore accounts, memberships or research context.

## Review publication and remaining status

Documentation is prepared on existing protected review branch
`review/account-deletion-recovery`. It is an ancestor of merged `7264f84`, so a
new PR against master contains only the documentation delta; PR #30 remains merged.
Live Render tracks `master` On Commit; this branch does not update it. Suppress
Render PR previews with **`[skip preview]` in the new PR title**; previews otherwise
inherit production settings. Both committed Vercel Git guards already disable this
exact branch. Use a `[skip render]` commit message as an additional guard. CI
contains no hosted migration/deploy step. **Do not merge the documentation PR**:
a later master merge can still trigger the hosting integrations.

The user confirmed no completed release-specific hosted/device acceptance records
were supplied and named no owners. Existing evidence and exact coverage gaps are in
[the deployed assessment](../deployed-audit-2026-10-18/README.md),
[provider acceptance plan](provider-acceptance.md) and the short
[owner/authorization checklist](owner-checklist.md). The original audit stays **open**.

Verified public platform references:
[configuration](https://render.com/docs/configure-environment-variables),
[Docker Secret Files](https://render.com/docs/docker-secrets),
[deploy lifecycle](https://render.com/docs/deploys),
[health checks](https://render.com/docs/health-checks),
[preview suppression](https://render.com/docs/service-previews).
