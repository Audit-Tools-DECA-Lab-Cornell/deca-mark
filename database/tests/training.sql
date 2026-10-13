\set training_definition `cat /tmp/fieldmaps-tests/janet-test-v1.json`
SELECT pg_temp.assert_true((SELECT definition = :'training_definition'::jsonb
  FROM fieldmaps.form_versions WHERE id = '10000000-0000-4000-8000-000000000104'),
  'Training definition matches the complete canonical Janet form');
SELECT pg_temp.assert_true(
  EXISTS (SELECT FROM fieldmaps.organizations WHERE id = '10000000-0000-4000-8000-000000000101'
    AND name = 'FieldMaps Training' AND slug = 'fieldmaps-training' AND is_platform)
  AND EXISTS (SELECT FROM fieldmaps.projects WHERE id = '10000000-0000-4000-8000-000000000102'
    AND organization_id = '10000000-0000-4000-8000-000000000101' AND code = 'training' AND is_training)
  AND EXISTS (SELECT FROM fieldmaps.sites WHERE id = '10000000-0000-4000-8000-000000000103'
    AND project_id = '10000000-0000-4000-8000-000000000102' AND code = 'training-garden')
  AND EXISTS (SELECT FROM fieldmaps.form_versions WHERE id = '10000000-0000-4000-8000-000000000104'
    AND project_id = '10000000-0000-4000-8000-000000000102' AND code = 'training-v1'
    AND definition->>'version' = 'janet-test-v1' AND jsonb_array_length(definition->'questions') = 12),
  'Training has its own fixed organization, project, site and Janet form');
SELECT pg_temp.assert_true(
  EXISTS (SELECT FROM fieldmaps.projects WHERE id = '10000000-0000-4000-8000-000000000002' AND NOT is_training)
  AND EXISTS (SELECT FROM fieldmaps.observations WHERE id = '30000000-0000-4000-8000-000000000001'
    AND project_id = '10000000-0000-4000-8000-000000000002' AND answers = '{"people":4,"notes":"Revised"}'::jsonb),
  'practice remains a normal project with its observations');

INSERT INTO auth.users(id, instance_id, aud, role, email, email_confirmed_at)
SELECT id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
  id::text || '@training.test.invalid', now()
FROM (VALUES ('53000000-0000-4000-8000-000000000001'::uuid),
  ('53000000-0000-4000-8000-000000000002'::uuid)) u(id);
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '53000000-0000-4000-8000-000000000001', true);
SELECT fieldmaps_private.ensure_profile('Trainee one');
SELECT fieldmaps_private.ensure_profile(NULL);
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(role = 'observer')
  FROM fieldmaps.project_memberships WHERE project_id = '10000000-0000-4000-8000-000000000102'),
  'ensure_profile enrolls the caller once as Training observer');
INSERT INTO fieldmaps.observations(id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, geom, answers, created_by, upload_hash, package_id, zone_id, round_type, first_round, placement_source)
VALUES ('53000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000103',
  '10000000-0000-4000-8000-000000000104', 'T1', now(),
  extensions.ST_SetSRID(extensions.ST_MakePoint(-76.485,42.448),4326), '{}',
  fieldmaps.request_user_id(), repeat('a',64),'91000000-0000-4000-8000-000000000003',
  '92000000-0000-4000-8000-000000000003','standard',true,'hand');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM fieldmaps.observations
  WHERE project_id = '10000000-0000-4000-8000-000000000102'), 'trainee reads own upload');
SELECT set_config('fieldmaps.user_id', '53000000-0000-4000-8000-000000000002', true);
SELECT fieldmaps_private.ensure_profile('Trainee two');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations
  WHERE project_id = '10000000-0000-4000-8000-000000000102'), 'second trainee cannot read first trainee upload');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.project_memberships
  WHERE user_id = '53000000-0000-4000-8000-000000000001'), 'Training does not reveal other memberships');
SELECT pg_temp.assert_rejected($q$INSERT INTO fieldmaps.organization_members(organization_id,user_id,role)
  VALUES ('10000000-0000-4000-8000-000000000101',fieldmaps.request_user_id(),'owner')$q$,
  '42501', 'API cannot grant itself platform organization membership');
RESET ROLE;

-- An operator may temporarily make a trainee a project manager, never an org member.
UPDATE fieldmaps.project_memberships SET role = 'manager'
WHERE project_id = '10000000-0000-4000-8000-000000000102'
  AND user_id = '53000000-0000-4000-8000-000000000002';
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_true(fieldmaps_private.has_project_role('10000000-0000-4000-8000-000000000102', ARRAY['manager']),
  'operator-granted Training manager can prepare packages');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations
  WHERE project_id = '10000000-0000-4000-8000-000000000102'), 'Training manager still cannot read another trainee upload');
RESET ROLE;
SELECT pg_temp.assert_rejected($q$INSERT INTO fieldmaps.organization_members(organization_id,user_id,role)
  VALUES ('10000000-0000-4000-8000-000000000101','53000000-0000-4000-8000-000000000002','owner')$q$,
  'FM006', 'platform organization membership is forbidden even through privileged writes');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.organization_members
  WHERE organization_id = '10000000-0000-4000-8000-000000000101'), 'platform organization has no members');

SET LOCAL ROLE fieldmaps_sample_reader;
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM gis.sample_observations
  WHERE observation_id = '53000000-0000-4000-8000-000000000011'), 'GIS reader cannot see Training');
