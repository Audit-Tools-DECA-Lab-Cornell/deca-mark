RESET ROLE;
SET LOCAL search_path = fieldmaps, extensions, public;
INSERT INTO sites (id, organization_id, project_id, code, name)
VALUES ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'zone-test-site', 'Synthetic second zone site');
INSERT INTO projects (id, organization_id, code, name)
VALUES ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  'zone-test-project', 'Synthetic second project');
INSERT INTO sites (id, organization_id, project_id, code, name)
VALUES ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002', 'zone-test-third-site', 'Synthetic third site');

INSERT INTO site_packages (id, organization_id, project_id, site_id, form_version_id,
  version, state, manifest, archive, archive_sha256, prepared_by, site_boundary)
SELECT ('72000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  CASE WHEN n = 6 THEN '70000000-0000-4000-8000-000000000001'::uuid
    ELSE '10000000-0000-4000-8000-000000000003'::uuid END,
  '10000000-0000-4000-8000-000000000004', CASE WHEN n=6 THEN 1 WHEN n=1 THEN 100 ELSE n END,
  CASE WHEN n = 5 THEN 'blocked' ELSE 'ready' END,
  jsonb_build_object('format',1,'zones','[]'::jsonb),
  decode('0102', 'hex'), repeat('a', 64), '50000000-0000-4000-8000-000000000004',
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.02 0,0.02 0.02,0 0.02,0 0)))', 4326)
FROM generate_series(1, 6) n;

INSERT INTO zone_identities (id, organization_id, project_id, site_id, code, created_by)
SELECT ('71000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  CASE WHEN n = 4 THEN '70000000-0000-4000-8000-000000000002'::uuid
    ELSE '10000000-0000-4000-8000-000000000002'::uuid END,
  CASE WHEN n = 3 THEN '70000000-0000-4000-8000-000000000001'::uuid
    WHEN n = 4 THEN '70000000-0000-4000-8000-000000000003'::uuid
    ELSE '10000000-0000-4000-8000-000000000003'::uuid END,
  CASE WHEN n = 2 THEN 'B' ELSE 'A' END, '50000000-0000-4000-8000-000000000004'
FROM generate_series(1, 4) n;
INSERT INTO package_zones (organization_id, project_id, site_id, package_id, zone_id,
  label, geom, display_anchor, geometry_sha256,canonical_geometry)
SELECT '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  ('72000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '71000000-0000-4000-8000-000000000001',
  CASE WHEN n = 2 THEN 'Old label' ELSE 'New label' END,
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.01 0,0.01 0.01,0 0.01,0 0)))', 4326),
  ST_GeomFromText('POINT(0.005 0.005)',4326),
  fieldmaps_private.zone_geometry_digest(fieldmaps_private.normalize_zone_geometry('{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}')),
  fieldmaps_private.normalize_zone_geometry('{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}')
FROM generate_series(2, 4) n;

INSERT INTO zone_drafts (id, organization_id, project_id, site_id, base_package_id,
  create_request_id, create_request_hash, create_request, created_by, updated_by,site_boundary)
SELECT ('76000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  CASE WHEN n = 2 THEN '72000000-0000-4000-8000-000000000002'::uuid
    ELSE '72000000-0000-4000-8000-000000000001'::uuid END,
  ('77000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, repeat('c', 64), '{}',
  '50000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004',
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.02 0,0.02 0.02,0 0.02,0 0)))',4326)
FROM generate_series(1, 3) n;
UPDATE zone_drafts SET state = 'published', revision = 2, published_package_id =
  ('72000000-0000-4000-8000-' || lpad((right(id::text, 1)::integer + 1)::text, 12, '0'))::uuid
WHERE id IN ('76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002');
INSERT INTO zone_publications (request_id, created_by, organization_id, project_id, site_id,
  draft_id, draft_revision, expected_current_package_id, request_hash, request,
  published_package_id, identity_map, change_note)
SELECT ('78000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003',
  ('76000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1,
  CASE WHEN n = 2 THEN '72000000-0000-4000-8000-000000000002'::uuid
    ELSE '72000000-0000-4000-8000-000000000001'::uuid END, repeat('d', 64), '{}',
  ('72000000-0000-4000-8000-' || lpad((n + 1)::text, 12, '0'))::uuid,
  '[{"zone_id":"71000000-0000-4000-8000-000000000001","zone_code":"A"}]',
  'Synthetic publication evidence.'
FROM generate_series(1, 2) n;
INSERT INTO site_zone_state (site_id, organization_id, project_id, current_package_id, revision)
VALUES ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', 2)
ON CONFLICT(site_id) DO UPDATE SET current_package_id=excluded.current_package_id,revision=excluded.revision;
UPDATE site_zone_state SET current_package_id = '72000000-0000-4000-8000-000000000003', revision = 3
WHERE site_id='10000000-0000-4000-8000-000000000003';
