\set ON_ERROR_STOP on
BEGIN;
\ir assertions.sql
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM zone_rehearsal.before_packages b
    FULL JOIN fieldmaps.site_packages p USING (id)
    WHERE b.value IS DISTINCT FROM to_jsonb(p) - ARRAY[
      'zone_contract_version', 'site_boundary', 'inventory_form_version_id']),
  'additive migration preserves every old package field and archive byte');
SELECT pg_temp.assert_true(
  NOT EXISTS ((SELECT value FROM zone_rehearsal.before_checks)
    EXCEPT (SELECT to_jsonb(c) FROM fieldmaps.package_checks c)),
  'additive migration preserves old checks');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM zone_rehearsal.before_observations b
    FULL JOIN fieldmaps.observations o USING (id)
    WHERE b.value IS DISTINCT FROM to_jsonb(o) - ARRAY[
      'package_id', 'zone_id', 'upload_protocol', 'upload_hash_version']),
  'additive migration preserves old hashes, answers, revisions, coordinates and receipts');
SELECT pg_temp.assert_true(
  (SELECT bool_and(package_id IS NULL AND zone_id IS NULL AND upload_protocol = 1
    AND upload_hash_version IS NULL)
    FROM fieldmaps.observations), 'all historical observations remain explicitly unversioned');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM fieldmaps.site_zone_state)
    AND NOT EXISTS (SELECT FROM fieldmaps.zone_identities)
    AND NOT EXISTS (SELECT FROM fieldmaps.package_zones),
  'schema installation does not adopt a site or invent historical zones');
ROLLBACK;
