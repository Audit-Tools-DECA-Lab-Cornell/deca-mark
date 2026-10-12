CREATE TABLE zone_rehearsal.before_gis AS
SELECT pg_get_viewdef(c.oid, false) AS definition, c.relacl, c.reloptions,
  (SELECT jsonb_agg(jsonb_build_array(a.attname, a.atttypid, a.atttypmod)
    ORDER BY a.attnum) FROM pg_attribute a
   WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
FROM pg_class c WHERE c.oid = 'gis.sample_observations'::regclass;
