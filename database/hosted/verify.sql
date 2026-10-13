BEGIN;
GRANT fieldmaps_api, fieldmaps_sample_reader TO postgres WITH SET TRUE;
CREATE FUNCTION pg_temp.assert_true(actual boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
END;
$$;
CREATE FUNCTION pg_temp.assert_rejected(statement text, expected_state text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'FAIL: %, expected SQLSTATE %, got %', label, expected_state, actual_state;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text),
  pg_temp.assert_rejected(text, text, text) TO fieldmaps_api, fieldmaps_sample_reader;

-- Privilege checks use has_any_column_privilege: grants here are column-limited, and
-- has_table_privilege would stay false after a column-level grant slipped in.

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', id::text || '@test.invalid'
FROM (VALUES ('50000000-0000-4000-8000-000000000001'::uuid),
  ('50000000-0000-4000-8000-000000000004'::uuid)) u(id) ON CONFLICT (id) DO NOTHING;
INSERT INTO fieldmaps.profiles(user_id) VALUES ('50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000004') ON CONFLICT (user_id) DO NOTHING;

INSERT INTO fieldmaps.project_memberships (user_id, organization_id, project_id, role)
VALUES ('50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'observer') ON CONFLICT (user_id, project_id) DO NOTHING;

\ir ../tests/current-fixture-helper.sql
INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name)
VALUES('50000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','verification','Synthetic verification site');
SELECT pg_temp.fixture_package('50000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000005',
 '50000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000004');
SELECT pg_temp.fixture_package('10000000-0000-4000-8000-000000000103','50000000-0000-4000-8000-000000000012',
 '50000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000104');
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM fieldmaps.projects), 'no identity sees no projects');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
DO $$ BEGIN PERFORM fieldmaps_private.ensure_profile(NULL); END $$;
SELECT pg_temp.assert_true(
  (SELECT array_agg(id ORDER BY id) = ARRAY[
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000102'::uuid
  ] FROM fieldmaps.projects), 'member sees only assigned study and Training projects');
INSERT INTO fieldmaps.observations
  (id, organization_id, project_id, site_id, form_version_id, observer_code,
   observed_at, geom, answers, created_by, upload_hash, package_id, zone_id, round_type, first_round, placement_source)
VALUES ('50000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004',
  'QA', now(), fieldmaps.make_point(-76.485, 42.448),
  '{"people":3,"notes":"Hosted transaction verification"}',
  fieldmaps.request_user_id(), repeat('a',64),'50000000-0000-4000-8000-000000000005',
 '50000000-0000-4000-8000-000000000008','standard',true,'hand');
SELECT pg_temp.assert_true(
  (SELECT fieldmaps.longitude(geom) = -76.485 FROM fieldmaps.observations
   WHERE id = '50000000-0000-4000-8000-000000000002'), 'API geometry readback');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000009', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM fieldmaps.observations), 'unassigned user sees no observations');
SELECT pg_temp.assert_true(NOT has_any_column_privilege(current_user, 'fieldmaps.observations', 'UPDATE'), 'API cannot edit observations');
SELECT pg_temp.assert_true(NOT has_any_column_privilege(current_user, 'fieldmaps.project_memberships', 'INSERT'), 'API cannot assign memberships');
RESET ROLE;
SET LOCAL ROLE fieldmaps_sample_reader;
SELECT pg_temp.assert_true(
  (SELECT longitude = -76.485 AND latitude = 42.448 AND people = 3
   FROM gis.sample_observations WHERE observation_id = '50000000-0000-4000-8000-000000000002'),
  'restricted GIS view returns the uploaded point');
RESET ROLE;

-- The restricted API reads finalized fixtures and cannot directly write packages.
INSERT INTO fieldmaps.project_memberships(user_id,organization_id,project_id,role)
VALUES('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','manager') ON CONFLICT(user_id,project_id) DO NOTHING;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000004',true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM fieldmaps.site_packages WHERE id = '50000000-0000-4000-8000-000000000005'), 'manager reads the package it prepared');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM fieldmaps.site_packages WHERE id = '50000000-0000-4000-8000-000000000005'), 'observer on the project reads the package');
SELECT pg_temp.assert_rejected($$
  INSERT INTO fieldmaps.site_packages
    (id, organization_id, project_id, site_id, form_version_id, version, state,
     manifest, archive, archive_sha256, prepared_by)
  VALUES ('50000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000004',
    2, 'ready', '{"format":1}', '\x01', repeat('b', 64),
    fieldmaps.request_user_id())$$,
  '42501', 'observer cannot prepare a package on a project that has a manager');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000009', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM fieldmaps.site_packages), 'unassigned user sees no packages');
SELECT pg_temp.assert_true(NOT has_any_column_privilege(current_user, 'fieldmaps.site_packages', 'UPDATE'), 'API cannot edit packages');
RESET ROLE;
SELECT pg_temp.assert_true(
  NOT has_any_column_privilege('anon', 'fieldmaps.site_packages', 'SELECT')
  AND NOT has_any_column_privilege('authenticated', 'fieldmaps.site_packages', 'SELECT'),
  'browser roles cannot read packages');
SELECT set_config('fieldmaps.user_id', '', true);
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_true(NOT fieldmaps_private.has_project_role(
  '10000000-0000-4000-8000-000000000002', ARRAY['manager']), 'no identity has no project role');
