# Post-merge verification — October 17, 2026

The user requested committing to `origin/master`. Fetching the current remote found
`bb38f13`, the observation ownership/export authorization fix. It was merged without
conflicts after form remediation commit `221e375`; merge commit `7d8ccfc` retains both.
No remote history was rewritten.

The mobile acceptance helper now expects observer export denial and performs its export
as a research viewer, preserving the merged authorization rule. Its exports still use
pytest temporary output.

- Combined form revision, workspace lifecycle/concurrency and observation authorization
  regressions: **107 passed** ([log](merged-focused.txt)).
- Real mobile outbox/restart/publication/readback/export acceptance: **1 passed**
  ([log](merged-mobile.txt)).
- Fresh disposable SQL suite with both pending migrations, Auth-hook and local execution
  of hosted assertions: passed, including all seven existing zone concurrency scenarios
  and 2,545 coordinate comparisons ([summary](merged-sql-summary.txt)).
- Ruff, BasedPyright and the three client-flow component/action tests passed.
- OpenAPI and both generated declaration hashes still match the recorded generation.

These checks use disposable PostgreSQL/PostGIS + pg_cron and synthetic Auth. They do not
apply either migration to an existing or hosted installation.
