CREATE FUNCTION fieldmaps_private.zone_issue(p_code text, p_ids uuid[] DEFAULT '{}', p_path text DEFAULT '')
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('code', p_code, 'zone_ids', to_jsonb(p_ids), 'path', p_path, 'message', p_code);
$$;

CREATE FUNCTION fieldmaps_private.reject_zone(p_code text, p_ids uuid[] DEFAULT '{}', p_path text DEFAULT '')
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'validation_failed' USING ERRCODE = 'ZB001', DETAIL =
    jsonb_build_object('issues', jsonb_build_array(fieldmaps_private.zone_issue(p_code, p_ids, p_path)))::text;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_number(p_value double precision) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' SET extra_float_digits = 3 AS $$
DECLARE
  bits bytea := float8send(abs(p_value));
  binary_exponent integer := ((get_byte(bits, 0) & 127) << 4) + (get_byte(bits, 1) >> 4);
  mantissa numeric := get_byte(bits, 1) & 15;
  exact_value numeric;
  factor numeric := 1;
  multiplier numeric;
  power_count integer;
  decimal_exponent integer;
  scale_digits integer;
  candidate numeric;
  unit_value numeric;
  digits text;
  sign_text text := CASE WHEN p_value < 0 THEN '-' ELSE '' END;
BEGIN
  IF p_value = 0 THEN RETURN '0'; END IF;
  IF p_value NOT BETWEEN -180 AND 180 THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  FOR i IN 2..7 LOOP mantissa := mantissa * 256 + get_byte(bits, i); END LOOP;
  IF binary_exponent = 0 THEN binary_exponent := -1074;
  ELSE mantissa := mantissa + 4503599627370496; binary_exponent := binary_exponent - 1075; END IF;
  power_count := abs(binary_exponent);
  multiplier := CASE WHEN binary_exponent < 0 THEN 5 ELSE 2 END;
  WHILE power_count > 0 LOOP
    IF power_count % 2 = 1 THEN factor := factor * multiplier; END IF;
    multiplier := multiplier * multiplier;
    power_count := power_count / 2;
  END LOOP;
  exact_value := mantissa * factor;
  IF binary_exponent < 0 THEN
    exact_value := (exact_value::text || 'e' || binary_exponent)::numeric;
  END IF;
  digits := split_part(exact_value::text, '.', 1);
  IF digits <> '0' THEN decimal_exponent := length(digits) - 1;
  ELSE decimal_exponent := -length(substring(exact_value::text FROM '^0\.(0*)')) - 1; END IF;
  FOR significant_digits IN 1..17 LOOP
    scale_digits := significant_digits - 1 - decimal_exponent;
    unit_value := ('1e' || (-scale_digits))::numeric;
    candidate := round(exact_value, scale_digits);
    -- ECMAScript chooses the nearest shortest decimal, with an even final digit on a tie.
    IF abs(candidate - exact_value) = unit_value / 2 AND mod(candidate / unit_value, 2) = 1 THEN
      candidate := candidate - unit_value;
    END IF;
    EXIT WHEN candidate::double precision = abs(p_value);
  END LOOP;
  digits := trim_scale(candidate)::text;
  IF candidate >= 0.000001 THEN RETURN sign_text || digits; END IF;
  decimal_exponent := -length(substring(digits FROM '^0\.(0*)')) - 1;
  digits := regexp_replace(digits, '^0\.0*', '');
  RETURN sign_text || left(digits, 1) || CASE WHEN length(digits) > 1 THEN '.' || substring(digits FROM 2) ELSE '' END
    || 'e' || decimal_exponent;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_coordinate_bytes(p_coordinates jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE value jsonb; result text := ''; separator text := '';
BEGIN
  IF jsonb_typeof(p_coordinates) = 'number' THEN
    RETURN fieldmaps_private.zone_number(p_coordinates::text::double precision);
  END IF;
  IF jsonb_typeof(p_coordinates) <> 'array' THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  FOR value IN SELECT jsonb_array_elements(p_coordinates) LOOP
    result := result || separator || fieldmaps_private.zone_coordinate_bytes(value);
    separator := ',';
  END LOOP;
  RETURN '[' || result || ']';
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_sequence_key(p_value jsonb) RETURNS double precision[]
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE value jsonb; result double precision[] := '{}';
BEGIN
  IF jsonb_typeof(p_value) = 'number' THEN RETURN ARRAY[p_value::text::double precision]; END IF;
  FOR value IN SELECT jsonb_array_elements(p_value) LOOP
    result := result || fieldmaps_private.zone_sequence_key(value);
  END LOOP;
  RETURN result || '-Infinity'::double precision;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_shape_position_count(p_geometry jsonb, p_limit integer) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE parts jsonb; part jsonb; ring jsonb; position jsonb; positions integer := 0;
BEGIN
  IF jsonb_typeof(p_geometry) <> 'object' OR NOT p_geometry ?& ARRAY['type','coordinates']
    OR (SELECT count(*) FROM jsonb_object_keys(p_geometry)) <> 2 THEN RETURN NULL; END IF;
  CASE p_geometry ->> 'type'
    WHEN 'Polygon' THEN parts := jsonb_build_array(p_geometry -> 'coordinates');
    WHEN 'MultiPolygon' THEN parts := p_geometry -> 'coordinates';
    ELSE RETURN NULL;
  END CASE;
  IF jsonb_typeof(parts) <> 'array' OR jsonb_array_length(parts) = 0 THEN RETURN NULL; END IF;
  FOR part IN SELECT jsonb_array_elements(parts) LOOP
    IF jsonb_typeof(part) <> 'array' OR jsonb_array_length(part) = 0 THEN RETURN NULL; END IF;
    FOR ring IN SELECT jsonb_array_elements(part) LOOP
      IF jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 4 THEN RETURN NULL; END IF;
      positions := positions + jsonb_array_length(ring);
      IF positions > p_limit OR ring -> 0 <> ring -> -1
        OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(ring)) < 3 THEN RETURN NULL; END IF;
      FOR position IN SELECT jsonb_array_elements(ring) LOOP
        IF jsonb_typeof(position) <> 'array' OR jsonb_array_length(position) <> 2
          OR jsonb_typeof(position -> 0) <> 'number' OR jsonb_typeof(position -> 1) <> 'number' THEN RETURN NULL; END IF;
        IF (position ->> 0)::numeric NOT BETWEEN -180 AND 180
          OR (position ->> 1)::numeric NOT BETWEEN -90 AND 90 THEN RETURN NULL; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN positions;
