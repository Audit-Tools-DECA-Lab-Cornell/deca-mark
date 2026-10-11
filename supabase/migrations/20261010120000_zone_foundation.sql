-- DB-15 installs storage only. DB-16 grants validated publication/draft/upload functions.
ALTER TABLE fieldmaps.site_packages
  ADD COLUMN zone_contract_version integer CHECK (zone_contract_version = 1),
  ADD COLUMN site_boundary extensions.geometry(MultiPolygon, 4326),
  ADD COLUMN inventory_form_version_id uuid,
  ADD CONSTRAINT site_packages_site_identity UNIQUE (organization_id, project_id, site_id, id),
  ADD CONSTRAINT site_packages_inventory_form FOREIGN KEY
    (organization_id, project_id, inventory_form_version_id)
    REFERENCES fieldmaps.form_versions (organization_id, project_id, id),
  ADD CONSTRAINT site_packages_zone_metadata CHECK (
    (zone_contract_version IS NULL AND site_boundary IS NULL AND inventory_form_version_id IS NULL)
    OR coalesce((zone_contract_version IS NOT NULL AND site_boundary IS NOT NULL
      AND manifest -> 'format' = '2'::jsonb AND state = 'ready'
      AND extensions.ST_IsValid(site_boundary) AND NOT extensions.ST_IsEmpty(site_boundary)
      AND extensions.ST_NDims(site_boundary) = 2
      AND extensions.ST_XMin(site_boundary::extensions.box3d) >= -180
      AND extensions.ST_XMax(site_boundary::extensions.box3d) <= 180
      AND extensions.ST_YMin(site_boundary::extensions.box3d) >= -85
      AND extensions.ST_YMax(site_boundary::extensions.box3d) <= 85
      AND extensions.ST_XMax(site_boundary::extensions.box3d)
        - extensions.ST_XMin(site_boundary::extensions.box3d) <= 1
      AND extensions.ST_YMax(site_boundary::extensions.box3d)
        - extensions.ST_YMin(site_boundary::extensions.box3d) <= 1), false)
  );

CREATE TABLE fieldmaps.zone_identities (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  code text COLLATE "C" NOT NULL CHECK (length(code) BETWEEN 1 AND 100
    AND code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, project_id, site_id)
    REFERENCES fieldmaps.sites (organization_id, project_id, id),
  UNIQUE (organization_id, project_id, site_id, id),
  UNIQUE (organization_id, project_id, site_id, code)
);
CREATE INDEX zone_identities_site_idx ON fieldmaps.zone_identities (project_id, site_id);

