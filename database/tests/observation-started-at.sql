SAVEPOINT observation_started_at;

SELECT pg_temp.assert_true(
  (SELECT started_at IS NULL FROM fieldmaps.observations
   WHERE id='30000000-0000-4000-8000-000000000001'),
  'legacy observation start remains unknown'
);

SELECT pg_temp.assert_rejected(
  $$UPDATE fieldmaps.observations SET started_at='2026-09-17T13:59:00Z'
    WHERE id='30000000-0000-4000-8000-000000000001'$$,
  '23514', 'captured start cannot be rewritten or backfilled'
);

SELECT pg_temp.assert_rejected(
  $$INSERT INTO fieldmaps.observations
    (id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,
     geom,answers,created_by,upload_hash,package_id,zone_id,round_type,first_round,
     placement_source,started_at)
    SELECT '30000000-0000-4000-8000-000000000091',organization_id,project_id,site_id,
      form_version_id,observer_code,observed_at,geom,answers,created_by,upload_hash,
      package_id,zone_id,round_type,first_round,placement_source,'infinity'::timestamptz
    FROM fieldmaps.observations WHERE id='30000000-0000-4000-8000-000000000001'$$,
  '23514', 'observation start must be finite'
);

INSERT INTO fieldmaps.observations
  (id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,
   geom,answers,created_by,upload_hash,package_id,zone_id,round_type,first_round,
   placement_source,started_at)
SELECT '30000000-0000-4000-8000-000000000091',organization_id,project_id,site_id,
  form_version_id,observer_code,observed_at,geom,answers,created_by,upload_hash,
  package_id,zone_id,round_type,first_round,placement_source,'2026-09-18T14:00:00Z'::timestamptz
FROM fieldmaps.observations WHERE id='30000000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_true(
  (SELECT started_at > observed_at FROM fieldmaps.observations
   WHERE id='30000000-0000-4000-8000-000000000091'),
  'device clock changes do not impose timestamp ordering'
);

ROLLBACK TO SAVEPOINT observation_started_at;
RELEASE SAVEPOINT observation_started_at;
