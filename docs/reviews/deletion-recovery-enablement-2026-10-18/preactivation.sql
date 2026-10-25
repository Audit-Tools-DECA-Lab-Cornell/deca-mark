BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('sampled_at',now(),
 'pending_deletions',(SELECT count(*) FROM fieldmaps_private.account_deletions),
 'retained_tombstones',(SELECT count(*) FROM fieldmaps.profiles WHERE deleted_at IS NOT NULL),
 'migration_recorded',EXISTS(SELECT 1 FROM fieldmaps_meta.schema_migrations WHERE version='20261018030756'),
 'runtime_role',(SELECT jsonb_build_object('superuser',rolsuper,'bypassrls',rolbypassrls) FROM pg_roles WHERE rolname='fieldmaps_api'),
 'recovery_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='fieldmaps_private.account_deletions'::regclass),
 'runtime_grants',jsonb_build_object(
  'select',has_table_privilege('fieldmaps_api','fieldmaps_private.account_deletions','SELECT'),
  'delete',has_table_privilege('fieldmaps_api','fieldmaps_private.account_deletions','DELETE'),
  'insert',has_table_privilege('fieldmaps_api','fieldmaps_private.account_deletions','INSERT'),
  'update_identity',has_column_privilege('fieldmaps_api','fieldmaps_private.account_deletions','user_id','UPDATE'),
  'enqueue_execute',has_function_privilege('fieldmaps_api','fieldmaps_private.enqueue_account_deletion()','EXECUTE'))
) AS preactivation;
ROLLBACK;
