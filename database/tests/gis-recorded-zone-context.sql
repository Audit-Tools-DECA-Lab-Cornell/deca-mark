RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 4 AND bool_and(reloptions @> ARRAY['security_invoker=true', 'security_barrier=true'])
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'gis' AND c.relname IN ('recorded_observations', 'point_events',
     'zone_snapshots', 'inventory_records')),
  'all companion GIS views enforce invoker RLS and security barriers');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role', 'fieldmaps_sample_reader']) r(role)
    WHERE n.nspname = 'gis' AND c.relname IN ('recorded_observations', 'point_events',
      'zone_snapshots', 'inventory_records')
      AND has_table_privilege(r.role, c.oid, 'SELECT')),
  'new GIS views grant no access to browser, service or existing sample readers');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'gis' AND c.relname IN ('recorded_observations', 'point_events',
      'zone_snapshots', 'inventory_records')
      AND (has_table_privilege('fieldmaps_api', c.oid, 'INSERT')
        OR has_table_privilege('fieldmaps_api', c.oid, 'UPDATE')
        OR has_table_privilege('fieldmaps_api', c.oid, 'DELETE'))),
  'companion GIS interface remains read-only');
SET LOCAL ROLE fieldmaps_sample_reader;
SELECT pg_temp.assert_rejected('SELECT * FROM gis.recorded_observations', '42501',
  'existing sample reader cannot access new project-wide GIS metadata');
SELECT pg_temp.assert_rejected('SELECT * FROM gis.zone_snapshots', '42501',
  'existing sample reader cannot access new zone snapshot geometry');
RESET ROLE;

SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id', '50000000-0000-4000-8000-000000000003', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM gis.recorded_observations WHERE site_id = :'site') =
  (SELECT count(*) FROM fieldmaps.observations WHERE site_id = :'site' AND deleted_at IS NULL),
  'viewer GIS metadata count matches live authorized observations');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM gis.point_events WHERE round_type = 'inventory'
    OR spatial_support <> 'point'),
  'Inventory never enters point-event counts');
SELECT pg_temp.assert_true(
  (SELECT package_id = :'p3' AND package_version = 3 AND zone_id = :'zone_a'
    AND zone_label_at_capture = 'Original A'
    AND snapshot_key = :'p3' || ':' || :'zone_a'
   FROM gis.inventory_records WHERE observation_id = :'inventory_id'),
  'superseded Inventory retains recorded version and original label');
SELECT pg_temp.assert_true(
  (SELECT ST_AsEWKB(i.geom) = ST_AsEWKB(z.geom)
    AND i.display_anchor = ST_AsGeoJSON(z.display_anchor, 17)::jsonb
   FROM gis.inventory_records i JOIN fieldmaps.package_zones z
     ON z.package_id = i.package_id AND z.zone_id = i.zone_id
   WHERE i.observation_id = :'inventory_id'),
  'Inventory polygon and anchor come from exact immutable package-zone snapshot');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT observation_id FROM gis.inventory_records GROUP BY observation_id
    HAVING count(*) <> 1)
  AND NOT EXISTS (SELECT snapshot_key FROM gis.zone_snapshots GROUP BY snapshot_key
    HAVING count(*) <> 1),
  'multipart geometry cannot multiply Inventory or snapshot rows');
SELECT pg_temp.assert_true((SELECT geom IS NULL FROM fieldmaps.observations WHERE id=:'inventory_id'),
  'Inventory has no stored event geometry');
SELECT pg_temp.assert_true(
  (SELECT z.zone_label_at_capture = 'Original A' AND z.package_version = 3
    AND z.area_m2 > 0 AND z.prepared_at = p.prepared_at AND z.prepared_by = p.prepared_by
    AND GeometryType(z.geom) = 'MULTIPOLYGON' AND ST_SRID(z.geom) = 4326
   FROM gis.zone_snapshots z JOIN fieldmaps.site_packages p ON p.id = z.package_id
   WHERE z.package_id = :'p3' AND z.zone_id = :'zone_a'),
  'snapshot projection exposes historical area and real publication metadata');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM gis.recorded_observations WHERE project_id =
    '20000000-0000-4000-8000-000000000002'),
  'GIS metadata excludes foreign project observations');
SELECT pg_temp.assert_true(
  NOT has_table_privilege(current_user, 'gis.sample_observations', 'SELECT'),
  'new runtime GIS usage does not grant the scoped sample view');
SELECT set_config('fieldmaps.user_id', '51000000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM gis.recorded_observations WHERE site_id = :'site')
  AND NOT EXISTS (SELECT FROM gis.zone_snapshots WHERE site_id = :'site')
  AND NOT EXISTS (SELECT FROM gis.inventory_records WHERE site_id = :'site')
  AND NOT EXISTS (SELECT FROM gis.point_events WHERE site_id = :'site'),
  'guessed site and package identities cannot cross tenant scope');
SELECT set_config('fieldmaps.user_id', '53000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM gis.point_events WHERE package_id = :'training_package')
  AND (SELECT count(*) = 1 FROM gis.zone_snapshots WHERE package_id = :'training_package'),
  'Training creator sees own event and its recorded snapshot');
SELECT set_config('fieldmaps.user_id', '53000000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM gis.recorded_observations WHERE package_id = :'training_package')
  AND NOT EXISTS (SELECT FROM gis.point_events WHERE package_id = :'training_package')
  AND NOT EXISTS (SELECT FROM gis.zone_snapshots WHERE package_id = :'training_package'),
  'Training manager cannot infer another creator activity from GIS snapshots');
SELECT set_config('fieldmaps.user_id', '', true);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT FROM gis.recorded_observations)
  AND NOT EXISTS (SELECT FROM gis.zone_snapshots),
  'missing caller identity exposes no GIS data');
RESET ROLE;
