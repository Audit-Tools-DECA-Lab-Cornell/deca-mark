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
