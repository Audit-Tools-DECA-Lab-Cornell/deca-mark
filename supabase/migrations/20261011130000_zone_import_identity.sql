CREATE OR REPLACE FUNCTION fieldmaps_private.zone_import_input(p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE mapping jsonb; feature jsonb; zones jsonb := '[]'; ground jsonb;
BEGIN
  IF jsonb_typeof(p_body -> 'zone_identity_map') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_body #> '{layers,zones,features}') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_body #> '{layers,ground,features}') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_body -> 'zone_identity_map') NOT BETWEEN 1 AND 250
    OR jsonb_array_length(p_body -> 'zone_identity_map') <> jsonb_array_length(p_body #> '{layers,zones,features}') THEN
    PERFORM fieldmaps_private.reject_zone('identity_conflict');
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_body #> '{layers,ground,features}')
    WHERE value #>> '{properties,kind}' = 'site') <> 1 THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  SELECT value -> 'geometry' INTO ground FROM jsonb_array_elements(p_body #> '{layers,ground,features}')
    WHERE value #>> '{properties,kind}' = 'site';
  IF EXISTS (SELECT FROM jsonb_array_elements(p_body -> 'zone_identity_map')
    WHERE jsonb_typeof(value -> 'source_feature_id') IS DISTINCT FROM 'string'
      OR length(value ->> 'source_feature_id') NOT BETWEEN 1 AND 200)
    OR EXISTS (SELECT FROM jsonb_array_elements(p_body #> '{layers,zones,features}')
    WHERE jsonb_typeof(value #> '{properties,id}') IS DISTINCT FROM 'string'
      OR length(value #>> '{properties,id}') NOT BETWEEN 1 AND 200) THEN
    PERFORM fieldmaps_private.reject_zone('identity_conflict');
  END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(p_body -> 'zone_identity_map') GROUP BY value -> 'source_feature_id' HAVING count(*) > 1)
    OR EXISTS (SELECT FROM jsonb_array_elements(p_body #> '{layers,zones,features}') GROUP BY value #> '{properties,id}' HAVING count(*) > 1) THEN
    PERFORM fieldmaps_private.reject_zone('identity_conflict');
  END IF;
  FOR mapping IN SELECT jsonb_array_elements(p_body -> 'zone_identity_map') LOOP
    SELECT value INTO feature FROM jsonb_array_elements(p_body #> '{layers,zones,features}')
      WHERE value #> '{properties,id}' = mapping -> 'source_feature_id';
    IF NOT FOUND THEN PERFORM fieldmaps_private.reject_zone('identity_conflict'); END IF;
    zones := zones || jsonb_build_array(jsonb_build_object('zone_id', mapping -> 'zone_id',
      'zone_code', mapping -> 'zone_code', 'zone_label', feature #> '{properties,name}', 'geometry', feature -> 'geometry'));
  END LOOP;
  RETURN jsonb_build_object('ground', ground, 'zones', zones);
END;
$$;

INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0021_zone_import_identity');
