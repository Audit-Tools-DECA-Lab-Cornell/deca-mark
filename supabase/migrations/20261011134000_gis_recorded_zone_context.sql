CREATE VIEW gis.recorded_observations
WITH (security_invoker = true, security_barrier = true) AS
SELECT o.qgis_id AS fid, o.id AS observation_id, o.organization_id, o.project_id,
  o.site_id, s.code AS site_code, s.name AS site_name, o.form_version_id,
  f.code AS form_version, o.created_by AS user_id, o.observer_code,
  o.observed_at, o.received_at, o.revision, o.answers,
  o.round_type, o.first_round, o.placement_source,
  o.package_id, p.version AS package_version, o.zone_id,
  coalesce(zi.code, o.zone_code) AS zone_code, z.label AS zone_label_at_capture,
  CASE WHEN o.package_id IS NULL THEN 'legacy_unversioned'
    ELSE 'recorded_package' END AS assignment_basis,
  CASE WHEN o.round_type = 'inventory' THEN 'zone'
    WHEN o.package_id IS NOT NULL OR (o.round_type IN ('standard', 'reliability')
      AND o.placement_source = 'hand') THEN 'point'
    ELSE 'legacy_unknown' END AS spatial_support,
  CASE WHEN o.package_id IS NOT NULL THEN
    o.package_id::text || ':' || o.zone_id::text END AS snapshot_key,
  CASE WHEN o.round_type = 'inventory' THEN
    extensions.ST_AsGeoJSON(coalesce(z.display_anchor, o.geom), 17)::jsonb
    END AS display_anchor,
  CASE WHEN o.round_type = 'inventory' THEN
    CASE WHEN o.package_id IS NULL THEN 'legacy_compatibility' ELSE 'snapshot' END
    END AS display_anchor_basis
FROM fieldmaps.observations o
JOIN fieldmaps.sites s ON (s.organization_id, s.project_id, s.id)
  = (o.organization_id, o.project_id, o.site_id)
JOIN fieldmaps.form_versions f ON (f.organization_id, f.project_id, f.id)
  = (o.organization_id, o.project_id, o.form_version_id)
LEFT JOIN fieldmaps.site_packages p ON (p.organization_id, p.project_id, p.site_id, p.id)
  = (o.organization_id, o.project_id, o.site_id, o.package_id)
LEFT JOIN fieldmaps.package_zones z ON
  (z.organization_id, z.project_id, z.site_id, z.package_id, z.zone_id)
  = (o.organization_id, o.project_id, o.site_id, o.package_id, o.zone_id)
LEFT JOIN fieldmaps.zone_identities zi ON
  (zi.organization_id, zi.project_id, zi.site_id, zi.id)
  = (z.organization_id, z.project_id, z.site_id, z.zone_id)
WHERE o.deleted_at IS NULL;

CREATE VIEW gis.point_events
WITH (security_invoker = true, security_barrier = true) AS
SELECT r.*, o.geom::extensions.geometry(Point, 4326) AS geom
FROM gis.recorded_observations r
JOIN fieldmaps.observations o ON o.id = r.observation_id
WHERE r.spatial_support = 'point' AND r.round_type IS DISTINCT FROM 'inventory';

CREATE VIEW gis.zone_snapshots
WITH (security_invoker = true, security_barrier = true) AS
SELECT z.package_id::text || ':' || z.zone_id::text AS snapshot_key,
  z.organization_id, z.project_id, z.site_id, s.code AS site_code, s.name AS site_name,
  z.package_id, p.version AS package_version, z.zone_id, zi.code AS zone_code,
  z.label AS zone_label_at_capture, z.geometry_sha256,
  p.prepared_at, p.prepared_by,
  extensions.ST_Area(z.geom::extensions.geography) AS area_m2,
  z.display_anchor::extensions.geometry(Point, 4326) AS display_anchor,
  z.geom::extensions.geometry(MultiPolygon, 4326) AS geom
FROM fieldmaps.package_zones z
JOIN fieldmaps.site_packages p ON (p.organization_id, p.project_id, p.site_id, p.id)
  = (z.organization_id, z.project_id, z.site_id, z.package_id)
JOIN fieldmaps.zone_identities zi ON (zi.organization_id, zi.project_id, zi.site_id, zi.id)
  = (z.organization_id, z.project_id, z.site_id, z.zone_id)
JOIN fieldmaps.sites s ON (s.organization_id, s.project_id, s.id)
  = (z.organization_id, z.project_id, z.site_id)
JOIN fieldmaps.projects project ON (project.organization_id, project.id)
  = (z.organization_id, z.project_id)
WHERE p.state = 'ready' AND p.zone_contract_version = 1
  -- Training metadata must not reveal another creator's recorded activity.
  -- RLS on observations supplies creator isolation even to Training managers.
  AND (NOT project.is_training OR EXISTS (
    SELECT FROM fieldmaps.observations o
    WHERE (o.organization_id, o.project_id, o.site_id, o.package_id, o.zone_id)
      = (z.organization_id, z.project_id, z.site_id, z.package_id, z.zone_id)
      AND o.deleted_at IS NULL));

CREATE VIEW gis.inventory_records
WITH (security_invoker = true, security_barrier = true) AS
SELECT r.*, z.geom::extensions.geometry(MultiPolygon, 4326) AS geom
FROM gis.recorded_observations r
LEFT JOIN fieldmaps.package_zones z ON
  (z.organization_id, z.project_id, z.site_id, z.package_id, z.zone_id)
  = (r.organization_id, r.project_id, r.site_id, r.package_id, r.zone_id)
WHERE r.round_type = 'inventory';

CREATE VIEW gis.legacy_records
WITH (security_invoker = true, security_barrier = true) AS
SELECT r.*,
  CASE WHEN r.spatial_support = 'point' THEN o.geom END
    ::extensions.geometry(Point, 4326) AS event_geom,
  CASE WHEN r.round_type = 'inventory' THEN 'legacy_compatibility_anchor'
    WHEN r.spatial_support = 'point' THEN 'event_point'
    ELSE 'legacy_unknown' END AS stored_geometry_role,
  o.geom::extensions.geometry(Point, 4326) AS geom
FROM gis.recorded_observations r
JOIN fieldmaps.observations o ON o.id = r.observation_id
WHERE r.assignment_basis = 'legacy_unversioned';

REVOKE ALL ON gis.recorded_observations, gis.point_events, gis.zone_snapshots,
  gis.inventory_records, gis.legacy_records
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_sample_reader, fieldmaps_api;
GRANT USAGE ON SCHEMA gis TO fieldmaps_api;
GRANT SELECT ON gis.recorded_observations, gis.point_events, gis.zone_snapshots,
  gis.inventory_records, gis.legacy_records TO fieldmaps_api;

COMMENT ON VIEW gis.recorded_observations IS
  'Read-only caller/RLS-scoped recorded metadata; snapshot_key joins exact package+zone, never current boundaries.';
COMMENT ON VIEW gis.point_events IS
  'Proven event Points only. Inventory compatibility anchors and unknown legacy support are excluded.';
COMMENT ON VIEW gis.zone_snapshots IS
  'One MultiPolygon per immutable package+zone; Training snapshots require an owner-visible live observation.';
COMMENT ON VIEW gis.inventory_records IS
  'One Inventory observation per recorded MultiPolygon; unversioned Inventory geometry is null and its display anchor is compatibility metadata.';
COMMENT ON VIEW gis.legacy_records IS
  'Retained legacy stored Point with explicit geometry role; package/version/zone UUID/label remain unknown.';

INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0025_gis_recorded_zone_context');
