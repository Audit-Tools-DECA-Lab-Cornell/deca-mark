// Org-level boundary check: owner account, org pages (the (org)/loading.tsx boundary). A (repo :3000) vs B (both loading.tsx deleted :3001), interleaved.
const fs = require('fs');
const { chromium } = require('/home/user/deca-mark/web/node_modules/@playwright/test');
const O = '/o/web-acceptance';
const STATE = '/home/user/deca-mark/web/e2e/.auth/owner.json';
const H = `const vis = sel => [...document.querySelectorAll(sel)].some(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; }); const at = p => location.pathname === p; const txt = () => (document.querySelector('main')?.innerText || '').length;`;
const R = {
  org: { path: O, pred: `at('${O}') && vis('main h1') && vis('main a[href*="/p/"]')` },
  members: { path: O + '/members', pred: `at('${O}/members') && vis('main section') && txt() > 40` },
  settings: { path: O + '/settings', pred: `at('${O}/settings') && vis('main section') && txt() > 40` },
};
const init = pred => `(() => { ${H} const m = window.__m = { usable: null, fbFirst: null }; const tick = () => { const t = performance.now(); if (m.fbFirst === null && document.querySelector('[aria-busy="true"]')) m.fbFirst = t; if (m.usable === null && (${pred})) m.usable = t; if (m.usable === null && t < 8000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); new PerformanceObserver(l => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); })();`;
const newCtx = b => b.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York' });
async function cold(b, base, r) {
  const ctx = await newCtx(b); const page = await ctx.newPage();
  await page.addInitScript(init(R[r].pred));
  await page.goto(base + R[r].path, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__m && window.__m.usable !== null, null, { timeout: 15000, polling: 50 }).catch(() => {});
  await page.waitForTimeout(150);
  const o = await page.evaluate(() => ({ ...window.__m, docEnd: performance.getEntriesByType('navigation')[0].responseEnd, finalPath: location.pathname }));
  await ctx.close(); return o;
}
async function click(page, sel, pred) {
  return page.evaluate(({ sel, pred, H }) => new Promise(resolve => {
    const f = new Function('return (function(){' + H + ' return () => (' + pred + '); })()')();
    const link = document.querySelector(sel); if (!link) return resolve({ error: 'no link ' + sel });
    const res = { usable: null, fbFirst: null }; const t0 = performance.now();
    const tick = () => { const t = performance.now() - t0; if (res.fbFirst === null && document.querySelector('[aria-busy="true"]')) res.fbFirst = t; if (f()) res.usable = t;
      if (res.usable !== null || t > 6000) { res.rsc = performance.getEntriesByType('resource').filter(e => e.name.includes('_rsc=') && e.startTime >= t0 - 5).map(e => e.responseEnd - t0); res.error = res.usable === null ? 'timeout' : undefined; return resolve(res); }
      requestAnimationFrame(tick); };
    link.click(); requestAnimationFrame(tick);
  }), { sel, pred, H });
}
async function warm(b, base) {
  const ctx = await newCtx(b); const page = await ctx.newPage();
  await page.goto(base + R.org.path, { waitUntil: 'load' });
  await page.waitForFunction(({ H, p }) => new Function(H + ' return ' + p)(), { H, p: R.org.pred }, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const out = [];
  for (const pass of [1, 2]) for (const [name, sel, dest] of [['org->members', `a[href="${O}/members"]`, 'members'], ['members->settings', `a[href="${O}/settings"]`, 'settings'], ['settings->org', `a[href="${O}"]`, 'org'], ['org->settings', `a[href="${O}/settings"]`, 'settings'], ['settings->members', `a[href="${O}/members"]`, 'members']]) {
    const r = await click(page, sel, R[dest].pred); out.push({ name, pass, ...r }); await page.waitForTimeout(900);
  }
  await ctx.close(); return out;
}
(async () => {
  const builds = { A: 3000, B: 3001 }; const out = 'results-org.jsonl';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const log = o => fs.appendFileSync(out, JSON.stringify(o) + '\n');
  for (const b of ['A', 'B']) { const base = 'http://127.0.0.1:' + builds[b]; for (const r of Object.keys(R)) await cold(browser, base, r); await warm(browser, base); }
  for (let i = 1; i <= 5; i++) for (const b of (i % 2 ? ['A', 'B'] : ['B', 'A'])) {
    const base = 'http://127.0.0.1:' + builds[b];
    for (const r of Object.keys(R)) log({ kind: 'cold', build: b, iter: i, route: r, ...(await cold(browser, base, r)) });
    for (const s of await warm(browser, base)) log({ kind: 'warm', build: b, iter: i, ...s });
    console.log('done', i, b);
  }
  await browser.close();
})();
