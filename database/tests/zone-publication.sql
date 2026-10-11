\ir zone-publication-fixtures.sql
\ir zone-publication-helpers.sql
GRANT SELECT ON pg_temp.bounded_zone_sets TO fieldmaps_api;
\set project '10000000-0000-4000-8000-000000000002'
\set site '80000000-0000-4000-8000-000000000001'
\set base '81000000-0000-4000-8000-000000000001'
\set geometry_cases `cat /tmp/fieldmaps-tests/zone-geometry.cases.json`
CREATE FUNCTION pg_temp.zone_create(p_request uuid, p_inventory boolean DEFAULT false) RETURNS fieldmaps.zone_drafts LANGUAGE sql AS $$
  SELECT fieldmaps_private.create_zone_draft('10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001',
    p_request, '81000000-0000-4000-8000-000000000001',
    '{"type":"Polygon","coordinates":[[[0,0],[0.03,0],[0.03,0.02],[0,0.02],[0,0]]]}',
    '[{"zone_code":"A","zone_label":"Original A","geometry":{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]],[[0.003,0.003],[0.003,0.007],[0.007,0.007],[0.007,0.003],[0.003,0.003]]]}},
      {"zone_code":"B","zone_label":"Original B","geometry":{"type":"Polygon","coordinates":[[[0.01,0],[0.02,0],[0.02,0.01],[0.01,0.01],[0.01,0]]]}}]',
    p_inventory, CASE WHEN p_inventory THEN 'db16-inventory-v1' ELSE NULL END);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.zone_create(uuid, boolean) TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_create('84000000-0000-4000-8000-000000000001')$q$,
  'FM006', 'observer cannot create zone drafts');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000003', true);
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_create('84000000-0000-4000-8000-000000000001')$q$,
  'FM006', 'viewer cannot create zone drafts');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_create('84000000-0000-4000-8000-000000000001')$q$,
  'FM006', 'another tenant manager cannot create drafts here');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000001', true);
SELECT (pg_temp.zone_create('84000000-0000-4000-8000-000000000001')).id AS admin_draft \gset
SELECT pg_temp.assert_true(:'admin_draft'::uuid IS NOT NULL, 'inherited organization admin can create a draft');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
\ir zone-set-validation.sql
\ir zone-publication-limits.sql
SELECT (pg_temp.zone_create('84000000-0000-4000-8000-000000000001', true)).id AS d1 \gset
SELECT (pg_temp.zone_create('84000000-0000-4000-8000-000000000002')).id AS d2 \gset
SELECT pg_temp.assert_true((pg_temp.zone_create('84000000-0000-4000-8000-000000000001', true)).id = :'d1'
  AND (SELECT inventory_form_version_id = '80000000-0000-4000-8000-000000000004' FROM zone_drafts WHERE id = :'d1'),
  'create replay retains provisional UUIDs and explicitly selected inventory form');
SELECT pg_temp.assert_true((SELECT inventory_form_version_id IS NULL FROM zone_drafts WHERE id = :'d2')
  AND NOT EXISTS (SELECT FROM site_zone_state WHERE site_id = :'site')
  AND NOT EXISTS (SELECT FROM zone_identities WHERE site_id = :'site'), 'draft creation does not adopt or infer inventory/identity');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_create('84000000-0000-4000-8000-000000000001', false)$q$,
  'ZB004', 'create request reuse with different form selection conflicts');
SELECT pg_temp.assert_true(fieldmaps_private.validate_zone_draft(:'project', :'site', :'d1', 1)
  #>> '{issues,0,code}' = 'legacy_mapping_required', 'legacy code publication requires an explicit mapping note');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.change_zone_draft(%L,%L,%L,NULL,%L,%L)',
  :'project', :'site', :'d1', '[]', ''), 'ZB006', 'missing draft revision requires a precondition');
SELECT fieldmaps_private.change_zone_draft(:'project', :'site', :'d1', 1,
  (SELECT jsonb_set(zones,'{0,zone_label}',to_jsonb(chr(160)||'Original A'||chr(8199))) FROM zone_drafts WHERE id = :'d1'),
  chr(160)||'Map legacy A to the submitted new UUID; old records remain unversioned.'||chr(12288));
SELECT pg_temp.assert_true((SELECT zones #>> '{0,zone_label}' = 'Original A'
  AND change_note = 'Map legacy A to the submitted new UUID; old records remain unversioned.' FROM zone_drafts WHERE id = :'d1'),
  'draft mutation trims Unicode whitespace from labels and notes');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.change_zone_draft(%L,%L,%L,1,%L,%L)',
  :'project', :'site', :'d1', '[]', ''), 'ZB002', 'stale whole-draft replacement cannot overwrite work');
