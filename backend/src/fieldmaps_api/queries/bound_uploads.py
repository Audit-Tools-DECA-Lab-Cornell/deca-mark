from typing import Final

from sqlalchemy import text

TARGET: Final = text("""
SELECT json_build_object('organization_id', p.organization_id, 'site_id', p.site_id,
  'ready', (p.state = 'ready' AND p.zone_contract_version = 1
    AND p.manifest->>'format' = '2') IS TRUE,
  'zone_present', z.zone_id IS NOT NULL, 'form_version_id', f.id,
  'form_version', f.code, 'definition', f.definition,
  'point_covered', CASE WHEN CAST(:longitude AS double precision) IS NULL THEN true ELSE
    coalesce(extensions.ST_Covers(z.geom, fieldmaps.make_point(:longitude, :latitude)), false)
  END)::text
FROM fieldmaps.site_packages p
LEFT JOIN fieldmaps.package_zones z ON z.package_id = p.id AND z.zone_id = :zone
LEFT JOIN fieldmaps.form_versions f ON f.id = CASE WHEN :round_type = 'inventory'
  THEN p.inventory_form_version_id ELSE p.form_version_id END
  AND f.state IN ('published', 'retired')
WHERE p.id = :package AND p.project_id = :project
""")

INSERT: Final = text("""
INSERT INTO fieldmaps.observations (id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, geom, answers, created_by, upload_hash,
  round_type, first_round, placement_source, package_id, zone_id, upload_protocol,
  upload_hash_version)
VALUES (:id, :organization, :project, :site, :form, :observer, :observed_at,
  CASE WHEN CAST(:longitude AS double precision) IS NULL THEN NULL ELSE
    fieldmaps.make_point(:longitude, :latitude) END,
  CAST(:answers AS jsonb), :user_id, :fingerprint,
  :round_type, :first_round, :placement, :package, :zone, 2, 'zone-upload-v2-jcs-1')
ON CONFLICT (id) DO NOTHING
""")
