CREATE FUNCTION fieldmaps_private.validate_zone_import(p_project uuid, p_site uuid,
  p_expected uuid, p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE site fieldmaps.sites; base fieldmaps.site_packages; imported jsonb; ground extensions.geometry;
BEGIN
  site := fieldmaps_private.lock_zone_site(p_project, p_site);
  IF p_expected IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
  IF p_expected IS DISTINCT FROM fieldmaps_private.zone_current_package(p_site) THEN
    RAISE EXCEPTION 'publication_conflict' USING ERRCODE='ZB003';
  END IF;
  SELECT * INTO base FROM fieldmaps.site_packages WHERE id=p_expected AND project_id=p_project AND site_id=p_site;
  IF base.zone_contract_version IS DISTINCT FROM 1 THEN PERFORM fieldmaps_private.reject_zone('unversioned_package'); END IF;
  IF p_body->>'site_code' IS DISTINCT FROM site.code OR p_body->>'form_version' IS DISTINCT FROM
    (SELECT code FROM fieldmaps.form_versions WHERE id=base.form_version_id) THEN
    PERFORM fieldmaps_private.reject_zone('form_not_in_package');
  END IF;
  imported := fieldmaps_private.zone_import_input(p_body);
  ground := extensions.ST_GeomFromGeoJSON(fieldmaps_private.normalize_zone_geometry(imported->'ground',2147483647));
  RETURN fieldmaps_private.zone_validation(p_project,p_site,
    fieldmaps_private.normalize_zone_draft_values(imported->'zones'),ground,base.form_version_id,
    base.inventory_form_version_id,p_body->>'change_note');
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_authoring_available(p_project uuid,p_site uuid,p_ground jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base fieldmaps.site_packages; shape extensions.geometry; extent extensions.box3d;
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  IF NOT fieldmaps_private.has_project_role(p_project,ARRAY['manager']) THEN RETURN false; END IF;
  SELECT * INTO base FROM fieldmaps.site_packages WHERE project_id=p_project AND site_id=p_site
    AND id=fieldmaps_private.zone_current_package(p_site) AND state='ready';
  IF NOT FOUND OR NOT EXISTS (SELECT FROM fieldmaps.form_versions WHERE id=base.form_version_id AND state='published')
    OR (base.inventory_form_version_id IS NOT NULL AND NOT EXISTS
      (SELECT FROM fieldmaps.form_versions WHERE id=base.inventory_form_version_id AND state='published')) THEN RETURN false; END IF;
  IF base.zone_contract_version=1 THEN shape:=base.site_boundary;
  ELSE
    BEGIN
      shape:=extensions.ST_GeomFromGeoJSON(fieldmaps_private.normalize_zone_geometry(p_ground,2147483647));
    EXCEPTION WHEN SQLSTATE 'ZB001' THEN RETURN false;
    END;
  END IF;
  IF shape IS NULL THEN RETURN false; END IF;
  extent:=shape::extensions.box3d;
  RETURN extensions.ST_YMin(extent)>=-85 AND extensions.ST_YMax(extent)<=85
    AND extensions.ST_XMax(extent)-extensions.ST_XMin(extent)<=1
    AND extensions.ST_YMax(extent)-extensions.ST_YMin(extent)<=1;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.validate_zone_import(uuid,uuid,uuid,jsonb),
  fieldmaps_private.zone_authoring_available(uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role,fieldmaps_api;
GRANT EXECUTE ON FUNCTION fieldmaps_private.validate_zone_import(uuid,uuid,uuid,jsonb),
  fieldmaps_private.zone_authoring_available(uuid,uuid,jsonb) TO fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0019_zone_api_validation');
