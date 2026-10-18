# CI registry follow-up — October 18, 2026

The first follow-up, `79931a0a94ef7ab57c6e2406d37a28618eec508a`, passed
contracts, web, mobile, database and plan in
[CI run 39136361218](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/39136361218).
Backend static checks passed, but its image-pull step failed before either database
acceptance operation started:

```text
docker pull public.ecr.aws/supabase/postgres:17.6.1.171
Error response from daemon: toomanyrequests: Data limit exceeded
```

This was a registry setup failure, not a failing or skipped acceptance scenario.
The job remains failing evidence for that SHA. The original local results and
source/evidence manifests remain unchanged and identify their earlier verified state.

The backend job now selects `supabase/postgres:17.6.1.171` on Docker Hub using its
existing `DECAMARK_REHEARSAL_IMAGE` override, and pulls that same selection before
both harnesses. The publisher namespace and version stay pinned. The public manifest
was checked successfully with the normal Docker manifest command and retained as
[dockerhub-manifest.json](evidence/dockerhub-manifest.json). The registry selection
supersedes the earlier evidence's ECR choice; no registry credentials were inspected
or added. Other CI jobs and the harness defaults are unchanged.

Only CI configuration and this additive evidence change after `79931a0`. Runtime,
migration, test and compatibility sources still match the 24-file local verification
manifest except its intentionally updated CI entry. Local **53 focused**, **1 fresh-clone
forward**, and **864 complete backend** passes are reused; the registry correction does
not justify repeating those local suites. YAML parsing, exact job-image/command wiring,
unchanged-source hashes and whitespace checks are rerun. GitHub CI must execute the
full backend and forward operations on the final pushed SHA; its actual result is
linked in the PR after completion.

These operations provision no hosted resources and apply no hosted migration. Render's
PR-title suppression and both exact-branch Vercel guards remain. Pinned PostgreSQL with
synthetic Auth tables is still distinct from full Supabase Auth/Storage, real-provider,
hosted and physical-device acceptance. All runbook prerequisites and unresolved
target/device/unsatisfiable-queue owner decisions remain open.
