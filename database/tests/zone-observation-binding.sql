RESET ROLE;
CREATE FUNCTION pg_temp.zone_observation(p_package uuid, p_zone uuid, p_point extensions.geometry,
  p_form uuid DEFAULT '80000000-0000-4000-8000-000000000010', p_round text DEFAULT 'standard',
  p_first boolean DEFAULT true, p_placement text DEFAULT 'hand') RETURNS fieldmaps.observations LANGUAGE plpgsql AS $$
DECLARE result fieldmaps.observations;
BEGIN
  INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,geom,
    answers,created_by,upload_hash,package_id,zone_id,upload_protocol,zone_code,round_type,first_round,placement_source)
  VALUES (gen_random_uuid(),'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000001',p_form,'QA',now(),p_point,'{}',fieldmaps.request_user_id(),repeat('c',64),
    p_package,p_zone,2,'UNTRUSTED',p_round,p_first,p_placement) RETURNING * INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.zone_observation(uuid,uuid,extensions.geometry,uuid,text,boolean,text) TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000001',true);
SELECT zone_id AS zone_a FROM package_zones WHERE package_id = :'p3' AND label = 'Original A' \gset
SELECT zone_id AS zone_b FROM package_zones WHERE package_id = :'p3' AND label = 'Original B' \gset
SELECT pg_temp.assert_true((pg_temp.zone_observation(:'p3',:'zone_a',fieldmaps.make_point(0.001,0.001))).zone_code = 'A',
  'superseded package accepts a bound point and derives immutable code');
SELECT pg_temp.assert_true((pg_temp.zone_observation(:'p3',:'zone_a',fieldmaps.make_point(0.001,0.001),
  '80000000-0000-4000-8000-000000000010','reliability',false,'hand')).round_type = 'reliability',
  'Reliability accepts explicit false first_round and the frozen play binding');
SELECT pg_temp.assert_true((pg_temp.zone_observation(:'p3',:'zone_a',fieldmaps.make_point(0.01,0.005))).package_id = :'p3'
  AND (pg_temp.zone_observation(:'p3',:'zone_b',fieldmaps.make_point(0.01,0.005))).package_id = :'p3',
  'shared boundary accepts either explicitly selected covering zone');
SELECT pg_temp.assert_true((pg_temp.zone_observation(:'p3',:'zone_a',fieldmaps.make_point(0.003,0.005))).zone_id = :'zone_a',
  'hole boundary is included without snapping');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.005,0.005))',:'p3',:'zone_a'),
  'ZB001','hole interior cannot be attributed to the selected zone');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.025,0.005))',:'p3',:'zone_a'),
  'ZB001','unsampled site gap cannot be attributed to a zone');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.010000000000000002,0.005))',:'p3',:'zone_a'),
  'ZB001','near-edge exterior point is rejected without a tolerance');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,NULL)',:'p3',:'zone_a'),
  'ZB001','point observations require an event coordinate');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001),%L,%L,NULL,%L)',
  :'p3',:'zone_a','80000000-0000-4000-8000-000000000010','standard','hand'), 'ZB001','point first_round is required');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001),%L,%L,true,%L)',
  :'p3',:'zone_a','80000000-0000-4000-8000-000000000010','standard','zone'), 'ZB001','point placement must be hand');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,NULL,%L,%L,false,%L)',
  :'p3',:'zone_a','80000000-0000-4000-8000-000000000004','inventory','zone'), 'ZB001','v2 inventory first_round must be null');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,NULL,%L,%L,NULL,%L)',
  :'p3',:'zone_a','80000000-0000-4000-8000-000000000010','inventory','zone'), 'ZB001','inventory cannot use the package play binding');
