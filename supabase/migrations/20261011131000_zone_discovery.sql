-- Structural legacy capability is immutable; authorization and form state are
-- checked separately on every discovery response.
CREATE FUNCTION fieldmaps_private.zone_ground_authoring_available(p_ground jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE shape extensions.geometry; extent extensions.box3d;
BEGIN
  BEGIN
    shape := extensions.ST_GeomFromGeoJSON(
      fieldmaps_private.normalize_zone_geometry(p_ground,2147483647));
  EXCEPTION WHEN SQLSTATE 'ZB001' THEN RETURN false;
  END;
  IF shape IS NULL THEN RETURN false; END IF;
  extent := shape::extensions.box3d;
  RETURN extensions.ST_YMin(extent)>=-85 AND extensions.ST_YMax(extent)<=85
    AND extensions.ST_XMax(extent)-extensions.ST_XMin(extent)<=1
    AND extensions.ST_YMax(extent)-extensions.ST_YMin(extent)<=1;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_authoring_available(p_project uuid,p_site uuid,
  p_expected uuid,p_legacy_available boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base record; extent extensions.box3d;
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  IF NOT fieldmaps_private.has_project_role(p_project,ARRAY['manager']) THEN RETURN false; END IF;
  SELECT form_version_id,inventory_form_version_id,zone_contract_version,site_boundary
    INTO base FROM fieldmaps.site_packages WHERE project_id=p_project AND site_id=p_site
    AND id=p_expected AND id=fieldmaps_private.zone_current_package(p_site) AND state='ready';
  IF NOT FOUND OR NOT EXISTS (SELECT FROM fieldmaps.form_versions
    WHERE id=base.form_version_id AND state='published')
    OR (base.inventory_form_version_id IS NOT NULL AND NOT EXISTS
      (SELECT FROM fieldmaps.form_versions WHERE id=base.inventory_form_version_id
      AND state='published')) THEN RETURN false; END IF;
  IF base.zone_contract_version IS DISTINCT FROM 1 THEN
    RETURN coalesce(p_legacy_available,false);
  END IF;
  IF base.site_boundary IS NULL THEN RETURN false; END IF;
  extent := base.site_boundary::extensions.box3d;
  RETURN extensions.ST_YMin(extent)>=-85 AND extensions.ST_YMax(extent)<=85
    AND extensions.ST_XMax(extent)-extensions.ST_XMin(extent)<=1
    AND extensions.ST_YMax(extent)-extensions.ST_YMin(extent)<=1;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.zone_ground_authoring_available(jsonb),
  fieldmaps_private.zone_authoring_available(uuid,uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role,fieldmaps_api;
GRANT EXECUTE ON FUNCTION fieldmaps_private.zone_ground_authoring_available(jsonb),
  fieldmaps_private.zone_authoring_available(uuid,uuid,uuid,boolean) TO fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0022_zone_discovery');