END;
$$;
CREATE OR REPLACE FUNCTION fieldmaps_private.zone_position_count(p_geometry jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT fieldmaps_private.zone_shape_position_count(p_geometry, 2000);
$$;

CREATE FUNCTION fieldmaps_private.normalize_zone_ring(p_ring jsonb, p_shell boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' SET extra_float_digits = 3 AS $$
DECLARE
  points jsonb[] := '{}'; point jsonb; previous jsonb; minimum_point jsonb; result jsonb[]; rotation jsonb[];
  area numeric := 0; count_points integer; best_key double precision[]; current_key double precision[];
BEGIN
  FOR point IN SELECT jsonb_array_elements(p_ring) LOOP
    point := jsonb_build_array((point ->> 0)::double precision + 0.0, (point ->> 1)::double precision + 0.0);
    IF previous IS DISTINCT FROM point THEN points := array_append(points, point); previous := point; END IF;
  END LOOP;
  count_points := cardinality(points);
  IF points[1] = points[count_points] THEN points := points[1:count_points - 1]; END IF;
  count_points := cardinality(points);
  FOR i IN 1..count_points LOOP
    point := points[CASE WHEN i = count_points THEN 1 ELSE i + 1 END];
    area := area + (points[i] ->> 0)::numeric * (point ->> 1)::numeric
      - (point ->> 0)::numeric * (points[i] ->> 1)::numeric;
  END LOOP;
  IF (area > 0) <> p_shell THEN
    SELECT array_agg(value ORDER BY ordinal DESC) INTO points FROM unnest(points) WITH ORDINALITY t(value, ordinal);
  END IF;
  SELECT value INTO minimum_point FROM unnest(points) value
    ORDER BY (value ->> 0)::double precision, (value ->> 1)::double precision LIMIT 1;
  FOR i IN 1..count_points LOOP
    IF points[i] <> minimum_point THEN CONTINUE; END IF;
    rotation := points[i:count_points] || points[1:i - 1];
    current_key := fieldmaps_private.zone_sequence_key(to_jsonb(rotation));
    IF best_key IS NULL OR current_key < best_key THEN result := rotation; best_key := current_key; END IF;
  END LOOP;
  RETURN to_jsonb(array_append(result, result[1]));
END;
$$;

CREATE FUNCTION fieldmaps_private.normalize_zone_geometry(p_geometry jsonb, p_position_limit integer DEFAULT 2000) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' SET extra_float_digits = 3 AS $$
DECLARE
  parts jsonb; part jsonb; shells jsonb := '[]'; holes jsonb; shell jsonb; normalized jsonb;
  original extensions.geometry; output_geom extensions.geometry;
BEGIN
  IF fieldmaps_private.zone_shape_position_count(p_geometry, p_position_limit) IS NULL THEN
    PERFORM fieldmaps_private.reject_zone('invalid_structure');
  END IF;
  original := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_geometry), 4326);
  IF extensions.ST_Area(extensions.ST_ConvexHull(original)) = 0 THEN
    PERFORM fieldmaps_private.reject_zone('zero_area');
  END IF;
  IF NOT extensions.ST_IsValid(original, 0) THEN
    PERFORM fieldmaps_private.reject_zone(CASE WHEN p_geometry ->> 'type' = 'Polygon'
      AND extensions.ST_IsValidReason(original) LIKE 'Self-intersection%'
      THEN 'self_intersection' ELSE 'invalid_topology' END);
  END IF;
  IF extensions.ST_Area(original) = 0 THEN PERFORM fieldmaps_private.reject_zone('zero_area'); END IF;
  parts := CASE WHEN p_geometry ->> 'type' = 'Polygon' THEN jsonb_build_array(p_geometry -> 'coordinates')
    ELSE p_geometry -> 'coordinates' END;
  FOR part IN SELECT jsonb_array_elements(parts) LOOP
    shell := fieldmaps_private.normalize_zone_ring(part -> 0, true);
    SELECT coalesce(jsonb_agg(ring ORDER BY fieldmaps_private.zone_sequence_key(ring)), '[]') INTO holes
    FROM (SELECT fieldmaps_private.normalize_zone_ring(value, false) ring
      FROM jsonb_array_elements(part) WITH ORDINALITY r(value, ordinal) WHERE ordinal > 1) h;
    shells := shells || jsonb_build_array(jsonb_build_array(shell) || holes);
  END LOOP;
  SELECT jsonb_build_object('type', 'MultiPolygon', 'coordinates', jsonb_agg(value
    ORDER BY fieldmaps_private.zone_sequence_key(value))) INTO normalized FROM jsonb_array_elements(shells);
  output_geom := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(normalized), 4326);
  IF NOT extensions.ST_IsValid(output_geom, 0) OR NOT extensions.ST_Equals(original, output_geom) THEN
    PERFORM fieldmaps_private.reject_zone('invalid_topology');
  END IF;
  RETURN normalized;
