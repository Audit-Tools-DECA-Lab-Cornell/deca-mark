import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const container = process.argv[2];
assert.match(container ?? '', /^(decamark-baseline-\d+|fieldmaps-db19-baseline)$/);
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
const fixtureHelper = readFileSync(new URL('./current-fixture-helper.sql', import.meta.url), 'utf8');
const auth = actor => `SET ROLE fieldmaps_api; SELECT set_config('fieldmaps.user_id','${actor}',false);`;
query(`BEGIN;
\\i /tmp/fieldmaps-tests/supabase/seed.sql
INSERT INTO auth.users(id,email) VALUES ('${manager}','db16-manager@test.invalid'),('${manager2}','db16-manager2@test.invalid'),
 ('50000000-0000-4000-8000-000000000001','db16-observer@test.invalid') ON CONFLICT DO NOTHING;
INSERT INTO fieldmaps.profiles(user_id) SELECT id FROM auth.users WHERE id IN ('${manager}','${manager2}','50000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO fieldmaps.project_memberships(user_id,organization_id,project_id,role) VALUES
 ('${manager}','10000000-0000-4000-8000-000000000001','${project}','manager'),
 ('${manager2}','10000000-0000-4000-8000-000000000001','${project}','manager') ON CONFLICT DO NOTHING;
${fixtureHelper}
${fixtures}
COMMIT;`);
const create = (request, current = base, actor = manager, targetSite = site) => query(`${auth(actor)}
SELECT (fieldmaps_private.create_zone_draft('${project}','${targetSite}','${request}','${current}')).id;`).split('\n').at(-1);
const save = (draft, revision, note, actor = manager) => query(`${auth(actor)}
SELECT (fieldmaps_private.change_zone_draft('${project}','${site}','${draft}',${revision},
(SELECT zones FROM fieldmaps.zone_drafts WHERE id='${draft}'),'${note}')).revision;`).split('\n').at(-1);
const publish = (draft, revision, request, current, version, packageId = `81000000-0000-4000-8000-${String(version).padStart(12, '0')}`) =>
  `SELECT (pg_temp.zone_publish('${draft}',${revision},'${request}','${current}',
  '${packageId}',${version})).id;`;
const replay = (draft, revision, request, current) =>
  `SELECT (r.package).id, r.replayed FROM fieldmaps_private.finalize_zone_package('${project}','${site}','${request}','${current}',
  '${draft}',${revision},NULL,NULL,NULL,NULL,NULL,NULL) r;`;
