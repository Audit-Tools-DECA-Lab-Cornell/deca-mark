RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations
  WHERE upload_protocol=1 AND upload_hash_version IS NOT NULL),
  'legacy records preserve the original unversioned hash representation');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations
  WHERE upload_protocol=2 AND upload_hash_version IS DISTINCT FROM 'zone-upload-v2-jcs-1'),
  'every bound upload records the frozen JCS hash version');
SELECT pg_temp.assert_true(has_column_privilege('fieldmaps_api','fieldmaps.observations',
  'upload_hash_version','INSERT') AND NOT has_column_privilege('fieldmaps_api',
  'fieldmaps.observations','upload_hash_version','UPDATE'),
  'restricted API can insert but cannot rewrite a recorded hash version');
SELECT pg_temp.assert_rejected(format('UPDATE fieldmaps.observations SET upload_hash_version=NULL WHERE id=%L',
  :'inventory_id'),'23514','bound hash version cannot be removed');
SELECT pg_temp.assert_rejected(format('UPDATE fieldmaps.observations SET upload_hash_version=%L WHERE id=%L',
  'future-version',:'inventory_id'),'23514','bound hash version cannot be reinterpreted');
SELECT pg_temp.assert_rejected(format($q$
  INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
    observer_code,observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,
    upload_protocol,zone_code,round_type,first_round,placement_source,upload_hash_version)
  SELECT gen_random_uuid(),organization_id,project_id,site_id,form_version_id,observer_code,
    observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,upload_protocol,
    zone_code,round_type,first_round,placement_source,'unknown-hash-version'
  FROM fieldmaps.observations WHERE id=%L
  $q$,:'inventory_id'),'23514','unknown hash algorithm cannot be inserted');
