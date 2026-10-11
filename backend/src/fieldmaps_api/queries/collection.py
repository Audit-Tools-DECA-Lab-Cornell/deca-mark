from typing import Final

from sqlalchemy import text

AUTHORIZE_UPLOAD: Final = text("SELECT fieldmaps_private.assert_zone_observer(:project)")

STORED_RECEIPT: Final = text("""
SELECT json_build_object('observation_id', id, 'project_id', project_id,
  'user_id', created_by, 'accepted_revision', 1, 'received_at', received_at,
  'upload_hash', upload_hash, 'upload_protocol', upload_protocol,
  'upload_hash_version', upload_hash_version, 'package_id', package_id, 'zone_id', zone_id)::text
FROM fieldmaps.observations WHERE id = :id
""")

UPLOAD_TARGET: Final = text("""
SELECT json_build_object('organization_id', p.organization_id,
  'site_id', s.id, 'form_version_id', f.id, 'definition', f.definition)::text
FROM fieldmaps.projects p
JOIN fieldmaps.sites s ON s.project_id = p.id AND s.code = :site
JOIN fieldmaps.form_versions f ON f.project_id = p.id AND f.code = :form
  AND f.state IN ('published', 'retired')
WHERE p.id = :project
  AND fieldmaps_private.has_project_role(p.id, ARRAY['observer','manager'])
""")

INSERT_OBSERVATION: Final = text("""
INSERT INTO fieldmaps.observations (id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, geom, answers, created_by, upload_hash,
  zone_code, round_type, first_round, placement_source)
VALUES (:id, :organization, :project, :site, :form, :observer, :observed_at,
  fieldmaps.make_point(:longitude, :latitude),
  CAST(:answers AS jsonb), :user_id, :fingerprint,
  :zone, :round_type, :first_round, :placement)
ON CONFLICT (id) DO NOTHING RETURNING id
""")

OBSERVATION: Final = text("""
SELECT json_build_object('observation_id', o.id, 'project_id', o.project_id,
  'observer', o.observer_code, 'coordinates',
  json_build_array(fieldmaps.longitude(o.geom), fieldmaps.latitude(o.geom)),
  'answers', o.answers, 'observed_at', o.observed_at, 'revision', o.revision,
  'site_code', s.code, 'site_name', s.name, 'form_version', f.code,
  'received_at', o.received_at, 'zone', o.zone_code,
  'round_type', coalesce(o.round_type, 'standard'),
  'first_round', o.first_round, 'placement', o.placement_source)::text
FROM fieldmaps.observations o
JOIN fieldmaps.sites s ON s.id = o.site_id
JOIN fieldmaps.form_versions f ON f.id = o.form_version_id
WHERE o.id = :id AND o.project_id = :project AND o.deleted_at IS NULL
""")

#: What a project's members can see, newest first, with its round context. Training records stay
#: visible only to their creator (RLS), so a manager's list never shows another trainee's. A record
#: uploaded without a round (practice uploads, and every record from before D26) is a play event
#: outside any reliability round: it lists, and filters, as Standard.
OBSERVATIONS: Final = text("""
SELECT json_build_object('observation_id', o.id, 'observer', o.observer_code,
  'observed_at', o.observed_at, 'received_at', o.received_at,
  'coordinates', json_build_array(fieldmaps.longitude(o.geom), fieldmaps.latitude(o.geom)),
  'site_code', s.code, 'site_name', s.name, 'form_version', f.code,
  'zone', o.zone_code, 'round_type', coalesce(o.round_type, 'standard'),
  'first_round', o.first_round,
  'placement', o.placement_source, 'answers', o.answers, 'revision', o.revision)::text
FROM fieldmaps.observations o
JOIN fieldmaps.sites s ON s.id = o.site_id
JOIN fieldmaps.form_versions f ON f.id = o.form_version_id
WHERE o.project_id = :project AND o.deleted_at IS NULL
  AND (CAST(:site AS text) IS NULL OR s.code = CAST(:site AS text))
  AND (CAST(:round_type AS text) IS NULL
    OR coalesce(o.round_type, 'standard') = CAST(:round_type AS text))
  AND (CAST(:since AS timestamptz) IS NULL OR o.received_at >= CAST(:since AS timestamptz))
ORDER BY o.observed_at DESC, o.id
LIMIT :limit
""")
