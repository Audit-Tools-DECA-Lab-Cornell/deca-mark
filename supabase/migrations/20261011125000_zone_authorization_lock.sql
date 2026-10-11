-- Tenancy mutations acquire caller account, organization, then resource locks.
-- Hold those same transaction locks throughout zone writes and publication so
-- role/account revocation and finalization have one committed serial order.
CREATE OR REPLACE FUNCTION fieldmaps_private.lock_zone_site(p_project uuid, p_site uuid)
RETURNS fieldmaps.sites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result fieldmaps.sites; org_id uuid;
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  SELECT organization_id INTO org_id FROM fieldmaps.projects WHERE id = p_project;
  IF org_id IS NULL THEN RAISE EXCEPTION 'role_required' USING ERRCODE = 'FM006'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(org_id::text, 0));
  IF NOT fieldmaps_private.has_project_role(p_project, ARRAY['manager']) THEN
    RAISE EXCEPTION 'role_required' USING ERRCODE = 'FM006';
  END IF;
  SELECT * INTO result FROM fieldmaps.sites WHERE project_id = p_project AND id = p_site FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'FM007'; END IF;
  -- Refresh permission checks after every possible wait, before any mutation.
  PERFORM fieldmaps_private.assert_active_user();
  IF NOT fieldmaps_private.has_project_role(p_project, ARRAY['manager']) THEN
    RAISE EXCEPTION 'role_required' USING ERRCODE = 'FM006';
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.lock_zone_site(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;

CREATE FUNCTION fieldmaps_private.lock_zone_authoring_site(p_project uuid, p_site uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT (fieldmaps_private.lock_zone_site(p_project, p_site)).id::text;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.lock_zone_authoring_site(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
GRANT EXECUTE ON FUNCTION fieldmaps_private.lock_zone_authoring_site(uuid, uuid) TO fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0020_zone_authorization_lock');
