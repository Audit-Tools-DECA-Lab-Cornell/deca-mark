RESET ROLE;
INSERT INTO fieldmaps.observations (id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, geom, answers, created_by, upload_hash, zone_code, round_type,
  first_round, placement_source, package_id, zone_id, upload_protocol)
SELECT md5('zone-query-plan-' || n)::uuid, '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004', 'QA', now() - n * interval '1 second',
  fieldmaps.make_point(0.005, 0.005), '{"people":1}', '50000000-0000-4000-8000-000000000001',
  repeat('e', 64), 'A', 'standard', true, 'hand',
  CASE WHEN n % 2 = 0 THEN '72000000-0000-4000-8000-000000000002'::uuid
    ELSE '72000000-0000-4000-8000-000000000003'::uuid END,
  '71000000-0000-4000-8000-000000000001', 2
FROM generate_series(1, 12000) n;
ANALYZE fieldmaps.observations;

CREATE FUNCTION pg_temp.zone_query_plan(p_statement text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || p_statement INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.zone_query_plan(text) TO fieldmaps_api;
CREATE TEMP TABLE zone_query_plans (label text, plan jsonb);
GRANT INSERT, SELECT ON zone_query_plans TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
INSERT INTO zone_query_plans VALUES
  ('observations_zone_time_idx', pg_temp.zone_query_plan($q$
    SELECT id FROM fieldmaps.observations WHERE project_id = '10000000-0000-4000-8000-000000000002'
      AND site_id = '10000000-0000-4000-8000-000000000003'
      AND zone_id = '71000000-0000-4000-8000-000000000001' AND upload_protocol = 2
    ORDER BY observed_at DESC, id LIMIT 50$q$)),
  ('observations_package_time_idx', pg_temp.zone_query_plan($q$
    SELECT id FROM fieldmaps.observations WHERE project_id = '10000000-0000-4000-8000-000000000002'
      AND site_id = '10000000-0000-4000-8000-000000000003'
      AND package_id = '72000000-0000-4000-8000-000000000002' AND upload_protocol = 2
    ORDER BY observed_at DESC, id LIMIT 50$q$));
SELECT pg_temp.assert_true(plan::text LIKE '%"Index Name": "' || label || '"%'
    AND plan #>> '{0,Plan,Actual Rows}' = '50',
  'restricted-role history query uses ' || label || ' on 12000 synthetic bound rows') FROM zone_query_plans;
SELECT label, plan #>> '{0,Execution Time}' AS execution_ms,
  plan #>> '{0,Plan,Shared Hit Blocks}' AS shared_hit_blocks FROM zone_query_plans;
RESET ROLE;
