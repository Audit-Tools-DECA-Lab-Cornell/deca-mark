SET LOCAL statement_timeout = '20s';
CREATE TEMP TABLE zone_max_positions AS
SELECT jsonb_agg(pg_temp.case_zone(geometry,zone_index) ORDER BY zone_index) zones FROM (
  SELECT zone_index,jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(jsonb_agg(
    jsonb_build_array(0.001+zone_index*0.002+0.0003*cos(CASE WHEN vertex=1999 THEN 0 ELSE 2*pi()*vertex/1999 END),
      0.001+0.0003*sin(CASE WHEN vertex=1999 THEN 0 ELSE 2*pi()*vertex/1999 END)) ORDER BY vertex))) geometry
  FROM generate_series(1,10) zone_index CROSS JOIN generate_series(0,1999) vertex GROUP BY zone_index) rings;
SELECT pg_temp.assert_true((pg_temp.zone_validate_set(zones) ->> 'ready')::boolean,
  'authoritative validation accepts 20000 positions across ten 2000-position zones within 20 seconds') FROM zone_max_positions;
CREATE TEMP TABLE zone_max_count AS
SELECT jsonb_agg(pg_temp.case_zone(jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(jsonb_build_array(
  jsonb_build_array(x,y),jsonb_build_array(x+0.0004,y),jsonb_build_array(x+0.0004,y+0.0004),
  jsonb_build_array(x,y+0.0004),jsonb_build_array(x,y)))),n) ORDER BY n) zones
FROM (SELECT n,0.001+(n%10)*0.001 x,0.001+(n/10)*0.0005 y FROM generate_series(1,250) n) cells;
SELECT pg_temp.assert_true((pg_temp.zone_validate_set(zones) ->> 'ready')::boolean,
  'authoritative validation accepts exactly 250 non-overlapping zones within 20 seconds') FROM zone_max_count;
SELECT pg_temp.assert_true((pg_temp.zone_validate_set(jsonb_build_array(pg_temp.case_zone(
  '{"type":"Polygon","coordinates":[[[0.0029,0.0009],[0.0031,0.0009],[0.0031,0.0011],[0.0029,0.0011],[0.0029,0.0009]]]}')),
  jsonb_set(zones #> '{0,geometry}','{coordinates,0}',(zones #> '{0,geometry,coordinates,0}')
    || jsonb_build_array(zones #> '{0,geometry,coordinates,0,0}'))) ->> 'ready')::boolean,
  'retained site ground is not incorrectly subject to the per-zone 2000-position cap')
FROM zone_max_positions;
SET LOCAL statement_timeout = 0;
