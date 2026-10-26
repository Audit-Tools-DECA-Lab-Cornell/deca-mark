# Approved activation — operator prerequisites pending

October 18, 2026, **19:29 EDT** (America/New_York).

The user approved the exact production enablement proposal with **“Approved!”**.
That approval persists; no additional approval of the same configuration is needed.
It covers the existing service's Manual PR-preview setting, the two named files,
the one configuration selector and approved build deployment. It does not provide
a disposable-account UUID allowlist or authorize production Auth failure injection.

## Newly rechecked after approval

- Local HEAD remains `b25c0d314d5a51ba41924994fb55e344b4f3902d`, clean before
  this evidence update, on protected review branch `review/account-deletion-recovery`.
- Render still serves approved `7264f8408683de549dc66bf7572a5e69e69a8246`,
  deployment `dep-dbajjb8jgiss739hjmvg`; no new deploy is listed.
- Service metadata still reports **automatic PR previews**. Therefore the required
  Manual-preview prerequisite has not yet been demonstrated.
- Current startup search returns the existing `enabled=False` records, with no new
  enabled startup. `/health` and `/ready` each return **200**. These are checks of
  the still-disabled deployment, not post-activation success.
- Read-only SQL at **19:29:13 EDT** reconfirms recovery migration recorded, RLS,
  non-superuser/no-BYPASSRLS runtime, expected SELECT/DELETE, denied INSERT,
  denied identity UPDATE and denied enqueue EXECUTE. Pending jobs and retained
  tombstones both remain **zero**.
- [CI 39169759920](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/39169759920)
  for `b25c0d3` completed successfully: all six jobs, including full backend recovery
  acceptance and forward migration. No suite was started again by this assessment.
  Existing real-provider/device limitations still apply.

## Remaining operator steps; never send credential contents

Connected Render tools can merge `DECAMARK_CONFIG` and request a deploy. They cannot
change preview mode or create/list Secret Files; no browser-control tool or local
Render CLI is available. Production approval alone cannot establish that a file
exists. Changing the selector before confirming its file could prevent startup.

On [the existing Decamark service](https://dashboard.render.com/web/srv-dapctm7f3r2c73c9mi50):

1. Set **Previews → Pull Request Previews → Manual**. Keep master auto-deploy and
   all unrelated services/settings unchanged. Do not start a production-connected preview.
2. In **Environment → Secret Files**, privately confirm/install:
   - `supabase-secret-key`: the approved Auth Admin credential for project
     `lezmqhuucfwqknspgcdy`. Do not paste it into chat, commit it or screenshot it.
   - `decamark-runtime.json`: the exact [public proposed JSON](decamark-runtime.proposed.json).
     It includes the credential path, not its value. Preserve the existing
     `database-password` file.
3. Saving files starts a deployment. Wait for it to finish and verify the source
   is an approved SHA from the proposal. Confirm both runtime files are readable
   by the API user (UID/GID 10001:10001); report only names/status, not contents.
4. Confirm **Manual previews and both files ready**. The agent can then merge only
   `DECAMARK_CONFIG=/etc/secrets/decamark-runtime.json` and activate the approved
   configuration without requesting the same production approval again.

Until confirmation, no environment mutation or redeploy has been attempted. Once
ready, refresh the preactivation backlog/source check, deploy, and verify the **new
instance's** enabled log, health/readiness, full restricted grants and backlog using
the already approved sequence. Do not claim key/provider acceptance from the enabled
flag alone.

Deletion-backlog alerts remain assigned to **no named deployment/Auth operator**;
the offline-device census to **no named collection lead**; unsatisfiable queues to
**no named research/data owner**. Both historical readers, queued bodies and records
are unchanged. The original audit remains open.
