# Review delivery — October 18, 2026

The subsequent user instruction authorizes a dedicated branch, commit, push and PR.
It does not authorize migration application, merge, provisioning or deployment.
The implementation-stage reports and raw results in this directory remain unchanged.

Base and remote master were both
`b93a2b2456cf5d7dc96cfc2fc3eaf5174bc34f4c`. Review branch:
`review/account-deletion-recovery`, in
`Audit-Tools-DECA-Lab-Cornell/deca-mark` on GitHub.

The actual production/migration diff was reconstructed from that base and compared
byte-for-byte with [the tested patch](production-change.patch). All 31 recorded
artifact hashes and eight protected compatibility/contract hashes match. The nine
changes to pre-existing tracked files are exactly those in [preservation.json](preservation.json).
Earlier authorization, QGIS, revision, numeric/answer validation, fields-only and
stored-canonical compatibility fixes remain in the base; no earlier audit report,
compatibility implementation, contract or generated client changes in this delivery.

The runtime source and tests have not changed since the recorded focused **43**,
combined **235**, forward-migration **1**, and database-free **84** passing cases,
full SQL acceptance, typing, lint and OpenAPI checks. Those results are reused, not
represented as newly executed suites. The alternate PostgreSQL 17/PostGIS 3.5 plus
pg_cron image and synthetic Auth boundary still do not establish pinned Supabase,
real provider or hosted compatibility. See [commands](commands.md) and
[the operational runbook and rollout assessment](rollout.md).

Precommit review scanned the 50 intended changed/new files then present, excluding
all secret/environment files. High-confidence private-key, provider-key, GitHub-token,
JWT, AWS-key and credential-URI patterns found no unexpected material. Fourteen
matches are the deliberately public `sb_secret_synthetic-test-value` test literal.
No dependency directories, caches, local configuration, real keys or generated
contracts are included. Retained SQL output, synthetic snapshots and the patch are
intentional evidence.

The first staged whitespace check identified only raw psql/pytest output and unified
patch context spaces. The three exact artifact paths have scoped `.gitattributes`
whitespace exemptions so their recorded hashes remain valid. Source, migration,
tests, instructions and delivery configuration retain normal checks.

## Preventing deployment during review

The repository's only GitHub Actions workflow runs checks on PRs and on master;
it has no deployment step. Read-only provider metadata confirmed the Render service
`Decamark` tracks master with automatic commits and automatic PR previews enabled.
Vercel's project is `deca-mark`; GitHub deployment metadata confirms previous
non-production branches produced previews. These checks read deployment/service
metadata only, not environment variables or credentials.

For this review:

- The branch is separate from master. Nothing is pushed to the production branch.
- The PR title includes `[skip preview]`, Render's documented suppression for
  automatic service previews and preview environments.
- `vercel.json` and `web/vercel.json` set `git.deploymentEnabled` to false for the
  exact review branch only. Both repository and documented web project-root locations
  are covered; other branches retain their default behavior. These small delivery
  guards add no build commands or application behavior. Their JSON and exact branch
  matching were checked locally. No hosted setting is changed.

References: [Render service previews](https://render.com/docs/service-previews#skipping-a-preview),
[Render preview environments](https://render.com/docs/preview-environments#manual-vs-automatic-preview-environments),
[Vercel branch configuration](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentEnabled).

Keep the title marker and branch guards during this review. Creating a preview,
removing these controls, merging or releasing requires separate authorization.
Migration/runtime ordering and rollback limitations are in the linked runbook.
Hosted acceptance, operator/alert ownership, target/device inventory and research-owner
decisions for unsatisfiable observation queues remain open.
