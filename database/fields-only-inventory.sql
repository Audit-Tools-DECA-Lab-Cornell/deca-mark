-- Read-only inventory for an explicitly selected target. No migration or data rewrite.
-- Counts/UUIDs describe server references only; device queues must be inventoried separately.
SELECT v.organization_id, v.project_id, v.id AS form_version_id, v.code, v.state,
  CASE WHEN v.definition ? 'questions' THEN 'questions-and-fields'
       WHEN jsonb_typeof(v.definition->'fields') = 'array' THEN 'fields-only'
       ELSE 'unrecognized' END AS stored_format,
  v.definition,
  (SELECT count(*) FROM fieldmaps.observations o
   WHERE o.form_version_id = v.id) AS observations,
  (SELECT count(*) FROM fieldmaps.site_packages p
   WHERE p.form_version_id = v.id OR p.inventory_form_version_id = v.id) AS packages,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'package_id',p.id,'site_id',p.site_id,'version',p.version,'state',p.state,
      'archive_sha256',p.archive_sha256,
      'play',p.form_version_id = v.id,'inventory',coalesce(p.inventory_form_version_id = v.id,false),
      'current',EXISTS (SELECT 1 FROM fieldmaps.site_zone_state s
                       WHERE s.site_id=p.site_id AND s.current_package_id=p.id)) ORDER BY p.id),'[]')
   FROM fieldmaps.site_packages p
   WHERE p.form_version_id = v.id OR p.inventory_form_version_id = v.id) AS package_bindings,
  (SELECT count(*) FROM fieldmaps.zone_drafts d
   LEFT JOIN fieldmaps.site_packages b ON b.id = d.base_package_id
   WHERE b.form_version_id = v.id OR b.inventory_form_version_id = v.id
      OR d.inventory_form_version_id = v.id) AS drafts
FROM fieldmaps.form_versions v
WHERE NOT (v.definition ? 'questions') OR v.definition ? 'fields'
ORDER BY v.project_id, v.code;
