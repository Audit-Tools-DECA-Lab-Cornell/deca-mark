-- Given a current map, publication binds the saved setup revision and preserves history.
RESET ROLE;
CREATE TEMP TABLE setup_publish_body AS SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(value,
 '{request_id}','"94000000-0000-4000-8000-000000000010"'),
 '{expected_current_package_id}','"93000000-0000-4000-8000-000000000004"'),
 '{layers,zones,features,0,properties}','{"id":"93000000-0000-4000-8000-000000000003","name":"North"}'),
 '{zone_identity_map,0,source_feature_id}','"93000000-0000-4000-8000-000000000003"') AS value FROM first_upload_body;
CREATE TEMP TABLE publish_setup_doc AS SELECT jsonb_build_object('content',jsonb_build_object(
 'import_generation',1,'outline',value#>'{layers,ground,features,0,geometry}',
 'zones',jsonb_build_array(jsonb_build_object('zone_id',value#>'{zone_identity_map,0,zone_id}',
 'zone_code','A','zone_label','North','geometry',value#>'{layers,zones,features,0,geometry}')),
 'form_version',value->'form_version','inventory_form_version',NULL,'change_note',value->'change_note',
 'assignments','[]'::jsonb,'confirmed_omissions','[]'::jsonb),
 'layers','[]'::jsonb,'issues','[]'::jsonb,'sources','[]'::jsonb,'project_file',NULL) AS document
FROM setup_publish_body;
GRANT SELECT ON setup_publish_body,publish_setup_doc TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
CREATE TEMP TABLE publish_setup_id AS SELECT created.setup_id AS id,created.replayed
FROM publish_setup_doc CROSS JOIN LATERAL fieldmaps_private.create_map_setup(
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 '94000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000004',document,'[]',repeat('c',64))
 created;
SELECT pg_temp.assert_true((SELECT NOT replayed FROM publish_setup_id),
 'new map setup creation is distinguished from an exact replay');
CREATE TEMP TABLE setup_prepared AS SELECT pg_temp.zone_prepared(fieldmaps_private.validate_zone_import(
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000004',value),'93000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000004',NULL,'94000000-0000-4000-8000-000000000012',2) AS value FROM setup_publish_body;
SELECT pg_temp.assert_rejected(format('SELECT * FROM fieldmaps_private.finalize_map_setup(%L,%L,%L,1,%L,%L,%L,NULL,NULL,NULL,NULL,NULL,NULL,%L,NULL)',
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',(SELECT id FROM publish_setup_id),
 repeat('d',64),'94000000-0000-4000-8000-000000000013','93000000-0000-4000-8000-000000000004',
 jsonb_set(value,'{layers,zones,features,0,properties,name}','"Other"')),'ZB001',
 'a different zone label cannot publish under the reviewed setup revision') FROM setup_publish_body;
SELECT pg_temp.assert_true((SELECT state='draft' AND revision=1 FROM fieldmaps.map_setups WHERE id=(SELECT id FROM publish_setup_id)),
 'failed publication leaves acknowledged setup unchanged');
CREATE TEMP TABLE setup_result AS SELECT (r.package).id AS id,r.replayed FROM setup_publish_body b
 CROSS JOIN setup_prepared p CROSS JOIN LATERAL fieldmaps_private.finalize_map_setup(
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',(SELECT id FROM publish_setup_id),1,
 repeat('e',64),'94000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000004',
 '94000000-0000-4000-8000-000000000012',2,p.value->'manifest',p.value->'layer','\x010203',
 '[{"step":"archive","state":"passed","detail":"Synthetic setup"}]',b.value,convert_to((p.value->'layer')::text,'UTF8')) r;
SELECT pg_temp.assert_true((SELECT id='94000000-0000-4000-8000-000000000012' AND NOT replayed FROM setup_result)
 AND (SELECT state='published' AND revision=2 AND document#>'{content,zones}' IS NULL
 FROM fieldmaps.map_setups WHERE id=(SELECT id FROM publish_setup_id)), 'package and setup receipt commit atomically with heavy-data cleanup');
SELECT pg_temp.assert_true(r.replayed AND (r.package).id='94000000-0000-4000-8000-000000000012',
 'lost-reply replay succeeds before obsolete revision and terminal-state checks')
 FROM fieldmaps_private.finalize_map_setup('10000000-0000-4000-8000-000000000002',
 '93000000-0000-4000-8000-000000000001',(SELECT id FROM publish_setup_id),1,repeat('e',64),
 '94000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000004',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL) r;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM fieldmaps.site_packages WHERE site_id='93000000-0000-4000-8000-000000000001')
 AND (SELECT archive='\x010203'::bytea FROM fieldmaps.site_packages WHERE id='93000000-0000-4000-8000-000000000004'),
 'setup publication keeps earlier immutable archive and creates no replay duplicate');
RESET ROLE;
