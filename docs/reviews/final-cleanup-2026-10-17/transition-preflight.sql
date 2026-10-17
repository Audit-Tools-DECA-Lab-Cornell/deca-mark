SELECT v.project_id, v.id, v.code, v.state,
  (SELECT count(*) FROM fieldmaps.observations o
   WHERE o.form_version_id = v.id) AS observations,
  (SELECT count(*) FROM fieldmaps.site_packages p
   WHERE p.form_version_id = v.id OR p.inventory_form_version_id = v.id) AS packages,
  (SELECT count(*) FROM fieldmaps.zone_drafts d
   JOIN fieldmaps.site_packages b ON b.id = d.base_package_id
   WHERE b.form_version_id = v.id OR d.inventory_form_version_id = v.id) AS drafts
FROM fieldmaps.form_versions v
WHERE NOT (v.definition ? 'questions')
ORDER BY v.project_id, v.code;
