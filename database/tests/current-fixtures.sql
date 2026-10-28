\ir current-fixture-helper.sql
SELECT pg_temp.fixture_package('10000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
SELECT pg_temp.fixture_package('20000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004',NULL,1,NULL,
  '{"type":"MultiPolygon","coordinates":[[[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5],[-0.5,-0.5]]]]}');
-- Training's own current package is part of the migrations' seed (DB-20); it needs no fixture.
