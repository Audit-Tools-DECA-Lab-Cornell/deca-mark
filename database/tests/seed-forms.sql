-- DB-20: what every environment starts from. Included straight after supabase/seed.sql, before any
-- scenario adds its own fixtures, so it sees only what the migrations and the local seed provide.
-- The schema and the current schema version come from the contracts, never from this file: a future
-- schema bump fails here until a migration rewrites every stored form version and template (CON-07).
CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;
\set form_schema `cat /tmp/fieldmaps-tests/form-definition.schema.json`
\set definition_cases `cat /tmp/fieldmaps-tests/form-definition.cases.json`
\set janet_test `cat /tmp/fieldmaps-tests/janet-test-v1.json`
\set janet_inventory `cat /tmp/fieldmaps-tests/janet-inventory-v1.json`
SELECT (:'definition_cases'::jsonb ->> 'currentSchemaVersion')::integer AS current_schema \gset

-- Every form version: canonical, current, and named as the API stamps it (version = code, status = state).
SELECT pg_temp.assert_true((SELECT count(*) > 0 AND bool_and(
    schema_version = :current_schema
    AND extensions.jsonb_matches_schema(:'form_schema'::json, definition))
  FROM fieldmaps.form_versions),
  'every seeded form version validates against the canonical schema at the current version');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.form_versions
  WHERE definition ? 'fields' OR NOT definition ? 'questions'),
  'no seeded form version is in the fields-only format');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM fieldmaps.form_versions
  WHERE definition ->> 'version' IS DISTINCT FROM code
    OR definition ->> 'status' IS DISTINCT FROM CASE state WHEN 'draft' THEN 'draft' ELSE 'published' END),
  'every seeded form version names its own code and state');

-- Training: the platform project every account joins (D4, D13).
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 AND bool_and(state = 'published') FROM fieldmaps.form_versions
    WHERE project_id = '10000000-0000-4000-8000-000000000102')
  AND EXISTS (SELECT FROM fieldmaps.form_versions
    WHERE id = '10000000-0000-4000-8000-000000000104' AND code = 'training-v1'
      AND organization_id = '10000000-0000-4000-8000-000000000101'
      AND project_id = '10000000-0000-4000-8000-000000000102'
      AND definition - 'version' - 'status' = :'janet_test'::jsonb - 'version' - 'status')
  AND EXISTS (SELECT FROM fieldmaps.form_versions
    WHERE id = '10000000-0000-4000-8000-000000000105' AND code = 'training-inventory-v1'
      AND organization_id = '10000000-0000-4000-8000-000000000101'
      AND project_id = '10000000-0000-4000-8000-000000000102'
      AND definition - 'version' - 'status' = :'janet_inventory'::jsonb - 'version' - 'status'),
  'Training publishes the Janet play form and the Janet inventory form in the canonical format');
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM fieldmaps.sites WHERE project_id = '10000000-0000-4000-8000-000000000102')
  AND EXISTS (SELECT FROM fieldmaps.sites s
    JOIN fieldmaps.site_zone_state st ON st.site_id = s.id
    JOIN fieldmaps.site_packages p ON p.id = st.current_package_id AND p.site_id = s.id
    WHERE s.id = '10000000-0000-4000-8000-000000000103' AND s.code = 'training-garden'
      AND s.project_id = '10000000-0000-4000-8000-000000000102'
      AND p.state = 'ready' AND p.version = 1 AND st.revision = 1
      AND p.form_version_id = '10000000-0000-4000-8000-000000000104'
      AND p.inventory_form_version_id = '10000000-0000-4000-8000-000000000105'
      AND p.manifest -> 'forms' = jsonb_build_object(
        'play', jsonb_build_object('form_version_id', '10000000-0000-4000-8000-000000000104', 'form_version', 'training-v1'),
        'inventory', jsonb_build_object('form_version_id', '10000000-0000-4000-8000-000000000105',
          'form_version', 'training-inventory-v1'))),
  'Training has one site whose current package names its play and inventory forms');
SELECT pg_temp.assert_true(
  (SELECT count(*) = 2 AND bool_and(
      z.geometry_sha256 = fieldmaps_private.zone_geometry_digest(z.canonical_geometry)
      AND z.canonical_geometry = fieldmaps_private.normalize_zone_geometry(z.canonical_geometry)
      AND extensions.ST_Equals(z.geom, extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(z.canonical_geometry), 4326))
      AND extensions.ST_Covers(p.site_boundary, z.geom)
      AND extensions.ST_Covers(z.geom, z.display_anchor)
      AND EXISTS (SELECT FROM jsonb_array_elements(p.manifest -> 'zones') m
        WHERE m ->> 'zone_id' = z.zone_id::text AND m ->> 'zone_code' = i.code AND m ->> 'label' = z.label
          AND m ->> 'geometry_sha256' = z.geometry_sha256
          AND m -> 'display_anchor' = jsonb_build_array(extensions.ST_X(z.display_anchor), extensions.ST_Y(z.display_anchor))))
    AND jsonb_array_length(min(p.manifest::text)::jsonb -> 'zones') = 2
    AND array_agg(i.code ORDER BY i.code COLLATE "C") = ARRAY['A', 'B']
    AND array_agg(z.label ORDER BY i.code COLLATE "C") = ARRAY['Lawn bed', 'Sand bed']
   FROM fieldmaps.package_zones z
   JOIN fieldmaps.site_packages p ON p.id = z.package_id
   JOIN fieldmaps.zone_identities i ON i.id = z.zone_id
   WHERE p.site_id = '10000000-0000-4000-8000-000000000103'),
  'the Training package carries the Practice garden: two zones whose digests, shapes and manifest entries agree');
