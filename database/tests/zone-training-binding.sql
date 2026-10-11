RESET ROLE;
INSERT INTO fieldmaps.site_packages(id,organization_id,project_id,site_id,form_version_id,version,state,manifest,archive,archive_sha256,prepared_by)
VALUES ('88000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000103',
  '10000000-0000-4000-8000-000000000104',1,'ready','{"format":1}','\x01',repeat('a',64),'53000000-0000-4000-8000-000000000002');
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','53000000-0000-4000-8000-000000000002',true);
SELECT (fieldmaps_private.create_zone_draft('10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000103',
  '88000000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000001',
  '{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}',
  '[{"zone_code":"TRAIN","zone_label":"Synthetic training zone","geometry":{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}}]')).id AS training_draft \gset
SELECT (pg_temp.zone_publish(:'training_draft',1,'88000000-0000-4000-8000-000000000004','88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000002',2)).id AS training_package \gset
SELECT zone_id AS training_zone FROM fieldmaps.package_zones WHERE package_id = :'training_package' \gset
SELECT set_config('fieldmaps.user_id','53000000-0000-4000-8000-000000000001',true);
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,geom,answers,
  created_by,upload_hash,package_id,zone_id,upload_protocol,round_type,first_round,placement_source)
VALUES ('88000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000103',
  '10000000-0000-4000-8000-000000000104','T1',now(),fieldmaps.make_point(0.005,0.005),'{}',
  fieldmaps.request_user_id(),repeat('a',64),:'training_package',:'training_zone',2,'standard',true,'hand');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM fieldmaps.observations WHERE package_id = :'training_package'),
  'bound Training upload remains visible to its creator');
SELECT pg_temp.assert_rejected(format($q$INSERT INTO fieldmaps.observations
  (id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,geom,answers,created_by,upload_hash,
    package_id,zone_id,upload_protocol,round_type,first_round,placement_source)
  VALUES (gen_random_uuid(),'10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000104','T1',now(),NULL,'{}',
    fieldmaps.request_user_id(),repeat('a',64),%L,%L,2,'inventory',NULL,'zone')$q$,:'training_package',:'training_zone'),
  'ZB001','unavailable package inventory cannot search for a replacement form');
SELECT set_config('fieldmaps.user_id','53000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations WHERE package_id = :'training_package'),
  'Training manager cannot read another creator bound observations');
RESET ROLE;