SELECT pg_temp.assert_true(NOT has_column_privilege(current_user, 'fieldmaps.projects', 'is_training', 'UPDATE')
  AND NOT has_column_privilege(current_user, 'fieldmaps.organizations', 'is_platform', 'UPDATE'),
  'API cannot change protected tenancy flags');
SELECT pg_temp.assert_true(NOT has_column_privilege(current_user, 'fieldmaps.form_versions', 'state', 'UPDATE')
  AND NOT has_column_privilege(current_user, 'fieldmaps.form_versions', 'published_at', 'UPDATE')
  AND NOT has_column_privilege(current_user, 'fieldmaps.sites', 'code', 'UPDATE'),
  'API cannot publish by editing a version, or move a site to another code');
SELECT pg_temp.assert_true(EXISTS (SELECT FROM pg_policies WHERE schemaname = 'fieldmaps'
    AND tablename = 'form_versions' AND policyname = 'member_reads_published_versions')
  AND NOT EXISTS (SELECT FROM pg_policies WHERE schemaname = 'fieldmaps'
    AND tablename = 'form_versions' AND policyname = 'assigned_forms'),
  'members read published versions only; drafts stay with managers');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004')$$,
  'FM006', 'publishing requires identity');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.ensure_profile(NULL)$$, 'FM006', 'tenancy functions require identity');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.ensure_profile_row()$$, '42501', 'internal membership helper is not callable');
RESET ROLE;
CREATE FUNCTION pg_temp.hosted_default_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
SELECT pg_temp.assert_true(NOT has_function_privilege('anon', 'pg_temp.hosted_default_probe()', 'EXECUTE'),
  'new functions are private by default');

SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT fieldmaps_private.ensure_profile(NULL);
SELECT pg_temp.assert_true(EXISTS (
  SELECT FROM fieldmaps.project_memberships
  WHERE project_id = '10000000-0000-4000-8000-000000000102'
    AND user_id = fieldmaps.request_user_id() AND role = 'observer'
), 'profile setup enrolls the observer in Training');
INSERT INTO fieldmaps.observations
  (id, organization_id, project_id, site_id, form_version_id, observer_code,
   observed_at, geom, answers, created_by, upload_hash, package_id, zone_id, round_type, first_round, placement_source)
VALUES ('50000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000102',
  '10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000104',
  'QA', now(), fieldmaps.make_point(-76.485, 42.448), '{}',
  fieldmaps.request_user_id(), repeat('c',64),'50000000-0000-4000-8000-000000000012',
 '50000000-0000-4000-8000-000000000013','standard',true,'hand');
SELECT pg_temp.assert_true(EXISTS (
  SELECT FROM fieldmaps.observations WHERE id = '50000000-0000-4000-8000-000000000011'
), 'trainee reads their own observation');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT fieldmaps_private.ensure_profile(NULL);
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT FROM fieldmaps.observations WHERE id = '50000000-0000-4000-8000-000000000011'
), 'another trainee cannot read the observation');
RESET ROLE;
SET LOCAL ROLE fieldmaps_sample_reader;
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT FROM gis.sample_observations WHERE observation_id = '50000000-0000-4000-8000-000000000011'
), 'GIS reader cannot see Training observations');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT FROM fieldmaps.organization_members WHERE organization_id = '10000000-0000-4000-8000-000000000101'
), 'Training enrollment creates no platform organization members');
SELECT pg_temp.assert_true(NOT has_schema_privilege('fieldmaps_api', 'fieldmaps_auth_hooks', 'USAGE')
  AND NOT has_function_privilege('authenticated', 'fieldmaps_auth_hooks.before_user_created(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'fieldmaps_auth_hooks.before_user_created(jsonb)', 'EXECUTE'),
  'signup hook is outside the application and browser boundary');
SELECT set_config('fieldmaps.user_id', '', true);
SELECT pg_temp.assert_true(
  has_schema_privilege('supabase_auth_admin', 'fieldmaps_auth_hooks', 'USAGE')
  AND has_function_privilege('supabase_auth_admin', 'fieldmaps_auth_hooks.before_user_created(jsonb)', 'EXECUTE')
  AND has_table_privilege('supabase_auth_admin', 'fieldmaps_auth_hooks.blocked_email_domains', 'SELECT')
  AND EXISTS (SELECT FROM pg_policies WHERE schemaname = 'fieldmaps_auth_hooks'
    AND tablename = 'blocked_email_domains' AND policyname = 'auth_admin_reads'
    AND roles = ARRAY['supabase_auth_admin']::name[] AND cmd = 'SELECT' AND qual = 'true'),
  'Auth receives both table privileges and an RLS read policy');
SELECT pg_temp.assert_true(
  fieldmaps_auth_hooks.before_user_created('{"user":{"email":"qa@mailinator.com"}}')
    = '{"error":{"http_code":400,"message":"Use a permanent email address."}}'::jsonb,
  'signup hook rejects disposable email without an application identity');
SELECT pg_temp.assert_true(
  fieldmaps_auth_hooks.before_user_created('{"user":{"email":"qa@cornell.edu"}}') = '{}'::jsonb,
  'signup hook accepts permanent email');
ROLLBACK;
SELECT 'Hosted assertions passed; synthetic accounts, memberships, observations, site and package rolled back' AS result;
