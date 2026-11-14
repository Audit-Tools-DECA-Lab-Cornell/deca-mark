-- Local test fixtures only. supabase/seed.sql runs on a local reset and in the disposable rehearsals; no
-- hosted target ever applies it, and the migrations own everything a hosted database starts from. The
-- practice organization, project and site come from the baseline. The practice form below is a fixture that
-- the SQL and API suites bind packages and observations to; hosted databases carry no such form (DB-20).
INSERT INTO fieldmaps.forms (id, organization_id, project_id, code, name)
VALUES ('77f41d15-b653-465a-abb9-39f19f606851', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'shell', 'shell')
ON CONFLICT DO NOTHING;
INSERT INTO fieldmaps.form_versions (id, organization_id, project_id, code, definition, form_id, version, state, published_at)
VALUES ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'shell-v1', '{"version": "shell-v1", "title": "Shell practice", "summary": "Synthetic practice counts and notes.", "source": "Original shell practice fields", "status": "published", "inclusion": "Synthetic practice only.", "questions": [{"id": "people", "code": "people", "exportColumn": "people", "act": "Social", "label": "people", "kind": "number", "required": true, "min": 0, "max": 999, "source": "Original shell practice fields"}, {"id": "notes", "code": "notes", "exportColumn": "notes", "act": "Record", "label": "notes", "kind": "text", "required": false, "maxLength": 1000, "source": "Original shell practice fields"}]}',
  '77f41d15-b653-465a-abb9-39f19f606851', 1, 'published', now())
ON CONFLICT DO NOTHING;

-- Local synthetic identities.
INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at)
SELECT id, '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated', label || '@fieldmaps-test.invalid', now()
FROM (VALUES
  ('50000000-0000-4000-8000-000000000001'::uuid, 'observer'),
  ('50000000-0000-4000-8000-000000000002'::uuid, 'outsider'),
  ('50000000-0000-4000-8000-000000000003'::uuid, 'viewer'),
  ('50000000-0000-4000-8000-000000000004'::uuid, 'manager')
) AS fixtures(id, label)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fieldmaps.profiles (user_id)
SELECT id FROM auth.users WHERE id IN (
  '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000004')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO fieldmaps.project_memberships (user_id, organization_id, project_id, role)
SELECT id, '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid, role
FROM (VALUES
  ('50000000-0000-4000-8000-000000000001'::uuid, 'observer'),
  ('50000000-0000-4000-8000-000000000003'::uuid, 'viewer'),
  ('50000000-0000-4000-8000-000000000004'::uuid, 'manager')
) AS fixtures(id, role)
ON CONFLICT (user_id, project_id) DO NOTHING;