const firstUploadHelper = `
CREATE FUNCTION pg_temp.first_upload(p_body jsonb,p_package uuid) RETURNS uuid LANGUAGE plpgsql AS $function$
DECLARE validation jsonb; prepared jsonb; result uuid;
BEGIN
  validation := fieldmaps_private.validate_zone_import('${project}',(p_body->>'site_id')::uuid,NULL,p_body);
  prepared := pg_temp.zone_prepared(validation,(p_body->>'site_id')::uuid,
    '10000000-0000-4000-8000-000000000004',NULL,p_package,1);
  SELECT (r.package).id INTO result FROM fieldmaps_private.finalize_zone_package('${project}',(p_body->>'site_id')::uuid,
    (p_body->>'request_id')::uuid,NULL,NULL,NULL,p_package,1,prepared->'manifest',prepared->'layer','\\x010203',
    '[{"step":"archive","state":"passed","detail":"Synthetic first upload race"}]',p_body,
    convert_to((prepared->'layer')::text,'UTF8')) r;
  RETURN result;
END;
$function$;
GRANT EXECUTE ON FUNCTION pg_temp.first_upload(jsonb,uuid) TO fieldmaps_api;`;
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
  process.stdin.write(`${helpers}\n${firstUploadHelper}\nSET application_name='${name}'; BEGIN; SET LOCAL statement_timeout='10s';\n${auth(actor)}\n${sql}\n`);
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
  save(draft1, 1, 'Preserve recorded zone A.');
  save(draft2, 1, 'Preserve recorded zone A.', manager2);
  await race(publish(draft1, 2, '87000000-0000-4000-8000-000000000001', base, 3),
    publish(draft2, 2, '87000000-0000-4000-8000-000000000002', base, 3), 'ZB003');
  assert.equal(query(`SELECT count(*) FROM fieldmaps.zone_publications WHERE site_id='${site}';`), '2');
  console.log('PASS: two managers race publication; one complete publication, one publication_conflict.');

  const current3 = '81000000-0000-4000-8000-000000000003';
  const draft3 = create('86000000-0000-4000-8000-000000000003', current3);
  save(draft3, 1, 'Preserve recorded zone A.');
  await race(publish(draft3, 2, '87000000-0000-4000-8000-000000000003', current3, 4),
    replay(draft3, 2, '87000000-0000-4000-8000-000000000003', current3), null, [manager, manager]);
  assert.equal(query(`SELECT count(*) FROM fieldmaps.zone_publications WHERE site_id='${site}';`), '3');
  console.log('PASS: concurrent identical retries return one durable result and create one version.');

  const current4 = '81000000-0000-4000-8000-000000000004';
  const draft4 = create('86000000-0000-4000-8000-000000000004', current4);
  const replace = note => `SELECT (fieldmaps_private.change_zone_draft('${project}','${site}','${draft4}',1,
    (SELECT zones FROM fieldmaps.zone_drafts WHERE id='${draft4}'),'${note}')).revision;`;
  await race(replace('First saved mapping.'), replace('Second saved mapping.'), 'ZB002');
  assert.equal(query(`SELECT revision||':'||change_note FROM fieldmaps.zone_drafts WHERE id='${draft4}';`), '2:First saved mapping.');
  console.log('PASS: two managers race whole-draft CAS; one revision advance and no lost update.');

  const firstSite = '95000000-0000-4000-8000-000000000001';
  query(`INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name)
    VALUES ('${firstSite}','10000000-0000-4000-8000-000000000001','${project}',
      'first-race','Synthetic first-package race');`);
  const playCode = query("SELECT code FROM fieldmaps.form_versions WHERE id='10000000-0000-4000-8000-000000000004';");
  const firstInput = (requestId, zoneId) => JSON.stringify({
    site_id: firstSite, request_id: requestId, expected_current_package_id: null,
    form_version: playCode, inventory_form_version: null, change_note: 'First package race',
    zone_identity_map: [{ source_feature_id: 'source-A', zone_id: zoneId, zone_code: 'A' }],
    layers: {
      ground: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { kind: 'site' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02], [0, 0]]] } }] },
      zones: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'source-A', name: 'North' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] } }] },
    },
  });
  const firstA = `SELECT pg_temp.first_upload($body$${firstInput('95000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000003')}$body$::jsonb,'95000000-0000-4000-8000-000000000004');`;
  const firstB = `SELECT pg_temp.first_upload($body$${firstInput('95000000-0000-4000-8000-000000000005',
    '95000000-0000-4000-8000-000000000006')}$body$::jsonb,'95000000-0000-4000-8000-000000000007');`;
  await race(firstA, firstB, 'ZB003');
  assert.equal(query(`SELECT count(*)||':'||min(version) FROM fieldmaps.site_packages WHERE site_id='${firstSite}';`), '1:1');
  assert.equal(query(`SELECT count(*) FROM fieldmaps.package_zones WHERE site_id='${firstSite}';`), '1');
  assert.equal(query(`SELECT count(*) FROM fieldmaps.zone_publications WHERE site_id='${firstSite}';`), '1');
  assert.equal(query(`SELECT current_package_id FROM fieldmaps.site_zone_state WHERE site_id='${firstSite}';`),
    '95000000-0000-4000-8000-000000000004');
  console.log('PASS: two null-precondition first uploads race; exactly one version-1 package, snapshot and current pointer.');

  // A project manager's authority changes under the same organization lock.
  query(`INSERT INTO fieldmaps.organization_members(organization_id,user_id,role)
    VALUES ('10000000-0000-4000-8000-000000000001','${manager2}','owner');`);
  const revoke = `SELECT fieldmaps_private.set_project_role('${project}','${manager}','viewer');`;
  await race(publish(draft4, 2, '87000000-0000-4000-8000-000000000004', current4, 5), revoke, null);
  assert.equal(query(`SELECT revision FROM fieldmaps.site_zone_state WHERE site_id='${site}';`), '5');
  assert.equal(query(`SELECT role FROM fieldmaps.project_memberships WHERE project_id='${project}' AND user_id='${manager}';`), 'viewer');
  console.log('PASS: publication commits before a waiting role revocation; one complete package survives.');

  query(`${auth(manager2)} SELECT fieldmaps_private.set_project_role('${project}','${manager}','manager');`);
  const current5 = '81000000-0000-4000-8000-000000000005';
  const draft5 = create('86000000-0000-4000-8000-000000000005', current5);
  await race(revoke, publish(draft5, 1, '87000000-0000-4000-8000-000000000005', current5, 6), 'FM006', [manager2, manager]);
  assert.equal(query(`SELECT revision FROM fieldmaps.site_zone_state WHERE site_id='${site}';`), '5');
  assert.equal(query(`SELECT state||':'||revision FROM fieldmaps.zone_drafts WHERE id='${draft5}';`), 'draft:1');
  console.log('PASS: revocation commits first; waiting publication rechecks authority and leaves no package.');

  query(`${auth(manager2)} SELECT fieldmaps_private.set_project_role('${project}','${manager}','manager');`);
  const draft6 = create('86000000-0000-4000-8000-000000000006', current5);
  await race(`SELECT fieldmaps_private.forget_user();`,
    publish(draft6, 1, '87000000-0000-4000-8000-000000000006', current5, 6), 'FM005', [manager, manager]);
  assert.equal(query(`SELECT revision FROM fieldmaps.site_zone_state WHERE site_id='${site}';`), '5');
  assert.equal(query(`SELECT count(*) FROM fieldmaps.site_packages WHERE site_id='${site}' AND version=6;`), '0');
  console.log('PASS: account forgetting holds the caller lock; a waiting publication is refused without side effects.');
} finally {
  for (const process of processes) process.stdin.end('ROLLBACK;\n');
}
