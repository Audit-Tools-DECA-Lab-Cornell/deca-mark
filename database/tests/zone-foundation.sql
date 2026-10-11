\ir zone-fixtures.sql
\set geometry_cases `cat /tmp/fieldmaps-tests/zone-geometry.cases.json`

SELECT pg_temp.assert_true(
  (fieldmaps_private.zone_position_count(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'geometry'))
    IS NOT NULL) = (c ->> 'draft_valid')::boolean,
  'SQL draft structure agrees with authored case: ' || (c ->> 'id'))
FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'structure_cases') c;
SELECT pg_temp.assert_true(fieldmaps_private.valid_zone_draft('[]'), 'an empty draft is retained');
SELECT pg_temp.assert_true(NOT fieldmaps_private.valid_zone_draft('{}'), 'a zones object is rejected');
SELECT pg_temp.assert_true(NOT fieldmaps_private.valid_zone_draft('[null]'), 'a null zone is rejected');

CREATE TEMP TABLE draft_zone AS SELECT jsonb_build_object(
  'zone_id', '71000000-0000-4000-8000-000000000001', 'zone_code', 'A', 'zone_label', 'Synthetic',
  'geometry', :'geometry_cases'::jsonb -> 'geometries' -> 'bow_tie') AS value;
SELECT pg_temp.assert_true((SELECT fieldmaps_private.valid_zone_draft(jsonb_build_array(value))
  FROM draft_zone), 'a complete self-intersecting draft can be saved before correction');
SELECT pg_temp.assert_true((SELECT NOT fieldmaps_private.valid_zone_draft(jsonb_build_array(value, value))
  FROM draft_zone), 'duplicate provisional UUIDs and codes are rejected');
SELECT pg_temp.assert_true((SELECT NOT fieldmaps_private.valid_zone_draft(jsonb_build_array(
  value, jsonb_set(value, '{zone_id}', '"71000000-0000-4000-8000-000000000002"'))) FROM draft_zone),
  'a repeated code cannot name a different provisional UUID');
SELECT pg_temp.assert_true((SELECT NOT fieldmaps_private.valid_zone_draft(jsonb_build_array(
  jsonb_set(value, '{zone_code}', '"A B"'))) FROM draft_zone), 'draft code syntax is enforced in SQL');
SELECT pg_temp.assert_true((SELECT NOT fieldmaps_private.valid_zone_draft(jsonb_build_array(
  jsonb_set(value, '{geometry,coordinates,0,0}', '[0,0,0]'))) FROM draft_zone),
  'draft positions cannot carry a third dimension');

CREATE FUNCTION pg_temp.zone_ring(p_count integer) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(
    (SELECT jsonb_agg(CASE WHEN n IN (1, p_count) THEN '[0,0]'::jsonb
      WHEN n = 2 THEN '[0.01,0]'::jsonb ELSE '[0,0.01]'::jsonb END ORDER BY n)
    FROM generate_series(1, p_count) n)));
$$;
SELECT pg_temp.assert_true(fieldmaps_private.zone_position_count(pg_temp.zone_ring(2000)) = 2000
  AND fieldmaps_private.zone_position_count(pg_temp.zone_ring(2001)) IS NULL,
  'per-zone limits include closing positions and accept exactly 2000');
SELECT pg_temp.assert_true(NOT fieldmaps_private.valid_zone_draft(jsonb_build_array(jsonb_set(
  (SELECT value FROM draft_zone), '{geometry}', jsonb_build_object('type', 'MultiPolygon', 'coordinates',
  jsonb_build_array(pg_temp.zone_ring(1001) -> 'coordinates', pg_temp.zone_ring(1000) -> 'coordinates'))))),
  'per-zone position limits span every multipart component');
CREATE TEMP TABLE bounded_zone_sets AS
SELECT maximum, jsonb_agg(jsonb_set(jsonb_set(jsonb_set(value,
  '{zone_id}', to_jsonb('79000000-0000-4000-8000-' || lpad(n::text, 12, '0'))),
  '{zone_code}', to_jsonb('Z' || n)), '{geometry}', pg_temp.zone_ring(positions)) ORDER BY n) AS zones
