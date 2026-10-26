BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object(
 'sampled_at',now(),'database',current_database(),'audit_role',current_user,
 'read_only',current_setting('transaction_read_only'),
 'role_bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'migrations',(SELECT jsonb_agg(version ORDER BY version) FROM fieldmaps_meta.schema_migrations),
 'backlog',(SELECT jsonb_build_object('pending',count(*),
   'due_unleased',count(*) FILTER (WHERE next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<=now())),
   'active_leases',count(*) FILTER (WHERE lease_until>now()),
   'expired_leases',count(*) FILTER (WHERE lease_until<=now()),
   'actionable_failures',count(*) FILTER (WHERE last_error IN ('permission','configuration')),
   'oldest_requested_at',min(requested_at),'max_attempts',max(attempts))
   FROM fieldmaps_private.account_deletions),
 'errors',(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
   SELECT last_error,count(*) AS pending,min(requested_at) AS oldest_requested_at,min(next_attempt_at) AS earliest_due
   FROM fieldmaps_private.account_deletions GROUP BY last_error ORDER BY last_error) x),
 'tombstones',(SELECT jsonb_build_object('retained',count(*),
   'with_pending',count(*) FILTER (WHERE EXISTS (
     SELECT 1 FROM fieldmaps_private.account_deletions d WHERE d.user_id=p.user_id)))
     FROM fieldmaps.profiles p WHERE deleted_at IS NOT NULL),
 'counts',(SELECT jsonb_build_object(
   'forms',(SELECT count(*) FROM fieldmaps.form_versions),
   'packages',(SELECT count(*) FROM fieldmaps.site_packages),
   'observations',(SELECT count(*) FROM fieldmaps.observations),
   'drafts',(SELECT count(*) FROM fieldmaps.zone_drafts))),
 'tables',(SELECT coalesce(jsonb_agg(table_name ORDER BY table_name),'[]')
 FROM information_schema.tables WHERE table_schema='fieldmaps' AND (table_name ILIKE '%receipt%' OR table_name ILIKE '%device%' OR table_name ILIKE '%queue%'))
) AS audit;
ROLLBACK;
