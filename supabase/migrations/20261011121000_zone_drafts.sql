ALTER TABLE fieldmaps.zone_drafts ADD COLUMN site_boundary extensions.geometry(MultiPolygon,4326);
ALTER TABLE fieldmaps.package_zones ADD COLUMN canonical_geometry jsonb;

CREATE FUNCTION fieldmaps_private.zone_trim(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT btrim(p_value, chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(28)||chr(29)||chr(30)||chr(31)||chr(32)
    ||chr(133)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)
    ||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288));
$$;
CREATE FUNCTION fieldmaps_private.normalize_zone_draft_values(p_zones jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE zone jsonb; result jsonb := '[]'; parts jsonb; part jsonb; ring jsonb;
  positions integer; total_positions integer := 0; ids uuid[] := '{}'; codes text[] := '{}'; zid uuid;
BEGIN
  IF p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  IF jsonb_array_length(p_zones) > 250 THEN PERFORM fieldmaps_private.reject_zone('too_complex'); END IF;
  FOR zone IN SELECT jsonb_array_elements(p_zones) LOOP
    IF jsonb_typeof(zone -> 'zone_label') = 'string' THEN
      zone := jsonb_set(zone, '{zone_label}', to_jsonb(fieldmaps_private.zone_trim(zone ->> 'zone_label')));
    END IF;
    IF jsonb_typeof(zone -> 'zone_id') = 'string' THEN
      zone := jsonb_set(zone, '{zone_id}', to_jsonb(lower(zone ->> 'zone_id')));
    END IF;
    IF zone #>> '{geometry,type}' NOT IN ('Polygon','MultiPolygon')
      OR jsonb_typeof(zone #> '{geometry,coordinates}') IS DISTINCT FROM 'array' THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure');
    END IF;
    parts := CASE WHEN zone #>> '{geometry,type}' = 'Polygon' THEN jsonb_build_array(zone #> '{geometry,coordinates}')
      ELSE zone #> '{geometry,coordinates}' END;
    positions := 0;
    FOR part IN SELECT jsonb_array_elements(parts) LOOP
      IF jsonb_typeof(part) <> 'array' THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
      FOR ring IN SELECT jsonb_array_elements(part) LOOP
        IF jsonb_typeof(ring) <> 'array' THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
        positions := positions + jsonb_array_length(ring);
        IF positions > 2000 THEN PERFORM fieldmaps_private.reject_zone('too_complex'); END IF;
      END LOOP;
    END LOOP;
    total_positions := total_positions + positions;
    IF total_positions > 20000 THEN PERFORM fieldmaps_private.reject_zone('too_complex'); END IF;
    IF NOT fieldmaps_private.valid_zone_draft(jsonb_build_array(zone)) THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure');
    END IF;
    zid := (zone ->> 'zone_id')::uuid;
    IF zid = ANY(ids) THEN PERFORM fieldmaps_private.reject_zone('duplicate_zone_id', ARRAY[zid]); END IF;
    IF zone ->> 'zone_code' = ANY(codes) THEN PERFORM fieldmaps_private.reject_zone('duplicate_code', ARRAY[zid]); END IF;
    ids := array_append(ids, zid); codes := array_append(codes, zone ->> 'zone_code');
    result := result || jsonb_build_array(zone);
  END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION fieldmaps_private.preserve_draft_boundary() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF extensions.ST_AsEWKB(NEW.site_boundary) IS DISTINCT FROM extensions.ST_AsEWKB(OLD.site_boundary) THEN
    RAISE EXCEPTION 'Draft ground is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_draft_ground BEFORE UPDATE ON fieldmaps.zone_drafts
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.preserve_draft_boundary();

CREATE FUNCTION fieldmaps_private.lock_zone_site(p_project uuid, p_site uuid) RETURNS fieldmaps.sites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result fieldmaps.sites;
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  IF NOT fieldmaps_private.has_project_role(p_project, ARRAY['manager']) THEN
    RAISE EXCEPTION 'role_required' USING ERRCODE = 'FM006';
  END IF;
  SELECT * INTO result FROM fieldmaps.sites WHERE project_id = p_project AND id = p_site FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'FM007'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_current_package(p_site uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((SELECT current_package_id FROM fieldmaps.site_zone_state WHERE site_id = p_site),
    (SELECT id FROM fieldmaps.site_packages WHERE site_id = p_site AND state = 'ready'
      AND zone_contract_version IS NULL AND manifest -> 'format' = '1'::jsonb ORDER BY version DESC LIMIT 1));
$$;

CREATE FUNCTION fieldmaps_private.create_zone_draft(p_project uuid, p_site uuid, p_request uuid,
  p_base uuid, p_ground jsonb DEFAULT NULL, p_legacy_zones jsonb DEFAULT NULL,
  p_inventory_supplied boolean DEFAULT false, p_inventory_code text DEFAULT NULL)
RETURNS fieldmaps.zone_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  site fieldmaps.sites; base fieldmaps.site_packages; result fieldmaps.zone_drafts;
  request jsonb; zones jsonb; ground extensions.geometry; inventory uuid;
BEGIN
  site := fieldmaps_private.lock_zone_site(p_project, p_site);
  IF p_request IS NULL OR p_base IS NULL OR p_inventory_supplied IS NULL
    OR (NOT p_inventory_supplied AND p_inventory_code IS NOT NULL) THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  request := jsonb_build_object('operation', 'draft_create', 'actor', fieldmaps.request_user_id(),
    'project_id', p_project, 'site_id', p_site, 'base_package_id', p_base,
    'inventory_supplied', p_inventory_supplied, 'inventory_form_version', p_inventory_code);
  SELECT * INTO result FROM fieldmaps.zone_drafts WHERE created_by = fieldmaps.request_user_id()
    AND project_id = p_project AND create_request_id = p_request;
  IF FOUND THEN
    IF result.create_request <> request THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'ZB004'; END IF;
    RETURN result;
  END IF;
  SELECT * INTO base FROM fieldmaps.site_packages WHERE id = p_base AND project_id = p_project AND site_id = p_site;
  IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('package_not_in_site'); END IF;
  IF base.state <> 'ready' THEN PERFORM fieldmaps_private.reject_zone('package_not_ready'); END IF;
  IF p_base IS DISTINCT FROM fieldmaps_private.zone_current_package(p_site) THEN
    RAISE EXCEPTION 'publication_conflict' USING ERRCODE = 'ZB003';
  END IF;
  IF base.zone_contract_version = 1 THEN
    ground := base.site_boundary;
    inventory := base.inventory_form_version_id;
    IF NOT fieldmaps_private.can_read_zone_package(base.id) THEN
      PERFORM fieldmaps_private.reject_zone('package_not_ready');
    END IF;
    IF p_inventory_supplied AND p_inventory_code IS DISTINCT FROM
      (SELECT code FROM fieldmaps.form_versions WHERE id = inventory) THEN
      PERFORM fieldmaps_private.reject_zone('form_not_in_package');
    END IF;
    SELECT jsonb_agg(jsonb_build_object('zone_id', z.zone_id, 'zone_code', i.code, 'zone_label', z.label,
      'geometry', coalesce(z.canonical_geometry, fieldmaps_private.zone_geom_json(z.geom))) ORDER BY i.code COLLATE "C")
      INTO zones FROM fieldmaps.package_zones z JOIN fieldmaps.zone_identities i ON i.id = z.zone_id
      WHERE z.package_id = base.id;
  ELSE
    IF base.manifest -> 'format' IS DISTINCT FROM '1'::jsonb OR p_ground IS NULL OR p_legacy_zones IS NULL THEN
      PERFORM fieldmaps_private.reject_zone('unversioned_package');
    END IF;
    ground := extensions.ST_GeomFromGeoJSON(fieldmaps_private.normalize_zone_geometry(p_ground, 2147483647));
    IF jsonb_typeof(p_legacy_zones) <> 'array' OR jsonb_array_length(p_legacy_zones) NOT BETWEEN 1 AND 250 THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure');
    END IF;
    SELECT jsonb_agg(jsonb_build_object('zone_id', gen_random_uuid(), 'zone_code', value -> 'zone_code',
      'zone_label', value -> 'zone_label', 'geometry', value -> 'geometry') ORDER BY ordinal) INTO zones
      FROM jsonb_array_elements(p_legacy_zones) WITH ORDINALITY z(value, ordinal);
    IF p_inventory_code IS NOT NULL THEN
      SELECT id INTO inventory FROM fieldmaps.form_versions WHERE project_id = p_project
        AND code = p_inventory_code AND state = 'published';
      IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('form_not_in_package'); END IF;
    END IF;
  END IF;
  zones := fieldmaps_private.normalize_zone_draft_values(zones);
  INSERT INTO fieldmaps.zone_drafts(id, organization_id, project_id, site_id, base_package_id,
    inventory_form_version_id, zones, create_request_id, create_request_hash, create_request,
    created_by, updated_by, site_boundary)
  VALUES (gen_random_uuid(), site.organization_id, p_project, p_site, p_base, inventory, zones, p_request,
    encode(sha256(convert_to(request::text, 'UTF8')), 'hex'), request,
    fieldmaps.request_user_id(), fieldmaps.request_user_id(), ground) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION fieldmaps_private.change_zone_draft(p_project uuid, p_site uuid, p_draft uuid,
  p_revision bigint, p_zones jsonb, p_note text, p_discard boolean DEFAULT false)
RETURNS fieldmaps.zone_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result fieldmaps.zone_drafts;
BEGIN
  PERFORM fieldmaps_private.lock_zone_site(p_project, p_site);
  IF p_revision IS NULL OR p_revision < 1 THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE = 'ZB006'; END IF;
  SELECT * INTO result FROM fieldmaps.zone_drafts WHERE id = p_draft AND project_id = p_project
    AND site_id = p_site FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'FM007'; END IF;
  IF result.state = 'published' THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'FM008'; END IF;
  IF result.revision <> p_revision THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE = 'ZB002'; END IF;
  IF result.state = 'discarded' AND p_discard THEN RETURN result; END IF;
  IF result.state <> 'draft' THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'FM008'; END IF;
  IF p_discard IS NULL THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
  IF NOT p_discard THEN
    IF p_note IS NULL OR length(fieldmaps_private.zone_trim(p_note)) > 2000 THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure');
    END IF;
    p_zones := fieldmaps_private.normalize_zone_draft_values(p_zones);
  END IF;
  UPDATE fieldmaps.zone_drafts SET
    zones = CASE WHEN p_discard THEN zones ELSE p_zones END,
    change_note = CASE WHEN p_discard THEN change_note ELSE fieldmaps_private.zone_trim(p_note) END,
    state = CASE WHEN p_discard THEN 'discarded' ELSE 'draft' END,
    revision = revision + 1, updated_at = clock_timestamp(), updated_by = fieldmaps.request_user_id()
    WHERE id = p_draft RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_validation(p_project uuid, p_site uuid, p_zones jsonb,
  p_ground extensions.geometry, p_play uuid, p_inventory uuid, p_note text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' SET extra_float_digits = 3 AS $$
DECLARE
  issues jsonb := '[]'; warnings jsonb := '[]'; normalized jsonb := '[]'; summaries jsonb := '[]';
  zone jsonb; canonical jsonb; shape extensions.geometry; prior_shape extensions.geometry;
  prior_shapes extensions.geometry[] := '{}'; prior_ids uuid[] := '{}';
  coverage extensions.geometry; extent extensions.box3d; anchor extensions.geometry;
  area double precision; gap double precision := NULL; detail text; zid uuid; path text; ground_valid boolean;
BEGIN
  IF NOT coalesce(fieldmaps_private.valid_zone_draft(p_zones), false) THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  IF jsonb_array_length(p_zones) = 0 THEN
    issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('empty_zone_set'));
  END IF;
  ground_valid := coalesce(NOT extensions.ST_IsEmpty(p_ground) AND extensions.ST_IsValid(p_ground, 0)
    AND extensions.ST_NDims(p_ground) = 2 AND extensions.ST_SRID(p_ground) = 4326, false);
  IF NOT ground_valid THEN issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('invalid_topology')); END IF;
  IF NOT EXISTS (SELECT FROM fieldmaps.form_versions WHERE project_id = p_project AND id = p_play AND state = 'published')
    OR (p_inventory IS NOT NULL AND NOT EXISTS (SELECT FROM fieldmaps.form_versions
      WHERE project_id = p_project AND id = p_inventory AND state = 'published')) THEN
    issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('form_not_in_package'));
  END IF;
  coverage := p_ground;
  FOR zone, path IN SELECT value, '/zones/' || (ordinal - 1)::text || '/geometry'
    FROM jsonb_array_elements(p_zones) WITH ORDINALITY z(value, ordinal) LOOP
    zid := (zone ->> 'zone_id')::uuid;
    IF EXISTS (SELECT FROM fieldmaps.zone_identities WHERE id = zid
      AND (project_id <> p_project OR site_id <> p_site OR code <> zone ->> 'zone_code'))
      OR EXISTS (SELECT FROM fieldmaps.zone_identities WHERE site_id = p_site
        AND code = zone ->> 'zone_code' AND id <> zid) THEN
      issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('identity_conflict', ARRAY[zid], path));
    END IF;
    IF EXISTS (SELECT FROM fieldmaps.observations WHERE project_id = p_project AND site_id = p_site
      AND upload_protocol = 1 AND zone_code = zone ->> 'zone_code') AND coalesce(btrim(p_note), '') = '' THEN
      issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('legacy_mapping_required', ARRAY[zid], path));
    END IF;
    BEGIN
      canonical := fieldmaps_private.normalize_zone_geometry(zone -> 'geometry');
    EXCEPTION WHEN SQLSTATE 'ZB001' THEN
      GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
      issues := issues || jsonb_build_array(fieldmaps_private.zone_issue(detail::jsonb #>> '{issues,0,code}', ARRAY[zid], path));
      summaries := summaries || jsonb_build_array(jsonb_build_object('zone_id', zid, 'area_m2', NULL,
        'extent', NULL, 'display_anchor', NULL));
      CONTINUE;
    END;
    shape := extensions.ST_GeomFromGeoJSON(canonical);
    IF ground_valid AND NOT extensions.ST_Covers(p_ground, shape) THEN
      issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('outside_site', ARRAY[zid], path));
    END IF;
    FOR i IN 1..cardinality(prior_shapes) LOOP
      prior_shape := prior_shapes[i];
      IF shape OPERATOR(extensions.&&) prior_shape AND extensions.ST_Relate(shape, prior_shape, '2********') THEN
        issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('interior_overlap',
          ARRAY[prior_ids[i], zid], path));
      END IF;
    END LOOP;
    prior_shapes := array_append(prior_shapes, shape);
    prior_ids := array_append(prior_ids, zid);
    extent := shape::extensions.box3d;
    IF extensions.ST_YMin(extent) < -85 OR extensions.ST_YMax(extent) > 85
      OR extensions.ST_XMax(extent) - extensions.ST_XMin(extent) > 1
      OR extensions.ST_YMax(extent) - extensions.ST_YMin(extent) > 1 THEN
      issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('unsupported_extent', ARRAY[zid], path));
    END IF;
    coverage := extensions.ST_Collect(coverage, shape);
    anchor := extensions.ST_PointOnSurface(shape);
    area := extensions.ST_Area(shape::extensions.geography);
    IF area < 1 THEN warnings := warnings || jsonb_build_array(fieldmaps_private.zone_issue('small_zone', ARRAY[zid], path)); END IF;
    normalized := normalized || jsonb_build_array(zone || jsonb_build_object('geometry', canonical,
      'display_anchor', jsonb_build_array(extensions.ST_X(anchor), extensions.ST_Y(anchor)),
      'geometry_sha256', fieldmaps_private.zone_geometry_digest(canonical)));
    summaries := summaries || jsonb_build_array(jsonb_build_object('zone_id', zid, 'area_m2', area,
      'extent', jsonb_build_object('west', extensions.ST_XMin(extent), 'south', extensions.ST_YMin(extent),
        'east', extensions.ST_XMax(extent), 'north', extensions.ST_YMax(extent)),
      'display_anchor', jsonb_build_array(extensions.ST_X(anchor), extensions.ST_Y(anchor))));
  END LOOP;
  IF ground_valid THEN
    extent := coverage::extensions.box3d;
    IF extensions.ST_YMin(extent) < -85 OR extensions.ST_YMax(extent) > 85
      OR extensions.ST_XMax(extent) - extensions.ST_XMin(extent) > 1
      OR extensions.ST_YMax(extent) - extensions.ST_YMin(extent) > 1 THEN
      issues := issues || jsonb_build_array(fieldmaps_private.zone_issue('unsupported_extent'));
    END IF;
    IF jsonb_array_length(normalized) > 0 THEN
      SELECT extensions.ST_Area(extensions.ST_Difference(p_ground,
        extensions.ST_UnaryUnion(extensions.ST_Collect(extensions.ST_GeomFromGeoJSON(value -> 'geometry'))))::extensions.geography)
        INTO gap FROM jsonb_array_elements(normalized);
      IF gap > 0 THEN warnings := warnings || jsonb_build_array(fieldmaps_private.zone_issue('site_gap')); END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('ready', issues = '[]', 'issues', issues, 'warnings', warnings,
    'zones', summaries, 'canonical_zones', normalized, 'site_gap_area_m2', gap);