-- BEGIN GENERATED PROVISIONAL LIBRARY SEED (local/test only; contracts/library/universal.json).
INSERT INTO fieldmaps.library_variables(id,level,code,group_name,section,settings)
SELECT id,'universal',code,group_name,section,settings FROM jsonb_to_recordset($library$[{"id": "71fbbc77-5315-459d-813f-de50c37b60be", "code": "PlaySummary1", "section": "Play", "settings": {"label": "Play Event Summary", "exportColumn": "Play_Event_Summary", "kind": "text", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B58", "hint": "Write a detailed description of the play event", "maxLength": 1000}, "group_name": "Play Event Summary"}, {"id": "73b7be2c-441d-4547-a969-da7c0afcde52", "code": "Clothing1", "section": "Child", "settings": {"label": "Target Child Clothing Color/Description", "exportColumn": "Child_Clothing", "kind": "text", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B59", "hint": "Describe child's shirt/main clothing item by color and/or pattern", "maxLength": 500}, "group_name": "Target Child Details"}, {"id": "ce4e4a68-34eb-4091-a9f4-40834bad66b0", "code": "Age1", "section": "Child", "settings": {"label": "Child Age range", "exportColumn": "Child_AgeRange", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B61", "hint": "Choose most appropriate range", "options": [{"code": "option_1", "label": "0-2 yrs"}, {"code": "option_2", "label": "3-5 yrs"}, {"code": "option_3", "label": "6-8 yrs"}, {"code": "option_4", "label": "9-12yrs"}, {"code": "option_5", "label": "13-16yrs"}, {"code": "option_6", "label": "17+"}]}, "group_name": "Target Child Details"}, {"id": "3fd87700-e72b-484b-9dad-e5fe2877d9b1", "code": "Age2", "section": "Child", "settings": {"label": "Child Age Range", "exportColumn": "Child_AgeRange", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B67", "hint": "Choose most appropriate range", "options": [{"code": "option_1", "label": "0-5 yrs"}, {"code": "option_2", "label": "6-10 yrs"}, {"code": "option_3", "label": "11-15 yrs"}, {"code": "option_4", "label": "16+ yrs"}]}, "group_name": "Target Child Details"}, {"id": "11a062d6-0af6-4243-b91c-042bb230dcce", "code": "Age3", "section": "Child", "settings": {"label": "Child Age Range Early Years", "exportColumn": "Child_AgeRange_EY", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B71", "hint": "Choose most appropriate range", "options": [{"code": "option_1", "label": "0-2 yrs"}, {"code": "option_2", "label": "3-5 yrs"}]}, "group_name": "Target Child Details"}, {"id": "6c09600c-261d-472e-8669-8878b43a0ac5", "code": "PlayType1", "section": "Play", "settings": {"label": "Primary Play Type 1", "exportColumn": "Play_Type_1", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B120", "hint": "Select a primary type of play involved in the play event", "options": [{"code": "option_1", "label": "Physical"}, {"code": "option_2", "label": "Exploratory"}, {"code": "option_3", "label": "Imaginative"}, {"code": "option_4", "label": "Play with Rules"}, {"code": "option_5", "label": "Bio"}, {"code": "option_6", "label": "Expressive"}, {"code": "option_7", "label": "Restorative"}, {"code": "option_8", "label": "Digital"}, {"code": "option_9", "label": "Non-Play"}]}, "group_name": "Play Type Details"}, {"id": "280891d6-e03c-4f5b-8fa9-b4a13693dfd4", "code": "PlayType2", "section": "Play", "settings": {"label": "Primary Play Type 2", "exportColumn": "Play_Type_2", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B129", "hint": "Select a primary type of play involved in the play event", "options": [{"code": "option_1", "label": "Physical"}, {"code": "option_2", "label": "Exploratory"}, {"code": "option_3", "label": "Imaginative"}, {"code": "option_4", "label": "Play with Rules"}, {"code": "option_5", "label": "Bio"}, {"code": "option_6", "label": "Expressive"}, {"code": "option_7", "label": "Restorative"}, {"code": "option_8", "label": "Digital"}, {"code": "option_9", "label": "Non-Play"}]}, "group_name": "Play Type Details"}, {"id": "e50f4320-227f-4338-87f8-174ae5e6eae5", "code": "CARS1", "section": "Play", "settings": {"label": "CARS Activity Intensity Expanded", "exportColumn": "CARS", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B172", "hint": "Choose the most appropriate (or longest lasting) activity intensity level", "options": [{"code": "option_1", "label": "1 (Stationary)"}, {"code": "option_2", "label": "2 (stationary but moving limbs)"}, {"code": "option_3", "label": "3 (Slow)"}, {"code": "option_4", "label": "4 (Moderate/FAst)"}, {"code": "option_5", "label": "5 (Vigorous/Very Fast)"}]}, "group_name": "Activity Intensity & Movement Details"}, {"id": "bbfbbde5-2214-4f53-bce6-6f0f8ada0c13", "code": "CARS2", "section": "Play", "settings": {"label": "CARS Activity Intensity Collapsed", "exportColumn": "CARS", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B177", "options": [{"code": "option_1", "label": "1-2 (Stationary)"}, {"code": "option_2", "label": "3 (Slow)"}, {"code": "option_3", "label": "4-5 (Moderate-Vigorous)"}]}, "group_name": "Activity Intensity & Movement Details"}, {"id": "68179129-3e8d-42ab-be61-7d320d6ce8ee", "code": "Topography1", "section": "Setting", "settings": {"label": "Topography", "exportColumn": "Topography", "kind": "one", "source": "Behavior Mapping Variable Library_ Additional.xlsx · BehMapApp Variable Library · B263", "hint": "What were the topography conditions where the play event occurred", "options": [{"code": "option_1", "label": "Flat - Ground level"}, {"code": "option_2", "label": "Flat - Raised level"}, {"code": "option_3", "label": "Low slope"}, {"code": "option_4", "label": "Moderate slope"}, {"code": "option_5", "label": "Steep Slope"}, {"code": "option_6", "label": "Uneven or rolling surface"}, {"code": "option_7", "label": "Other"}]}, "group_name": "Topography"}]$library$::jsonb)
AS x(id uuid,code text,group_name text,section text,settings jsonb)
ON CONFLICT (id) DO NOTHING;
-- END GENERATED PROVISIONAL LIBRARY SEED
