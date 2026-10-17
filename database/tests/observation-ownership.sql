-- Isolate these fixtures and membership changes from the rest of the SQL suite.
SAVEPOINT observation_ownership;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
-- A second immutable creator deliberately uses the same observer initials.
INSERT INTO fieldmaps.observations
  (id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,
   geom,answers,created_by,upload_hash,package_id,zone_id,round_type,first_round,placement_source)
SELECT '30000000-0000-4000-8000-000000000009', organization_id,project_id,site_id,
  form_version_id,observer_code,observed_at,geom,'{"people":9,"notes":"Other creator"}',
  fieldmaps.request_user_id(),repeat('e',64),package_id,zone_id,round_type,first_round,placement_source
FROM fieldmaps.observations WHERE id='30000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*)=2 FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')),
  'manager can upload, read the new row and review another creator');

SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT array_agg(id)=ARRAY['30000000-0000-4000-8000-000000000001'::uuid]
   FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')
   AND observer_code='QA'),
  'research observer ownership uses creator identity, never shared initials');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM gis.recorded_observations
    WHERE observation_id='30000000-0000-4000-8000-000000000009')
  AND NOT EXISTS (SELECT FROM gis.point_events
    WHERE observation_id='30000000-0000-4000-8000-000000000009'),
  'observation GIS projections cannot disclose a different creator');

SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000003', true);
SELECT pg_temp.assert_true(
  (SELECT count(*)=2 FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')),
  'research viewer retains both creators records');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT count(*)=2 FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')),
  'organization admin retains review access without project membership');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')),
  'foreign manager cannot see either creator');
SELECT set_config('fieldmaps.user_id', '', true);
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.observations),
  'missing identity has no observation access');

RESET ROLE;
INSERT INTO auth.users(id,instance_id,aud,role,email)
VALUES('59000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','observation-member@ownership.test.invalid');
INSERT INTO fieldmaps.profiles(user_id) VALUES('59000000-0000-4000-8000-000000000001');
INSERT INTO fieldmaps.organization_members(organization_id,user_id,role)
VALUES('10000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000001','member');
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '59000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')),
  'organization membership alone grants no observation access');

RESET ROLE;
UPDATE fieldmaps.project_memberships SET role='observer'
WHERE user_id='50000000-0000-4000-8000-000000000004'
  AND project_id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT pg_temp.assert_true(
  (SELECT array_agg(id)=ARRAY['30000000-0000-4000-8000-000000000009'::uuid]
   FROM fieldmaps.observations WHERE id IN
    ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009')),
  'demoted reviewer immediately reads only their own immutable uploads');
RESET ROLE;
DELETE FROM fieldmaps.project_memberships
WHERE user_id='50000000-0000-4000-8000-000000000004'
  AND project_id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM fieldmaps.observations WHERE id='30000000-0000-4000-8000-000000000009'),
  'revoked membership hides even the callers own immutable uploads');
RESET ROLE;
ROLLBACK TO SAVEPOINT observation_ownership;