FROM draft_zone CROSS JOIN (VALUES (250, 4), (251, 4), (10, 2000), (11, 2000)) limits(maximum, positions)
CROSS JOIN LATERAL generate_series(1, maximum) n GROUP BY maximum;
SELECT pg_temp.assert_true(fieldmaps_private.valid_zone_draft(zones) = (maximum IN (250, 10)),
  'SQL inclusive package limits for ' || maximum || ' zones') FROM bounded_zone_sets;

SELECT pg_temp.assert_rejected($q$INSERT INTO zone_identities
  (id, organization_id, project_id, site_id, code, created_by)
  SELECT '71000000-0000-4000-8000-000000000099', organization_id, project_id, site_id, code, created_by
  FROM zone_identities WHERE id = '71000000-0000-4000-8000-000000000001'$q$,
  '23505', 'a stable code cannot be reused within its site');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM zone_identities WHERE code = 'A'),
  'different sites and projects may use the same code');
SELECT pg_temp.assert_rejected($q$UPDATE zone_identities SET code = 'C'
  WHERE id = '71000000-0000-4000-8000-000000000001'$q$, '23514', 'a stable code is immutable');
SELECT pg_temp.assert_rejected($q$UPDATE zone_identities SET site_id = '70000000-0000-4000-8000-000000000001'
  WHERE id = '71000000-0000-4000-8000-000000000001'$q$, '23514', 'identities cannot move between sites');
SELECT pg_temp.assert_rejected($q$DELETE FROM zone_identities
  WHERE id = '71000000-0000-4000-8000-000000000002'$q$, '23514', 'removed identities remain reserved');
SELECT pg_temp.assert_rejected($q$INSERT INTO zone_identities
  (id, organization_id, project_id, site_id, code, created_by)
  SELECT '71000000-0000-4000-8000-000000000099', organization_id, project_id,
    '20000000-0000-4000-8000-000000000003', 'C', created_by FROM zone_identities LIMIT 1$q$,
  '23503', 'a zone cannot link to another tenant site');

SELECT pg_temp.assert_rejected($q$INSERT INTO package_zones
  SELECT organization_id, project_id, site_id, package_id, '71000000-0000-4000-8000-000000000003',
    label, geom, display_anchor, geometry_sha256 FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000004'$q$,
  '23503', 'a snapshot cannot link to another site identity');
SELECT pg_temp.assert_rejected($q$INSERT INTO package_zones
  SELECT organization_id, project_id, site_id, package_id, '71000000-0000-4000-8000-000000000004',
    label, geom, display_anchor, geometry_sha256 FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000004'$q$,
  '23503', 'a snapshot cannot link to another project identity');
SELECT pg_temp.assert_rejected($q$INSERT INTO package_zones
  SELECT organization_id, project_id, site_id, '72000000-0000-4000-8000-000000000001',
    zone_id, label, geom, display_anchor, geometry_sha256 FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000004'$q$,
  '23514', 'legacy packages cannot acquire invented zone snapshots');
SELECT pg_temp.assert_rejected($q$INSERT INTO package_zones
  SELECT organization_id, project_id, site_id, '72000000-0000-4000-8000-000000000005',
    zone_id, label, geom, display_anchor, geometry_sha256 FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000004'$q$,
  '23514', 'blocked packages cannot acquire snapshots');
SELECT pg_temp.assert_rejected($q$INSERT INTO package_zones
  SELECT organization_id, project_id, site_id, package_id, '71000000-0000-4000-8000-000000000002',
    label, geom, display_anchor, geometry_sha256 FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000002'$q$,
  '23514', 'a superseded published snapshot set cannot be appended even by its owner');
SELECT pg_temp.assert_rejected($q$UPDATE package_zones SET label = 'Reclassified'
  WHERE package_id = '72000000-0000-4000-8000-000000000002'$q$,
  '23514', 'historical labels cannot be rewritten');
SELECT pg_temp.assert_rejected($q$DELETE FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000002'$q$,
  '23514', 'historical geometry cannot be deleted');

