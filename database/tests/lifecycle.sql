-- Sites, the form lifecycle and round context (current baseline).
-- Fixture users come from supabase/seed.sql (…0001 observer, …0003 viewer, …0004 manager on the
-- sample project) and tenancy.sql (51…0002, a manager of the other organization's project).
RESET ROLE;
SELECT pg_temp.assert_true(EXISTS (
  SELECT FROM fieldmaps.forms f JOIN fieldmaps.form_versions v ON v.form_id = f.id
  WHERE v.code = 'training-v1' AND f.code = 'training' AND v.version = 1 AND v.state = 'published'),
  'the Training form version has its form in the current baseline');
SELECT pg_temp.assert_true(EXISTS (
  SELECT FROM fieldmaps.forms f JOIN fieldmaps.form_versions v ON v.form_id = f.id
  WHERE v.code = 'other-v1' AND f.code = 'other' AND v.published_at IS NOT NULL),
  'a version inserted without a form is given one from its code');

SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);

-- Sites.
INSERT INTO fieldmaps.sites (id, organization_id, project_id, code, name, created_by)
VALUES ('54000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'north-meadow', 'North meadow', fieldmaps.request_user_id());
UPDATE fieldmaps.sites SET name = 'North meadow plot', description = 'Behind the school'
WHERE id = '54000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT name = 'North meadow plot' AND description = 'Behind the school'
  FROM fieldmaps.sites WHERE id = '54000000-0000-4000-8000-000000000001'),
  'a manager creates and renames a site');
SELECT pg_temp.assert_rejected(
  $$UPDATE fieldmaps.sites SET code = 'moved' WHERE id = '54000000-0000-4000-8000-000000000001'$$,
  '42501', 'a site code never changes');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.sites
  (id, organization_id, project_id, code, name, created_by)
  VALUES ('54000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'observer-site', 'Observer site', fieldmaps.request_user_id())$$,
  '42501', 'an observer cannot create a site');

-- Drafts.
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
INSERT INTO fieldmaps.forms (id, organization_id, project_id, code, name, created_by)
VALUES ('54000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'play-events', 'Play events', fieldmaps.request_user_id());
INSERT INTO fieldmaps.form_versions
  (id, organization_id, project_id, form_id, version, code, definition, state, created_by)
VALUES ('54000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000002', 1,
  'play-events-v1', '{"status":"draft","questions":[]}', 'draft', fieldmaps.request_user_id());
UPDATE fieldmaps.form_versions SET definition = '{"status":"draft","questions":["edited"]}'
WHERE id = '54000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true((SELECT definition -> 'questions' = '["edited"]'
  FROM fieldmaps.form_versions WHERE id = '54000000-0000-4000-8000-000000000003'),
  'a manager edits a draft');
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.form_versions
  (id, organization_id, project_id, form_id, version, code, definition, state, created_by)
  VALUES ('54000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000002', 2,
  'play-events-v2', '{}', 'published', fieldmaps.request_user_id())$$,
  '42501', 'a version is created as a draft, never published directly');

SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM fieldmaps.form_versions
  WHERE id = '54000000-0000-4000-8000-000000000003'), 'observers do not see drafts');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', 2)$$,
  'FM006', 'an observer cannot publish');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '20000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', 2)$$,
  'FM007', 'a manager of another project cannot publish this version through their own project');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', 2)$$,
  'FM006', 'a manager of another project cannot publish this version through its project');

-- Revision preconditions are enforced inside the locking publication function.
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT pg_temp.assert_true((SELECT revision = 2 FROM fieldmaps.form_versions
  WHERE id = '54000000-0000-4000-8000-000000000003'), 'a draft edit advances its revision');
SELECT pg_temp.assert_true(to_regprocedure('fieldmaps_private.publish_form_version(uuid,uuid)') IS NULL,
  'the unconditional publication function is removed');
SELECT pg_temp.assert_true(NOT has_column_privilege(current_user, 'fieldmaps.form_versions', 'revision', 'UPDATE'),
  'API callers cannot set the revision');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', NULL)$$,
  'FM010', 'publication requires a revision');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', 1)$$,
  'FM009', 'publication rejects an unreviewed revision');
SELECT pg_temp.assert_true((SELECT state = 'draft' AND published_at IS NULL
  FROM fieldmaps.form_versions WHERE id = '54000000-0000-4000-8000-000000000003'),
  'a refused publication leaves the draft unpublished');

-- Publishing and retiring.
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', 2);
SELECT pg_temp.assert_true((SELECT state = 'published' AND published_at IS NOT NULL
    AND published_by = '50000000-0000-4000-8000-000000000004'
    AND definition ->> 'status' = 'published'
  FROM fieldmaps.form_versions WHERE id = '54000000-0000-4000-8000-000000000003'),
  'publishing freezes the draft and marks its definition published');
UPDATE fieldmaps.form_versions SET definition = '{"rewritten":true}'
WHERE id = '54000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true((SELECT definition ->> 'status' = 'published'
  FROM fieldmaps.form_versions WHERE id = '54000000-0000-4000-8000-000000000003'),
  'a published version cannot be edited');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.publish_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003', 2)$$,
  'FM008', 'a version is published once');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM fieldmaps.form_versions
  WHERE id = '54000000-0000-4000-8000-000000000003'), 'observers read published versions');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT fieldmaps_private.retire_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003');
SELECT pg_temp.assert_true((SELECT state = 'retired' FROM fieldmaps.form_versions
  WHERE id = '54000000-0000-4000-8000-000000000003'), 'a published version can be retired');
SELECT pg_temp.assert_rejected($$SELECT fieldmaps_private.retire_form_version(
  '10000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000003')$$,
  'FM008', 'a version is retired once');

-- Round context is checked on the required package-zone attribution.
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
INSERT INTO fieldmaps.observations (id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, geom, answers, created_by, upload_hash,
  zone_code, round_type, first_round, placement_source, package_id, zone_id)
VALUES ('54000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004', 'JL', now(), fieldmaps.make_point(-76.485, 42.448),
  '{"people":0,"notes":""}', fieldmaps.request_user_id(), repeat('c', 64),
  'UNTRUSTED', 'reliability', false, 'hand','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT round_type = 'reliability' AND placement_source = 'hand' AND zone_code = 'FIXTURE' AND first_round = false
  FROM fieldmaps.observations WHERE id = '54000000-0000-4000-8000-000000000005'),
  'an observer stores round context while SQL derives the immutable zone code');
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.observations (id, organization_id, project_id,
  site_id, form_version_id, observer_code, observed_at, geom, answers, created_by, upload_hash, round_type,
  package_id,zone_id,first_round,placement_source)
  VALUES ('54000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004', 'JL', now(), fieldmaps.make_point(-76.485, 42.448),
  '{"people":0,"notes":""}', fieldmaps.request_user_id(), repeat('d', 64), 'weekly',
  '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',true,'hand')$$,
  'ZB001', 'only the three round types are stored');
RESET ROLE;