SELECT pg_temp.assert_true((fieldmaps_private.validate_zone_draft(:'project', :'site', :'d1', 2) ->> 'ready')::boolean
  AND (SELECT revision = 2 FROM zone_drafts WHERE id = :'d1'), 'validation is ready and does not mutate revision');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_publish(%L,2,%L,%L,%L,3,%L)', :'d1',
  '85000000-0000-4000-8000-000000000001', :'base', '81000000-0000-4000-8000-000000000003', 'digest'),
  'ZB001', 'manifest geometry checksum must match normalized snapshots');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_publish(%L,2,%L,%L,%L,3,%L)', :'d1',
  '85000000-0000-4000-8000-000000000001', :'base', '81000000-0000-4000-8000-000000000003', 'anchor'),
  'ZB001', 'manifest anchor cannot substitute a different covered point');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_publish(%L,2,%L,%L,%L,3,%L)', :'d1',
  '85000000-0000-4000-8000-000000000001', :'base', '81000000-0000-4000-8000-000000000003', 'layer'),
  'ZB001', 'archive layer input must match canonical snapshot geometry');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_publish(%L,2,%L,%L,%L,3,%L)', :'d1',
  '85000000-0000-4000-8000-000000000001', :'base', '81000000-0000-4000-8000-000000000003', 'check'),
  '23514', 'check failure after package insertion rolls back the transaction');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM site_packages WHERE id = '81000000-0000-4000-8000-000000000003')
  AND NOT EXISTS (SELECT FROM site_zone_state WHERE site_id = :'site')
  AND (SELECT state = 'draft' AND revision = 2 FROM zone_drafts WHERE id = :'d1'), 'failed finalization leaves no package, activation or draft transition');
RESET ROLE;
CREATE FUNCTION pg_temp.abort_final_draft_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Synthetic failure after snapshot, audit and pointer insertion';
END;
$$;
CREATE TRIGGER synthetic_publication_failure BEFORE UPDATE ON fieldmaps.zone_drafts
  FOR EACH ROW WHEN (NEW.state = 'published') EXECUTE FUNCTION pg_temp.abort_final_draft_transition();
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_publish(%L,2,%L,%L,%L,3)', :'d1',
  '85000000-0000-4000-8000-000000000001', :'base', '81000000-0000-4000-8000-000000000003'),
  'P0001', 'failure after snapshot, audit and activation rolls back the full publication');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM site_packages WHERE id = '81000000-0000-4000-8000-000000000003')
  AND NOT EXISTS (SELECT FROM zone_identities WHERE site_id = :'site') AND NOT EXISTS (SELECT FROM zone_publications WHERE site_id = :'site')
  AND NOT EXISTS (SELECT FROM site_zone_state WHERE site_id = :'site') AND (SELECT revision = 2 AND state = 'draft' FROM zone_drafts WHERE id = :'d1'),
  'late failure retains only original legacy artifacts and editable draft');
RESET ROLE;
DROP TRIGGER synthetic_publication_failure ON fieldmaps.zone_drafts;
SET LOCAL ROLE fieldmaps_api;
SELECT (pg_temp.zone_publish(:'d1', 2, '85000000-0000-4000-8000-000000000001', :'base',
  '81000000-0000-4000-8000-000000000003', 3)).id AS p3 \gset
SELECT pg_temp.assert_true((SELECT revision = 3 AND legacy_package_id = :'base' AND current_package_id = :'p3'
  FROM site_zone_state WHERE site_id = :'site') AND (SELECT state = 'published' AND revision = 3 AND published_package_id = :'p3'
  FROM zone_drafts WHERE id = :'d1'), 'first publication atomically adopts, freezes legacy selection and skips blocked version 2');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM package_zones WHERE package_id = :'p3')
  AND (SELECT count(*) = 2 FROM zone_identities WHERE site_id = :'site'), 'only successful publication creates complete durable identities and snapshots');
SELECT pg_temp.assert_rejected(format('SELECT pg_temp.zone_publish(%L,1,%L,%L,%L,4)', :'d2',
  '85000000-0000-4000-8000-000000000002', :'base', '81000000-0000-4000-8000-000000000004'),
  'ZB003', 'distinct stale publication does not activate a second package');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.change_zone_draft(%L,%L,%L,3,NULL,NULL,true)',
  :'project', :'site', :'d1'), 'FM008', 'published draft cannot be discarded');
