-- Successor imports choose new published bindings; existing immutable packages stay untouched.
CREATE FUNCTION fieldmaps_private.zone_import_forms(p_project uuid, p_base uuid, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE play fieldmaps.form_versions; inventory fieldmaps.form_versions; inventory_id uuid;
BEGIN
  IF jsonb_typeof(p_body->'form_version') IS DISTINCT FROM 'string'
    OR (p_body ? 'inventory_form_version' AND jsonb_typeof(p_body->'inventory_form_version') NOT IN ('string','null')) THEN
    PERFORM fieldmaps_private.reject_zone('form_not_in_package');
  END IF;
  SELECT * INTO play FROM fieldmaps.form_versions WHERE project_id=p_project AND code=p_body->>'form_version';
  IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('form_not_in_package'); END IF;
  IF p_body ? 'inventory_form_version' THEN
    IF p_body->>'inventory_form_version' IS NOT NULL THEN
      SELECT id INTO inventory_id FROM fieldmaps.form_versions
        WHERE project_id=p_project AND code=p_body->>'inventory_form_version';
      IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('form_not_in_package'); END IF;
    END IF;
  ELSE
    SELECT inventory_form_version_id INTO inventory_id FROM fieldmaps.site_packages
      WHERE project_id=p_project AND id=p_base;
  END IF;
  -- Match publication's deterministic form lock order; retirement holds an incompatible row lock.
  PERFORM 1 FROM fieldmaps.form_versions WHERE id IN (play.id,inventory_id) ORDER BY id FOR SHARE;
  SELECT * INTO play FROM fieldmaps.form_versions WHERE id=play.id AND state='published';
  IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('form_not_in_package'); END IF;
  IF inventory_id IS NOT NULL THEN
    SELECT * INTO inventory FROM fieldmaps.form_versions WHERE id=inventory_id AND project_id=p_project AND state='published';
    IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('form_not_in_package'); END IF;
  END IF;
  RETURN jsonb_build_object('play',jsonb_build_object('form_version_id',play.id,'form_version',play.code),
    'inventory',CASE WHEN inventory_id IS NULL THEN NULL ELSE
      jsonb_build_object('form_version_id',inventory.id,'form_version',inventory.code) END);
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.zone_import_forms(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,fieldmaps_api;

CREATE OR REPLACE FUNCTION fieldmaps_private.validate_zone_import(p_project uuid, p_site uuid,
  p_expected uuid, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE site fieldmaps.sites; base fieldmaps.site_packages; imported jsonb; ground extensions.geometry; forms jsonb;
BEGIN
  site := fieldmaps_private.lock_zone_site(p_project, p_site);
  IF p_expected IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
  IF p_expected IS DISTINCT FROM fieldmaps_private.zone_current_package(p_site) THEN
    RAISE EXCEPTION 'publication_conflict' USING ERRCODE='ZB003';
  END IF;
  SELECT * INTO base FROM fieldmaps.site_packages WHERE id=p_expected AND project_id=p_project AND site_id=p_site;
  IF base.zone_contract_version IS DISTINCT FROM 1 THEN PERFORM fieldmaps_private.reject_zone('unversioned_package'); END IF;
  IF p_body->>'site_code' IS DISTINCT FROM site.code THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  forms := fieldmaps_private.zone_import_forms(p_project,base.id,p_body);
  imported := fieldmaps_private.zone_import_input(p_body);
  ground := extensions.ST_GeomFromGeoJSON(fieldmaps_private.normalize_zone_geometry(imported->'ground',2147483647));
  RETURN fieldmaps_private.zone_validation(p_project,p_site,
    fieldmaps_private.normalize_zone_draft_values(imported->'zones'),ground,(forms #>> '{play,form_version_id}')::uuid,
    (forms #>> '{inventory,form_version_id}')::uuid,p_body->>'change_note');
END;
$$;

CREATE OR REPLACE FUNCTION fieldmaps_private.finalize_zone_package(p_project uuid, p_site uuid, p_request uuid,
  p_expected_current uuid, p_draft uuid, p_revision bigint, p_package uuid, p_version integer,
  p_manifest jsonb, p_zone_layer jsonb, p_archive bytea, p_checks jsonb, p_import_body jsonb DEFAULT NULL,
  p_zone_layer_bytes bytea DEFAULT NULL)
RETURNS TABLE(package fieldmaps.site_packages, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET extra_float_digits = 3 AS $$
DECLARE
  site fieldmaps.sites; draft fieldmaps.zone_drafts; base fieldmaps.site_packages; event fieldmaps.zone_publications;
  result fieldmaps.site_packages; request jsonb; publication_operation text; current_package uuid; next_version integer;
  validation jsonb; zones jsonb; note text; ground extensions.geometry; imported jsonb;
  zone jsonb; shape extensions.geometry; anchor extensions.geometry; identity_map jsonb;
  expected_zones jsonb := '[]'; expected_features jsonb := '[]'; extent extensions.box3d;
  forms jsonb; play uuid; inventory uuid; play_code text; inventory_code text;
BEGIN
  site := fieldmaps_private.lock_zone_site(p_project, p_site);
  IF p_request IS NULL OR p_expected_current IS NULL OR (p_draft IS NOT NULL AND p_revision IS NULL) THEN
    RAISE EXCEPTION 'precondition_required' USING ERRCODE = 'ZB006';
  END IF;
  publication_operation := CASE WHEN p_draft IS NULL THEN 'package_import' ELSE 'draft_publish' END;
  IF (p_draft IS NULL) <> (p_import_body IS NOT NULL) THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
  request := jsonb_build_object('operation', publication_operation, 'actor', fieldmaps.request_user_id(),
    'project_id', p_project, 'site_id', p_site, 'draft_id', p_draft, 'revision', p_revision,
    'expected_current_package_id', p_expected_current, 'body', CASE WHEN p_draft IS NULL THEN p_import_body
      ELSE jsonb_build_object('request_id', p_request, 'expected_current_package_id', p_expected_current) END);
  SELECT * INTO event FROM fieldmaps.zone_publications WHERE created_by = fieldmaps.request_user_id()
    AND project_id = p_project AND zone_publications.operation = publication_operation AND request_id = p_request;
  IF FOUND THEN
    IF event.request <> request THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'ZB004'; END IF;
    SELECT * INTO result FROM fieldmaps.site_packages WHERE id = event.published_package_id;
    RETURN QUERY SELECT result, true;
    RETURN;
  END IF;
  current_package := fieldmaps_private.zone_current_package(p_site);
  IF current_package IS DISTINCT FROM p_expected_current THEN
    RAISE EXCEPTION 'publication_conflict' USING ERRCODE = 'ZB003', DETAIL =
      jsonb_build_object('current_package_id', current_package)::text;
  END IF;
  SELECT * INTO base FROM fieldmaps.site_packages WHERE id = current_package AND project_id = p_project AND site_id = p_site;
  IF NOT FOUND OR base.state <> 'ready' THEN PERFORM fieldmaps_private.reject_zone('package_not_ready'); END IF;
  IF p_draft IS NOT NULL THEN
    SELECT * INTO draft FROM fieldmaps.zone_drafts WHERE id = p_draft AND project_id = p_project AND site_id = p_site FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'FM007'; END IF;
    IF draft.revision <> p_revision THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE = 'ZB002'; END IF;
    IF draft.state <> 'draft' THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'FM008'; END IF;
    IF draft.base_package_id <> current_package THEN RAISE EXCEPTION 'publication_conflict' USING ERRCODE = 'ZB003'; END IF;
    zones := draft.zones; ground := draft.site_boundary; play := base.form_version_id; inventory := draft.inventory_form_version_id; note := draft.change_note;
    SELECT jsonb_agg(jsonb_build_object('zone_id', value -> 'zone_id', 'zone_code', value -> 'zone_code') ORDER BY ordinal)
      INTO identity_map FROM jsonb_array_elements(zones) WITH ORDINALITY z(value, ordinal);
  ELSE
    IF base.zone_contract_version IS DISTINCT FROM 1 THEN PERFORM fieldmaps_private.reject_zone('unversioned_package'); END IF;
    IF p_import_body ->> 'request_id' IS DISTINCT FROM p_request::text
      OR p_import_body ->> 'expected_current_package_id' IS DISTINCT FROM p_expected_current::text
      OR p_import_body ->> 'site_code' IS DISTINCT FROM site.code THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure');
    END IF;
    imported := fieldmaps_private.zone_import_input(p_import_body);
    zones := fieldmaps_private.normalize_zone_draft_values(imported -> 'zones');
    note := p_import_body ->> 'change_note';
    forms := fieldmaps_private.zone_import_forms(p_project, base.id, p_import_body);
    play := (forms #>> '{play,form_version_id}')::uuid;
    inventory := (forms #>> '{inventory,form_version_id}')::uuid;
    ground := extensions.ST_GeomFromGeoJSON(fieldmaps_private.normalize_zone_geometry(imported -> 'ground', 2147483647));
    identity_map := p_import_body -> 'zone_identity_map';
  END IF;
  IF note IS NULL OR length(fieldmaps_private.zone_trim(note)) > 2000 THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
  note := fieldmaps_private.zone_trim(note);
  PERFORM 1 FROM fieldmaps.form_versions WHERE id IN (play, inventory) ORDER BY id FOR SHARE;
  SELECT code INTO play_code FROM fieldmaps.form_versions WHERE id = play;
  SELECT code INTO inventory_code FROM fieldmaps.form_versions WHERE id = inventory;
  validation := fieldmaps_private.zone_validation(p_project, p_site, zones, ground, play, inventory, note);
  IF validation -> 'ready' <> 'true'::jsonb THEN
    RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'ZB001', DETAIL = jsonb_build_object('issues', validation -> 'issues')::text;
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO next_version FROM fieldmaps.site_packages WHERE site_id = p_site;
  IF p_version IS DISTINCT FROM next_version THEN RAISE EXCEPTION 'publication_conflict' USING ERRCODE = 'ZB003'; END IF;
  IF p_package IS NULL THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
  forms := jsonb_build_object('play', jsonb_build_object('form_version_id', play, 'form_version', play_code),
    'inventory', CASE WHEN inventory IS NULL THEN NULL ELSE jsonb_build_object('form_version_id', inventory, 'form_version', inventory_code) END);
  FOR zone IN SELECT jsonb_array_elements(validation -> 'canonical_zones') LOOP
    shape := extensions.ST_GeomFromGeoJSON(zone -> 'geometry'); extent := shape::extensions.box3d;
    expected_zones := expected_zones || jsonb_build_array(jsonb_build_object('id', zone -> 'zone_code', 'label', zone -> 'zone_label',
      'west', extensions.ST_XMin(extent), 'south', extensions.ST_YMin(extent),
      'east', extensions.ST_XMax(extent), 'north', extensions.ST_YMax(extent),
      'zone_id', zone -> 'zone_id', 'zone_code', zone -> 'zone_code',
      'display_anchor', zone -> 'display_anchor', 'geometry_sha256', zone -> 'geometry_sha256'));
    expected_features := expected_features || jsonb_build_array(jsonb_build_object('type', 'Feature', 'geometry', zone -> 'geometry',
      'properties', jsonb_build_object('id', zone -> 'zone_code', 'zone_id', zone -> 'zone_id', 'zone_code', zone -> 'zone_code',
        'name', zone -> 'zone_label', 'display_anchor', zone -> 'display_anchor', 'geometry_sha256', zone -> 'geometry_sha256')));
  END LOOP;
  IF p_manifest IS NULL OR p_manifest -> 'format' IS DISTINCT FROM '2'::jsonb
    OR p_manifest -> 'zone_contract_version' IS DISTINCT FROM '1'::jsonb
    OR p_manifest ->> 'site_id' IS DISTINCT FROM p_site::text OR p_manifest ->> 'site_code' IS DISTINCT FROM site.code
    OR p_manifest ->> 'package_id' IS DISTINCT FROM p_package::text
    OR p_manifest -> 'package_version' IS DISTINCT FROM to_jsonb(next_version)
    OR p_manifest -> 'forms' IS DISTINCT FROM forms OR p_manifest ->> 'form_version' IS DISTINCT FROM play_code
    OR p_manifest -> 'zones' IS DISTINCT FROM expected_zones
    OR p_zone_layer IS DISTINCT FROM jsonb_build_object('type', 'FeatureCollection', 'features', expected_features) THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  IF p_checks IS NULL OR jsonb_typeof(p_checks) <> 'array' OR jsonb_array_length(p_checks) NOT BETWEEN 1 AND 5
    OR EXISTS (SELECT FROM jsonb_array_elements(p_checks) WHERE value ->> 'state' IS NULL
      OR value ->> 'state' NOT IN ('passed', 'warning', 'skipped')) THEN
    PERFORM fieldmaps_private.reject_zone('package_not_ready');
  END IF;
  IF NOT p_manifest ?& ARRAY['extent','centre','layers','source_project']
    OR jsonb_typeof(p_manifest -> 'extent') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_manifest -> 'centre') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_manifest -> 'layers') IS DISTINCT FROM 'array' THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  IF NOT p_manifest -> 'extent' ?& ARRAY['west','south','east','north']
    OR jsonb_array_length(p_manifest -> 'centre') <> 2
    OR jsonb_array_length(p_manifest -> 'layers') NOT BETWEEN 2 AND 4
    OR EXISTS (SELECT FROM jsonb_array_elements(p_manifest -> 'centre') WHERE jsonb_typeof(value) <> 'number')
    OR EXISTS (SELECT FROM jsonb_each(p_manifest -> 'extent') WHERE jsonb_typeof(value) <> 'number')
    OR EXISTS (SELECT FROM jsonb_array_elements(p_manifest -> 'layers')
      WHERE value ->> 'name' IS NULL OR value ->> 'name' NOT IN ('ground','paths','trees','zones')
        OR jsonb_typeof(value -> 'features') IS DISTINCT FROM 'number'
        OR value ->> 'features' !~ '^[0-9]+$' OR value ->> 'sha256' IS NULL OR value ->> 'sha256' !~ '^[a-f0-9]{64}$')
    OR EXISTS (SELECT FROM jsonb_array_elements(p_manifest -> 'layers') GROUP BY value -> 'name' HAVING count(*) > 1)
    OR NOT EXISTS (SELECT FROM jsonb_array_elements(p_manifest -> 'layers') WHERE value ->> 'name' = 'ground')
    OR NOT EXISTS (SELECT FROM jsonb_array_elements(p_manifest -> 'layers') WHERE value ->> 'name' = 'zones'
      AND value -> 'features' = to_jsonb(jsonb_array_length(expected_zones))
      AND value ->> 'sha256' = encode(sha256(p_zone_layer_bytes), 'hex'))
    OR p_zone_layer_bytes IS NULL THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  BEGIN
    IF convert_from(p_zone_layer_bytes, 'UTF8')::jsonb IS DISTINCT FROM p_zone_layer THEN
      PERFORM fieldmaps_private.reject_zone('invalid_structure');
    END IF;
  EXCEPTION WHEN character_not_in_repertoire OR invalid_text_representation THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END;
  INSERT INTO fieldmaps.site_packages(id, organization_id, project_id, site_id, form_version_id, version, state,
    manifest, archive, archive_sha256, prepared_by, zone_contract_version, site_boundary, inventory_form_version_id)
  VALUES (p_package, site.organization_id, p_project, p_site, play, next_version, 'ready', p_manifest, p_archive,
    encode(sha256(p_archive), 'hex'), fieldmaps.request_user_id(), 1, ground, inventory) RETURNING * INTO result;
  INSERT INTO fieldmaps.package_checks(package_id, position, step, state, detail)
    SELECT p_package, ordinal - 1, value ->> 'step', value ->> 'state', value ->> 'detail'
    FROM jsonb_array_elements(p_checks) WITH ORDINALITY c(value, ordinal);
  FOR zone IN SELECT jsonb_array_elements(validation -> 'canonical_zones') LOOP
    INSERT INTO fieldmaps.zone_identities(id, organization_id, project_id, site_id, code, created_by)
    VALUES ((zone ->> 'zone_id')::uuid, site.organization_id, p_project, p_site, zone ->> 'zone_code', fieldmaps.request_user_id())
    ON CONFLICT (id) DO NOTHING;
    IF NOT EXISTS (SELECT FROM fieldmaps.zone_identities WHERE id = (zone ->> 'zone_id')::uuid
      AND project_id = p_project AND site_id = p_site AND code = zone ->> 'zone_code') THEN
      PERFORM fieldmaps_private.reject_zone('identity_conflict', ARRAY[(zone ->> 'zone_id')::uuid]);
    END IF;
    shape := extensions.ST_GeomFromGeoJSON(zone -> 'geometry');
    anchor := extensions.ST_SetSRID(extensions.ST_MakePoint((zone #>> '{display_anchor,0}')::double precision,
      (zone #>> '{display_anchor,1}')::double precision), 4326);
    INSERT INTO fieldmaps.package_zones(organization_id, project_id, site_id, package_id, zone_id,
      label, geom, display_anchor, geometry_sha256, canonical_geometry)
    VALUES (site.organization_id, p_project, p_site, p_package, (zone ->> 'zone_id')::uuid,
      zone ->> 'zone_label', shape, anchor, zone ->> 'geometry_sha256', zone -> 'geometry');
  END LOOP;
  IF (SELECT count(*) FROM fieldmaps.package_zones WHERE package_id = p_package) <> jsonb_array_length(expected_zones) THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  INSERT INTO fieldmaps.zone_publications(request_id, created_by, organization_id, project_id, site_id, operation,
    draft_id, draft_revision, expected_current_package_id, request_hash, request, published_package_id, identity_map, change_note)
  VALUES (p_request, fieldmaps.request_user_id(), site.organization_id, p_project, p_site, publication_operation, p_draft, p_revision,
    p_expected_current, encode(sha256(convert_to(request::text, 'UTF8')), 'hex'), request, p_package, identity_map, note);
  IF EXISTS (SELECT FROM fieldmaps.site_zone_state WHERE site_id = p_site) THEN
    UPDATE fieldmaps.site_zone_state SET current_package_id = p_package, revision = next_version WHERE site_id = p_site;
  ELSE
    INSERT INTO fieldmaps.site_zone_state(site_id, organization_id, project_id, current_package_id, legacy_package_id, revision)
    VALUES (p_site, site.organization_id, p_project, p_package, base.id, next_version);
  END IF;
  IF p_draft IS NOT NULL THEN
    UPDATE fieldmaps.zone_drafts SET state = 'published', revision = revision + 1, published_package_id = p_package,
      updated_at = clock_timestamp(), updated_by = fieldmaps.request_user_id() WHERE id = p_draft;
  END IF;
  RETURN QUERY SELECT result, false;
END;
$$;

CREATE FUNCTION fieldmaps_private.resolve_zone_import_forms(p_project uuid,p_site uuid,p_expected uuid,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM fieldmaps_private.lock_zone_site(p_project,p_site);
  IF p_expected IS DISTINCT FROM fieldmaps_private.zone_current_package(p_site) THEN
    RAISE EXCEPTION 'publication_conflict' USING ERRCODE='ZB003';
  END IF;
  RETURN fieldmaps_private.zone_import_forms(p_project,p_expected,p_body);
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.resolve_zone_import_forms(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,fieldmaps_api;
GRANT EXECUTE ON FUNCTION fieldmaps_private.resolve_zone_import_forms(uuid,uuid,uuid,jsonb) TO fieldmaps_api;

CREATE FUNCTION fieldmaps_private.guard_current_zone_form_retirement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.state='published' AND NEW.state='retired' AND EXISTS (
    SELECT FROM fieldmaps.site_zone_state st JOIN fieldmaps.site_packages k ON k.id=st.current_package_id
    WHERE k.form_version_id=OLD.id OR k.inventory_form_version_id=OLD.id) THEN
    RAISE EXCEPTION 'current_package_form' USING ERRCODE='ZB007';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.guard_current_zone_form_retirement()
  FROM PUBLIC,anon,authenticated,service_role,fieldmaps_api;
CREATE TRIGGER current_zone_form_retirement BEFORE UPDATE ON fieldmaps.form_versions
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.guard_current_zone_form_retirement();
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0023_zone_form_succession');
