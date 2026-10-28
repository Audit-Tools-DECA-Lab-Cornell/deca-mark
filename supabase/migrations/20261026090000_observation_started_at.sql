ALTER TABLE fieldmaps.observations
  ADD COLUMN started_at timestamptz,
  ADD CONSTRAINT observations_started_at_check CHECK (started_at IS NULL OR isfinite(started_at));

GRANT INSERT (started_at) ON fieldmaps.observations TO fieldmaps_api;

CREATE OR REPLACE FUNCTION fieldmaps_private.preserve_bound_observation_context() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF (NEW.organization_id, NEW.project_id, NEW.site_id, NEW.form_version_id,
    extensions.ST_AsEWKB(NEW.geom), NEW.zone_code, NEW.round_type, NEW.first_round,
    NEW.placement_source, NEW.created_by, NEW.upload_hash, NEW.started_at)
    IS DISTINCT FROM (OLD.organization_id, OLD.project_id, OLD.site_id, OLD.form_version_id,
    extensions.ST_AsEWKB(OLD.geom), OLD.zone_code, OLD.round_type, OLD.first_round,
    OLD.placement_source, OLD.created_by, OLD.upload_hash, OLD.started_at) THEN
    RAISE EXCEPTION 'Historical observation context cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
