CREATE FUNCTION fieldmaps_private.assert_zone_observer(p_project uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  IF NOT fieldmaps_private.has_project_role(p_project, ARRAY['observer','manager']) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
END;
$$;
CREATE FUNCTION fieldmaps_private.authorize_zone_observation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.upload_protocol = 2 AND current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID)) THEN
    PERFORM fieldmaps_private.assert_zone_observer(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER authorize_zone_observation BEFORE INSERT ON fieldmaps.observations
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.authorize_zone_observation();

CREATE FUNCTION fieldmaps_private.bind_zone_observation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE package fieldmaps.site_packages; snapshot fieldmaps.package_zones; code text; expected_form uuid;
BEGIN
  IF NEW.upload_protocol = 1 THEN RETURN NEW; END IF;
  IF NEW.upload_protocol IS DISTINCT FROM 2 OR NEW.package_id IS NULL OR NEW.zone_id IS NULL THEN
    RAISE EXCEPTION 'Both v2 binding IDs are required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO package FROM fieldmaps.site_packages WHERE id = NEW.package_id
    AND organization_id = NEW.organization_id AND project_id = NEW.project_id AND site_id = NEW.site_id;
  IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('package_not_in_site'); END IF;
  IF package.state <> 'ready' OR package.zone_contract_version IS DISTINCT FROM 1 OR NOT EXISTS (
    SELECT FROM fieldmaps.zone_publications WHERE published_package_id = package.id) THEN
    PERFORM fieldmaps_private.reject_zone('package_not_ready');
  END IF;
  SELECT * INTO snapshot FROM fieldmaps.package_zones WHERE package_id = package.id AND zone_id = NEW.zone_id;
  IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('zone_not_in_package', ARRAY[NEW.zone_id]); END IF;
  SELECT i.code INTO code FROM fieldmaps.zone_identities i WHERE id = snapshot.zone_id;
  NEW.zone_code := code;
  IF NEW.round_type = 'inventory' THEN
    IF NEW.placement_source IS DISTINCT FROM 'zone' OR NEW.first_round IS NOT NULL THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure', ARRAY[NEW.zone_id]);
    END IF;
    expected_form := package.inventory_form_version_id;
    NEW.geom := snapshot.display_anchor;
  ELSIF NEW.round_type IN ('standard', 'reliability') THEN
    IF NEW.placement_source IS DISTINCT FROM 'hand' OR NEW.first_round IS NULL
      OR NEW.geom IS NULL OR extensions.ST_IsEmpty(NEW.geom) OR extensions.ST_NDims(NEW.geom) <> 2
      OR NOT (extensions.ST_X(NEW.geom) BETWEEN -180 AND 180 AND extensions.ST_Y(NEW.geom) BETWEEN -90 AND 90) THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure', ARRAY[NEW.zone_id]);
    END IF;
    expected_form := package.form_version_id;
    IF NOT extensions.ST_Covers(snapshot.geom, NEW.geom) THEN
      PERFORM fieldmaps_private.reject_zone('point_outside_zone', ARRAY[NEW.zone_id]);
    END IF;
  ELSE
    PERFORM fieldmaps_private.reject_zone('invalid_structure', ARRAY[NEW.zone_id]);
  END IF;
  IF expected_form IS NULL OR NEW.form_version_id IS DISTINCT FROM expected_form OR NOT EXISTS (
    SELECT FROM fieldmaps.form_versions WHERE id = expected_form AND state IN ('published', 'retired')) THEN
    PERFORM fieldmaps_private.reject_zone('form_not_in_package', ARRAY[NEW.zone_id]);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validated_zone_observation BEFORE INSERT ON fieldmaps.observations
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.bind_zone_observation();

CREATE FUNCTION fieldmaps_private.preserve_bound_observation_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.upload_protocol = 2 AND (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.form_version_id,
    extensions.ST_AsEWKB(NEW.geom), NEW.zone_code, NEW.round_type, NEW.first_round, NEW.placement_source, NEW.created_by, NEW.upload_hash)
    IS DISTINCT FROM (OLD.organization_id, OLD.project_id, OLD.site_id, OLD.form_version_id,
    extensions.ST_AsEWKB(OLD.geom), OLD.zone_code, OLD.round_type, OLD.first_round, OLD.placement_source, OLD.created_by, OLD.upload_hash) THEN
    RAISE EXCEPTION 'Historical observation context cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_bound_observation_context BEFORE UPDATE ON fieldmaps.observations
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.preserve_bound_observation_context();
GRANT INSERT (package_id, zone_id, upload_protocol) ON fieldmaps.observations TO fieldmaps_api;
REVOKE ALL ON FUNCTION fieldmaps_private.bind_zone_observation(), fieldmaps_private.preserve_bound_observation_context()
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
REVOKE ALL ON FUNCTION fieldmaps_private.assert_zone_observer(uuid), fieldmaps_private.authorize_zone_observation()
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
GRANT EXECUTE ON FUNCTION fieldmaps_private.assert_zone_observer(uuid) TO fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0018_zone_observation_binding');
