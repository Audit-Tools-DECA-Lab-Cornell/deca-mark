-- DB-21 independent fixture scope; all test records roll back with run.sql.
RESET ROLE;
INSERT INTO fieldmaps.organizations(id,name,slug) VALUES ('64000000-0000-4000-8000-000000000001','Library tests','library-tests');
INSERT INTO fieldmaps.projects(id,organization_id,name,code) VALUES ('64000000-0000-4000-8000-000000000002','64000000-0000-4000-8000-000000000001','Library tests','library-tests');
INSERT INTO fieldmaps.sites(id,organization_id,project_id,name,code)
SELECT ('64000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002','Site '||n,'site-'||n FROM generate_series(3,4)n;
INSERT INTO auth.users(id) SELECT ('64000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(10,14)n;
INSERT INTO fieldmaps.profiles(user_id) SELECT id FROM auth.users WHERE id::text LIKE '64000000%';
INSERT INTO fieldmaps.organization_members(organization_id,user_id,role) VALUES ('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000010','owner');
INSERT INTO fieldmaps.project_memberships(organization_id,project_id,user_id,role)
SELECT '64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002',('64000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,role
FROM (VALUES(11,'manager'),(12,'viewer'),(13,'observer'))r(n,role);
INSERT INTO fieldmaps.library_variables(id,level,organization_id,project_id,site_id,code,group_name,section,settings)
SELECT ('64000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,level,'64000000-0000-4000-8000-000000000001',
CASE WHEN level<>'organization' THEN '64000000-0000-4000-8000-000000000002'::uuid END,
CASE WHEN level='site' THEN '64000000-0000-4000-8000-000000000003'::uuid END,
'Age1','Synthetic','Child','{"label":"Synthetic","kind":"text","exportColumn":"synthetic","source":"SQL fixture"}'
FROM (VALUES(20,'organization'),(21,'project'),(22,'site'))r(n,level);
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.library_variables(level,code,group_name,section,settings) VALUES ('site','Broken','G','Child','{}')$$,'23514','scope shape enforced');
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.library_variables(level,code,group_name,section,settings) SELECT level,code,group_name,section,settings FROM fieldmaps.library_variables WHERE level='universal' LIMIT 1$$,'23505','Universal code unique');
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','64000000-0000-4000-8000-000000000010',true);
SELECT pg_temp.assert_true((SELECT count(*)=13 FROM fieldmaps.library_variables),'owner sees Universal plus own scope');
SELECT set_config('fieldmaps.user_id','64000000-0000-4000-8000-000000000011',true);
SELECT pg_temp.assert_true((SELECT count(*)=13 FROM fieldmaps.library_variables),'manager sees all four levels');
SELECT set_config('fieldmaps.user_id','64000000-0000-4000-8000-000000000012',true);
SELECT pg_temp.assert_true((SELECT count(*)=13 FROM fieldmaps.library_variables),'viewer sees all four levels');
SELECT pg_temp.assert_rejected($$DELETE FROM fieldmaps.library_variables$$,'42501','no API delete grant');
SELECT pg_temp.assert_rejected($$UPDATE fieldmaps.library_variables SET revision=2$$,'42501','no API update grant');
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.library_variables(level,code,group_name,section,settings) VALUES ('universal','No','G','Child','{}')$$,'42501','no API insert grant');
SELECT set_config('fieldmaps.user_id','64000000-0000-4000-8000-000000000013',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM fieldmaps.library_variables),'observer sees no library');
SELECT set_config('fieldmaps.user_id','64000000-0000-4000-8000-000000000014',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM fieldmaps.library_variables),'outsider sees no library');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=10 AND bool_and(revision=1) FROM fieldmaps.library_variables WHERE level='universal'), 'local seed replay retains the ten identities and revisions');
SELECT pg_temp.assert_rejected($$INSERT INTO fieldmaps.library_variables(level,organization_id,project_id,code,group_name,section,settings) VALUES ('project','64000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Wrong','G','Child','{}')$$,'23503','composite FK refuses mismatched ownership');