CREATE TABLE fieldmaps.package_zones (
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  package_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  geom extensions.geometry(MultiPolygon, 4326) NOT NULL,
  display_anchor extensions.geometry(Point, 4326) NOT NULL,
  geometry_sha256 text NOT NULL CHECK (geometry_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (package_id, zone_id),
  UNIQUE (organization_id, project_id, site_id, package_id, zone_id),
  FOREIGN KEY (organization_id, project_id, site_id, package_id)
    REFERENCES fieldmaps.site_packages (organization_id, project_id, site_id, id),
  FOREIGN KEY (organization_id, project_id, site_id, zone_id)
    REFERENCES fieldmaps.zone_identities (organization_id, project_id, site_id, id),
  CHECK (extensions.ST_IsValid(geom) AND NOT extensions.ST_IsEmpty(geom)
    AND extensions.ST_NDims(geom) = 2 AND extensions.ST_NPoints(geom) <= 2000
    AND extensions.ST_XMin(geom::extensions.box3d) >= -180
    AND extensions.ST_XMax(geom::extensions.box3d) <= 180
    AND extensions.ST_YMin(geom::extensions.box3d) >= -85
    AND extensions.ST_YMax(geom::extensions.box3d) <= 85
    AND extensions.ST_XMax(geom::extensions.box3d) - extensions.ST_XMin(geom::extensions.box3d) <= 1
    AND extensions.ST_YMax(geom::extensions.box3d) - extensions.ST_YMin(geom::extensions.box3d) <= 1),
  CHECK (NOT extensions.ST_IsEmpty(display_anchor) AND extensions.ST_NDims(display_anchor) = 2
    AND extensions.ST_Covers(geom, display_anchor))
);
CREATE INDEX package_zones_geom_idx ON fieldmaps.package_zones USING gist (geom);
CREATE INDEX package_zones_identity_idx ON fieldmaps.package_zones (project_id, site_id, zone_id);

-- Structural checks allow invalid topology in drafts while bounding decoded positions.
CREATE FUNCTION fieldmaps_private.zone_position_count(p_geometry jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE
  parts jsonb;
  part jsonb;
  ring jsonb;
  position jsonb;
  positions integer := 0;
BEGIN
  IF jsonb_typeof(p_geometry) <> 'object'
    OR NOT p_geometry ?& ARRAY['type', 'coordinates']
    OR (SELECT count(*) FROM jsonb_object_keys(p_geometry)) <> 2 THEN RETURN NULL; END IF;
  CASE p_geometry ->> 'type'
    WHEN 'Polygon' THEN parts := jsonb_build_array(p_geometry -> 'coordinates');
    WHEN 'MultiPolygon' THEN parts := p_geometry -> 'coordinates';
    ELSE RETURN NULL;
  END CASE;
  IF jsonb_typeof(parts) <> 'array' OR jsonb_array_length(parts) = 0 THEN RETURN NULL; END IF;
  FOR part IN SELECT value FROM jsonb_array_elements(parts) LOOP
    IF jsonb_typeof(part) <> 'array' OR jsonb_array_length(part) = 0 THEN RETURN NULL; END IF;
    FOR ring IN SELECT value FROM jsonb_array_elements(part) LOOP
      IF jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 4 THEN RETURN NULL; END IF;
      positions := positions + jsonb_array_length(ring);
      IF positions > 2000 OR ring -> 0 <> ring -> -1
        OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(ring)) < 3 THEN RETURN NULL; END IF;
      FOR position IN SELECT value FROM jsonb_array_elements(ring) LOOP
        IF jsonb_typeof(position) <> 'array' OR jsonb_array_length(position) <> 2
          OR jsonb_typeof(position -> 0) <> 'number' OR jsonb_typeof(position -> 1) <> 'number'
          THEN RETURN NULL; END IF;
        IF (position ->> 0)::numeric NOT BETWEEN -180 AND 180
          OR (position ->> 1)::numeric NOT BETWEEN -90 AND 90 THEN RETURN NULL; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN positions;
END;
$$;

CREATE FUNCTION fieldmaps_private.valid_zone_draft(p_zones jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE
  zone jsonb;
  count_positions integer;
  total_positions integer := 0;
  ids uuid[] := '{}';
  codes text[] := '{}';
  zone_id uuid;
BEGIN
  IF jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) > 250 THEN RETURN false; END IF;
  FOR zone IN SELECT value FROM jsonb_array_elements(p_zones) LOOP
    IF jsonb_typeof(zone) <> 'object'
      OR NOT zone ?& ARRAY['zone_id', 'zone_code', 'zone_label', 'geometry']
      OR (SELECT count(*) FROM jsonb_object_keys(zone)) <> 4
      OR jsonb_typeof(zone -> 'zone_id') <> 'string'
      OR (zone ->> 'zone_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      OR jsonb_typeof(zone -> 'zone_code') <> 'string'
      OR length(zone ->> 'zone_code') NOT BETWEEN 1 AND 100
      OR (zone ->> 'zone_code') COLLATE "C" !~ '^[A-Za-z0-9][A-Za-z0-9_.-]*$'
      OR jsonb_typeof(zone -> 'zone_label') <> 'string'
      OR length(btrim(zone ->> 'zone_label')) NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
    zone_id := (zone ->> 'zone_id')::uuid;
    IF zone_id = ANY(ids) OR (zone ->> 'zone_code') = ANY(codes) THEN RETURN false; END IF;
    ids := array_append(ids, zone_id);
    codes := array_append(codes, zone ->> 'zone_code');
    count_positions := fieldmaps_private.zone_position_count(zone -> 'geometry');
    IF count_positions IS NULL THEN RETURN false; END IF;
    total_positions := total_positions + count_positions;
    IF total_positions > 20000 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE fieldmaps.zone_drafts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  base_package_id uuid NOT NULL,
  inventory_form_version_id uuid,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'discarded')),
  zones jsonb NOT NULL DEFAULT '[]' CHECK (fieldmaps_private.valid_zone_draft(zones)),
  change_note text NOT NULL DEFAULT '' CHECK (length(change_note) <= 2000),
  create_request_id uuid NOT NULL,
  create_request_hash text NOT NULL CHECK (create_request_hash ~ '^[a-f0-9]{64}$'),
  create_request jsonb NOT NULL CHECK (jsonb_typeof(create_request) = 'object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_package_id uuid,
  UNIQUE (organization_id, project_id, site_id, id),
  UNIQUE (created_by, project_id, create_request_id),
  FOREIGN KEY (organization_id, project_id, site_id, base_package_id)
    REFERENCES fieldmaps.site_packages (organization_id, project_id, site_id, id),
  FOREIGN KEY (organization_id, project_id, inventory_form_version_id)
    REFERENCES fieldmaps.form_versions (organization_id, project_id, id),
  FOREIGN KEY (organization_id, project_id, site_id, published_package_id)
    REFERENCES fieldmaps.site_packages (organization_id, project_id, site_id, id),
  CHECK ((state = 'published') = (published_package_id IS NOT NULL))
);
CREATE INDEX zone_drafts_site_idx ON fieldmaps.zone_drafts (project_id, site_id, state);