SELECT pg_temp.assert_true(
  (SELECT archive_sha256 = encode(sha256(archive), 'hex') AND substr(archive, 1, 4) = '\x504b0304'
    AND octet_length(archive) BETWEEN 1 AND 16777216
   FROM fieldmaps.site_packages WHERE id = '10000000-0000-4000-8000-000000000106')
  AND (SELECT count(*) BETWEEN 1 AND 5 AND bool_and(state <> 'blocked')
    FROM fieldmaps.package_checks WHERE package_id = '10000000-0000-4000-8000-000000000106')
  AND EXISTS (SELECT FROM fieldmaps_private.zone_package_metadata('10000000-0000-4000-8000-000000000106')),
  'the Training package is a zip with a matching digest, passing checks and publication metadata');

-- Form templates: the starting points a manager picks from (BE-25 serves them).
SELECT pg_temp.assert_true(
  (SELECT array_agg(code ORDER BY code) = ARRAY['behaviour-mapping', 'zone-inventory'] FROM fieldmaps.form_templates)
  AND (SELECT bool_and(schema_version = :current_schema
      AND extensions.jsonb_matches_schema(:'form_schema'::json, definition)
      AND length(btrim(title)) > 0 AND length(btrim(summary)) > 0) FROM fieldmaps.form_templates)
  AND (SELECT definition = :'janet_test'::jsonb FROM fieldmaps.form_templates WHERE code = 'behaviour-mapping')
  AND (SELECT definition = :'janet_inventory'::jsonb FROM fieldmaps.form_templates WHERE code = 'zone-inventory'),
  'form templates exist, match contracts/forms and validate at the current schema version');

-- A signed-in API caller reads templates and cannot change them; without an identity there is nothing to read.
SET LOCAL ROLE fieldmaps_api;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM fieldmaps.form_templates),
  'a request without an identity reads no form templates');
RESET ROLE;
-- The new account and its membership are rolled back at the end, so later scenarios start from the plain seed.
SAVEPOINT seed_forms_account;
INSERT INTO auth.users(id, instance_id, aud, role, email, email_confirmed_at)
VALUES ('54000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'new-trainee@seed.test.invalid', now());
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '54000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM fieldmaps.projects), 'a new account belongs to no project before it sets up');
SELECT fieldmaps_private.ensure_profile('New trainee');
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM fieldmaps.form_templates),
  'a signed-in account reads the form templates');
SELECT pg_temp.assert_rejected($q$INSERT INTO fieldmaps.form_templates(code, title, summary, definition, schema_version)
  VALUES ('x', 'x', 'x', '{}', 2)$q$, '42501', 'the API cannot add a form template');
SELECT pg_temp.assert_rejected($q$UPDATE fieldmaps.form_templates SET title = 'x'$q$, '42501',
  'the API cannot edit a form template');
SELECT pg_temp.assert_rejected($q$DELETE FROM fieldmaps.form_templates$q$, '42501',
  'the API cannot delete a form template');

-- A new account joins Training and sees the site, its current package, the zones and both forms.
SELECT pg_temp.assert_true(
  (SELECT array_agg(id) = ARRAY['10000000-0000-4000-8000-000000000102'::uuid] FROM fieldmaps.projects)
  AND (SELECT role = 'observer' FROM fieldmaps.project_memberships
       WHERE project_id = '10000000-0000-4000-8000-000000000102' AND user_id = fieldmaps.request_user_id())
  AND (SELECT count(*) = 1 FROM fieldmaps.sites WHERE project_id = '10000000-0000-4000-8000-000000000102')
  AND (SELECT current_package_id = '10000000-0000-4000-8000-000000000106' FROM fieldmaps.site_zone_state
       WHERE site_id = '10000000-0000-4000-8000-000000000103')
  AND (SELECT octet_length(archive) > 0 AND state = 'ready' FROM fieldmaps.site_packages
       WHERE id = '10000000-0000-4000-8000-000000000106')
  AND (SELECT count(*) = 2 FROM fieldmaps.package_zones WHERE package_id = '10000000-0000-4000-8000-000000000106')
  AND (SELECT array_agg(code ORDER BY code) = ARRAY['training-inventory-v1', 'training-v1']
       FROM fieldmaps.form_versions WHERE project_id = '10000000-0000-4000-8000-000000000102')
  AND (SELECT count(*) = 1 FROM fieldmaps_private.zone_package_metadata('10000000-0000-4000-8000-000000000106')),
  'a new account joins Training and sees the site, its current package, the zones and both forms');
SELECT pg_temp.assert_true(NOT fieldmaps_private.zone_authoring_available(
    '10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000103'),
  'a trainee cannot edit the Training zones');
RESET ROLE;
ROLLBACK TO SAVEPOINT seed_forms_account;
SELECT set_config('fieldmaps.user_id', '', true);
