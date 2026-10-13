-- Validation describes changes against the live current snapshot without mutating it.
SELECT (fieldmaps_private.create_zone_draft(:'project',:'site','94000000-0000-4000-8000-000000000001',:'p3')).id AS changes_draft \gset
SELECT pg_temp.assert_true((SELECT bool_and(value->>'change'='unchanged')
 FROM jsonb_array_elements(fieldmaps_private.validate_zone_draft(:'project',:'site',:'changes_draft',1)->'zones')),
 'unchanged validation compares exact current geometry and label');
SELECT fieldmaps_private.change_zone_draft(:'project',:'site',:'changes_draft',1,
 (SELECT jsonb_set(zones,'{0,zone_label}','"Validation rename"') FROM fieldmaps.zone_drafts WHERE id=:'changes_draft'),'Label only');
SELECT pg_temp.assert_true((SELECT value->>'change'='label_changed' AND value->>'geometry_sha256' IS NOT NULL
 FROM jsonb_array_elements(fieldmaps_private.validate_zone_draft(:'project',:'site',:'changes_draft',2)->'zones')
 WHERE value->>'zone_id'='82000000-0000-4000-8000-000000000001'),
 'label-only validation retains geometry digest and reports label_changed');
SELECT fieldmaps_private.change_zone_draft(:'project',:'site',:'changes_draft',2,
 (SELECT jsonb_build_array(jsonb_set(zones->0,'{geometry}',
 '{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}'),
 '{"zone_id":"94000000-0000-4000-8000-000000000002","zone_code":"C","zone_label":"Added C","geometry":{"type":"Polygon","coordinates":[[[0.02,0],[0.025,0],[0.025,0.005],[0.02,0.005],[0.02,0]]]}}'::jsonb)
 FROM fieldmaps.zone_drafts WHERE id=:'changes_draft'),'Changed shape, removed B, added C');
SELECT pg_temp.assert_true((SELECT jsonb_object_agg(value->>'zone_id',value->>'change')=
 '{"82000000-0000-4000-8000-000000000001":"geometry_changed","82000000-0000-4000-8000-000000000002":"removed","94000000-0000-4000-8000-000000000002":"added"}'::jsonb
 FROM jsonb_array_elements(fieldmaps_private.validate_zone_draft(:'project',:'site',:'changes_draft',3)->'zones')),
 'validation covers added/removed and geometry_changed takes precedence over a label change');
SELECT pg_temp.assert_true((SELECT value->>'geometry_sha256'=z.geometry_sha256
 AND value->'display_anchor'=extensions.ST_AsGeoJSON(z.display_anchor,17)::jsonb->'coordinates'
 FROM jsonb_array_elements(fieldmaps_private.validate_zone_draft(:'project',:'site',:'changes_draft',3)->'zones') value
 JOIN fieldmaps.package_zones z ON z.package_id=:'p3' AND z.zone_id=(value->>'zone_id')::uuid
 WHERE value->>'change'='removed'), 'removed-zone validation retains its current snapshot digest and anchor');
SELECT pg_temp.assert_true((SELECT revision=3 AND state='draft' FROM fieldmaps.zone_drafts WHERE id=:'changes_draft')
 AND (SELECT current_package_id=:'p3' FROM fieldmaps.site_zone_state WHERE site_id=:'site'),
 'validation never advances the revision or current package');
SELECT fieldmaps_private.change_zone_draft(:'project',:'site',:'changes_draft',3,
 (SELECT jsonb_build_array(jsonb_set(zones->0,'{geometry}',
 '{"type":"Polygon","coordinates":[[[0,0],[0.01,0.01],[0.01,0],[0,0.01],[0,0]]]}'))
 FROM fieldmaps.zone_drafts WHERE id=:'changes_draft'),'Save invalid topology for correction');
SELECT pg_temp.assert_true((SELECT value->'geometry_sha256'='null'::jsonb AND value->'display_anchor'='null'::jsonb
 AND value->'change'='null'::jsonb AND value->'area_m2'='null'::jsonb AND value->'extent'='null'::jsonb
 FROM jsonb_array_elements(fieldmaps_private.validate_zone_draft(:'project',:'site',:'changes_draft',4)->'zones') value
 WHERE value->>'zone_id'='82000000-0000-4000-8000-000000000001'),
 'invalid proposed geometry has no misleading derived summary metadata');
SELECT fieldmaps_private.change_zone_draft(:'project',:'site',:'changes_draft',4,NULL,NULL,true);