CREATE TABLE fieldmaps.zone_publications (
  request_id uuid NOT NULL,
  created_by uuid NOT NULL,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  operation text NOT NULL DEFAULT 'draft_publish' CHECK (operation IN ('draft_publish', 'package_import')),
  draft_id uuid,
  draft_revision bigint CHECK (draft_revision > 0),
  expected_current_package_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  published_package_id uuid NOT NULL,
  identity_map jsonb NOT NULL CHECK (jsonb_typeof(identity_map) = 'array'
    AND jsonb_array_length(identity_map) BETWEEN 1 AND 250),
  change_note text NOT NULL CHECK (length(change_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (created_by, project_id, operation, request_id),
  UNIQUE (organization_id, project_id, site_id, published_package_id),
  FOREIGN KEY (organization_id, project_id, site_id, draft_id)
    REFERENCES fieldmaps.zone_drafts (organization_id, project_id, site_id, id),
  FOREIGN KEY (organization_id, project_id, site_id, expected_current_package_id)
    REFERENCES fieldmaps.site_packages (organization_id, project_id, site_id, id),
  FOREIGN KEY (organization_id, project_id, site_id, published_package_id)
    REFERENCES fieldmaps.site_packages (organization_id, project_id, site_id, id),
  CHECK ((draft_id IS NULL) = (draft_revision IS NULL)),
  CHECK (operation <> 'draft_publish' OR draft_id IS NOT NULL)
);
CREATE INDEX zone_publications_site_idx ON fieldmaps.zone_publications (project_id, site_id);

CREATE TABLE fieldmaps.site_zone_state (
  site_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  current_package_id uuid NOT NULL,
  legacy_package_id uuid,
  revision integer NOT NULL CHECK (revision > 0),
  enabled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, project_id, site_id)
    REFERENCES fieldmaps.sites (organization_id, project_id, id),
  FOREIGN KEY (organization_id, project_id, site_id, current_package_id)
    REFERENCES fieldmaps.zone_publications (organization_id, project_id, site_id, published_package_id),
  FOREIGN KEY (organization_id, project_id, site_id, legacy_package_id)
    REFERENCES fieldmaps.site_packages (organization_id, project_id, site_id, id)
);
CREATE INDEX site_zone_state_project_idx ON fieldmaps.site_zone_state (project_id, site_id);

ALTER TABLE fieldmaps.observations
  ADD COLUMN package_id uuid,
  ADD COLUMN zone_id uuid,
  ADD COLUMN upload_protocol integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT observation_zone_binding CHECK (
    (upload_protocol = 1 AND package_id IS NULL AND zone_id IS NULL)
    OR (upload_protocol = 2 AND package_id IS NOT NULL AND zone_id IS NOT NULL)),
  ADD CONSTRAINT observation_package_zone FOREIGN KEY
    (organization_id, project_id, site_id, package_id, zone_id)
    REFERENCES fieldmaps.package_zones (organization_id, project_id, site_id, package_id, zone_id);
CREATE INDEX observations_zone_time_idx ON fieldmaps.observations
  (project_id, site_id, zone_id, observed_at DESC, id) WHERE upload_protocol = 2;
CREATE INDEX observations_package_time_idx ON fieldmaps.observations
  (project_id, site_id, package_id, observed_at DESC, id) WHERE upload_protocol = 2;

CREATE FUNCTION fieldmaps_private.preserve_zone_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Published zone history is immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER immutable_zone_identity BEFORE UPDATE OR DELETE ON fieldmaps.zone_identities
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.preserve_zone_history();
CREATE TRIGGER immutable_package_zone BEFORE UPDATE OR DELETE ON fieldmaps.package_zones
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.preserve_zone_history();
CREATE TRIGGER immutable_zone_publication BEFORE UPDATE OR DELETE ON fieldmaps.zone_publications
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.preserve_zone_history();

CREATE FUNCTION fieldmaps_private.guard_package_zone_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT FROM fieldmaps.zone_publications p
    WHERE (p.organization_id, p.project_id, p.site_id, p.published_package_id)
      = (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.package_id)) THEN
    RAISE EXCEPTION 'Published zone snapshots cannot be appended' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT FROM fieldmaps.site_packages p
    WHERE (p.organization_id, p.project_id, p.site_id, p.id)
      = (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.package_id)
      AND p.state = 'ready' AND p.zone_contract_version = 1) THEN
    RAISE EXCEPTION 'Zone snapshots require a ready managed package' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_zone_insert BEFORE INSERT ON fieldmaps.package_zones
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.guard_package_zone_insert();

