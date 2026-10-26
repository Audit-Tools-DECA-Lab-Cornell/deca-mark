-- SOURCE ONLY: schema2 forward transition. No application/reset is authorized by this file.
-- For any rows other than the exact prevalidated fresh baseline or empty table, run the
-- actual Python form_schema_preflight before a separately approved application over
-- ALL rows, including drafts/retired/platform forms, with a fully privileged read snapshot.
-- The preflight runs FormDefinition (schema2 structural/reference/cycle/order/bounds rules),
-- rejects legacy formats, and rejects any formerly ignored schema2 property recursively.
-- In the SAME database session as this migration, set the JSON report through a bound parameter:
-- SELECT set_config('fieldmaps.schema2_preflight', :reviewed_report_json, false);
-- This is an explicit operational gate: the SQL subset below is NOT equivalent to Python.
-- With no external report, the only permitted states are the exact two canonical baseline
-- rows below or an empty table. Both reports were genuinely validated with the Python parser
-- on isolated PostgreSQL 17 after every prior migration. Tests recompute these reports from
-- the unchanged baseline, so a future definition change blocks until explicitly reviewed.
-- These are byte/identity proofs, not a second SQL implementation of the schema2 validator.
BEGIN;
LOCK TABLE fieldmaps.form_versions IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE report jsonb; total bigint; validated bigint; storage_default text;
BEGIN
  SELECT pg_get_expr(d.adbin,d.adrelid) INTO storage_default
  FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE d.adrelid='fieldmaps.form_versions'::regclass AND a.attname='schema_version';
  IF storage_default IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Schema2 upgrade requires schema_version default1, including empty tables';
  END IF;
  report := nullif(current_setting('fieldmaps.schema2_preflight', true), '')::jsonb;
  IF report IS NULL THEN
    IF EXISTS (SELECT 1 FROM fieldmaps.form_versions) THEN
      -- validated-baseline-report-start
      report := '{"format":"decamark-schema2-preflight-1","validated_schema_version":2,"rows":[
        {"id":"10000000-0000-4000-8000-000000000004",
         "definition_sha256":"913c172a926b373bb32b9473eb112b64704c185a7b75c4500508eea2b6e90162"},
        {"id":"10000000-0000-4000-8000-000000000104",
         "definition_sha256":"020577de4b49b54fc04f56d028299f2e24f10570120191de2dd9240bb4331f36"}]}'::jsonb;
      -- validated-baseline-report-end
    ELSE
      -- The empty snapshot passes the same Python preflight vacuously; the table is locked.
      report := '{"format":"decamark-schema2-preflight-1","validated_schema_version":2,"rows":[]}'::jsonb;
    END IF;
  END IF;
  IF report IS NULL OR report->>'format' IS DISTINCT FROM 'decamark-schema2-preflight-1'
     OR report->'validated_schema_version' IS DISTINCT FROM '2'::jsonb
     OR jsonb_typeof(report->'rows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Schema2 requires an explicit all-row Python preflight report';
  END IF;
  IF EXISTS (SELECT 1 FROM fieldmaps.form_versions WHERE schema_version <> 1
      OR jsonb_typeof(definition->'questions') IS DISTINCT FROM 'array'
      OR definition ? 'columnNaming'
      OR jsonb_path_exists(definition, '$.**.numberMode')
      OR jsonb_path_exists(definition, '$.**.valueSource')
      OR jsonb_path_exists(definition, '$.**.dateTime')
      OR jsonb_path_exists(definition, '$.**.columnNaming')) THEN
    RAISE EXCEPTION 'Every stored row must be canonical schema1 without new semantic properties';
  END IF;
  SELECT count(*) INTO total FROM fieldmaps.form_versions;
  SELECT count(*) INTO validated FROM jsonb_array_elements(report->'rows');
  IF total <> validated OR validated <> (
      SELECT count(DISTINCT entry->>'id') FROM jsonb_array_elements(report->'rows') entry)
     OR EXISTS (
      SELECT 1 FROM fieldmaps.form_versions f
      LEFT JOIN jsonb_array_elements(report->'rows') entry ON entry->>'id'=f.id::text
      WHERE entry IS NULL OR entry->>'definition_sha256' IS DISTINCT FROM
        encode(sha256(convert_to(f.definition::text,'UTF8')),'hex')) THEN
    RAISE EXCEPTION 'Schema2 preflight is stale or incomplete; re-read and validate every row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='fieldmaps.form_versions'::regclass
      AND tgname='immutable_form_version' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Expected enabled published-form immutability trigger is required';
  END IF;
END $$;

-- The schema transition is the sole exception to published-row immutability. Preserve every
-- definition byte, ID, revision, answer and package binding; all other triggers remain enabled.
ALTER TABLE fieldmaps.form_versions DISABLE TRIGGER immutable_form_version;
UPDATE fieldmaps.form_versions SET schema_version=2;
ALTER TABLE fieldmaps.form_versions ENABLE TRIGGER immutable_form_version;
ALTER TABLE fieldmaps.form_versions ALTER COLUMN schema_version SET DEFAULT 2;
COMMIT;
