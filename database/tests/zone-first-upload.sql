-- A site's first package uses the same trusted finalizer as every successor.
RESET ROLE;
INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name)
VALUES('93000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','first-upload','Synthetic first package');
CREATE TEMP TABLE first_upload_body AS SELECT jsonb_build_object(
 'request_id','93000000-0000-4000-8000-000000000002','site_id','93000000-0000-4000-8000-000000000001',
 'expected_current_package_id',NULL,'form_version','shell-v1','inventory_form_version',NULL,'change_note','First map',
 'zone_identity_map','[{"source_feature_id":"source-A","zone_id":"93000000-0000-4000-8000-000000000003","zone_code":"A"}]'::jsonb,
 'layers',jsonb_build_object('ground','{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"kind":"site"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[0.02,0],[0.02,0.02],[0,0.02],[0,0]]]}}]}'::jsonb,
 'zones','{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"id":"source-A","name":"North"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}}]}'::jsonb)) AS value;
-- Use the fixture's explicit play form code; no latest-form inference.
UPDATE first_upload_body SET value=jsonb_set(value,'{form_version}',to_jsonb((SELECT code FROM fieldmaps.form_versions
 WHERE id='10000000-0000-4000-8000-000000000004')));
GRANT SELECT ON first_upload_body TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.validate_zone_import(%L,%L,NULL,%L)',
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 (SELECT (value-'expected_current_package_id')::text FROM first_upload_body)),
 'ZB006','first upload requires an explicit null current-package precondition');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.validate_zone_import(%L,%L,NULL,%L)',
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 (SELECT jsonb_set(value,'{zone_identity_map}','[]')::text FROM first_upload_body)),
 'ZB001','first upload rejects missing source identity mapping');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.validate_zone_import(%L,%L,NULL,%L)',
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 (SELECT jsonb_set(value,'{zone_identity_map,0,source_feature_id}','"unused"')::text FROM first_upload_body)),
 'ZB001','first upload rejects an unused mapping without label inference');
CREATE TEMP TABLE first_upload_prepared AS
SELECT pg_temp.zone_prepared(fieldmaps_private.validate_zone_import('10000000-0000-4000-8000-000000000002',
 '93000000-0000-4000-8000-000000000001',NULL,value),'93000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000004',NULL,'93000000-0000-4000-8000-000000000004',1) AS value
FROM first_upload_body;
CREATE TEMP TABLE first_upload_result AS SELECT (r.package).id AS package_id,(r.package).version AS version,r.replayed
FROM first_upload_body b CROSS JOIN first_upload_prepared p CROSS JOIN LATERAL fieldmaps_private.finalize_zone_package(
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000002',NULL,NULL,NULL,'93000000-0000-4000-8000-000000000004',1,
 p.value->'manifest',p.value->'layer','\x010203','[{"step":"archive","state":"passed","detail":"Synthetic first map"}]',
 b.value,convert_to((p.value->'layer')::text,'UTF8')) r;
SELECT pg_temp.assert_true((SELECT version=1 AND NOT replayed FROM first_upload_result)
 AND (SELECT current_package_id='93000000-0000-4000-8000-000000000004'
 FROM fieldmaps.site_zone_state WHERE site_id='93000000-0000-4000-8000-000000000001'),
 'first null-precondition upload atomically creates and activates map version 1');
SELECT pg_temp.assert_true((r.package).id='93000000-0000-4000-8000-000000000004' AND r.replayed,
 'first-upload replay resolves before the now-stale null current precondition')
FROM first_upload_body b CROSS JOIN LATERAL fieldmaps_private.finalize_zone_package(
 '10000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 '93000000-0000-4000-8000-000000000002',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,b.value) r;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM fieldmaps.site_packages WHERE site_id='93000000-0000-4000-8000-000000000001')
 AND (SELECT count(*)=1 FROM fieldmaps.package_zones WHERE package_id='93000000-0000-4000-8000-000000000004'),
 'replay creates neither duplicate package nor extra snapshots');
RESET ROLE;
