from typing import Final

from sqlalchemy import text

PACKAGE_TARGET: Final = text("""
SELECT json_build_object('organization_id', p.organization_id,
  'site_id', s.id, 'form_version_id', f.id, 'definition', f.definition,
  'form_state', f.state)::text
FROM fieldmaps.projects p
JOIN fieldmaps.sites s ON s.project_id = p.id AND s.code = :site
JOIN fieldmaps.form_versions f ON f.project_id = p.id AND f.code = :form
WHERE p.id = :project AND fieldmaps_private.has_project_role(p.id, ARRAY['manager'])
""")

NEXT_PACKAGE_VERSION: Final = text("""
SELECT coalesce(max(version), 0) + 1 FROM fieldmaps.site_packages
WHERE project_id = :project AND site_id = :site
""")

INSERT_PACKAGE: Final = text("""
INSERT INTO fieldmaps.site_packages (id, organization_id, project_id, site_id, form_version_id,
  version, state, manifest, archive, archive_sha256, prepared_by)
VALUES (:id, :organization, :project, :site, :form, :version, :state,
  CAST(:manifest AS jsonb), :archive, :digest, :user_id)
RETURNING prepared_at
""")

INSERT_PACKAGE_CHECK: Final = text("""
INSERT INTO fieldmaps.package_checks (package_id, position, step, state, detail)
VALUES (:package, :position, :step, :state, :detail)
""")

PACKAGES: Final = text("""
SELECT json_build_object('package_id', k.id, 'site_code', s.code, 'form_version', f.code,
  'version', k.version, 'state', k.state, 'archive_bytes', octet_length(k.archive),
  'archive_sha256', k.archive_sha256, 'prepared_at', k.prepared_at,
  'format', (k.manifest->>'format')::integer, 'zone_contract_version', k.zone_contract_version,
  'map_revision', CASE WHEN k.zone_contract_version=1 THEN k.version ELSE NULL END)::text
FROM fieldmaps.site_packages k
JOIN fieldmaps.sites s ON s.id = k.site_id
JOIN fieldmaps.form_versions f ON f.id = k.form_version_id
WHERE k.project_id = :project
  AND (CAST(:site AS text) IS NULL OR s.code = CAST(:site AS text))
AND (k.manifest->>'format')::integer = ANY(CAST(:formats AS integer[]))
ORDER BY s.code, k.version DESC
""")

PACKAGE_DETAIL: Final = text("""
SELECT json_build_object('package_id', k.id, 'site_code', s.code, 'form_version', f.code,
  'version', k.version, 'state', k.state, 'archive_bytes', octet_length(k.archive),
  'archive_sha256', k.archive_sha256, 'prepared_at', k.prepared_at,
  'format', (k.manifest->>'format')::integer, 'zone_contract_version', k.zone_contract_version,
  'map_revision', CASE WHEN k.zone_contract_version=1 THEN k.version ELSE NULL END, 'manifest',
  k.manifest,
  'checks', coalesce((SELECT json_agg(json_build_object('step', c.step, 'state', c.state,
      'detail', c.detail) ORDER BY c.position)
    FROM fieldmaps.package_checks c WHERE c.package_id = k.id), '[]'::json))::text
FROM fieldmaps.site_packages k
JOIN fieldmaps.sites s ON s.id = k.site_id
JOIN fieldmaps.form_versions f ON f.id = k.form_version_id
WHERE k.project_id = :project AND k.id = :id
""")

PACKAGE_ARCHIVE: Final = text("""
SELECT archive, archive_sha256, state FROM fieldmaps.site_packages
WHERE project_id = :project AND id = :id
""")

#: A site as the workspace and the collector read it: its newest ready package, that package's
#: zones and extent, and how many observations the caller can see there.
BASE_SITE_SELECT: Final = """
SELECT json_build_object('site_id', s.id, 'code', s.code, 'name', s.name,
  'description', s.description, 'created_at', s.created_at,
  'package', (SELECT json_build_object('package_id', k.id, 'version', k.version,
      'form_version', (SELECT f.code FROM fieldmaps.form_versions f WHERE f.id = k.form_version_id),
      'archive_bytes', octet_length(k.archive), 'archive_sha256', k.archive_sha256,
      'prepared_at', k.prepared_at)
    FROM fieldmaps.site_packages k WHERE k.site_id = s.id AND k.state = 'ready'
    ORDER BY k.version DESC LIMIT 1),
  'zones', coalesce((SELECT k.manifest -> 'zones' FROM fieldmaps.site_packages k
    WHERE k.site_id = s.id AND k.state = 'ready' ORDER BY k.version DESC LIMIT 1), '[]'::jsonb),
  'extent', (SELECT k.manifest -> 'extent' FROM fieldmaps.site_packages k
    WHERE k.site_id = s.id AND k.state = 'ready' ORDER BY k.version DESC LIMIT 1),
  'centre', (SELECT k.manifest -> 'centre' FROM fieldmaps.site_packages k
    WHERE k.site_id = s.id AND k.state = 'ready' ORDER BY k.version DESC LIMIT 1),
  'observation_count', (SELECT count(*) FROM fieldmaps.observations o
    WHERE o.site_id = s.id AND o.deleted_at IS NULL))::text
FROM fieldmaps.sites s
WHERE s.project_id = :project
"""
LEGACY_SELECTION: Final = """k.id = CASE WHEN EXISTS (SELECT FROM fieldmaps.site_zone_state st
  WHERE st.site_id=s.id)
 THEN (SELECT st.legacy_package_id FROM fieldmaps.site_zone_state st WHERE st.site_id=s.id)
 ELSE (SELECT l.id FROM fieldmaps.site_packages l WHERE l.site_id=s.id AND l.state='ready'
 AND l.manifest->'format'='1'::jsonb ORDER BY l.version DESC LIMIT 1) END"""
SITE_SELECT: Final = BASE_SITE_SELECT.replace(
    "k.site_id = s.id AND k.state = 'ready'",
    "k.site_id = s.id AND k.state = 'ready' AND " + LEGACY_SELECTION,
)
SITES: Final = text(SITE_SELECT + " ORDER BY s.name, s.id")
SITE: Final = text(SITE_SELECT + " AND s.code = :code")

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
WHERE project_id = :project AND code = :code
RETURNING id
""")
