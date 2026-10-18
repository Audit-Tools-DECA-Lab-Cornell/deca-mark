# Collector acceptance dependency in the backend CI job

[CI run 39159018908](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/actions/runs/39159018908)
on `6a30bd1d569a00aeeb6dfdfadcdf833828bba5ae` successfully fetched the pinned image,
passed backend static checks and executed the full disposable suite: **862 passed,
two failed**, 122 existing warnings. The other five CI jobs passed. This result is
not full backend or forward acceptance; the forward step correctly did not run
after the suite failed.

Both failing cases invoked the real collector SQLite/HTTP queue regressions:

- `test_fields_only_queue_after_canonical_successor`
- `test_published_history_exports_replays_and_retains_rejected_device_queue`

They failed because `mobile/node_modules/vitest/vitest.mjs` was absent in the backend
job. Dependencies installed in the separate successful mobile job do not populate
this job's filesystem. The scenarios themselves were unchanged and had passed in
the local complete **864-case** run with installed mobile dependencies.

The backend job now runs the same `pnpm --dir mobile install --frozen-lockfile`
command already used by mobile CI, before backend checks/acceptance. It retains
Node 24, pnpm 10.17.1, the pinned Docker Hub PostgreSQL version, full Git history,
both disposable selectors, the complete backend suite and the forward rehearsal.
No test is skipped, filtered, replaced or weakened. No lockfile, collector source,
runtime, migration or compatibility definition changes.

Local full/focused/forward results remain valid because tested source has not
changed. YAML wiring, unchanged-source hashes and whitespace checks are rerun;
GitHub must execute the full suite and forward rehearsal on the final pushed SHA.
The completed result is linked on PR #30, without relabeling these earlier failures.
Pinned synthetic database acceptance remains distinct from real Auth/Storage,
hosted/provider and physical-device acceptance. All existing rollout and queue-owner
decisions remain open; no deployment or hosted migration is performed.