CREATE FUNCTION fieldmaps_private.guard_zone_draft_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state <> 'draft' THEN
    RAISE EXCEPTION 'Retain zone drafts and immutable published results' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.site_id, NEW.base_package_id,
      NEW.inventory_form_version_id, NEW.create_request_id, NEW.create_request_hash,
      NEW.create_request, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.project_id, OLD.site_id, OLD.base_package_id,
      OLD.inventory_form_version_id, OLD.create_request_id, OLD.create_request_hash,
      OLD.create_request, OLD.created_by, OLD.created_at) OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Draft lineage is immutable and revision must advance once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zone_draft_change BEFORE UPDATE OR DELETE ON fieldmaps.zone_drafts
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.guard_zone_draft_change();

CREATE FUNCTION fieldmaps_private.guard_site_zone_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target fieldmaps.site_packages;
  adoption_base uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Retain managed-site history' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.site_id, NEW.organization_id, NEW.project_id, NEW.legacy_package_id, NEW.enabled_at)
      IS DISTINCT FROM (OLD.site_id, OLD.organization_id, OLD.project_id, OLD.legacy_package_id, OLD.enabled_at)
      OR NEW.revision <= OLD.revision THEN
      RAISE EXCEPTION 'Adoption is frozen; publish a newer version' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT * INTO target FROM fieldmaps.site_packages p
  WHERE (p.organization_id, p.project_id, p.site_id, p.id)
    = (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.current_package_id);
  IF NOT FOUND OR target.state <> 'ready' OR target.zone_contract_version IS DISTINCT FROM 1
    OR NEW.revision <> target.version
    OR NOT EXISTS (SELECT FROM fieldmaps.package_zones WHERE package_id = target.id) THEN
    RAISE EXCEPTION 'Current selection requires a ready managed snapshot and its package version'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.legacy_package_id IS NOT NULL AND NOT EXISTS (SELECT FROM fieldmaps.site_packages p
    WHERE (p.organization_id, p.project_id, p.site_id, p.id)
      = (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.legacy_package_id)
      AND p.state = 'ready' AND p.zone_contract_version IS NULL AND p.manifest -> 'format' = '1'::jsonb) THEN
    RAISE EXCEPTION 'Legacy selection requires a ready format-1 package' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT p.expected_current_package_id INTO adoption_base FROM fieldmaps.zone_publications p
    WHERE (p.organization_id, p.project_id, p.site_id, p.published_package_id)
      = (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.current_package_id);
    IF FOUND AND NEW.legacy_package_id IS DISTINCT FROM adoption_base THEN
      RAISE EXCEPTION 'First adoption freezes its format-1 base for legacy clients' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER site_zone_state_change BEFORE INSERT OR UPDATE OR DELETE ON fieldmaps.site_zone_state
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.guard_site_zone_state();

