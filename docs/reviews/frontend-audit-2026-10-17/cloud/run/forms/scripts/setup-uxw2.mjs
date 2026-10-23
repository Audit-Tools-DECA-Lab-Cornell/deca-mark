// Creates a SYNTHETIC extra project in the seeded web-acceptance org so Overview's 'Nothing needs attention'
// condition can be reached (every site has a package, a form is published, no draft) and then publishes v2.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const F = '/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms';
const WA = JSON.parse(readFileSync('/home/user/deca-mark/database/.local/web-workspace.json', 'utf8'));
const PASSWORD = /PASSWORD = "([^"]+)"/.exec(readFileSync('/home/user/deca-mark/web/e2e/support/auth.ts', 'utf8'))[1];
async function req(url, headers, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null } catch {}
  if (!r.ok) throw new Error(`${method} ${new URL(url).pathname} -> ${r.status}`);
  return j;
}
async function session(role) {
  const s = await req(`${WA.supabaseUrl}/auth/v1/token?grant_type=password`, { apikey: WA.publishableKey }, 'POST', { email: WA.accounts[role].email, password: PASSWORD });
  return (path, method = 'GET', body, extra = {}) => req(WA.apiUrl + path, { Authorization: `Bearer ${s.access_token}`, ...extra }, method, body);
}
const owner = await session('owner'); const manager = await session('manager');
const code = 'uxw2-clean';
let proj = (await owner(`/v1/orgs/${WA.organizationId}/projects`)).find(p => p.code === code);
if (!proj) proj = await owner(`/v1/orgs/${WA.organizationId}/projects`, 'POST', { name: 'UXW2 clean project', code, timezone: 'America/New_York' });
const pid = proj.project_id; const base = `/v1/projects/${pid}`;
const members = await owner(`${base}/members`);
if (!members.find(m => m.user_id === WA.accounts.manager.id)) {
  const inv = await owner(`${base}/invitations`, 'POST', { role: 'manager', email: WA.accounts.manager.email });
  await manager('/v1/invitations/redeem', 'POST', { token: inv.token });
}
const definition = { version: 'uxw2-form-v1', title: 'UXW2 form', status: 'draft', summary: 'Synthetic data for local audit only.', source: 'Local audit fixture', inclusion: 'Not a research instrument.',
  questions: [{ id: 'note', code: 'Note', exportColumn: 'Note', act: 'Record', kind: 'text', label: 'Test note', source: 'Local audit fixture', required: true }] };
let forms = await manager(`${base}/forms`);
if (!forms.some(f => f.code === 'uxw2-form')) await manager(`${base}/forms`, 'POST', { code: 'uxw2-form', name: 'UXW2 form', definition });
let v1 = await manager(`${base}/form-versions/uxw2-form-v1`);
if (v1.state === 'draft') v1 = await manager(`${base}/form-versions/uxw2-form-v1/publish`, 'POST', undefined, { 'If-Match': v1.etag });
if (!(await manager(`${base}/sites`)).some(s => s.code === 'site-a')) await manager(`${base}/sites`, 'POST', { code: 'site-a', name: 'Site A' });
const site = (await manager(`${base}/sites`)).find(s => s.code === 'site-a');
const root = '/home/user/deca-mark/qgis/fall-creek/upload-sample';
const layers = Object.fromEntries(['ground', 'zones'].map(l => [l, JSON.parse(readFileSync(`${root}/${l}.geojson`, 'utf8'))]));
layers.zones.features = layers.zones.features.map(f => ({ ...f, properties: { ...f.properties, name: f.properties.label } }));
if (!site.package) {
  const prepared = await manager(`${base}/packages`, 'POST', { site_id: site.site_id, form_version: 'uxw2-form-v1', inventory_form_version: 'uxw2-form-v1', layers, request_id: randomUUID(), expected_current_package_id: null,
    zone_identity_map: [{ source_feature_id: 'A', zone_id: randomUUID(), zone_code: 'A' }], change_note: 'Synthetic audit map' });
  console.log('package state', prepared.package.state);
}
// v2: new draft from v1, reword, publish. Site A's package keeps v1.
forms = await manager(`${base}/forms`);
const form = forms.find(f => f.code === 'uxw2-form');
if (form.versions.length === 1) {
  const d = await manager(`${base}/forms/uxw2-form/versions`, 'POST', {});
  const full = await manager(`${base}/form-versions/${d.code}`);
  const def2 = JSON.parse(JSON.stringify(full.definition)); def2.questions[0].label = 'Test note (corrected wording)';
  const saved = await manager(`${base}/form-versions/${d.code}`, 'PUT', { definition: def2 }, { 'If-Match': full.etag });
  const cur = await manager(`${base}/form-versions/${d.code}`);
  await manager(`${base}/form-versions/${d.code}/publish`, 'POST', undefined, { 'If-Match': cur.etag });
}
const after = (await manager(`${base}/forms`)).find(f => f.code === 'uxw2-form').versions.map(v => `${v.code}:${v.state}`);
const sites = await manager(`${base}/sites`);
console.log(JSON.stringify({ projectId: pid, versions: after, sitePackage: sites.map(s => ({ code: s.code, pkgForms: s.package?.forms })) }));
writeFileSync(`${F}/data/uxw2-project.json`, JSON.stringify({ projectId: pid, path: `/o/web-acceptance/p/${code}` }));
