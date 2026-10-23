const fs = require('fs');
const file = process.argv[2] || 'results.jsonl';
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.kind !== 'meta');
const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rng = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? `${med(s).toFixed(0)} (${s[0].toFixed(0)}-${s[s.length - 1].toFixed(0)})` : 'n/a'; };
const builds = [...new Set(rows.map(r => r.build))].sort();
const label = { A: 'A repo :3000', B: 'B no-loading :3001', C: 'C tabs-group :3002', D: 'D control copy :3003', E: 'E throttle=0 :3004', F: 'F loading at p/ :3005', G: 'G Suspense in layout :3006' };
console.log('## COLD (fresh context per sample; ms from navigationStart; median (min-max); n)');
console.log('| route | build | n | usable | usable & painted (max(usable,FCP)) | LCP | TTFB | FCP | doc end | fallback seen (n) | usable-docEnd |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const route of ['overview', 'data', 'sites', 'zones']) for (const b of builds) {
  const s = rows.filter(r => r.kind === 'cold' && r.build === b && r.route === route); if (!s.length) continue;
  console.log(`| ${route} | ${label[b]} | ${s.length} | ${rng(s.map(r => r.usable))} | ${rng(s.map(r => Math.max(r.usable, r.fcp)))} | ${rng(s.map(r => r.lcp))} | ${rng(s.map(r => r.ttfb))} | ${rng(s.map(r => r.fcp))} | ${rng(s.map(r => r.docEnd))} | ${s.filter(r => r.fbFirst != null).length} | ${rng(s.map(r => r.usable - r.docEnd))} |`);
}
console.log('\n## WARM (click -> usable; one context per sample; pass 1 = first visit of the transition in that context, pass 2 = repeat)');
const steps = ['overview->data', 'data->sites', 'site->forms', 'zones->forms', 'forms->sites', 'x->overview', 'data->observation', 'sites->site', 'sites->site(2)', 'site->zones'];
console.log('| transition | build | pass | n | usable | RSC end | usable-RSC end | fallback seen (n) | fb first | foreign origins |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const st of steps) for (const b of builds) for (const pass of [1, 2]) {
  const s = rows.filter(r => r.kind === 'warm' && r.build === b && r.name === st && r.pass === pass); if (!s.length) continue;
  const rsc = s.map(r => r.rsc && r.rsc.length ? Math.max(...r.rsc.map(x => x.end)) : null);
  console.log(`| ${st} | ${label[b]} | ${pass} | ${s.length} | ${rng(s.map(r => r.usable))} | ${rng(rsc)} | ${rng(s.map((r, i) => rsc[i] == null ? null : r.usable - rsc[i]))} | ${s.filter(r => r.fbFirst != null).length} | ${rng(s.map(r => r.fbFirst))} | ${[...new Set(s.flatMap(r => r.foreign || []))].join(',') || '-'} |`);
}
console.log('errors:', rows.filter(r => r.error).map(r => `${r.build}/${r.name || r.route}:${r.error}`).join(' ') || 'none');
