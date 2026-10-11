import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.argv[2];
assert.match(container ?? '', /^fieldmaps-zone-(rehearsal-\d+|db16-work)$/);
const args = ['exec', '-i', container, 'psql', '-h', '/tmp', '-X', '-U', 'postgres', '-At',
  '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const query = sql => execFileSync('docker', args, { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim();
const project = '10000000-0000-4000-8000-000000000002';
const site = '80000000-0000-4000-8000-000000000001';
const base = '81000000-0000-4000-8000-000000000001';
const manager = '50000000-0000-4000-8000-000000000004';
const manager2 = '50000000-0000-4000-8000-000000000005';
const helpers = readFileSync(new URL('./zone-publication-helpers.sql', import.meta.url), 'utf8');
const fixtures = readFileSync(new URL('./zone-publication-fixtures.sql', import.meta.url), 'utf8');
const geometry = '{"type":"Polygon","coordinates":[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}';
const legacyZones = JSON.stringify([{ zone_code: 'A', zone_label: 'Synthetic A', geometry: JSON.parse(geometry) }]);
const auth = actor => `SET ROLE fieldmaps_api; SELECT set_config('fieldmaps.user_id','${actor}',false);`;
query(`BEGIN;
\\i /tmp/fieldmaps-tests/supabase/seed.sql
INSERT INTO auth.users(id,email) VALUES ('${manager}','db16-manager@test.invalid'),('${manager2}','db16-manager2@test.invalid'),
 ('50000000-0000-4000-8000-000000000001','db16-observer@test.invalid') ON CONFLICT DO NOTHING;
INSERT INTO fieldmaps.profiles(user_id) SELECT id FROM auth.users WHERE id IN ('${manager}','${manager2}','50000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO fieldmaps.project_memberships(user_id,organization_id,project_id,role) VALUES
 ('${manager}','10000000-0000-4000-8000-000000000001','${project}','manager'),
 ('${manager2}','10000000-0000-4000-8000-000000000001','${project}','manager') ON CONFLICT DO NOTHING;
${fixtures}
COMMIT;`);
const create = (request, current = base, actor = manager, targetSite = site) => query(`${auth(actor)}
SELECT (fieldmaps_private.create_zone_draft('${project}','${targetSite}','${request}','${current}',
'${geometry}','${legacyZones}')).id;`).split('\n').at(-1);
const save = (draft, revision, note, actor = manager) => query(`${auth(actor)}
SELECT (fieldmaps_private.change_zone_draft('${project}','${site}','${draft}',${revision},
(SELECT zones FROM fieldmaps.zone_drafts WHERE id='${draft}'),'${note}')).revision;`).split('\n').at(-1);
const publish = (draft, revision, request, current, version, packageId = `81000000-0000-4000-8000-${String(version).padStart(12, '0')}`) =>
  `SELECT (pg_temp.zone_publish('${draft}',${revision},'${request}','${current}',
  '${packageId}',${version})).id;`;
const replay = (draft, revision, request, current) =>
  `SELECT (r.package).id, r.replayed FROM fieldmaps_private.finalize_zone_package('${project}','${site}','${request}','${current}',
  '${draft}',${revision},NULL,NULL,NULL,NULL,NULL,NULL) r;`;
const processes = new Set();
const session = (name, actor, sql, hold) => {
  const process = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const result = { process, stdout: '', stderr: '', done: null };
  processes.add(process);
  process.stdout.setEncoding('utf8').on('data', text => { result.stdout += text; });
  process.stderr.setEncoding('utf8').on('data', text => { result.stderr += text; });
  result.done = new Promise((resolve, reject) => {
    process.once('error', reject);
    process.once('close', code => { processes.delete(process); resolve(code); });
  });
  process.stdin.write(`${helpers}\nSET application_name='${name}'; BEGIN; SET LOCAL statement_timeout='10s';\n${auth(actor)}\n${sql}\n`);
  if (hold) process.stdin.write(`\n\\echo FIRST_READY\n`);
  else process.stdin.end('COMMIT;\n');
  return result;
};
const ready = async first => {
  for (let count = 0; count < 200; count += 1) {
    if (first.stdout.includes('FIRST_READY')) return;
    if (first.stderr.includes('ERROR:')) throw new Error(first.stderr);
    await delay(20);
  }
  throw new Error(`First transaction did not reach barrier: ${first.stderr}`);
};
const blocked = async () => {
  for (let count = 0; count < 100; count += 1) {
    if (query("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='zone-concurrency-B' AND wait_event_type='Lock');") === 't') return;
    await delay(20);
  }
  throw new Error('Second transaction did not wait on the database lock');
};
const race = async (firstSql, secondSql, expectedError, actors = [manager, manager2]) => {
  const first = session('zone-concurrency-A', actors[0], firstSql, true);
  await ready(first);
  const second = session('zone-concurrency-B', actors[1], secondSql, false);
  await blocked();
  first.process.stdin.end('COMMIT;\n');
  assert.equal(await first.done, 0, first.stderr);
  assert.equal(await second.done, expectedError ? 3 : 0, second.stderr);
  if (expectedError) assert.ok(second.stderr.includes(expectedError), second.stderr);
  return [first, second];
};
try {
  const draft1 = create('86000000-0000-4000-8000-000000000001');
  const draft2 = create('86000000-0000-4000-8000-000000000002', base, manager2);
  save(draft1, 1, 'Explicit legacy A mapping.');
  save(draft2, 1, 'Explicit legacy A mapping.', manager2);
  await race(publish(draft1, 2, '87000000-0000-4000-8000-000000000001', base, 3),
    publish(draft2, 2, '87000000-0000-4000-8000-000000000002', base, 3), 'ZB003');
  assert.equal(query(`SELECT count(*) FROM fieldmaps.zone_publications WHERE site_id='${site}';`), '1');
  console.log('PASS: two managers race first adoption; one complete publication, one publication_conflict.');

  const current3 = '81000000-0000-4000-8000-000000000003';
  const draft3 = create('86000000-0000-4000-8000-000000000003', current3);
  save(draft3, 1, 'Explicit legacy A mapping.');
  await race(publish(draft3, 2, '87000000-0000-4000-8000-000000000003', current3, 4),
    replay(draft3, 2, '87000000-0000-4000-8000-000000000003', current3), null, [manager, manager]);
  assert.equal(query(`SELECT count(*) FROM fieldmaps.zone_publications WHERE site_id='${site}';`), '2');
  console.log('PASS: concurrent identical retries return one durable result and create one version.');

  const current4 = '81000000-0000-4000-8000-000000000004';
  const draft4 = create('86000000-0000-4000-8000-000000000004', current4);
  const replace = note => `SELECT (fieldmaps_private.change_zone_draft('${project}','${site}','${draft4}',1,
    (SELECT zones FROM fieldmaps.zone_drafts WHERE id='${draft4}'),'${note}')).revision;`;
  await race(replace('First saved mapping.'), replace('Second saved mapping.'), 'ZB002');
  assert.equal(query(`SELECT revision||':'||change_note FROM fieldmaps.zone_drafts WHERE id='${draft4}';`), '2:First saved mapping.');
  console.log('PASS: two managers race whole-draft CAS; one revision advance and no lost update.');

  const legacyInsert = `INSERT INTO fieldmaps.site_packages(id,organization_id,project_id,site_id,form_version_id,version,state,
    manifest,archive,archive_sha256,prepared_by) VALUES ('81000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000001','${project}','${site}','10000000-0000-4000-8000-000000000004',99,
    'ready','{"format":1}','\\x01',repeat('a',64),fieldmaps.request_user_id());`;
  await race(publish(draft4, 2, '87000000-0000-4000-8000-000000000004', current4, 5), legacyInsert, 'ZB006');
  assert.equal(query(`SELECT revision FROM fieldmaps.site_zone_state WHERE site_id='${site}';`), '5');
  console.log('PASS: legacy importer waits for the publication lock and cannot bypass managed finalization.');

  query(`BEGIN;
    INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name)
    SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','${project}',
    'db16-race-'||n,'Synthetic import/adoption race' FROM generate_series(10,11) n;
    INSERT INTO fieldmaps.site_packages(id,organization_id,project_id,site_id,form_version_id,version,state,manifest,archive,archive_sha256,prepared_by)
    SELECT ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','${project}',
    ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000004',1,'ready','{"format":1}',
    '\\x01',repeat('a',64),'${manager}' FROM generate_series(10,11) n;
    COMMIT;`);
  const insertLegacy = (targetSite, packageId, version) => `INSERT INTO fieldmaps.site_packages
    (id,organization_id,project_id,site_id,form_version_id,version,state,manifest,archive,archive_sha256,prepared_by)
    VALUES ('${packageId}','10000000-0000-4000-8000-000000000001','${project}','${targetSite}',
    '10000000-0000-4000-8000-000000000004',${version},'ready','{"format":1}','\\x01',repeat('a',64),fieldmaps.request_user_id());`;
  const site10 = '80000000-0000-4000-8000-000000000010';
  const base10 = '81000000-0000-4000-8000-000000000010';
  const draft10 = create('86000000-0000-4000-8000-000000000010', base10, manager2, site10);
  await race(insertLegacy(site10, '81000000-0000-4000-8000-000000000020', 2),
    publish(draft10, 1, '87000000-0000-4000-8000-000000000010', base10, 3, '81000000-0000-4000-8000-000000000021'), 'ZB003');
  assert.equal(query(`SELECT count(*) FROM fieldmaps.site_zone_state WHERE site_id='${site10}';`), '0');
  assert.equal(query(`SELECT state||':'||revision FROM fieldmaps.zone_drafts WHERE id='${draft10}';`), 'draft:1');
  console.log('PASS: legacy import winning first makes adoption stale; draft and unmanaged site remain intact.');

  const site11 = '80000000-0000-4000-8000-000000000011';
  const base11 = '81000000-0000-4000-8000-000000000011';
  const draft11 = create('86000000-0000-4000-8000-000000000011', base11, manager, site11);
  await race(publish(draft11, 1, '87000000-0000-4000-8000-000000000011', base11, 2, '81000000-0000-4000-8000-000000000022'),
    insertLegacy(site11, '81000000-0000-4000-8000-000000000023', 3), 'ZB006');
  assert.equal(query(`SELECT revision FROM fieldmaps.site_zone_state WHERE site_id='${site11}';`), '2');
  console.log('PASS: adoption winning first blocks a waiting legacy import on the previously unmanaged site.');
} finally {
  for (const process of processes) process.stdin.end('ROLLBACK;\n');
}