END;
$$;

CREATE FUNCTION fieldmaps_private.validate_zone_draft(p_project uuid, p_site uuid, p_draft uuid, p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE draft fieldmaps.zone_drafts; play uuid;
BEGIN
  PERFORM fieldmaps_private.lock_zone_site(p_project, p_site);
  IF p_revision IS NULL OR p_revision < 1 THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE = 'ZB006'; END IF;
  SELECT * INTO draft FROM fieldmaps.zone_drafts WHERE id = p_draft AND project_id = p_project AND site_id = p_site FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'FM007'; END IF;
  IF draft.revision <> p_revision THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE = 'ZB002'; END IF;
  IF draft.state <> 'draft' THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'FM008'; END IF;
  SELECT form_version_id INTO play FROM fieldmaps.site_packages WHERE id = draft.base_package_id;
  RETURN jsonb_build_object('draft_id', draft.id, 'revision', draft.revision) || fieldmaps_private.zone_validation(
    p_project, p_site, draft.zones, draft.site_boundary, play, draft.inventory_form_version_id, draft.change_note);
END;
$$;

REVOKE ALL ON FUNCTION fieldmaps_private.preserve_draft_boundary(), fieldmaps_private.lock_zone_site(uuid, uuid),
  fieldmaps_private.zone_trim(text), fieldmaps_private.normalize_zone_draft_values(jsonb),
  fieldmaps_private.zone_current_package(uuid), fieldmaps_private.create_zone_draft(uuid, uuid, uuid, uuid, jsonb, jsonb, boolean, text),
  fieldmaps_private.change_zone_draft(uuid, uuid, uuid, bigint, jsonb, text, boolean),
  fieldmaps_private.zone_validation(uuid, uuid, jsonb, extensions.geometry, uuid, uuid, text),
  fieldmaps_private.validate_zone_draft(uuid, uuid, uuid, bigint) FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
GRANT EXECUTE ON FUNCTION fieldmaps_private.create_zone_draft(uuid, uuid, uuid, uuid, jsonb, jsonb, boolean, text),
  fieldmaps_private.change_zone_draft(uuid, uuid, uuid, bigint, jsonb, text, boolean),
  fieldmaps_private.validate_zone_draft(uuid, uuid, uuid, bigint) TO fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0016_zone_drafts');