END;
$$;

CREATE FUNCTION fieldmaps_private.zone_geometry_digest(p_normalized jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT encode(sha256(convert_to('{"coordinates":' ||
    fieldmaps_private.zone_coordinate_bytes(p_normalized -> 'coordinates') || ',"type":"MultiPolygon"}', 'UTF8')), 'hex');
$$;

CREATE FUNCTION fieldmaps_private.zone_geom_json(p_geometry extensions.geometry) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' SET extra_float_digits = 3 AS $$
  SELECT jsonb_build_object('type', 'MultiPolygon', 'coordinates', jsonb_agg(rings ORDER BY polygon))
  FROM (SELECT polygon, jsonb_agg(points ORDER BY ring) rings FROM
    (SELECT (d.path)[1] polygon, (d.path)[2] ring,
      jsonb_agg(jsonb_build_array(extensions.ST_X(d.geom), extensions.ST_Y(d.geom)) ORDER BY (d.path)[3]) points
    FROM extensions.ST_DumpPoints(extensions.ST_Multi(p_geometry)) d GROUP BY (d.path)[1], (d.path)[2]) r
    GROUP BY polygon) p;
$$;

REVOKE ALL ON FUNCTION fieldmaps_private.zone_issue(text, uuid[], text),
  fieldmaps_private.reject_zone(text, uuid[], text), fieldmaps_private.zone_number(double precision),
  fieldmaps_private.zone_coordinate_bytes(jsonb), fieldmaps_private.zone_sequence_key(jsonb),
  fieldmaps_private.zone_shape_position_count(jsonb, integer),
  fieldmaps_private.normalize_zone_ring(jsonb, boolean), fieldmaps_private.normalize_zone_geometry(jsonb, integer),
  fieldmaps_private.zone_geometry_digest(jsonb), fieldmaps_private.zone_geom_json(extensions.geometry)
  FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('0015_zone_geometry');
