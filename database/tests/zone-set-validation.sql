CREATE FUNCTION pg_temp.zone_validate_set(p_zones jsonb, p_ground jsonb DEFAULT
  '{"type":"Polygon","coordinates":[[[0,0],[0.03,0],[0.03,0.02],[0,0.02],[0,0]]]}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE body jsonb; detail text; draft fieldmaps.zone_drafts;
BEGIN
  draft := fieldmaps_private.create_zone_draft('10000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000001',gen_random_uuid(),'81000000-0000-4000-8000-000000000001');
  draft := fieldmaps_private.change_zone_draft(draft.project_id,draft.site_id,draft.id,1,p_zones,'Synthetic geometry case');
  p_zones := draft.zones;
  SELECT jsonb_build_object('site_id','80000000-0000-4000-8000-000000000001',
    'expected_current_package_id','81000000-0000-4000-8000-000000000001','form_version','db16-play-v1','inventory_form_version','db16-inventory-v1','change_note','Synthetic geometry case',
    'zone_identity_map',coalesce(jsonb_agg(jsonb_build_object('source_feature_id',n::text,'zone_id',z->'zone_id','zone_code',z->'zone_code') ORDER BY n),'[]'),
    'layers',jsonb_build_object('ground',jsonb_build_object('type','FeatureCollection','features',jsonb_build_array(
      jsonb_build_object('type','Feature','properties',jsonb_build_object('kind','site'),'geometry',p_ground))),
      'zones',jsonb_build_object('type','FeatureCollection','features',coalesce(jsonb_agg(jsonb_build_object('type','Feature',
        'properties',jsonb_build_object('id',n::text,'name',z->'zone_label'),'geometry',z->'geometry') ORDER BY n),'[]')))) INTO body
  FROM jsonb_array_elements(p_zones) WITH ORDINALITY entries(z,n);
  IF jsonb_array_length(p_zones)=0 THEN
    RETURN fieldmaps_private.validate_zone_draft(draft.project_id,draft.site_id,draft.id,2);
  END IF;
  RETURN fieldmaps_private.validate_zone_import('10000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',body);
EXCEPTION WHEN SQLSTATE 'ZB001' THEN
  GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
  RETURN detail::jsonb;
END;
$$;
CREATE FUNCTION pg_temp.case_zone(p_geometry jsonb, p_index integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('zone_id','89000000-0000-4000-8000-'||lpad(p_index::text,12,'0'),
    'zone_code','NEW'||p_index,'zone_label','Synthetic','geometry',p_geometry);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.zone_validate_set(jsonb,jsonb),pg_temp.case_zone(jsonb,integer) TO fieldmaps_api;
SELECT pg_temp.assert_true(
  CASE WHEN c ->> 'publish_issue' IS NULL THEN jsonb_array_length(result -> 'issues') = 0
    ELSE result -> 'issues' @> jsonb_build_array(jsonb_build_object('code',c ->> 'publish_issue')) END,
  'restricted authoring validation: '||(c ->> 'id'))
FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'structure_cases') c
CROSS JOIN LATERAL (SELECT pg_temp.zone_validate_set(jsonb_build_array(
  pg_temp.case_zone(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'geometry')))) result) validation;
SELECT pg_temp.assert_true((result -> 'issues' @> '[{"code":"interior_overlap"}]') = (c ->> 'interior_overlap')::boolean,
  'restricted authoring intersection: '||(c ->> 'id'))
FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'relation_cases') c
CROSS JOIN LATERAL (SELECT pg_temp.zone_validate_set(jsonb_build_array(
  pg_temp.case_zone(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'left'),1),
  pg_temp.case_zone(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'right'),2))) result) validation;
SELECT pg_temp.assert_true((result -> 'issues' @> '[{"code":"outside_site"}]') <> (c ->> 'covered')::boolean,
  'restricted authoring ground containment: '||(c ->> 'id'))
FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'containment_cases') c
CROSS JOIN LATERAL (SELECT pg_temp.zone_validate_set(jsonb_build_array(
  pg_temp.case_zone(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'zone'))),
  :'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'ground')) result) validation;
SELECT pg_temp.assert_true(pg_temp.zone_validate_set('[]') -> 'issues' @> '[{"code":"empty_zone_set"}]',
  'empty saved draft cannot be published');
SELECT pg_temp.assert_true(pg_temp.zone_validate_set(jsonb_build_array(pg_temp.case_zone(
  '{"type":"Polygon","coordinates":[[[0,0],[0.0000001,0],[0.0000001,0.0000001],[0,0.0000001],[0,0]]]}'))) -> 'warnings'
  @> '[{"code":"small_zone"},{"code":"site_gap"}]', 'small zones and unsampled ground gaps are warnings');
SELECT pg_temp.assert_true(pg_temp.zone_validate_set(zones) -> 'issues' @> '[{"code":"too_complex"}]',
  'restricted draft rejects over-limit zone/position count: '||maximum)
FROM bounded_zone_sets WHERE maximum IN (251,11);
SELECT pg_temp.assert_true(pg_temp.zone_validate_set(jsonb_build_array(z,z)) -> 'issues' @> '[{"code":"duplicate_zone_id"}]',
  'restricted draft uses the frozen duplicate UUID issue code')
FROM (SELECT pg_temp.case_zone(:'geometry_cases'::jsonb #> '{geometries,square}') z) fixture;
SELECT pg_temp.assert_true((pg_temp.zone_validate_set(jsonb_build_array(pg_temp.case_zone(g)),g) ->> 'ready')::boolean,
  'publication includes the exact one-degree span and latitude support boundary')
FROM (VALUES ('{"type":"Polygon","coordinates":[[[0,84],[1,84],[1,85],[0,85],[0,84]]]}'::jsonb),
  ('{"type":"Polygon","coordinates":[[[0,-85],[1,-85],[1,-84],[0,-84],[0,-85]]]}'::jsonb)) cases(g);
SELECT pg_temp.assert_true(pg_temp.zone_validate_set(jsonb_build_array(z,jsonb_set(z,'{zone_id}',
  '"89000000-0000-4000-8000-000000000002"'))) -> 'issues' @> '[{"code":"duplicate_code"}]',
  'restricted draft uses the frozen duplicate code issue')
FROM (SELECT pg_temp.case_zone(:'geometry_cases'::jsonb #> '{geometries,square}') z) fixture;
