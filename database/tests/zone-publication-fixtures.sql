RESET ROLE;
SET LOCAL search_path = fieldmaps, extensions, public;
INSERT INTO fieldmaps.sites(id, organization_id, project_id, code, name)
VALUES ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'db16-synthetic', 'Synthetic DB-16 publication site');
INSERT INTO fieldmaps.form_versions(id, organization_id, project_id, code, definition)
VALUES ('80000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'db16-inventory-v1', '{"fields":[]}');
INSERT INTO fieldmaps.form_versions(id, organization_id, project_id, code, definition)
VALUES ('80000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002','db16-play-v1','{"fields":[]}');
SELECT pg_temp.fixture_package('80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',
 '82000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000010','80000000-0000-4000-8000-000000000004',1,
 '[{"zone_id":"82000000-0000-4000-8000-000000000001","zone_code":"A","zone_label":"Original A","geometry":{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]],[[0.003,0.003],[0.003,0.007],[0.007,0.007],[0.007,0.003],[0.003,0.003]]]}},
   {"zone_id":"82000000-0000-4000-8000-000000000002","zone_code":"B","zone_label":"Original B","geometry":{"type":"Polygon","coordinates":[[[0.01,0],[0.02,0],[0.02,0.01],[0.01,0.01],[0.01,0]]]}}]',
 '{"type":"Polygon","coordinates":[[[0,0],[0.03,0],[0.03,0.02],[0,0.02],[0,0]]]}');
INSERT INTO fieldmaps.site_packages(id,organization_id,project_id,site_id,form_version_id,
  inventory_form_version_id,version,state,manifest,archive,archive_sha256,prepared_by,site_boundary)
SELECT '81000000-0000-4000-8000-000000000002',organization_id,project_id,site_id,form_version_id,
  inventory_form_version_id,2,'blocked',manifest,archive,archive_sha256,prepared_by,site_boundary
FROM fieldmaps.site_packages WHERE id='81000000-0000-4000-8000-000000000001';
