from typing import Final

from sqlalchemy import text

PACKAGES: Final = text("""
SELECT jsonb_build_object('package_id', k.id, 'site_id', k.site_id,
  'package_version', k.version, 'state', k.state, 'archive_bytes', octet_length(k.archive),
  'archive_sha256', k.archive_sha256, 'prepared_at', k.prepared_at,
  'forms', k.manifest->'forms', 'zone_count', jsonb_array_length(k.manifest->'zones'),
  'change_note', m.change_note, 'published_by', m.published_by, 'source', m.source)::text
FROM fieldmaps.site_packages k
JOIN fieldmaps.sites s ON s.id = k.site_id
JOIN LATERAL fieldmaps_private.zone_package_metadata(k.id) m ON true
WHERE k.project_id = :project
  AND (CAST(:site AS uuid) IS NULL OR k.site_id = CAST(:site AS uuid))
ORDER BY s.code, k.version DESC
""")

PACKAGE_DETAIL: Final = text("""
SELECT json_build_object('package_id', k.id, 'site_id', k.site_id,
  'package_version', k.version, 'state', k.state, 'archive_bytes', octet_length(k.archive),
  'archive_sha256', k.archive_sha256, 'prepared_at', k.prepared_at,
  'forms', k.manifest->'forms', 'zone_count', jsonb_array_length(k.manifest->'zones'),
  'change_note',m.change_note,'published_by',m.published_by,'source',m.source,'manifest',k.manifest,
  'checks', coalesce((SELECT json_agg(json_build_object('step', c.step, 'state', c.state,
      'detail', c.detail) ORDER BY c.position)
    FROM fieldmaps.package_checks c WHERE c.package_id = k.id), '[]'::json))::text
FROM fieldmaps.site_packages k
JOIN fieldmaps.sites s ON s.id = k.site_id
JOIN LATERAL fieldmaps_private.zone_package_metadata(k.id) m ON true
WHERE k.project_id = :project AND k.id = :id
""")

PACKAGE_ARCHIVE: Final = text("""
SELECT archive, archive_sha256, state FROM fieldmaps.site_packages
WHERE project_id = :project AND id = :id
""")

SITE_SELECT: Final = """
SELECT jsonb_build_object('site_id',s.id,'code',s.code,'name',s.name,
 'description',s.description,'created_at',s.created_at,
 'observation_count',(SELECT count(*) FROM fieldmaps.observations o
   WHERE o.site_id=s.id AND o.deleted_at IS NULL),
 'current_package_id',k.id,
 'package',CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object(
   'package_id',k.id,'site_id',k.site_id,'package_version',k.version,'state',k.state,
   'prepared_at',k.prepared_at,'archive_bytes',octet_length(k.archive),
   'archive_sha256',k.archive_sha256,'forms',k.manifest->'forms',
   'zone_count',jsonb_array_length(k.manifest->'zones'),'change_note',m.change_note,
   'published_by',m.published_by,'source',m.source) END,
 'zones',coalesce((SELECT jsonb_agg(jsonb_build_object('zone_id',z.zone_id,'zone_code',i.code,
   'label',z.label,'bbox',jsonb_build_array(extensions.ST_XMin(z.geom::extensions.box3d),
    extensions.ST_YMin(z.geom::extensions.box3d),extensions.ST_XMax(z.geom::extensions.box3d),
    extensions.ST_YMax(z.geom::extensions.box3d)),'display_anchor',
    jsonb_build_array(extensions.ST_X(z.display_anchor),extensions.ST_Y(z.display_anchor)),
    'geometry_sha256',z.geometry_sha256) ORDER BY i.code COLLATE "C")
   FROM fieldmaps.package_zones z JOIN fieldmaps.zone_identities i ON i.id=z.zone_id
   WHERE z.package_id=k.id),'[]'::jsonb),
 'extent',CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object(
   'west',extensions.ST_XMin(k.site_boundary::extensions.box3d),
   'south',extensions.ST_YMin(k.site_boundary::extensions.box3d),
   'east',extensions.ST_XMax(k.site_boundary::extensions.box3d),
   'north',extensions.ST_YMax(k.site_boundary::extensions.box3d)) END,
 'centre',CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_array(
   extensions.ST_X(extensions.ST_PointOnSurface(k.site_boundary)),
   extensions.ST_Y(extensions.ST_PointOnSurface(k.site_boundary))) END,
 'zone_editing_available',fieldmaps_private.zone_authoring_available(s.project_id,s.id))::text
FROM fieldmaps.sites s
LEFT JOIN fieldmaps.site_zone_state st ON st.site_id=s.id
LEFT JOIN fieldmaps.site_packages k ON k.id=st.current_package_id AND k.state='ready'
LEFT JOIN LATERAL fieldmaps_private.zone_package_metadata(k.id) m ON k.id IS NOT NULL
WHERE s.project_id=:project
"""
SITES: Final = text(SITE_SELECT + " ORDER BY s.name, s.id")
SITE: Final = text(SITE_SELECT + " AND s.id = :site")
SITE_BY_CODE: Final = text(
    "SELECT id FROM fieldmaps.sites WHERE project_id=:project AND code=:code"
)

PROJECT_ORGANIZATION: Final = text(
    "SELECT organization_id FROM fieldmaps.projects WHERE id = :project"
)

CREATE_SITE: Final = text("""
INSERT INTO fieldmaps.sites (id, organization_id, project_id, code, name, description, created_by)
VALUES (:id, :organization, :project, :code, :name, :description, fieldmaps.request_user_id())
""")

PATCH_SITE: Final = text("""
UPDATE fieldmaps.sites SET name = coalesce(:name, name),
  description = CASE WHEN :has_description THEN :description ELSE description END
WHERE project_id = :project AND id = :site
RETURNING id
""")