CREATE FUNCTION pg_temp.zone_snapshot(p_geom extensions.geometry, p_anchor extensions.geometry)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO fieldmaps.package_zones
  SELECT organization_id, project_id, site_id, package_id, '71000000-0000-4000-8000-000000000002',
    label, p_geom, p_anchor, geometry_sha256 FROM fieldmaps.package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000004';
$$;
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_snapshot(NULL, fieldmaps.make_point(0,0))$q$,
  '23502', 'published snapshot geometry must be present');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_snapshot(
  ST_GeomFromText('MULTIPOLYGON EMPTY',4326), fieldmaps.make_point(0,0))$q$,
  '23514', 'empty published geometry is rejected');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_snapshot(
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.01 0.01,0.01 0,0 0.01,0 0)))',4326), fieldmaps.make_point(0,0))$q$,
  '23514', 'invalid published topology is rejected');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_snapshot(
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.01 0,0.01 0.01,0 0.01,0 0)))',4326), fieldmaps.make_point(1,1))$q$,
  '23514', 'an anchor must be covered by its snapshot');

CREATE FUNCTION pg_temp.zone_package(p_inventory uuid, p_boundary extensions.geometry, p_manifest jsonb)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO fieldmaps.site_packages (id, organization_id, project_id, site_id, form_version_id,
    version, state, manifest, archive, archive_sha256, prepared_by,
    zone_contract_version, site_boundary, inventory_form_version_id)
  SELECT '72000000-0000-4000-8000-000000000099', organization_id, project_id, site_id, form_version_id,
    99, state, p_manifest, archive, archive_sha256, prepared_by, 1, p_boundary, p_inventory
  FROM fieldmaps.site_packages WHERE id = '72000000-0000-4000-8000-000000000004';
$$;
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_package(NULL, NULL, '{"format":2}')$q$,
  '23514', 'managed packages require actual site ground');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_package(NULL,
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.01 0,0.01 0.01,0 0.01,0 0)))',4326), '{}')$q$,
  '23514', 'missing format metadata cannot bypass a nullable CHECK');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.zone_package('20000000-0000-4000-8000-000000000004',
  ST_GeomFromText('MULTIPOLYGON(((0 0,0.01 0,0.01 0.01,0 0.01,0 0)))',4326), '{"format":2}')$q$,
  '23503', 'package inventory binding cannot cross projects');

SELECT pg_temp.assert_rejected($q$INSERT INTO zone_drafts
  (id, organization_id, project_id, site_id, base_package_id, inventory_form_version_id,
    create_request_id, create_request_hash, create_request, created_by, updated_by)
  SELECT '76000000-0000-4000-8000-000000000099', organization_id, project_id, site_id,
    '72000000-0000-4000-8000-000000000006', NULL,
    '77000000-0000-4000-8000-000000000099', create_request_hash, create_request, created_by, updated_by
  FROM zone_drafts LIMIT 1$q$, '23503', 'draft bases must belong to the same site');
SELECT pg_temp.assert_rejected($q$INSERT INTO zone_drafts
  (id, organization_id, project_id, site_id, base_package_id, inventory_form_version_id,
    create_request_id, create_request_hash, create_request, created_by, updated_by)
  SELECT '76000000-0000-4000-8000-000000000099', organization_id, project_id, site_id, base_package_id,
    '20000000-0000-4000-8000-000000000004', '77000000-0000-4000-8000-000000000099',
    create_request_hash, create_request, created_by, updated_by FROM zone_drafts LIMIT 1$q$,
  '23503', 'draft inventory binding cannot cross tenants');
SELECT pg_temp.assert_rejected($q$INSERT INTO zone_drafts
  (id, organization_id, project_id, site_id, base_package_id, create_request_id,
    create_request_hash, create_request, created_by, updated_by)
  SELECT '76000000-0000-4000-8000-000000000099', organization_id, project_id, site_id, base_package_id,
    create_request_id, create_request_hash, create_request, created_by, updated_by
  FROM zone_drafts WHERE id = '76000000-0000-4000-8000-000000000003'$q$,
  '23505', 'draft creation request identity is durable');