CREATE FUNCTION fieldmaps_private.preserve_observation_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.package_id, NEW.zone_id, NEW.upload_protocol)
    IS DISTINCT FROM (OLD.package_id, OLD.zone_id, OLD.upload_protocol) THEN
    RAISE EXCEPTION 'Historical observation attribution cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_observation_binding BEFORE UPDATE ON fieldmaps.observations
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.preserve_observation_binding();

ALTER TABLE fieldmaps.zone_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldmaps.package_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldmaps.zone_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldmaps.zone_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldmaps.site_zone_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fieldmaps.zone_identities, fieldmaps.package_zones, fieldmaps.zone_drafts,
  fieldmaps.zone_publications, fieldmaps.site_zone_state FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
GRANT SELECT ON fieldmaps.zone_identities, fieldmaps.package_zones, fieldmaps.zone_drafts,
  fieldmaps.zone_publications, fieldmaps.site_zone_state TO fieldmaps_api;
CREATE FUNCTION fieldmaps_private.can_read_zone_package(p_package_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT FROM fieldmaps.site_packages s JOIN fieldmaps.zone_publications p
    ON (p.organization_id, p.project_id, p.site_id, p.published_package_id)
      = (s.organization_id, s.project_id, s.site_id, s.id)
    WHERE s.id = p_package_id AND s.project_id IN (SELECT fieldmaps_private.my_project_ids()));
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.can_read_zone_package(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fieldmaps_private.can_read_zone_package(uuid) TO fieldmaps_api;
CREATE POLICY assigned_zone_identities ON fieldmaps.zone_identities FOR SELECT TO fieldmaps_api
  USING (project_id IN (SELECT fieldmaps_private.my_project_ids()));
CREATE POLICY assigned_package_zones ON fieldmaps.package_zones FOR SELECT TO fieldmaps_api
  USING (project_id IN (SELECT fieldmaps_private.my_project_ids())
    AND fieldmaps_private.can_read_zone_package(package_id));
CREATE POLICY manager_zone_drafts ON fieldmaps.zone_drafts FOR SELECT TO fieldmaps_api
  USING (fieldmaps_private.has_project_role(project_id, ARRAY['manager']));
CREATE POLICY manager_zone_publications ON fieldmaps.zone_publications FOR SELECT TO fieldmaps_api
  USING (fieldmaps_private.has_project_role(project_id, ARRAY['manager']));
CREATE POLICY assigned_site_zone_state ON fieldmaps.site_zone_state FOR SELECT TO fieldmaps_api
  USING (project_id IN (SELECT fieldmaps_private.my_project_ids()));
REVOKE ALL ON FUNCTION fieldmaps_private.zone_position_count(jsonb),
  fieldmaps_private.valid_zone_draft(jsonb), fieldmaps_private.preserve_zone_history(),
  fieldmaps_private.guard_package_zone_insert(), fieldmaps_private.guard_zone_draft_change(),
  fieldmaps_private.guard_site_zone_state(), fieldmaps_private.preserve_observation_binding()
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;

INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0014_zone_foundation');
