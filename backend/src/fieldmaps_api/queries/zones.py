from typing import Final

from sqlalchemy import text

SCOPE: Final = text("""
SELECT jsonb_build_object('site_id', s.id, 'code', s.code,
 'managed', z.site_id IS NOT NULL,
 'manager', fieldmaps_private.has_project_role(s.project_id, ARRAY['manager']),
 'current_package_id', coalesce(z.current_package_id, (
  SELECT k.id FROM fieldmaps.site_packages k WHERE k.site_id=s.id AND k.state='ready'
   AND k.manifest->'format'='1'::jsonb ORDER BY version DESC LIMIT 1)),
 'next_version', (SELECT coalesce(max(version),0)+1 FROM fieldmaps.site_packages WHERE
  site_id=s.id))::text
FROM fieldmaps.sites s LEFT JOIN fieldmaps.site_zone_state z ON z.site_id=s.id
WHERE s.project_id=:project AND s.id=:site
""")

DRAFT_SELECT: Final = """
SELECT jsonb_build_object('draft_id', d.id, 'site_id', d.site_id,
 'base_package_id', d.base_package_id, 'base_package_version', b.version,
 'current_package_id', coalesce(st.current_package_id, (
  SELECT k.id FROM fieldmaps.site_packages k WHERE k.site_id=d.site_id AND k.state='ready'
  AND k.manifest->'format'='1'::jsonb ORDER BY version DESC LIMIT 1)),
 'revision', d.revision, 'state', d.state, 'zones', d.zones, 'change_note', d.change_note,
 'updated_at', d.updated_at, 'updated_by', d.updated_by, 'published_package_id',
  d.published_package_id,
 'forms', jsonb_build_object('play', jsonb_build_object('form_version_id', pf.id,
  'form_version',pf.code),
 'inventory', CASE WHEN inf.id IS NULL THEN NULL ELSE
  jsonb_build_object('form_version_id',inf.id,'form_version',inf.code) END),
 'legacy_codes_requiring_mapping', coalesce((SELECT jsonb_agg(DISTINCT dz.value->>'zone_code')
 FROM jsonb_array_elements(d.zones) dz WHERE EXISTS (SELECT FROM fieldmaps.observations o
 WHERE o.site_id=d.site_id AND o.upload_protocol=1 AND o.zone_code=dz.value->>'zone_code')),
  '[]'::jsonb))::text
FROM fieldmaps.zone_drafts d JOIN fieldmaps.site_packages b ON b.id=d.base_package_id
JOIN fieldmaps.form_versions pf ON pf.id=b.form_version_id
LEFT JOIN fieldmaps.form_versions inf ON inf.id=d.inventory_form_version_id
LEFT JOIN fieldmaps.site_zone_state st ON st.site_id=d.site_id
WHERE d.project_id=:project AND d.site_id=:site
"""
GET_DRAFT: Final = text(DRAFT_SELECT + " AND d.id=:draft")
LIST_DRAFTS: Final = text(DRAFT_SELECT + " AND d.state=:state ORDER BY d.updated_at DESC, d.id")
CREATE_REPLAY: Final = text("""
SELECT id FROM fieldmaps.zone_drafts WHERE project_id=:project
 AND created_by=fieldmaps.request_user_id() AND create_request_id=:request
""")
CREATE: Final = text("""
SELECT id FROM fieldmaps_private.create_zone_draft(:project,:site,:request,:base,
 CAST(:ground AS jsonb),CAST(:zones AS jsonb),:inventory_supplied,CAST(:inventory AS text))
""")
CHANGE: Final = text("""
SELECT id FROM fieldmaps_private.change_zone_draft(:project,:site,:draft,:revision,
 CAST(:zones AS jsonb),CAST(:note AS text),:discard)
""")
VALIDATE: Final = text("""
SELECT fieldmaps_private.validate_zone_draft(:project,:site,:draft,:revision)::text
""")
REPLAY: Final = text("""
SELECT published_package_id FROM fieldmaps.zone_publications WHERE project_id=:project
 AND created_by=fieldmaps.request_user_id() AND operation=:operation AND request_id=:request
""")
FINALIZE: Final = text("""
SELECT (r.package).id, r.replayed FROM fieldmaps_private.finalize_zone_package(
 :project,:site,:request,:expected,:draft,:revision,:package,:version,
 CAST(:manifest AS jsonb),CAST(:layer AS jsonb),CAST(:archive AS bytea),
 CAST(:checks AS jsonb),CAST(:import_body AS jsonb),CAST(:layer_bytes AS bytea)) r
""")
HISTORY: Final = text("""
SELECT jsonb_build_object('site_id', k.site_id, 'package_id', k.id, 'package_version', k.version,
 'zones', coalesce((SELECT jsonb_agg(jsonb_build_object('zone_id', z.zone_id,'zone_code',i.code,
 'zone_label',z.label,'geometry',z.canonical_geometry,'display_anchor',
 jsonb_build_array(extensions.ST_X(z.display_anchor),extensions.ST_Y(z.display_anchor)),
 'geometry_sha256',z.geometry_sha256) ORDER BY i.code COLLATE "C") FROM fieldmaps.package_zones z
 JOIN fieldmaps.zone_identities i ON i.id=z.zone_id WHERE z.package_id=k.id),'[]'::jsonb))::text
FROM fieldmaps.site_packages k WHERE k.project_id=:project AND k.site_id=:site AND k.id=:package
 AND k.state='ready' AND k.zone_contract_version=1
""")
IMPORT_VALIDATE: Final = text("""
SELECT fieldmaps_private.validate_zone_import(:project,:site,:expected,CAST(:body AS jsonb))::text
""")
IMPORT_FORMS: Final = text("""
SELECT fieldmaps_private.resolve_zone_import_forms(
 :project,:site,:expected,CAST(:body AS jsonb))::text
""")
CAPABILITY: Final = text("""
SELECT fieldmaps_private.zone_authoring_available(:project,:site,CAST(:ground AS jsonb))
""")
SITE_BY_CODE: Final = text(
    "SELECT id FROM fieldmaps.sites WHERE project_id=:project AND code=:code"
)
GET_FORMS: Final = text("""
SELECT jsonb_build_object('play',jsonb_build_object('form_version_id',p.id,'form_version',p.code),
 'inventory',CASE WHEN i.id IS NULL THEN NULL ELSE
  jsonb_build_object('form_version_id',i.id,'form_version',i.code) END)::text
FROM fieldmaps.site_packages k JOIN fieldmaps.form_versions p ON p.id=k.form_version_id
LEFT JOIN fieldmaps.form_versions i ON i.id=k.inventory_form_version_id WHERE k.id=:package
""")
