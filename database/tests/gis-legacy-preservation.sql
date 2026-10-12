\set ON_ERROR_STOP on
BEGIN;
\ir assertions.sql
SELECT pg_temp.assert_true(
  (SELECT b.definition = pg_get_viewdef(c.oid, false)
    AND b.relacl IS NOT DISTINCT FROM c.relacl
    AND b.reloptions IS NOT DISTINCT FROM c.reloptions
    AND b.columns = (SELECT jsonb_agg(jsonb_build_array(a.attname, a.atttypid, a.atttypmod)
      ORDER BY a.attnum) FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
   FROM zone_rehearsal.before_gis b
   CROSS JOIN pg_class c WHERE c.oid = 'gis.sample_observations'::regclass),
  'GIS addition preserves legacy view definition, feature columns and ACLs exactly');
ROLLBACK;
