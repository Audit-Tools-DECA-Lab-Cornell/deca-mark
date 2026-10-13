SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
SELECT (fieldmaps_private.create_zone_draft(:'project',:'site','84000000-0000-4000-8000-000000000005',:'p5')).id AS import_draft \gset
SELECT fieldmaps_private.change_zone_draft(:'project',:'site',:'import_draft',1,
  (SELECT jsonb_build_array(zones -> 0) FROM zone_drafts WHERE id = :'import_draft'), 'Explicit import mapping for A.');
CREATE TEMP TABLE zone_import_prepared AS SELECT pg_temp.zone_prepare(:'project',:'site',:'import_draft',2,
  '81000000-0000-4000-8000-000000000006',6) AS value;
CREATE TEMP TABLE zone_import_body AS
SELECT jsonb_build_object('request_id','85000000-0000-4000-8000-000000000001', 'expected_current_package_id',:'p5',
  'site_id',:'site','form_version',p.value #>> '{manifest,forms,play,form_version}','change_note','Explicit import mapping for A.',
  'zone_identity_map',jsonb_build_array(jsonb_build_object('source_feature_id','source-A','zone_id',z -> 'zone_id','zone_code','A')),
  'layers',jsonb_build_object('ground',jsonb_build_object('type','FeatureCollection','features',jsonb_build_array(jsonb_build_object(
    'type','Feature','properties',jsonb_build_object('kind','site'),'geometry',
      '{"type":"Polygon","coordinates":[[[0,0],[0.03,0],[0.03,0.02],[0,0.02],[0,0]]]}'::jsonb))),
    'zones',jsonb_build_object('type','FeatureCollection','features',jsonb_build_array(jsonb_build_object('type','Feature',
      'properties',jsonb_build_object('id','source-A','name',z -> 'zone_label'),'geometry',z -> 'geometry'))))) AS value
FROM zone_import_prepared p CROSS JOIN LATERAL (SELECT zones -> 0 AS z FROM zone_drafts WHERE id = :'import_draft') d;
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.finalize_zone_package(%L,%L,%L,%L,NULL,NULL,%L,6,NULL,NULL,NULL,NULL,%L)',
  :'project',:'site','85000000-0000-4000-8000-000000000001',:'p5','81000000-0000-4000-8000-000000000006',
  (SELECT jsonb_set(value,'{zone_identity_map}','[]')::text FROM zone_import_body)), 'ZB001','layer import requires exactly one mapping per source feature');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.finalize_zone_package(%L,%L,%L,%L,NULL,NULL,%L,6,NULL,NULL,NULL,NULL,%L)',
  :'project',:'site','85000000-0000-4000-8000-000000000001',:'p5','81000000-0000-4000-8000-000000000006',
  (SELECT jsonb_set(value,'{zone_identity_map,0,source_feature_id}','"unused"')::text FROM zone_import_body)),
  'ZB001','unused layer import mapping cannot infer an identity from a label');
SELECT (r.package).id AS p6, r.replayed AS import_replayed
FROM zone_import_prepared p CROSS JOIN zone_import_body b CROSS JOIN LATERAL fieldmaps_private.finalize_zone_package(:'project',:'site','85000000-0000-4000-8000-000000000001',:'p5',NULL,NULL,
  '81000000-0000-4000-8000-000000000006',6,p.value -> 'manifest',p.value -> 'layer','\x010203',
  '[{"step":"archive","state":"passed","detail":"Synthetic layer import"}]',b.value,convert_to((p.value -> 'layer')::text,'UTF8')) r \gset
SELECT pg_temp.assert_true((SELECT operation = 'package_import' AND identity_map #>> '{0,source_feature_id}' = 'source-A'
  FROM zone_publications WHERE published_package_id = :'p6') AND (SELECT revision = 6 FROM site_zone_state WHERE site_id = :'site'),
  'layer import uses the same atomic finalizer and retains exact source mapping in its operation-scoped audit');
SELECT pg_temp.assert_true((r.package).id = :'p6' AND r.replayed AND NOT :'import_replayed'::boolean,
  'layer import replay resolves before stale-current validation with an explicit replay result')
FROM fieldmaps_private.finalize_zone_package(:'project',:'site','85000000-0000-4000-8000-000000000001',
  :'p5',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,(SELECT value FROM zone_import_body)) r;
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.finalize_zone_package(%L,%L,%L,%L,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,%L)',
  :'project',:'site','85000000-0000-4000-8000-000000000001',:'p5',
  (SELECT jsonb_set(value,'{change_note}','"different"')::text FROM zone_import_body)), 'ZB004','layer import request ID cannot accept changed source content');
RESET ROLE;
UPDATE fieldmaps.profiles SET deleted_at = clock_timestamp() WHERE user_id = '50000000-0000-4000-8000-000000000004';
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.finalize_zone_package(%L,%L,%L,%L,%L,2,NULL,NULL,NULL,NULL,NULL,NULL)',
  :'project',:'site','85000000-0000-4000-8000-000000000001',:'base',:'d1'), 'FM005','publication replay rechecks current account authorization');
RESET ROLE;
UPDATE fieldmaps.profiles SET deleted_at = NULL WHERE user_id = '50000000-0000-4000-8000-000000000004';
UPDATE fieldmaps.project_memberships SET role = 'viewer' WHERE project_id = :'project'
  AND user_id = '50000000-0000-4000-8000-000000000004';
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_rejected(format('SELECT * FROM fieldmaps_private.finalize_zone_package(%L,%L,%L,%L,%L,2,NULL,NULL,NULL,NULL,NULL,NULL)',
  :'project',:'site','85000000-0000-4000-8000-000000000001',:'base',:'d1'), 'FM006','publication replay refuses a manager whose role was revoked');
RESET ROLE;
UPDATE fieldmaps.project_memberships SET role = 'manager' WHERE project_id = :'project'
  AND user_id = '50000000-0000-4000-8000-000000000004';
