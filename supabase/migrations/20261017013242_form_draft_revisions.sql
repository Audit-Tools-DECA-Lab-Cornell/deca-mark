-- Revision-conditional form editing and publication. Applied migrations stay unchanged.
ALTER TABLE fieldmaps.form_versions
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE OR REPLACE FUNCTION fieldmaps.preserve_form_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'Published form versions are immutable; publish a new version'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.code, NEW.form_id, NEW.version,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.code, OLD.form_id, OLD.version,
      OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Form version identity cannot change' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'draft' AND NEW.state IN ('draft', 'published') THEN
    -- Every draft write advances the precondition, even if the content is identical.
    NEW.revision := OLD.revision + CASE WHEN NEW.state = 'draft' THEN 1 ELSE 0 END;
    RETURN NEW;
  END IF;
  IF OLD.state = 'published' AND NEW.state = 'retired'
     AND NEW.definition = OLD.definition AND NEW.schema_version = OLD.schema_version
     AND NEW.revision = OLD.revision
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
     AND NEW.published_by IS NOT DISTINCT FROM OLD.published_by THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Published form versions are immutable; publish a new version'
    USING ERRCODE = '23514';
END;
$$;

-- Remove the unconditional entry point; callers must name the reviewed revision.
DROP FUNCTION fieldmaps_private.publish_form_version(uuid, uuid);

CREATE FUNCTION fieldmaps_private.publish_form_version(p_project_id uuid, p_form_version_id uuid, p_revision bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE target fieldmaps.form_versions;
BEGIN
  PERFORM fieldmaps_private.assert_active_user();
  SELECT * INTO target FROM fieldmaps.form_versions WHERE id = p_form_version_id FOR UPDATE;
  IF NOT FOUND OR target.project_id <> p_project_id THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'FM007';
  END IF;
  IF NOT fieldmaps_private.has_project_role(p_project_id, ARRAY['manager']) THEN
    RAISE EXCEPTION 'role_required' USING ERRCODE = 'FM006';
  END IF;
  IF target.state <> 'draft' THEN
    RAISE EXCEPTION 'conflict' USING ERRCODE = 'FM008';
  END IF;
  IF p_revision IS NULL THEN
    RAISE EXCEPTION 'precondition_required' USING ERRCODE = 'FM010';
  END IF;
  IF target.revision <> p_revision THEN
    RAISE EXCEPTION 'revision_conflict' USING ERRCODE = 'FM009';
  END IF;
  UPDATE fieldmaps.form_versions SET
    state = 'published',
    definition = pg_catalog.jsonb_set(target.definition, '{status}', '"published"', true),
    published_at = pg_catalog.clock_timestamp(),
    published_by = fieldmaps.request_user_id()
  WHERE id = p_form_version_id;
END;
$$;

REVOKE ALL ON FUNCTION fieldmaps_private.publish_form_version(uuid, uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fieldmaps_private.publish_form_version(uuid, uuid, bigint) TO fieldmaps_api;
