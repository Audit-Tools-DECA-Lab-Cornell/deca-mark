-- Given an empty site, an incomplete setup is durable without altering publication requirements.
RESET ROLE;
INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name) VALUES
('94000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','setup-test','Synthetic map setup');
CREATE TEMP TABLE setup_test AS SELECT
'94000000-0000-4000-8000-000000000001'::uuid AS site,
'10000000-0000-4000-8000-000000000002'::uuid AS project,
'{"content":{"import_generation":1,"assignments":[],"outline":null,"zones":[],"form_version":null,"inventory_form_version":null,"change_note":"","confirmed_omissions":[]},"layers":[],"issues":[],"sources":[],"project_file":null}'::jsonb AS document;
GRANT SELECT ON setup_test TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
CREATE TEMP TABLE setup_id AS SELECT created.setup_id AS id,created.replayed
FROM setup_test CROSS JOIN LATERAL fieldmaps_private.create_map_setup(project,site,
'94000000-0000-4000-8000-000000000002',NULL,document,'[]',repeat('a',64)) created;
SELECT pg_temp.assert_true((SELECT revision=1 AND state='draft' AND expected_current_package_id IS NULL
 AND document#>'{content,zones}'='[]'::jsonb FROM fieldmaps.map_setups WHERE id=(SELECT id FROM setup_id))
 AND (SELECT NOT replayed FROM setup_id),
 'empty first-map setup saves without outline, zones or form');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM fieldmaps.site_zone_state WHERE site_id=(SELECT site FROM setup_test)),
 'incomplete setup does not activate a package');
SELECT pg_temp.assert_true(created.setup_id=(SELECT id FROM setup_id) AND created.replayed,
 'import request replay returns the original setup') FROM setup_test CROSS JOIN LATERAL
 fieldmaps_private.create_map_setup(project,site,'94000000-0000-4000-8000-000000000002',
 NULL,document,'[]',repeat('a',64)) created;
SELECT pg_temp.assert_rejected(format('SELECT * FROM fieldmaps_private.create_map_setup(%L,%L,%L,NULL,%L,%L,%L)',
 project,site,'94000000-0000-4000-8000-000000000003',document,'[]',repeat('b',64)),
 'FM008','one active setup per site') FROM setup_test;
SELECT fieldmaps_private.replace_map_setup(project,site,(SELECT id FROM setup_id),1,
 jsonb_set(document,'{content,change_note}','"Keep my work"'),NULL,NULL,NULL) FROM setup_test;
SELECT pg_temp.assert_true((SELECT revision=2 AND document#>>'{content,change_note}'='Keep my work'
 FROM fieldmaps.map_setups WHERE id=(SELECT id FROM setup_id)), 'revisioned replacement preserves incomplete work');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.replace_map_setup(%L,%L,%L,1,%L,NULL,NULL,NULL)',
 project,site,(SELECT id FROM setup_id),document),'ZB002','stale save cannot overwrite newer work') FROM setup_test;
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.replace_map_setup(%L,%L,%L,2,%L,NULL,NULL,NULL)',
 project,site,(SELECT id FROM setup_id),jsonb_set(document,'{content,zones}','{}')),
 'ZB001','malformed draft arrays rejected') FROM setup_test;
-- Source updates are atomic and keep acknowledged work on malformed input.
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.replace_map_setup(%L,%L,%L,2,%L,%L,%L,%L)',
 project,site,(SELECT id FROM setup_id),jsonb_set(document,'{content,import_generation}','2'),
 '[{"file_name":"bad.gpkg","content":"not base64!"}]','94000000-0000-4000-8000-000000000004',repeat('f',64)),
 'ZB001','invalid source bytes leave saved draft intact') FROM setup_test;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM fieldmaps.map_setups WHERE id=(SELECT id FROM setup_id)),
 'observer cannot read active map setup');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM fieldmaps_private.map_setup_sources WHERE setup_id=(SELECT id FROM setup_id)),
 'observer cannot read active source bundle');
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
SELECT fieldmaps_private.discard_map_setup(project,site,(SELECT id FROM setup_id),2) FROM setup_test;
SELECT pg_temp.assert_true((SELECT revision=3 AND state='discarded' AND document#>'{content,zones}' IS NULL AND document->'layers'='[]'::jsonb
 FROM fieldmaps.map_setups WHERE id=(SELECT id FROM setup_id)), 'discard clears heavy data and retains audit');
SELECT pg_temp.assert_true(created.setup_id=(SELECT id FROM setup_id) AND created.replayed,
 'import replay resolves even after terminal cleanup') FROM setup_test CROSS JOIN LATERAL
 fieldmaps_private.create_map_setup(project,site,'94000000-0000-4000-8000-000000000002',
 NULL,document,'[]',repeat('a',64)) created;
RESET ROLE;
GRANT SELECT ON setup_id TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM fieldmaps.map_setups WHERE id=(SELECT id FROM setup_id)),
 'observer cannot read manager setup');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM fieldmaps_private.map_setup_sources WHERE setup_id=(SELECT id FROM setup_id)),
 'observer cannot read retained source files');
RESET ROLE;
-- Given deletion of an otherwise empty study, only retained unfinished upload data is purged.
INSERT INTO fieldmaps.map_setups(id,organization_id,project_id,site_id,document,created_by,updated_by)
SELECT '94000000-0000-4000-8000-000000000020',organization_id,project_id,id,
 '{"content":{"import_generation":1},"layers":[]}',
 '50000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004'
FROM fieldmaps.sites WHERE id='20000000-0000-4000-8000-000000000003';
INSERT INTO fieldmaps_private.map_setup_sources VALUES('94000000-0000-4000-8000-000000000020','[{"file_name":"study.qgz","content":"AA=="}]');
UPDATE fieldmaps.organizations SET deleted_at=now() WHERE id='20000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM fieldmaps_private.map_setup_sources WHERE setup_id='94000000-0000-4000-8000-000000000020')
 AND (SELECT state='discarded' AND document->'layers'='[]'::jsonb FROM fieldmaps.map_setups WHERE id='94000000-0000-4000-8000-000000000020'),
 'organization deletion purges unpublished upload bytes without touching immutable packages');
