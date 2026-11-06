-- Alternate execution source for the unapplied schema2 version, selected only by
-- the all-row Python preflight. Never reapply it to a schema2 database. The original
-- migration stays unchanged; the wrapper records this actual source atomically.
-- Existing fields-only definitions use the retained historical reader, not a
-- conversion to canonical questions. No definition, answer or binding is rewritten.
BEGIN;
LOCK TABLE fieldmaps.form_versions IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE report jsonb; total bigint; validated bigint; storage_default text;
BEGIN
  SELECT pg_get_expr(d.adbin,d.adrelid) INTO storage_default
  FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE d.adrelid='fieldmaps.form_versions'::regclass AND a.attname='schema_version';
  IF storage_default IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Schema2 preservation requires schema_version default1';
  END IF;
  report := nullif(current_setting('fieldmaps.schema2_preflight', true), '')::jsonb;
  IF report IS NULL OR report->>'format' IS DISTINCT FROM 'decamark-schema2-preflight-2'
     OR report->'validated_schema_version' IS DISTINCT FROM '2'::jsonb
     OR jsonb_typeof(report->'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Schema2 preservation requires an explicit all-row Python format2 report';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(report->'rows') entry
      WHERE entry->>'definition_format' = 'legacy_fields') THEN
    RAISE EXCEPTION 'Use the original schema2 migration for an entirely canonical population';
  END IF;
  SELECT count(*) INTO total FROM fieldmaps.form_versions;
  SELECT count(*) INTO validated FROM jsonb_array_elements(report->'rows');
  IF total <> validated OR validated <> (
      SELECT count(DISTINCT entry->>'id') FROM jsonb_array_elements(report->'rows') entry)
     OR EXISTS (
      SELECT 1 FROM fieldmaps.form_versions f
      LEFT JOIN jsonb_array_elements(report->'rows') entry ON entry->>'id'=f.id::text
      WHERE entry IS NULL OR entry->>'definition_sha256' IS DISTINCT FROM
        encode(sha256(convert_to(f.definition::text,'UTF8')),'hex')
        OR entry->>'definition_format' IS DISTINCT FROM
          CASE WHEN f.definition ? 'questions' THEN 'canonical' ELSE 'legacy_fields' END
        OR CASE WHEN f.definition ? 'questions'
          THEN jsonb_typeof(f.definition->'questions') IS DISTINCT FROM 'array'
          ELSE jsonb_typeof(f.definition->'fields') IS DISTINCT FROM 'array' END) THEN
    RAISE EXCEPTION 'Schema2 preservation preflight is stale, incomplete or misclassified';
  END IF;
  IF EXISTS (SELECT 1 FROM fieldmaps.form_versions WHERE schema_version <> 1
      OR jsonb_path_exists(definition, '$.**.numberMode')
      OR jsonb_path_exists(definition, '$.**.valueSource')
      OR jsonb_path_exists(definition, '$.**.dateTime')
      OR jsonb_path_exists(definition, '$.**.columnNaming')
      OR jsonb_path_exists(definition, '$.**.role')) THEN
    RAISE EXCEPTION 'Schema2 preservation refuses unknown versions or newly meaningful properties';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='fieldmaps.form_versions'::regclass
      AND tgname='immutable_form_version' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Expected enabled published-form immutability trigger is required';
  END IF;
END $$;

ALTER TABLE fieldmaps.form_versions DISABLE TRIGGER immutable_form_version;
UPDATE fieldmaps.form_versions SET schema_version=2;
ALTER TABLE fieldmaps.form_versions ENABLE TRIGGER immutable_form_version;
ALTER TABLE fieldmaps.form_versions ALTER COLUMN schema_version SET DEFAULT 2;
COMMIT;