SELECT pg_temp.assert_rejected($q$UPDATE zone_drafts SET zones = '[]', revision = revision + 1
  WHERE id = '76000000-0000-4000-8000-000000000001'$q$, '23514', 'published drafts are frozen');
SELECT pg_temp.assert_rejected($q$UPDATE zone_drafts SET change_note = 'lost update'
  WHERE id = '76000000-0000-4000-8000-000000000003'$q$, '23514', 'draft updates must advance revision');
SELECT pg_temp.assert_rejected($q$UPDATE zone_drafts SET inventory_form_version_id =
  '10000000-0000-4000-8000-000000000004', revision = revision + 1
  WHERE id = '76000000-0000-4000-8000-000000000003'$q$, '23514', 'draft form selection is frozen');

SELECT pg_temp.assert_rejected($q$UPDATE site_zone_state SET legacy_package_id = NULL, revision = 44$q$,
  '23514', 'the legacy package selection is frozen after adoption');
SELECT pg_temp.assert_rejected($q$UPDATE site_zone_state
  SET current_package_id = '72000000-0000-4000-8000-000000000002', revision = 42$q$,
  '23514', 'rollback cannot reactivate an older package');
SELECT pg_temp.assert_rejected($q$UPDATE site_zone_state
  SET current_package_id = '72000000-0000-4000-8000-000000000004', revision = 44$q$,
  '23503', 'an unfinalized package cannot become current');
SELECT pg_temp.assert_rejected($q$UPDATE site_zone_state
  SET current_package_id = '72000000-0000-4000-8000-000000000005', revision = 45$q$,
  '23514', 'blocked packages cannot become current');
SELECT pg_temp.assert_rejected($q$DELETE FROM site_zone_state$q$, '23514', 'adoption cannot be erased');
SELECT pg_temp.assert_rejected($q$UPDATE zone_publications SET change_note = 'lost mapping'$q$,
  '23514', 'publication mapping audit is immutable');
SELECT pg_temp.assert_rejected($q$DELETE FROM zone_publications$q$,
  '23514', 'durable replay evidence cannot be deleted');
SELECT pg_temp.assert_rejected($q$INSERT INTO zone_publications
  SELECT '78000000-0000-4000-8000-000000000099', created_by, organization_id, project_id,
    site_id, operation, draft_id, draft_revision, expected_current_package_id, request_hash, request,
    '72000000-0000-4000-8000-000000000006', identity_map, change_note, created_at
  FROM zone_publications LIMIT 1$q$, '23503', 'publication results cannot cross sites');
SELECT pg_temp.assert_rejected($q$UPDATE observations SET upload_protocol = 2,
  package_id = '72000000-0000-4000-8000-000000000002', zone_id = '71000000-0000-4000-8000-000000000001'
  WHERE id = '30000000-0000-4000-8000-000000000001'$q$,
  '23514', 'legacy observations cannot be retrospectively bound');

CREATE FUNCTION pg_temp.bound_observation(p_site uuid, p_package uuid, p_zone uuid, p_protocol integer)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO fieldmaps.observations (id, organization_id, project_id, site_id, form_version_id,
    observer_code, observed_at, geom, answers, created_by, upload_hash, package_id, zone_id, upload_protocol,
    round_type, first_round, placement_source)
  VALUES ('74000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002', p_site, '10000000-0000-4000-8000-000000000004',
    'QA', now(), fieldmaps.make_point(0.005, 0.005), '{}',
    '50000000-0000-4000-8000-000000000001', repeat('e', 64), p_package, p_zone, p_protocol, 'standard', true, 'hand');
$$;
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.bound_observation(
  '10000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001', 1)$q$, '23514', 'v1 cannot claim v2 binding');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.bound_observation(
  '10000000-0000-4000-8000-000000000003', NULL, NULL, 2)$q$,
  '23514', 'v2 requires both binding IDs');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.bound_observation(
  '10000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000002', 2)$q$,
  'ZB001', 'an observation requires the exact package-zone snapshot');
SELECT pg_temp.assert_rejected($q$SELECT pg_temp.bound_observation(
  '70000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001', 2)$q$,
  'ZB001', 'an observation cannot bind another site package');
