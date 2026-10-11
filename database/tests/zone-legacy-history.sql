\set ON_ERROR_STOP on
BEGIN;
\ir assertions.sql
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM zone_rehearsal.before_packages b
  LEFT JOIN fieldmaps.site_packages p USING(id) WHERE b.value IS DISTINCT FROM to_jsonb(p)
    - ARRAY['zone_contract_version','site_boundary','inventory_form_version_id']),
  'publication and concurrency tests preserve all original archive bytes and package fields');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM zone_rehearsal.before_observations b
  LEFT JOIN fieldmaps.observations o USING(id) WHERE b.value IS DISTINCT FROM to_jsonb(o)
    - ARRAY['package_id','zone_id','upload_protocol']),
  'publication and concurrency tests preserve all original hashes, answers, coordinates, revisions and receipts');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM zone_rehearsal.before_observations b
  JOIN fieldmaps.observations o USING(id) WHERE o.package_id IS NOT NULL OR o.zone_id IS NOT NULL OR o.upload_protocol <> 1),
  'original observations remain unversioned after all publication paths execute');
ROLLBACK;
