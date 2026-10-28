# Reviewed migration execution alternatives

These files are explicit operator repair sources, not another automatic
migration directory. Do not run them directly or apply them after their migration
version is already recorded.

20261024090000_form_schema2_preserve_legacy.sql is selected by the all-row Python
preflight when a schema1 population contains valid fields-only definitions.
The unchanged supabase/migrations/20261024090000_form_schema2.sql remains the
source for an entirely canonical population.

Both represent the same pending schema2 transition. The application wrapper
binds the exact parser report, executes the selected source and inserts the
Supabase history entry in one transaction. History records the actual source
executed; it is never a manual stamp. The preservation source refuses a missing,
incomplete, changed or misclassified report and never converts definitions.

Follow the [production procedure](../../database/hosted/form-schema2-rollout.md)
and [compatibility decision](../../docs/decisions/0002-schema2-legacy-preservation.md).