SELECT (pg_temp.zone_observation(:'p3',:'zone_a',NULL,'80000000-0000-4000-8000-000000000004','inventory',NULL,'zone')).id AS inventory_id \gset
SELECT pg_temp.assert_true((SELECT first_round IS NULL AND placement_source = 'zone' AND zone_code = 'A'
  AND ST_AsEWKB(o.geom) = ST_AsEWKB(z.display_anchor) FROM observations o
  JOIN package_zones z ON z.package_id = o.package_id AND z.zone_id = o.zone_id WHERE o.id = :'inventory_id'),
  'inventory stores the exact server-derived snapshot anchor');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001))',:'base',:'zone_a'),
  'ZB001','format-1 package cannot acquire a v2 observation binding');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001))',
  '81000000-0000-4000-8000-000000000002',:'zone_a'), 'ZB001','blocked package cannot bind an observation');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001))',:'p4',:'zone_b'),
  'ZB001','removed zone is valid in its retained package only');
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001))',:'p3',:'zone_a'),
  '42501','viewer cannot upload through the binding trigger');
SELECT set_config('fieldmaps.user_id','51000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.001,0.001))',:'p3',:'zone_a'),
  '42501','another tenant cannot upload against a guessed package');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_observation(%L,%L,fieldmaps.make_point(0.005,0.005))',:'p3',:'zone_a'),
  '42501','authorization precedes geometry validation and does not disclose a guessed hole');
RESET ROLE;
SELECT pg_temp.assert_rejected(format('UPDATE observations SET geom = fieldmaps.make_point(0,0) WHERE id = %L',:'inventory_id'),
  '23514','bound inventory anchor cannot be changed retrospectively');
SELECT pg_temp.assert_rejected(format('UPDATE observations SET form_version_id = %L WHERE id = %L',
  '80000000-0000-4000-8000-000000000010',:'inventory_id'), '23514','bound form attribution cannot be changed');
SELECT pg_temp.assert_rejected($q$UPDATE form_versions SET state='retired'
  WHERE id='80000000-0000-4000-8000-000000000010'$q$,'ZB007',
  'current managed play form cannot retire before an explicit successor');
INSERT INTO form_versions(id,organization_id,project_id,code,definition)
VALUES ('80000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',
  :'project','db16-successor-v1','{"fields":[]}');
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
SELECT (r.package).id AS successor_package FROM zone_import_prepared p CROSS JOIN zone_import_body b
CROSS JOIN LATERAL fieldmaps_private.finalize_zone_package(:'project',:'site',
  '85000000-0000-4000-8000-000000000009',:'p6',NULL,NULL,
  '81000000-0000-4000-8000-000000000009',7,
  p.value->'manifest' || jsonb_build_object('package_id','81000000-0000-4000-8000-000000000009',
    'package_version',7,'form_version','db16-successor-v1','forms',jsonb_build_object(
      'play',jsonb_build_object('form_version_id','80000000-0000-4000-8000-000000000009',
        'form_version','db16-successor-v1'),'inventory',NULL)),
  p.value->'layer','\x010203','[{"step":"archive","state":"passed","detail":"Synthetic successor"}]',
  b.value || jsonb_build_object('request_id','85000000-0000-4000-8000-000000000009',
    'expected_current_package_id',:'p6','form_version','db16-successor-v1','inventory_form_version',NULL),
  convert_to((p.value->'layer')::text,'UTF8')) r \gset
SELECT pg_temp.assert_true((SELECT form_version_id='80000000-0000-4000-8000-000000000009'
  AND inventory_form_version_id IS NULL FROM site_packages WHERE id=:'successor_package'),
  'successor binds an explicit replacement play form and disables inventory');
RESET ROLE;
UPDATE form_versions SET state = 'retired' WHERE id IN ('80000000-0000-4000-8000-000000000010','80000000-0000-4000-8000-000000000004');
UPDATE projects SET status = 'archived' WHERE id = :'project';
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((pg_temp.zone_observation(:'p3',:'zone_a',fieldmaps.make_point(0.001,0.001))).package_id = :'p3'
  AND (pg_temp.zone_observation(:'p3',:'zone_a',NULL,'80000000-0000-4000-8000-000000000004','inventory',NULL,'zone')).package_id = :'p3',
  'archived project and retired frozen forms still accept authorized historical offline work');
RESET ROLE;
