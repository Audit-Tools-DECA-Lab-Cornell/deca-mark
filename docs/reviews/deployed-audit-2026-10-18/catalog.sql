BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object(
 'sampled_at',now(),
 'runtime_role',(SELECT jsonb_build_object('role',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls,'login',rolcanlogin) FROM pg_roles WHERE rolname='fieldmaps_api'),
 'deletion_table',(SELECT jsonb_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,'owner',pg_get_userbyid(relowner)) FROM pg_class WHERE oid='fieldmaps_private.account_deletions'::regclass),
 'deletion_grants',(SELECT jsonb_agg(jsonb_build_object('role',role,
   'select',has_table_privilege(role,'fieldmaps_private.account_deletions','SELECT'),
   'insert',has_table_privilege(role,'fieldmaps_private.account_deletions','INSERT'),
   'update_table',has_table_privilege(role,'fieldmaps_private.account_deletions','UPDATE'),
   'delete',has_table_privilege(role,'fieldmaps_private.account_deletions','DELETE'),
   'update_identity',has_column_privilege(role,'fieldmaps_private.account_deletions','user_id','UPDATE'),
   'update_requested_at',has_column_privilege(role,'fieldmaps_private.account_deletions','requested_at','UPDATE'),
   'enqueue_execute',has_function_privilege(role,'fieldmaps_private.enqueue_account_deletion()','EXECUTE'),
   'metadata_updates',(SELECT jsonb_agg(a.attname ORDER BY a.attname) FROM pg_attribute a
      WHERE a.attrelid='fieldmaps_private.account_deletions'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege(role,a.attrelid,a.attnum,'UPDATE'))
  )) FROM unnest(ARRAY['anon','authenticated','service_role','fieldmaps_api']) AS r(role)),
 'deletion_policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'qual',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid))) FROM pg_policy WHERE polrelid='fieldmaps_private.account_deletions'::regclass),
 'enqueue_function',(SELECT jsonb_build_object('security_definer',prosecdef,'config',proconfig,'source',prosrc) FROM pg_proc WHERE oid='fieldmaps_private.enqueue_account_deletion()'::regprocedure),
 'enqueue_trigger',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid))) FROM pg_trigger WHERE tgrelid='fieldmaps.profiles'::regclass AND tgname='enqueue_account_deletion'),
 'observation_policy',(SELECT jsonb_build_object('name',polname,'qual',pg_get_expr(polqual,polrelid)) FROM pg_policy WHERE polrelid='fieldmaps.observations'::regclass AND polname='assigned_observations'),
 'form_revision',jsonb_build_object(
   'column',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='fieldmaps' AND table_name='form_versions' AND column_name='revision'),
   'conditional_publish',to_regprocedure('fieldmaps_private.publish_form_version(uuid,uuid,bigint)') IS NOT NULL,
   'unconditional_publish',to_regprocedure('fieldmaps_private.publish_form_version(uuid,uuid)') IS NOT NULL),
 'observation_columns',(SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='fieldmaps' AND table_name='observations'),
 'queue_tables',(SELECT jsonb_agg(jsonb_build_object('schema',table_schema,'name',table_name)) FROM information_schema.tables WHERE table_schema IN ('fieldmaps','fieldmaps_private') AND (table_name ILIKE '%receipt%' OR table_name ILIKE '%queue%' OR table_name ILIKE '%device%'))
) AS catalog;
ROLLBACK;
