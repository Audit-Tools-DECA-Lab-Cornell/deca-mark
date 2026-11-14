"""Scoped library reads; all queries run under the caller's existing RLS."""

from pathlib import Path
from typing import Final

from sqlalchemy import text

LIBRARY: Final = text(Path(__file__).with_suffix(".sql").read_text())
SCOPE: Final = """
(v.level='universal' OR (v.level='organization' AND v.organization_id=:org)
 OR (CAST(:project AS uuid) IS NOT NULL AND v.project_id=:project))
"""
VARIABLE: Final = text(
    """
SELECT (to_jsonb(v)-'group_name'||jsonb_build_object('group',v.group_name))::text
FROM fieldmaps.library_variables v WHERE v.id=:id AND """
    + SCOPE
)
USAGE: Final = text(
    """
WITH matched AS MATERIALIZED (
 SELECT v.id,v.form_id,v.code,v.version,v.state,v.definition->>'title' AS title
 FROM fieldmaps.form_versions v
 WHERE v.organization_id=:org AND (CAST(:project AS uuid) IS NULL OR v.project_id=:project)
 AND EXISTS (SELECT FROM jsonb_array_elements(CASE
 WHEN jsonb_typeof(v.definition->'questions')='array'
   THEN v.definition->'questions' ELSE '[]'::jsonb END) q(value)
   WHERE q.value->'librarySource'->>'variableId'=CAST(CAST(:id AS uuid) AS text))
)
SELECT jsonb_build_object('forms',COALESCE((SELECT jsonb_agg(row ORDER BY row->>'form_id') FROM (
 SELECT jsonb_build_object('form_id',f.id,'form_code',f.code,'name',f.name,
   'project_id',p.id,'project_code',p.code,'organization_id',o.id,'organization_slug',o.slug,
   'versions',(SELECT jsonb_agg(jsonb_build_object('version_id',m.id,'version_code',m.code,
     'version',m.version,'state',m.state,'title',m.title) ORDER BY m.version DESC)
     FROM matched m WHERE m.form_id=f.id)) AS row
 FROM fieldmaps.forms f JOIN fieldmaps.projects p ON p.id=f.project_id
 JOIN fieldmaps.organizations o ON o.id=f.organization_id
 WHERE f.id IN (SELECT form_id FROM matched)
) forms),'[]'::jsonb),
'used_in_forms',(SELECT count(DISTINCT form_id) FROM matched),
'dependent_variables',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,
 'label',v.settings->>'label','level',v.level,'organization_id',v.organization_id,
 'project_id',v.project_id,'site_id',v.site_id) ORDER BY v.code,v.id)
 FROM fieldmaps.library_variables v WHERE
 (v.level='universal' OR (v.level='organization' AND v.organization_id=:org)
 OR (CAST(:project AS uuid) IS NOT NULL AND v.project_id=:project))
 AND (jsonb_path_exists(v.settings,'$.dependsOn.**.question ? (@ == $target)',
   jsonb_build_object('target',CAST(CAST(:id AS uuid) AS text)))
   OR v.settings->'dynamicFrom'->>'question'=CAST(CAST(:id AS uuid) AS text))),'[]'::jsonb),
 'can_edit',false,'templates','[]'::jsonb)::text
"""
)
