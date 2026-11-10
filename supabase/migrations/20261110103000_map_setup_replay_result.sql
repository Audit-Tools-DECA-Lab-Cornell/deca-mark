-- Forward repair for local stacks that applied the first map-setup migration
-- before create_map_setup reported whether an idempotent request was replayed.
DROP FUNCTION fieldmaps_private.create_map_setup(uuid,uuid,uuid,uuid,jsonb,jsonb,text);

CREATE FUNCTION fieldmaps_private.create_map_setup(
 p_project uuid,p_site uuid,p_request uuid,p_expected uuid,
 p_document jsonb,p_sources jsonb,p_fingerprint text
) RETURNS TABLE(setup_id uuid,replayed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE site fieldmaps.sites; receipt fieldmaps_private.map_setup_operations; created_id uuid;
BEGIN
 site:=fieldmaps_private.lock_zone_site(p_project,p_site);
 SELECT o.* INTO receipt FROM fieldmaps_private.map_setup_operations o
 WHERE o.actor=fieldmaps.request_user_id() AND o.request_id=p_request AND o.operation='import';
 IF FOUND THEN
  IF receipt.fingerprint IS DISTINCT FROM p_fingerprint OR NOT EXISTS(
   SELECT FROM fieldmaps.map_setups
   WHERE id=receipt.setup_id AND project_id=p_project AND site_id=p_site
  ) THEN
   RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='ZB004';
  END IF;
  RETURN QUERY SELECT receipt.setup_id,true;
  RETURN;
 END IF;
 IF p_request IS NULL OR p_fingerprint IS NULL THEN
  RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006';
 END IF;
 IF fieldmaps_private.zone_current_package(p_site) IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'publication_conflict' USING ERRCODE='ZB003';
 END IF;
 IF EXISTS(SELECT FROM fieldmaps.map_setups WHERE site_id=p_site AND state='draft') THEN
  RAISE EXCEPTION 'conflict' USING ERRCODE='FM008';
 END IF;
 PERFORM fieldmaps_private.check_map_setup_document(p_document,p_sources);
 INSERT INTO fieldmaps.map_setups(
  organization_id,project_id,site_id,expected_current_package_id,
  document,import_generation,created_by,updated_by
 ) VALUES(
  site.organization_id,p_project,p_site,p_expected,p_document,
  (p_document#>>'{content,import_generation}')::bigint,
  fieldmaps.request_user_id(),fieldmaps.request_user_id()
 ) RETURNING id INTO created_id;
 INSERT INTO fieldmaps_private.map_setup_sources VALUES(created_id,p_sources);
 INSERT INTO fieldmaps_private.map_setup_operations VALUES(
  created_id,fieldmaps.request_user_id(),p_request,'import',p_fingerprint,
  jsonb_build_object('setup_id',created_id)
 );
 RETURN QUERY SELECT created_id,false;
END; $$;

REVOKE ALL ON FUNCTION fieldmaps_private.create_map_setup(
 uuid,uuid,uuid,uuid,jsonb,jsonb,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fieldmaps_private.create_map_setup(
 uuid,uuid,uuid,uuid,jsonb,jsonb,text
) TO fieldmaps_api;