SELECT pg_temp.assert_true(EXISTS (SELECT FROM gis.sample_observations
  WHERE observation_id = '30000000-0000-4000-8000-000000000001'), 'GIS reader still sees practice');
SELECT pg_temp.assert_rejected('SELECT * FROM fieldmaps.observations', '42501', 'GIS cannot bypass its scoped view');
RESET ROLE;

-- A different flagged project must never be included in the fixed-ID retention job.
INSERT INTO fieldmaps.projects(id,organization_id,name,code,is_training)
VALUES ('53000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000001','Other training','other-training',true);
INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name)
VALUES ('53000000-0000-4000-8000-000000000103','20000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000102','garden','Garden');
INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition)
VALUES ('53000000-0000-4000-8000-000000000104','20000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000102','other-v1','{}');
SELECT pg_temp.fixture_package('53000000-0000-4000-8000-000000000103','91000000-0000-4000-8000-000000000004',
  '92000000-0000-4000-8000-000000000004','53000000-0000-4000-8000-000000000104');
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
  observer_code,observed_at,received_at,geom,answers,created_by,upload_hash,package_id,zone_id,round_type,first_round,placement_source)
SELECT id, org, project, site, form, 'QA', now()-interval '90 days', received,
  extensions.ST_SetSRID(extensions.ST_MakePoint(-76.485,42.448),4326), '{}',
  '50000000-0000-4000-8000-000000000001',repeat('a',64),
  CASE WHEN site='10000000-0000-4000-8000-000000000103' THEN '91000000-0000-4000-8000-000000000003'::uuid
    WHEN site='10000000-0000-4000-8000-000000000003' THEN '91000000-0000-4000-8000-000000000001'::uuid
    ELSE '91000000-0000-4000-8000-000000000004'::uuid END,
  CASE WHEN site='10000000-0000-4000-8000-000000000103' THEN '92000000-0000-4000-8000-000000000003'::uuid
    WHEN site='10000000-0000-4000-8000-000000000003' THEN '92000000-0000-4000-8000-000000000001'::uuid
    ELSE '92000000-0000-4000-8000-000000000004'::uuid END,'standard',true,'hand'
FROM (VALUES
 ('53000000-0000-4000-8000-000000000021'::uuid,'10000000-0000-4000-8000-000000000101'::uuid,'10000000-0000-4000-8000-000000000102'::uuid,'10000000-0000-4000-8000-000000000103'::uuid,'10000000-0000-4000-8000-000000000104'::uuid,now()-interval '31 days'),
 ('53000000-0000-4000-8000-000000000022'::uuid,'10000000-0000-4000-8000-000000000101'::uuid,'10000000-0000-4000-8000-000000000102'::uuid,'10000000-0000-4000-8000-000000000103'::uuid,'10000000-0000-4000-8000-000000000104'::uuid,now()-interval '30 days'),
 ('53000000-0000-4000-8000-000000000023'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid,'10000000-0000-4000-8000-000000000004'::uuid,now()-interval '31 days'),
 ('53000000-0000-4000-8000-000000000024'::uuid,'20000000-0000-4000-8000-000000000001'::uuid,'53000000-0000-4000-8000-000000000102'::uuid,'53000000-0000-4000-8000-000000000103'::uuid,'53000000-0000-4000-8000-000000000104'::uuid,now()-interval '31 days')
) f(id,org,project,site,form,received);
SELECT pg_temp.assert_true((SELECT count(*) = 1 AND bool_and(active) FROM cron.job
  WHERE jobname = 'fieldmaps_training_purge'), 'one active Training purge job is scheduled');
SELECT command FROM cron.job WHERE jobname = 'fieldmaps_training_purge' \gexec
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations WHERE id = '53000000-0000-4000-8000-000000000021')
  AND (SELECT count(*) = 3 FROM fieldmaps.observations WHERE id IN
    ('53000000-0000-4000-8000-000000000022','53000000-0000-4000-8000-000000000023','53000000-0000-4000-8000-000000000024')),
  'purge uses receipt age over 30 days and only the fixed Training project');
SELECT pg_temp.assert_true(NOT has_schema_privilege('fieldmaps_api','cron','USAGE')
  AND NOT has_schema_privilege('anon','cron','USAGE')
  AND NOT has_schema_privilege('authenticated','cron','USAGE')
  AND NOT has_schema_privilege('service_role','cron','USAGE'),
  'application and browser roles cannot access cron');
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_rejected($q$SELECT cron.schedule('unauthorized-training-job','0 0 * * *','SELECT 1')$q$,
  '42501', 'API cannot schedule jobs through extension functions');
RESET ROLE;
INSERT INTO fieldmaps.invitations(id,organization_id,role,token_hash,expires_at,max_uses,created_by)
VALUES ('53000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000101',
  'member',repeat('8',64),now()+interval '1 day',1,'53000000-0000-4000-8000-000000000002');
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','53000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_rejected($q$SELECT fieldmaps_private.redeem_invitation(repeat('8',64),NULL)$q$,
  'FM006','privileged invitation cannot grant platform organization membership through API');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT use_count = 0 FROM fieldmaps.invitations
  WHERE id = '53000000-0000-4000-8000-000000000031'), 'rejected platform invitation does not consume a use');
SELECT set_config('fieldmaps.user_id','',true);
