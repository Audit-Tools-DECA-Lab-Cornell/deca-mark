\set ON_ERROR_STOP on
\ir ../../supabase/seed.sql
SET search_path = fieldmaps, extensions, public;
INSERT INTO organizations (id, name, slug)
VALUES ('60000000-0000-4000-8000-000000000010', 'Synthetic legacy team', 'zone-legacy-team');
INSERT INTO projects (id, organization_id, name, code)
VALUES ('60000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000010',
  'Synthetic legacy project', 'zone-legacy-project');
INSERT INTO form_versions (id, organization_id, project_id, code, definition)
VALUES ('60000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000010',
  '60000000-0000-4000-8000-000000000011', 'legacy-test-v1', '{"fields":[]}');

INSERT INTO sites (id, organization_id, project_id, code, name)
SELECT id, '60000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000011',
  code, code FROM (VALUES
    ('60000000-0000-4000-8000-000000000001'::uuid, 'legacy-second-site'),
    ('60000000-0000-4000-8000-000000000013'::uuid, 'legacy-first-site')) s(id, code);

INSERT INTO site_packages (id, organization_id, project_id, site_id, form_version_id,
  version, state, manifest, archive, archive_sha256, prepared_by, prepared_at)
SELECT ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '60000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000011',
  CASE WHEN n = 4 THEN '60000000-0000-4000-8000-000000000001'::uuid
    ELSE '60000000-0000-4000-8000-000000000013'::uuid END,
  '60000000-0000-4000-8000-000000000012', CASE WHEN n = 4 THEN 1 ELSE n - 1 END,
  CASE WHEN n = 3 THEN 'blocked' ELSE 'ready' END,
  '{"format":1,"zones":[{"id":"A","label":"Legacy area"}]}',
  decode('0001ff00abcd', 'hex'), repeat('a', 64),
  '50000000-0000-4000-8000-000000000004', '2026-10-01T12:00:00Z'
FROM generate_series(2, 4) n;
INSERT INTO package_checks (package_id, position, step, state, detail)
SELECT id, 0, 'archive', CASE WHEN state = 'blocked' THEN 'blocked' ELSE 'passed' END,
  'Synthetic legacy archive check' FROM site_packages
WHERE project_id = '60000000-0000-4000-8000-000000000011';

INSERT INTO observations (id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, received_at, updated_at, revision, geom, answers,
  created_by, upload_hash, zone_code, round_type, first_round, placement_source)
SELECT ('61000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '60000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000011',
  CASE WHEN n = 3 THEN '60000000-0000-4000-8000-000000000001'::uuid
    ELSE '60000000-0000-4000-8000-000000000013'::uuid END,
  '60000000-0000-4000-8000-000000000012', 'LEGACY', '2026-10-01T12:00:00Z',
  '2026-10-02T12:00:00Z', '2026-10-03T12:00:00Z', n,
  ST_GeomFromText('POINT(-76.485 42.448)', 4326), '{"people":3,"notes":"Synthetic"}',
  '50000000-0000-4000-8000-000000000001', repeat(n::text, 64), 'A',
  CASE WHEN n = 2 THEN 'inventory' ELSE 'standard' END,
  false, CASE WHEN n = 2 THEN 'zone' ELSE 'hand' END
FROM generate_series(1, 3) n;

CREATE SCHEMA zone_rehearsal;
CREATE TABLE zone_rehearsal.before_packages AS SELECT id, to_jsonb(p) AS value FROM site_packages p;
CREATE TABLE zone_rehearsal.before_checks AS SELECT to_jsonb(c) AS value FROM package_checks c;
CREATE TABLE zone_rehearsal.before_observations AS SELECT id, to_jsonb(o) AS value FROM observations o;
