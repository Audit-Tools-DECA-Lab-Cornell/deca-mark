WITH abilities AS MATERIALIZED (
 SELECT fieldmaps_private.has_org_role(CAST(:org AS uuid),ARRAY['owner','admin']) AS org_edit,
 CASE WHEN CAST(:project AS uuid) IS NULL THEN false ELSE
 fieldmaps_private.has_project_role(CAST(:project AS uuid),ARRAY['manager']) END AS project_edit
), visible AS MATERIALIZED (
 SELECT v.* FROM fieldmaps.library_variables v
 WHERE v.level='universal'
 OR (v.level='organization' AND v.organization_id=:org)
 OR (CAST(:project AS uuid) IS NOT NULL AND v.project_id=:project)
), scoped_versions AS MATERIALIZED (
 SELECT v.form_id,v.definition FROM fieldmaps.form_versions v
 WHERE v.organization_id=:org AND (CAST(:project AS uuid) IS NULL OR v.project_id=:project)
), usage AS (
 SELECT q.value->'librarySource'->>'variableId' AS variable_id,count(DISTINCT v.form_id) AS forms
 FROM scoped_versions v
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.definition->'questions')='array'
   THEN v.definition->'questions' ELSE '[]'::jsonb END) q(value)
 WHERE q.value->'librarySource'->>'variableId' IN (SELECT id::text FROM visible)
 GROUP BY q.value->'librarySource'->>'variableId'
)
SELECT jsonb_build_object(
 'context',CASE WHEN CAST(:project AS uuid) IS NULL THEN jsonb_build_object('organization_id',CAST(:org AS uuid))
   ELSE jsonb_build_object('organization_id',CAST(:org AS uuid),'project_id',CAST(:project AS uuid)) END,
 'sites',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code) ORDER BY s.id)
   FROM fieldmaps.sites s WHERE s.project_id=:project),'[]'::jsonb),
 'variables',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'variable',to_jsonb(v)-'group_name'||jsonb_build_object('group',v.group_name),
   'used_in_forms',COALESCE(u.forms,0),
   'can_edit',CASE WHEN v.level='universal' THEN false WHEN v.level='organization'
     THEN (SELECT org_edit FROM abilities)
     ELSE (SELECT project_edit FROM abilities) END)
   ORDER BY CASE v.level WHEN 'universal' THEN 0 WHEN 'organization' THEN 1 WHEN 'project' THEN 2 ELSE 3 END,
     v.site_id,v.code,v.id) FROM visible v LEFT JOIN usage u ON u.variable_id=v.id::text),'[]'::jsonb)
)::text