SELECT pg_temp.assert_rejected($q$INSERT INTO site_packages(id,organization_id,project_id,site_id,form_version_id,version,state,
  manifest,archive,archive_sha256,prepared_by) VALUES ('81000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',99,'ready','{"format":1}','\x01',repeat('a',64),fieldmaps.request_user_id())$q$,
  'ZB006', 'managed-site direct legacy import cannot bypass finalization');
SELECT pg_temp.assert_rejected($q$INSERT INTO package_checks VALUES ('81000000-0000-4000-8000-000000000003',99,'archive','passed','Late append')$q$,
  'ZB006', 'runtime cannot append checks to a managed publication');
SELECT (fieldmaps_private.create_zone_draft(:'project', :'site', '84000000-0000-4000-8000-000000000003', :'p3')).id AS d3 \gset
SELECT pg_temp.assert_true((SELECT inventory_form_version_id = '80000000-0000-4000-8000-000000000004'
  FROM zone_drafts WHERE id = :'d3'), 'format-2 draft inherits exact frozen forms');
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.create_zone_draft(%L,%L,%L,%L,NULL,NULL,true,NULL)',
  :'project', :'site', '84000000-0000-4000-8000-000000000004', :'p3'), 'ZB001', 'explicit null cannot override inherited inventory');
SELECT fieldmaps_private.change_zone_draft(:'project', :'site', :'d3', 1,
  (SELECT jsonb_build_array(jsonb_set(zones -> 0, '{zone_label}', '"Renamed A"')) FROM zone_drafts WHERE id = :'d3'), 'Retain A, remove B.');
SELECT (pg_temp.zone_publish(:'d3', 2, '85000000-0000-4000-8000-000000000003', :'p3',
  '81000000-0000-4000-8000-000000000004', 4)).id AS p4 \gset
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND min(label) = 'Renamed A' FROM package_zones WHERE package_id = :'p4')
  AND (SELECT count(*) = 2 AND bool_and(label LIKE 'Original %') FROM package_zones WHERE package_id = :'p3'),
  'rename and removal retain historical snapshots and labels');
SELECT pg_temp.assert_true((r.package).id = :'p3' AND r.replayed
  AND (SELECT current_package_id = :'p4' FROM site_zone_state WHERE site_id = :'site'),
  'old replay returns its original package before stale preconditions without moving current backwards')
FROM fieldmaps_private.finalize_zone_package(:'project', :'site', '85000000-0000-4000-8000-000000000001',
  :'base', :'d1', 2, NULL, NULL, NULL, NULL, NULL, NULL) r;
SELECT pg_temp.assert_rejected(format('SELECT fieldmaps_private.finalize_zone_package(%L,%L,%L,%L,%L,3,NULL,NULL,NULL,NULL,NULL,NULL)',
  :'project', :'site', '85000000-0000-4000-8000-000000000001', :'base', :'d1'), 'ZB004', 'changed revision under published request ID conflicts');
SELECT (fieldmaps_private.create_zone_draft(:'project', :'site', '84000000-0000-4000-8000-000000000004', :'p4')).id AS d4 \gset
SELECT fieldmaps_private.change_zone_draft(:'project', :'site', :'d4', 1,
  (SELECT zones FROM zone_drafts WHERE id = :'d1'), 'Explicit rollback by publishing original boundaries as a new package.');
SELECT (pg_temp.zone_publish(:'d4', 2, '85000000-0000-4000-8000-000000000004', :'p4',
  '81000000-0000-4000-8000-000000000005', 5)).id AS p5 \gset
SELECT pg_temp.assert_true((SELECT revision = 5 AND current_package_id = :'p5' AND legacy_package_id = :'base'
  FROM site_zone_state WHERE site_id = :'site'), 'rollback publishes a higher version and retains all prior artifacts');
SELECT fieldmaps_private.change_zone_draft(:'project', :'site', :'d2', 1, NULL, NULL, true);
SELECT pg_temp.assert_true((fieldmaps_private.change_zone_draft(:'project', :'site', :'d2', 2, NULL, NULL, true)).revision = 2,
  'discard replay accepts the acknowledged discarded revision');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT upload_protocol = 1 AND package_id IS NULL AND zone_id IS NULL AND first_round = false
  AND upload_hash = repeat('e',64) AND revision = 1 FROM observations WHERE id = '83000000-0000-4000-8000-000000000001'),
  'adoption never backfills legacy inventory, hash or revision');
