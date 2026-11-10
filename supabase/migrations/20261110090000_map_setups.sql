-- Incomplete, manager-only map setup. Published packages retain their existing contract.
CREATE TABLE fieldmaps.map_setups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 project_id uuid NOT NULL, site_id uuid NOT NULL, state text NOT NULL DEFAULT 'draft'
 CHECK(state IN ('draft','published','discarded')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 expected_current_package_id uuid REFERENCES fieldmaps.site_packages(id),
 import_generation bigint NOT NULL DEFAULT 1 CHECK(import_generation>0),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=25165824),
 created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 published_package_id uuid REFERENCES fieldmaps.site_packages(id),
 FOREIGN KEY(organization_id,project_id,site_id) REFERENCES fieldmaps.sites(organization_id,project_id,id) ON DELETE CASCADE,
 CHECK((state='published')=(published_package_id IS NOT NULL))
);
CREATE UNIQUE INDEX map_setups_one_active ON fieldmaps.map_setups(site_id) WHERE state='draft';
CREATE INDEX map_setups_site ON fieldmaps.map_setups(site_id);
CREATE INDEX map_setups_expected_package ON fieldmaps.map_setups(expected_current_package_id)
 WHERE expected_current_package_id IS NOT NULL;
CREATE INDEX map_setups_published_package ON fieldmaps.map_setups(published_package_id)
 WHERE published_package_id IS NOT NULL;
ALTER TABLE fieldmaps.map_setups ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_reads_map_setup ON fieldmaps.map_setups FOR SELECT TO fieldmaps_api
 USING(fieldmaps_private.has_project_role(project_id,ARRAY['manager']));
GRANT SELECT ON fieldmaps.map_setups TO fieldmaps_api;

CREATE TABLE fieldmaps_private.map_setup_sources (
 setup_id uuid PRIMARY KEY REFERENCES fieldmaps.map_setups(id) ON DELETE CASCADE, bundle jsonb NOT NULL
);
CREATE TABLE fieldmaps_private.map_setup_operations (
 setup_id uuid NOT NULL REFERENCES fieldmaps.map_setups(id) ON DELETE CASCADE,
 actor uuid NOT NULL, request_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('import','sources','publish')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'), result jsonb NOT NULL,
 PRIMARY KEY(actor,request_id,operation)
);
CREATE INDEX map_setup_operations_setup ON fieldmaps_private.map_setup_operations(setup_id);
ALTER TABLE fieldmaps_private.map_setup_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fieldmaps_private.map_setup_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_reads_map_setup_source ON fieldmaps_private.map_setup_sources FOR SELECT TO fieldmaps_api
 USING(EXISTS(SELECT FROM fieldmaps.map_setups s WHERE s.id=setup_id));
CREATE POLICY manager_reads_map_setup_receipt ON fieldmaps_private.map_setup_operations FOR SELECT TO fieldmaps_api
 USING(actor=fieldmaps.request_user_id() AND EXISTS(SELECT FROM fieldmaps.map_setups s WHERE s.id=setup_id));
GRANT SELECT ON fieldmaps_private.map_setup_sources,fieldmaps_private.map_setup_operations TO fieldmaps_api;

