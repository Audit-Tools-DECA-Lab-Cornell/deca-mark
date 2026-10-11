ALTER TABLE fieldmaps.observations ADD COLUMN upload_hash_version text;
ALTER TABLE fieldmaps.observations DISABLE TRIGGER observation_revision;
UPDATE fieldmaps.observations SET upload_hash_version = 'zone-upload-v2-jcs-1'
WHERE upload_protocol = 2;
ALTER TABLE fieldmaps.observations ENABLE TRIGGER observation_revision;
ALTER TABLE fieldmaps.observations ADD CONSTRAINT observation_upload_hash_version CHECK (
  (upload_protocol = 1 AND upload_hash_version IS NULL)
  OR (upload_protocol = 2 AND upload_hash_version IS NOT NULL
    AND upload_hash_version = 'zone-upload-v2-jcs-1'));

CREATE FUNCTION fieldmaps_private.freeze_upload_hash_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.upload_protocol = 2 AND NEW.upload_hash_version IS NULL THEN
    NEW.upload_hash_version := 'zone-upload-v2-jcs-1';
  ELSIF TG_OP = 'UPDATE' AND NEW.upload_hash_version IS DISTINCT FROM OLD.upload_hash_version THEN
    RAISE EXCEPTION 'Historical upload hash version cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_upload_hash_version BEFORE INSERT OR UPDATE ON fieldmaps.observations
  FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.freeze_upload_hash_version();
GRANT INSERT (upload_hash_version) ON fieldmaps.observations TO fieldmaps_api;
REVOKE ALL ON FUNCTION fieldmaps_private.freeze_upload_hash_version()
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;

CREATE OR REPLACE FUNCTION fieldmaps_private.assert_zone_observer(p_project uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org_id uuid;
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  SELECT organization_id INTO org_id FROM fieldmaps.projects WHERE id = p_project;
  IF org_id IS NULL THEN RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(org_id::text, 0));
  PERFORM fieldmaps_private.assert_active_user();
  IF NOT fieldmaps_private.has_project_role(p_project, ARRAY['observer','manager']) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.assert_zone_observer(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fieldmaps_private.assert_zone_observer(uuid) TO fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0024_zone_upload_protocol');