SELECT pg_temp.bound_observation('10000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 2);
SELECT pg_temp.assert_rejected($q$UPDATE observations SET package_id =
  '72000000-0000-4000-8000-000000000003' WHERE id = '74000000-0000-4000-8000-000000000099'$q$,
  '23514', 'bound observations cannot be moved to newer boundaries');

SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM package_zones),
  'observers read current and superseded snapshots while unfinalized snapshots stay hidden');
SELECT pg_temp.assert_true((SELECT label = 'Old label' FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000002'), 'history uses the recorded label');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM zone_drafts)
  AND NOT EXISTS (SELECT FROM zone_publications), 'observers cannot read draft geometry or mapping notes');
SELECT pg_temp.assert_true((SELECT current_package_id = '72000000-0000-4000-8000-000000000003'
  AND legacy_package_id = '72000000-0000-4000-8000-000000000001' AND revision = 43
  FROM site_zone_state), 'current revision is the package version and legacy selection stays frozen');
SELECT pg_temp.assert_rejected('INSERT INTO package_zones SELECT * FROM package_zones',
  '42501', 'direct snapshot writes are denied');
SELECT pg_temp.assert_rejected('INSERT INTO zone_identities SELECT * FROM zone_identities',
  '42501', 'direct identity writes are denied');
SELECT pg_temp.assert_rejected('UPDATE site_zone_state SET revision = revision + 1',
  '42501', 'observers cannot change current selection');
SELECT pg_temp.assert_true(has_column_privilege(current_user, 'fieldmaps.observations', 'package_id', 'INSERT')
  AND has_column_privilege(current_user, 'fieldmaps.observations', 'zone_id', 'INSERT')
  AND has_column_privilege(current_user, 'fieldmaps.observations', 'upload_protocol', 'INSERT'),
  'v2 insert grants are guarded by server-side binding validation');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000003', true);
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM package_zones)
  AND NOT EXISTS (SELECT FROM zone_drafts), 'viewers read history but cannot inspect drafts');
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM zone_drafts)
  AND (SELECT count(*) = 2 FROM zone_publications), 'managers read their project drafts and publication audit');
SELECT pg_temp.assert_rejected('INSERT INTO zone_drafts SELECT * FROM zone_drafts',
  '42501', 'managers cannot bypass future draft validation functions');
SELECT pg_temp.assert_rejected('UPDATE site_zone_state SET revision = revision + 1',
  '42501', 'managers cannot activate packages directly');
SELECT pg_temp.assert_rejected('INSERT INTO zone_publications SELECT * FROM zone_publications',
  '42501', 'managers cannot forge publication audit');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM zone_drafts)
  AND (SELECT count(*) = 2 FROM package_zones), 'inherited organization admins have manager reads');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM package_zones)
  AND NOT EXISTS (SELECT FROM zone_identities) AND NOT EXISTS (SELECT FROM zone_drafts)
  AND NOT EXISTS (SELECT FROM zone_publications) AND NOT EXISTS (SELECT FROM site_zone_state),
  'a manager of another tenant cannot discover zone resources');
SELECT pg_temp.assert_true(NOT fieldmaps_private.can_read_zone_package('72000000-0000-4000-8000-000000000002'),
  'the finalization read helper does not leak another tenant publication');
SELECT set_config('fieldmaps.user_id', '', true);
SELECT pg_temp.assert_true(NOT EXISTS (SELECT FROM package_zones)
  AND NOT EXISTS (SELECT FROM zone_drafts), 'anonymous API sessions cannot read zones');
RESET ROLE;

GRANT INSERT ON package_zones TO fieldmaps_api;
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000004', true);
SELECT pg_temp.assert_rejected($q$INSERT INTO package_zones
  SELECT organization_id, project_id, site_id, package_id, '71000000-0000-4000-8000-000000000002',
    label, geom, display_anchor, geometry_sha256 FROM package_zones
  WHERE package_id = '72000000-0000-4000-8000-000000000002'$q$,
  '23514', 'the append trigger still protects history if an INSERT grant accidentally appears');
RESET ROLE;
REVOKE INSERT ON package_zones FROM fieldmaps_api;
