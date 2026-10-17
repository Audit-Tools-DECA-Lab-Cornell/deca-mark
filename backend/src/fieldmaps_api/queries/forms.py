from typing import Final

from sqlalchemy import text

#: Every form with its versions, newest first. RLS leaves drafts to the project's managers.
FORMS: Final = text("""
SELECT json_build_object('form_id', f.id, 'code', f.code, 'name', f.name,
  'created_at', f.created_at,
  'versions', coalesce((SELECT json_agg(json_build_object(
      'version_id', v.id, 'code', v.code, 'version', v.version, 'state', v.state,
      'revision', v.revision, 'title', v.definition ->> 'title',
      'question_count', CASE WHEN jsonb_typeof(v.definition -> 'questions') = 'array'
        THEN jsonb_array_length(v.definition -> 'questions') ELSE 0 END,
      'created_at', v.created_at, 'published_at', v.published_at) ORDER BY v.version DESC)
    FROM fieldmaps.form_versions v WHERE v.form_id = f.id), '[]'::json))::text
FROM fieldmaps.forms f WHERE f.project_id = :project ORDER BY f.name, f.id
""")

VERSION: Final = text("""
SELECT json_build_object(
  'version_id', v.id, 'code', v.code, 'version', v.version, 'state', v.state,
  'revision', v.revision, 'title', v.definition ->> 'title',
  'question_count', CASE WHEN jsonb_typeof(v.definition -> 'questions') = 'array'
    THEN jsonb_array_length(v.definition -> 'questions') ELSE 0 END,
  'created_at', v.created_at, 'published_at', v.published_at,
  'form_id', f.id, 'form_code', f.code, 'form_name', f.name, 'definition', v.definition)::text
FROM fieldmaps.form_versions v JOIN fieldmaps.forms f ON f.id = v.form_id
WHERE v.project_id = :project AND v.code = :code
""")

FORM: Final = text("""
SELECT json_build_object('id', f.id, 'code', f.code, 'organization_id', f.organization_id)::text
FROM fieldmaps.forms f WHERE f.project_id = :project AND f.code = :code
""")

LATEST_DEFINITION: Final = text("""
SELECT v.definition::text FROM fieldmaps.form_versions v
WHERE v.form_id = :form ORDER BY v.version DESC LIMIT 1
""")

NEXT_VERSION: Final = text("""
SELECT coalesce(max(version), 0) + 1 FROM fieldmaps.form_versions WHERE form_id = :form
""")

CREATE_FORM: Final = text("""
INSERT INTO fieldmaps.forms (id, organization_id, project_id, code, name, created_by)
VALUES (:id, :organization, :project, :code, :name, fieldmaps.request_user_id())
""")

CREATE_DRAFT: Final = text("""
INSERT INTO fieldmaps.form_versions
  (id, organization_id, project_id, form_id, version, code, definition, state, created_by)
VALUES (:id, :organization, :project, :form, :version, :code, CAST(:definition AS jsonb),
  'draft', fieldmaps.request_user_id())
""")

UPDATE_DRAFT: Final = text("""
UPDATE fieldmaps.form_versions SET definition = CAST(:definition AS jsonb)
WHERE project_id = :project AND code = :code AND state = 'draft'
  AND id = :version_id AND revision = :revision
RETURNING id
""")

DISCARD_DRAFT: Final = text("""
DELETE FROM fieldmaps.form_versions
WHERE project_id = :project AND code = :code AND state = 'draft'
  AND id = :version_id AND revision = :revision
RETURNING id
""")

PUBLISH: Final = text("SELECT fieldmaps_private.publish_form_version(:project, :id, :revision)")
RETIRE: Final = text("SELECT fieldmaps_private.retire_form_version(:project, :id)")
