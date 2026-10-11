RESET ROLE;
\set geometry_cases `cat /tmp/fieldmaps-tests/zone-geometry.cases.json`
CREATE FUNCTION pg_temp.normalization_issue(p_geometry jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE detail text;
BEGIN
  PERFORM fieldmaps_private.normalize_zone_geometry(p_geometry);
  RETURN NULL;
EXCEPTION WHEN SQLSTATE 'ZB001' THEN
  GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
  RETURN detail::jsonb #>> '{issues,0,code}';
END;
$$;
SELECT pg_temp.assert_true(pg_temp.normalization_issue(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'geometry'))
  IS NOT DISTINCT FROM c ->> 'publish_issue', 'publication topology: ' || (c ->> 'id'))
  FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'structure_cases') c
  WHERE (c ->> 'draft_valid')::boolean AND coalesce(c ->> 'publish_issue','') <> 'unsupported_extent';
SELECT pg_temp.assert_true(extensions.ST_Covers(extensions.ST_GeomFromGeoJSON(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'selected')),
  fieldmaps.make_point((c #>> '{point,0}')::float8, (c #>> '{point,1}')::float8)) = (c ->> 'accepted')::boolean,
  'selected-zone point coverage: ' || (c ->> 'id')) FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'coverage_cases') c;
SELECT pg_temp.assert_true(extensions.ST_Relate(extensions.ST_GeomFromGeoJSON(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'left')),
  extensions.ST_GeomFromGeoJSON(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'right')), '2********') = (c ->> 'interior_overlap')::boolean,
  'interior intersection: ' || (c ->> 'id')) FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'relation_cases') c;
SELECT pg_temp.assert_true(extensions.ST_Covers(extensions.ST_GeomFromGeoJSON(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'ground')),
  extensions.ST_GeomFromGeoJSON(:'geometry_cases'::jsonb -> 'geometries' -> (c ->> 'zone'))) = (c ->> 'covered')::boolean,
  'actual-ground containment: ' || (c ->> 'id')) FROM jsonb_array_elements(:'geometry_cases'::jsonb -> 'containment_cases') c;
SELECT pg_temp.assert_true(fieldmaps_private.normalize_zone_geometry(:'geometry_cases'::jsonb #> '{geometries,square}')
  = fieldmaps_private.normalize_zone_geometry(:'geometry_cases'::jsonb #> '{geometries,reversed}'),
  'ring winding and rotation normalize to identical full-precision geometry');
SELECT pg_temp.assert_true(fieldmaps_private.normalize_zone_geometry(:'geometry_cases'::jsonb #> '{geometries,square}')
  = fieldmaps_private.normalize_zone_geometry(:'geometry_cases'::jsonb #> '{geometries,duplicate_vertex}'),
  'consecutive duplicate positions do not change canonical geometry');
SELECT pg_temp.assert_true(fieldmaps_private.normalize_zone_geometry(
  '{"type":"Polygon","coordinates":[[[0,0],[0.000000000000000012345678901234568,0],[0.000000000000000012345678901234568,0.0000001],[0,0.0000001],[0,0]]]}')
  #>> '{coordinates,0,0,1,0}' = '0.000000000000000012345678901234568',
  'normalization retains accepted double precision below GeoJSON decimal output defaults');
SET LOCAL extra_float_digits = -3;
SELECT pg_temp.assert_true(fieldmaps_private.normalize_zone_geometry(
  '{"type":"Polygon","coordinates":[[[0,0],[0.12345678901234568,0],[0.12345678901234568,0.1],[0,0.1],[0,0]]]}')
  #>> '{coordinates,0,0,1,0}' = '0.12345678901234568', 'caller float-output settings cannot reduce canonical precision');
SET LOCAL extra_float_digits = 1;
SELECT pg_temp.assert_true(fieldmaps_private.normalize_zone_geometry(g) = fieldmaps_private.normalize_zone_geometry(
  jsonb_set(g,'{coordinates}',jsonb_build_array(g #> '{coordinates,1}',g #> '{coordinates,0}'))),
  'multipart order cannot change canonical geometry or its digest')
FROM (SELECT :'geometry_cases'::jsonb #> '{geometries,multipart}' g) fixture;
