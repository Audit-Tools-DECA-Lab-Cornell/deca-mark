-- Read-only assessment, not a migration. Run only on an explicitly authorized target.
-- Identifies the contradictory numeric bounds fixed by finding 4; not a full parser.
SELECT v.project_id, v.id AS form_version_id, v.code, v.state,
       q->>'id' AS question_id, q->'required' AS required, q->'min' AS minimum, q->'max' AS maximum,
       (SELECT count(*) FROM fieldmaps.observations o WHERE o.form_version_id=v.id) AS observations,
       (SELECT count(*) FROM fieldmaps.site_packages p
        WHERE p.form_version_id=v.id OR p.inventory_form_version_id=v.id) AS packages
FROM fieldmaps.form_versions v
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(v.definition->'questions')='array' THEN v.definition->'questions' ELSE '[]'::jsonb END
) AS q
WHERE q->>'kind'='number'
  AND CASE WHEN jsonb_typeof(q->'min')='number' AND jsonb_typeof(q->'max')='number'
           THEN (q->>'min')::numeric > (q->>'max')::numeric ELSE false END
ORDER BY v.project_id,v.code,q->>'id';
