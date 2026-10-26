BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('sampled_at',now(),
 'packages',(SELECT coalesce(jsonb_agg(x ORDER BY x.id),'[]') FROM (
  SELECT p.id,p.project_id,p.site_id,p.version,p.state,p.prepared_at,p.archive_sha256,
   encode(extensions.digest(p.archive,'sha256'),'hex')=p.archive_sha256 AS archive_digest_matches,
   p.form_version_id,p.inventory_form_version_id,
   v.code AS play_form_code,iv.code AS inventory_form_code,
   EXISTS(SELECT 1 FROM fieldmaps.site_zone_state s WHERE s.current_package_id=p.id) AS current,
   (SELECT count(*) FROM fieldmaps.observations o WHERE o.package_id=p.id) AS observations,
   (SELECT count(*) FROM fieldmaps.package_zones z WHERE z.package_id=p.id) AS zones,
   (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(p.manifest) k) AS manifest_keys,
   p.manifest->'forms' AS manifest_forms
   FROM fieldmaps.site_packages p
   LEFT JOIN fieldmaps.form_versions v ON v.id=p.form_version_id
   LEFT JOIN fieldmaps.form_versions iv ON iv.id=p.inventory_form_version_id) x),
 'receipts',(SELECT jsonb_build_object('observations',count(*),
    'valid_upload_hashes',count(*) FILTER (WHERE upload_hash ~ '^[a-f0-9]{64}$'),
    'missing_form',count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM fieldmaps.form_versions v WHERE v.id=o.form_version_id)),
    'missing_package',count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM fieldmaps.site_packages p WHERE p.id=o.package_id)),
    'missing_zone_snapshot',count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM fieldmaps.package_zones z WHERE z.package_id=o.package_id AND z.zone_id=o.zone_id)),
    'newest_received_at',max(received_at),
    'snapshot_sha256',encode(extensions.digest(coalesce(string_agg(to_jsonb(o)::text,E'\n' ORDER BY o.id),''),'sha256'),'hex'))
    FROM fieldmaps.observations o)
) AS inventory;
ROLLBACK;
