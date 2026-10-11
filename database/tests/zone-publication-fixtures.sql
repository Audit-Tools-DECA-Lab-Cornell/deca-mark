RESET ROLE;
SET LOCAL search_path = fieldmaps, extensions, public;
INSERT INTO fieldmaps.sites(id, organization_id, project_id, code, name)
VALUES ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'db16-synthetic', 'Synthetic DB-16 publication site');
INSERT INTO fieldmaps.form_versions(id, organization_id, project_id, code, definition)
VALUES ('80000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'db16-inventory-v1', '{"fields":[]}');
INSERT INTO fieldmaps.form_versions(id, organization_id, project_id, code, definition)
VALUES ('80000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002','db16-play-v1','{"fields":[]}');
INSERT INTO fieldmaps.site_packages(id, organization_id, project_id, site_id, form_version_id,
  version, state, manifest, archive, archive_sha256, prepared_by)
SELECT ('81000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000010', n,
  CASE WHEN n = 1 THEN 'ready' ELSE 'blocked' END, '{"format":1}', decode('0102', 'hex'), repeat('a', 64),
  '50000000-0000-4000-8000-000000000004' FROM generate_series(1, 2) n;
INSERT INTO fieldmaps.observations(id, organization_id, project_id, site_id, form_version_id,
  observer_code, observed_at, geom, answers, created_by, upload_hash, zone_code, round_type, first_round, placement_source)
VALUES ('83000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000010', 'QA', now(), fieldmaps.make_point(0.005,0.005), '{}',
  '50000000-0000-4000-8000-000000000001', repeat('e',64), 'A', 'inventory', false, 'zone');
