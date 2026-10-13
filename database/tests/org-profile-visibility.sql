-- Organization management must name people even when they have no project membership.
INSERT INTO auth.users (id, instance_id, aud, role, email)
VALUES ('53000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','org-only-member@test.invalid'),
  ('53000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','unrelated-member@test.invalid'),
  ('53000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','org-owner@test.invalid');
INSERT INTO fieldmaps.profiles (user_id,display_name)
VALUES ('53000000-0000-4000-8000-000000000001','Synthetic org-only member'),
  ('53000000-0000-4000-8000-000000000002','Synthetic unrelated member'),
  ('53000000-0000-4000-8000-000000000003','Synthetic org owner');
INSERT INTO fieldmaps.organization_members (organization_id,user_id,role)
VALUES ('10000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','member'),
  ('20000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','member'),
  ('10000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000003','owner');

SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','53000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((SELECT display_name='Synthetic org-only member' FROM fieldmaps.profiles
  WHERE user_id='53000000-0000-4000-8000-000000000001'),
  'org owner reads names of members without project membership');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM fieldmaps.profiles
  WHERE user_id='53000000-0000-4000-8000-000000000002'), 'org owner cannot read another organization profile');
SELECT set_config('fieldmaps.user_id','51000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM fieldmaps.profiles
  WHERE user_id='53000000-0000-4000-8000-000000000001'), 'org admin reads org-only member profiles');
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM fieldmaps.profiles
  WHERE user_id='53000000-0000-4000-8000-000000000001'), 'project viewer cannot enumerate organization profiles');
SELECT set_config('fieldmaps.user_id','53000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM fieldmaps.profiles), 'ordinary org member reads only own profile');
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM fieldmaps.profiles), 'Training does not grant profile enumeration');
SELECT set_config('fieldmaps.user_id','',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM fieldmaps.profiles), 'missing identity cannot read organization profiles');
RESET ROLE;
DELETE FROM fieldmaps.organization_members WHERE user_id IN
  ('53000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000003');
DELETE FROM fieldmaps.profiles WHERE user_id IN
  ('53000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000003');
DELETE FROM auth.users WHERE id IN
  ('53000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000003');
