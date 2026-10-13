CREATE FUNCTION pg_temp.zone_prepared(p_validation jsonb,p_site uuid,p_play uuid,p_inventory uuid,
  p_package uuid,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE manifest jsonb; layer jsonb; play_code text; inventory_code text; site_code text;
BEGIN
  SELECT code INTO play_code FROM fieldmaps.form_versions WHERE id=p_play;
  SELECT code INTO inventory_code FROM fieldmaps.form_versions WHERE id=p_inventory;
  SELECT code INTO site_code FROM fieldmaps.sites WHERE id=p_site;
  SELECT jsonb_build_object('format',1,'site_id',p_site,'site_code',site_code,'package_id',p_package,'package_version',p_version,
    'forms',jsonb_build_object('play',jsonb_build_object('form_version_id',p_play,'form_version',play_code),
      'inventory',CASE WHEN p_inventory IS NULL THEN NULL ELSE jsonb_build_object('form_version_id',p_inventory,'form_version',inventory_code) END),
    'zones',coalesce(jsonb_agg(jsonb_build_object('zone_id',z->'zone_id','zone_code',z->'zone_code','label',z->'zone_label',
      'bbox',jsonb_build_array(s#>'{extent,west}',s#>'{extent,south}',s#>'{extent,east}',s#>'{extent,north}'),
      'display_anchor',z->'display_anchor','geometry_sha256',z->'geometry_sha256') ORDER BY n),'[]')) INTO manifest
  FROM jsonb_array_elements(p_validation->'canonical_zones') WITH ORDINALITY zones(z,n)
  JOIN jsonb_array_elements(p_validation->'zones') summaries(s) ON s->'zone_id'=z->'zone_id';
  SELECT jsonb_build_object('type','FeatureCollection','features',coalesce(jsonb_agg(jsonb_build_object('type','Feature',
    'geometry',z->'geometry','properties',jsonb_build_object('zone_id',z->'zone_id','zone_code',z->'zone_code',
      'name',z->'zone_label','display_anchor',z->'display_anchor','geometry_sha256',z->'geometry_sha256')) ORDER BY n),'[]')) INTO layer
  FROM jsonb_array_elements(p_validation->'canonical_zones') WITH ORDINALITY zones(z,n);
  RETURN jsonb_build_object('manifest',manifest,'layer',layer);
END;
$$;
CREATE FUNCTION pg_temp.zone_prepare(p_project uuid,p_site uuid,p_draft uuid,p_revision bigint,
  p_package uuid,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE validation jsonb; draft fieldmaps.zone_drafts;
BEGIN
  validation := fieldmaps_private.validate_zone_draft(p_project,p_site,p_draft,p_revision);
  SELECT * INTO STRICT draft FROM fieldmaps.zone_drafts WHERE id=p_draft;
  RETURN pg_temp.zone_prepared(validation,p_site,(SELECT form_version_id FROM fieldmaps.site_packages WHERE id=draft.base_package_id),
    draft.inventory_form_version_id,p_package,p_version);
END;
$$;
CREATE FUNCTION pg_temp.zone_publish(p_draft uuid, p_revision bigint, p_request uuid, p_current uuid,
  p_package uuid, p_version integer, p_mutation text DEFAULT NULL) RETURNS fieldmaps.site_packages LANGUAGE plpgsql AS $$
DECLARE draft fieldmaps.zone_drafts; prepared jsonb; checks jsonb; result fieldmaps.site_packages;
BEGIN
  SELECT * INTO draft FROM fieldmaps.zone_drafts WHERE id = p_draft;
  prepared := pg_temp.zone_prepare(draft.project_id, draft.site_id, p_draft, p_revision, p_package, p_version);
  checks := '[{"step":"archive","state":"passed","detail":"Synthetic SQL archive fixture"}]';
  IF p_mutation = 'digest' THEN prepared := jsonb_set(prepared, '{manifest,zones,0,geometry_sha256}', to_jsonb(repeat('f', 64))); END IF;
  IF p_mutation = 'anchor' THEN prepared := jsonb_set(prepared, '{manifest,zones,0,display_anchor}', '[0,0]'); END IF;
  IF p_mutation = 'layer' THEN prepared := jsonb_set(prepared, '{layer,features,0,geometry,coordinates,0,0,1}', '[0.0001,0]'); END IF;
  IF p_mutation = 'check' THEN checks := '[{"step":"invalid","state":"passed","detail":"Force failure after package insertion"}]'; END IF;
  SELECT (r.package).* INTO result FROM fieldmaps_private.finalize_zone_package(draft.project_id, draft.site_id, p_request, p_current, p_draft,
    p_revision, p_package, p_version, prepared -> 'manifest', prepared -> 'layer', decode('010203', 'hex'), checks,
    NULL,convert_to((prepared -> 'layer')::text,'UTF8')) r;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.zone_prepared(jsonb,uuid,uuid,uuid,uuid,integer), pg_temp.zone_prepare(uuid, uuid, uuid, bigint, uuid, integer),
  pg_temp.zone_publish(uuid, bigint, uuid, uuid, uuid, integer, text) TO fieldmaps_api;
