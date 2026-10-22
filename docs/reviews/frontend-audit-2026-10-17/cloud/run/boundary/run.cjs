// Interleaved experiment: for iteration i, for each build (rotated order): 4 cold routes (fresh context each) + 1 warm chain (fresh context, 2 passes).
const fs = require('fs');
const { chromium, cold, warmChain } = require('./lib.cjs');
const BUILDS = { A: 3000, B: 3001, C: 3002, D: 3003, E: 3004, F: 3005, G: 3006 };
const which = (process.argv[2] || 'A,B,C,D,E').split(',');
const N = Number(process.argv[3] || 5);
const out = process.argv[4] || 'results.jsonl';
const ROUTES = ['overview', 'data', 'sites', 'zones'];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const log = o => fs.appendFileSync(out, JSON.stringify(o) + '\n');
  fs.appendFileSync(out, JSON.stringify({ kind: 'meta', t: new Date().toISOString(), chromium: browser.version(), builds: which, N, cpus: require('os').cpus().length }) + '\n');
  // warm-up (discarded): server JIT, caches.
  for (const b of which) { const base = 'http://127.0.0.1:' + BUILDS[b]; for (const r of ROUTES) await cold(browser, base, r); await warmChain(browser, base, 1); }
  for (let i = 1; i <= N; i++) {
    const order = which.slice(i % which.length).concat(which.slice(0, i % which.length));
    for (const b of order) {
      const base = 'http://127.0.0.1:' + BUILDS[b];
      for (const r of ROUTES) { const m = await cold(browser, base, r); log({ kind: 'cold', build: b, iter: i, route: r, ...m }); }
      const w = await warmChain(browser, base, 2);
      for (const s of w.steps) log({ kind: 'warm', build: b, iter: i, ...s, foreign: w.foreign });
      console.log('done iter', i, 'build', b, new Date().toISOString());
    }
  }
  await browser.close();
  fs.writeFileSync('DONE_run', 'ok');
})();