CREATE FUNCTION fieldmaps_private.check_map_setup_document(p_document jsonb,p_sources jsonb DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; source_bytes bigint:=0;
BEGIN
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR octet_length(p_document::text)>25165824
 OR jsonb_typeof(p_document->'content') IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_document#>'{content,zones}') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_document#>'{content,zones}')>250
 OR jsonb_typeof(p_document#>'{content,assignments}') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_document#>'{content,confirmed_omissions}') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_document->'layers') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_document->'issues') IS DISTINCT FROM 'array'
 OR NOT coalesce((p_document#>>'{content,import_generation}') ~ '^[1-9][0-9]*$',false)
 THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
 IF p_sources IS NOT NULL THEN
  IF jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)>64 THEN
   PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
  FOR item IN SELECT jsonb_array_elements(p_sources) LOOP
   IF jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'file_name') IS DISTINCT FROM 'string'
    OR length(item->>'file_name') NOT BETWEEN 1 AND 200 OR jsonb_typeof(item->'content') IS DISTINCT FROM 'string'
   THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
   BEGIN source_bytes:=source_bytes+octet_length(decode(item->>'content','base64'));
   EXCEPTION WHEN invalid_parameter_value THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END;
  END LOOP;
  IF source_bytes>16777216 THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
 END IF;
END; $$;

CREATE FUNCTION fieldmaps_private.create_map_setup(p_project uuid,p_site uuid,p_request uuid,p_expected uuid,
 p_document jsonb,p_sources jsonb,p_fingerprint text) RETURNS TABLE(setup_id uuid,replayed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE site fieldmaps.sites; receipt fieldmaps_private.map_setup_operations; created_id uuid;
BEGIN
 site:=fieldmaps_private.lock_zone_site(p_project,p_site);
 SELECT o.* INTO receipt FROM fieldmaps_private.map_setup_operations o
 WHERE o.actor=fieldmaps.request_user_id() AND o.request_id=p_request AND o.operation='import';
 IF FOUND THEN
  IF receipt.fingerprint IS DISTINCT FROM p_fingerprint OR NOT EXISTS(SELECT FROM fieldmaps.map_setups
 WHERE id=receipt.setup_id AND project_id=p_project AND site_id=p_site) THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='ZB004'; END IF;
  RETURN QUERY SELECT receipt.setup_id,true; RETURN;
 END IF;
 IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
 IF fieldmaps_private.zone_current_package(p_site) IS DISTINCT FROM p_expected THEN
  RAISE EXCEPTION 'publication_conflict' USING ERRCODE='ZB003'; END IF;
 IF EXISTS(SELECT FROM fieldmaps.map_setups WHERE site_id=p_site AND state='draft') THEN
  RAISE EXCEPTION 'conflict' USING ERRCODE='FM008'; END IF;
 PERFORM fieldmaps_private.check_map_setup_document(p_document,p_sources);
 INSERT INTO fieldmaps.map_setups(organization_id,project_id,site_id,expected_current_package_id,
 document,import_generation,created_by,updated_by) VALUES(site.organization_id,p_project,p_site,p_expected,
 p_document,(p_document#>>'{content,import_generation}')::bigint,fieldmaps.request_user_id(),fieldmaps.request_user_id()) RETURNING id INTO created_id;
 INSERT INTO fieldmaps_private.map_setup_sources VALUES(created_id,p_sources);
 INSERT INTO fieldmaps_private.map_setup_operations VALUES(created_id,fieldmaps.request_user_id(),p_request,'import',p_fingerprint,jsonb_build_object('setup_id',created_id));
 RETURN QUERY SELECT created_id,false;
END; $$;

CREATE FUNCTION fieldmaps_private.replace_map_setup(p_project uuid,p_site uuid,p_setup uuid,p_revision bigint,
 p_document jsonb,p_sources jsonb DEFAULT NULL,p_request uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE setup fieldmaps.map_setups; receipt fieldmaps_private.map_setup_operations; generation bigint;
BEGIN
 PERFORM fieldmaps_private.lock_zone_site(p_project,p_site);
 SELECT * INTO setup FROM fieldmaps.map_setups WHERE id=p_setup AND project_id=p_project AND site_id=p_site FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='FM007'; END IF;
 IF p_sources IS NOT NULL AND p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM fieldmaps_private.map_setup_operations WHERE actor=fieldmaps.request_user_id()
   AND request_id=p_request AND operation='sources';
  IF FOUND THEN
   IF receipt.setup_id<>p_setup OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='ZB004'; END IF;
   RETURN p_setup;
  END IF;
 END IF;
 IF p_revision IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
 IF setup.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='ZB002'; END IF;
 IF setup.state<>'draft' THEN RAISE EXCEPTION 'conflict' USING ERRCODE='FM008'; END IF;
 PERFORM fieldmaps_private.check_map_setup_document(p_document,p_sources);
 generation:=(p_document#>>'{content,import_generation}')::bigint;
 IF generation<>(setup.import_generation+CASE WHEN p_sources IS NULL THEN 0 ELSE 1 END) THEN
  RAISE EXCEPTION 'revision_conflict' USING ERRCODE='ZB002'; END IF;
 IF p_sources IS NOT NULL THEN
  IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
  UPDATE fieldmaps_private.map_setup_sources SET bundle=p_sources WHERE setup_id=p_setup;
  INSERT INTO fieldmaps_private.map_setup_operations VALUES(p_setup,fieldmaps.request_user_id(),p_request,'sources',p_fingerprint,jsonb_build_object('setup_id',p_setup));
 END IF;
 UPDATE fieldmaps.map_setups SET document=p_document,import_generation=generation,revision=revision+1,
 updated_by=fieldmaps.request_user_id(),updated_at=clock_timestamp() WHERE id=p_setup;
 RETURN p_setup;
END; $$;

CREATE FUNCTION fieldmaps_private.discard_map_setup(p_project uuid,p_site uuid,p_setup uuid,p_revision bigint) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE setup fieldmaps.map_setups;
BEGIN
 PERFORM fieldmaps_private.lock_zone_site(p_project,p_site);
 SELECT * INTO setup FROM fieldmaps.map_setups WHERE id=p_setup AND project_id=p_project AND site_id=p_site FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='FM007'; END IF;
 IF p_revision IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
 IF setup.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='ZB002'; END IF;
 IF setup.state<>'draft' THEN RAISE EXCEPTION 'conflict' USING ERRCODE='FM008'; END IF;
 DELETE FROM fieldmaps_private.map_setup_sources WHERE setup_id=p_setup;
 UPDATE fieldmaps.map_setups SET state='discarded',document=jsonb_build_object('content',jsonb_build_object('import_generation',import_generation),
 'layers','[]'::jsonb,'issues','[]'::jsonb,'sources','[]'::jsonb,'project_file',NULL),revision=revision+1,
 updated_by=fieldmaps.request_user_id(),updated_at=clock_timestamp() WHERE id=p_setup;
 RETURN p_setup;
END; $$;

CREATE FUNCTION fieldmaps_private.finalize_map_setup(p_project uuid,p_site uuid,p_setup uuid,p_revision bigint,
 p_fingerprint text,p_request uuid,p_expected_current uuid,p_package uuid,p_version integer,p_manifest jsonb,
 p_zone_layer jsonb,p_archive bytea,p_checks jsonb,p_import_body jsonb,p_zone_layer_bytes bytea)
 RETURNS TABLE(package fieldmaps.site_packages,replayed boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE setup fieldmaps.map_setups; receipt fieldmaps_private.map_setup_operations;
 result fieldmaps.site_packages; canonical_replayed boolean; finalized record;
BEGIN
 PERFORM fieldmaps_private.lock_zone_site(p_project,p_site);
 SELECT * INTO setup FROM fieldmaps.map_setups WHERE id=p_setup AND project_id=p_project AND site_id=p_site FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='FM007'; END IF;
 SELECT * INTO receipt FROM fieldmaps_private.map_setup_operations WHERE actor=fieldmaps.request_user_id()
  AND request_id=p_request AND operation='publish';
 IF FOUND THEN
  IF receipt.setup_id<>p_setup OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN
   RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='ZB004'; END IF;
  SELECT * INTO result FROM fieldmaps.site_packages WHERE id=(receipt.result->>'package_id')::uuid;
  RETURN QUERY SELECT result,true; RETURN;
 END IF;
 IF p_request IS NULL OR p_revision IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'precondition_required' USING ERRCODE='ZB006'; END IF;
 IF setup.revision<>p_revision THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='ZB002'; END IF;
 IF setup.state<>'draft' THEN RAISE EXCEPTION 'conflict' USING ERRCODE='FM008'; END IF;
 IF setup.expected_current_package_id IS DISTINCT FROM p_expected_current THEN RAISE EXCEPTION 'publication_conflict' USING ERRCODE='ZB003'; END IF;
 IF setup.document#>'{content,outline}' IS NULL OR setup.document#>'{content,outline}'='null'::jsonb
 OR jsonb_array_length(setup.document#>'{content,zones}')=0
 OR setup.document#>>'{content,form_version}' IS NULL
 OR p_import_body->>'form_version' IS DISTINCT FROM setup.document#>>'{content,form_version}'
 OR p_import_body->>'inventory_form_version' IS DISTINCT FROM setup.document#>>'{content,inventory_form_version}'
 OR p_import_body->>'change_note' IS DISTINCT FROM setup.document#>>'{content,change_note}'
 OR (SELECT count(*) FROM jsonb_array_elements(p_import_body#>'{layers,ground,features}') f
 WHERE f#>>'{properties,kind}'='site' AND f->'geometry'=setup.document#>'{content,outline}')<>1
 OR p_import_body#>'{layers,zones,features}' IS DISTINCT FROM
 (SELECT jsonb_agg(jsonb_build_object('type','Feature','geometry',z->'geometry','properties',
 jsonb_build_object('id',z->>'zone_id','name',z->>'zone_label')) ORDER BY n)
 FROM jsonb_array_elements(setup.document#>'{content,zones}') WITH ORDINALITY v(z,n))
 OR p_import_body->'zone_identity_map' IS DISTINCT FROM
 (SELECT jsonb_agg(jsonb_build_object('source_feature_id',z->>'zone_id','zone_id',z->'zone_id','zone_code',z->'zone_code') ORDER BY n)
 FROM jsonb_array_elements(setup.document#>'{content,zones}') WITH ORDINALITY v(z,n))
 THEN PERFORM fieldmaps_private.reject_zone('invalid_structure'); END IF;
 SELECT r.package,r.replayed INTO finalized FROM fieldmaps_private.finalize_zone_package(
 p_project,p_site,p_request,p_expected_current,NULL,NULL,p_package,p_version,p_manifest,p_zone_layer,
 p_archive,p_checks,p_import_body,p_zone_layer_bytes) r;
 result:=finalized.package; canonical_replayed:=finalized.replayed;
 INSERT INTO fieldmaps_private.map_setup_operations VALUES(p_setup,fieldmaps.request_user_id(),p_request,'publish',p_fingerprint,
 jsonb_build_object('package_id',result.id));
 DELETE FROM fieldmaps_private.map_setup_sources WHERE setup_id=p_setup;
 UPDATE fieldmaps.map_setups SET state='published',document=jsonb_build_object('content',jsonb_build_object('import_generation',import_generation),
 'layers','[]'::jsonb,'issues','[]'::jsonb,'sources','[]'::jsonb,'project_file',NULL),published_package_id=result.id,revision=revision+1,
 updated_by=fieldmaps.request_user_id(),updated_at=clock_timestamp() WHERE id=p_setup;
 RETURN QUERY SELECT result,canonical_replayed;
END; $$;

REVOKE ALL ON FUNCTION fieldmaps_private.check_map_setup_document(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION fieldmaps_private.create_map_setup(uuid,uuid,uuid,uuid,jsonb,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fieldmaps_private.replace_map_setup(uuid,uuid,uuid,bigint,jsonb,jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fieldmaps_private.discard_map_setup(uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION fieldmaps_private.finalize_map_setup(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea,jsonb,jsonb,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fieldmaps_private.create_map_setup(uuid,uuid,uuid,uuid,jsonb,jsonb,text),
 fieldmaps_private.replace_map_setup(uuid,uuid,uuid,bigint,jsonb,jsonb,uuid,text),
 fieldmaps_private.discard_map_setup(uuid,uuid,uuid,bigint),
 fieldmaps_private.finalize_map_setup(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea,jsonb,jsonb,bytea) TO fieldmaps_api;

-- Deleting a study organization removes its unfinished upload bytes; immutable maps stay.
CREATE FUNCTION fieldmaps_private.cleanup_deleted_org_map_setups() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
  DELETE FROM fieldmaps_private.map_setup_sources WHERE setup_id IN
   (SELECT id FROM fieldmaps.map_setups WHERE organization_id=NEW.id);
  UPDATE fieldmaps.map_setups SET state='discarded',document=jsonb_build_object('content',
   jsonb_build_object('import_generation',import_generation),'layers','[]'::jsonb,'issues','[]'::jsonb,
   'sources','[]'::jsonb,'project_file',NULL),revision=revision+1,updated_at=clock_timestamp()
   WHERE organization_id=NEW.id AND state='draft';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fieldmaps_private.cleanup_deleted_org_map_setups() FROM PUBLIC;
CREATE TRIGGER cleanup_deleted_org_map_setups AFTER UPDATE OF deleted_at ON fieldmaps.organizations
 FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.cleanup_deleted_org_map_setups();
