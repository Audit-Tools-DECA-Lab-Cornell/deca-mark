// Shared measurement code. Same script for every build; only the base URL differs.
const { chromium } = require('/home/user/deca-mark/web/node_modules/@playwright/test');
const fs = require('fs');
const M = JSON.parse(fs.readFileSync('/home/user/deca-mark/database/.local/web-workspace.json', 'utf8'));
const STATE = '/home/user/deca-mark/web/e2e/.auth/manager.json';
const P = M.path;                         // /o/web-acceptance/p/play-study
const OBS = M.observations[0];

// Predicates (same definitions as the earlier audit's route table), plus a pathname guard.
const HELPERS = `
const vis = sel => [...document.querySelectorAll(sel)].some(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; });
const big = () => [...document.querySelectorAll('main svg[aria-label]')].some(s => { const r = s.getBoundingClientRect(); return r.width > 300 && r.height > 200; });
const at = p => location.pathname === p;
`;
const ROUTES = {
  overview: { path: P,                         pred: `at(${JSON.stringify(P)}) && vis('main h1') && vis('main dl')` },
  data:     { path: P + '/data',               pred: `at(${JSON.stringify(P + '/data')}) && vis('main a[href*="/data/"]')` },
  sites:    { path: P + '/sites',              pred: `at(${JSON.stringify(P + '/sites')}) && vis('main a[href*="/sites/"]')` },
  site:     { path: P + '/sites/fall-creek',   pred: `at(${JSON.stringify(P + '/sites/fall-creek')}) && big()` },
  zones:    { path: P + '/sites/fall-creek/zones', pred: `at(${JSON.stringify(P + '/sites/fall-creek/zones')}) && big()` },
  forms:    { path: P + '/forms',              pred: `at(${JSON.stringify(P + '/forms')}) && vis('main h1')` },
  obs:      { path: P + '/data/' + OBS,        pred: `at(${JSON.stringify(P + '/data/' + OBS)}) && vis('main h1') && vis('main dl')` },
};

// Runs in the page for a cold load: poll each animation frame, record first frame where the predicate holds.
function coldInit(pred) {
  return `(() => { ${HELPERS}
    const m = window.__m = { usable: null, fbFirst: null, fbGone: null, fcp: null, lcp: null, frames: 0 };
    const fb = () => !!document.querySelector('[aria-busy="true"]');
    const tick = () => {
      const t = performance.now(); m.frames++;
      const f = fb();
      if (f && m.fbFirst === null) m.fbFirst = t;
      if (!f && m.fbFirst !== null && m.fbGone === null) m.fbGone = t;
      if (m.usable === null && (${pred})) m.usable = t;
      if (m.usable === null && t < 8000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  })();`;
}

async function newCtx(browser, opts = {}) {
  return browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'America/New_York', ...opts });
}

async function cold(browser, base, route) {
  const r = ROUTES[route];
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const foreign = new Set();
  page.on('request', q => { const u = new URL(q.url()); if (u.origin !== new URL(base).origin) foreign.add(u.origin); });
  await page.addInitScript(coldInit(r.pred));
  await page.goto(base + r.path, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__m && window.__m.usable !== null, null, { timeout: 15000, polling: 50 }).catch(() => {});
  await page.waitForTimeout(150);
  const out = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { ...window.__m, ttfb: n.responseStart, docEnd: n.responseEnd, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, RT: typeof window.$RT === 'number' ? window.$RT : null, finalPath: location.pathname };
  });
  out.foreign = [...foreign];
  await ctx.close();
  return out;
}

// One client-side transition: click an in-page link, poll each frame until the destination predicate holds.
async function click(page, linkSel, pred) {
  return page.evaluate(({ linkSel, pred, HELPERS }) => new Promise(resolve => {
    const run = new Function('return (function(){' + HELPERS + ' return { fb: () => !!document.querySelector(\'[aria-busy="true"]\'), ok: () => (' + pred + ') }; })()')();
    const link = document.querySelector(linkSel);
    if (!link) return resolve({ error: 'no link ' + linkSel });
    const res = { usable: null, fbFirst: null, fbGone: null };
    const t0 = performance.now();
    const tick = () => {
      const t = performance.now() - t0;
      const f = run.fb();
      if (f && res.fbFirst === null) res.fbFirst = t;
      if (!f && res.fbFirst !== null && res.fbGone === null) res.fbGone = t;
      if (run.ok()) { res.usable = t; }
      if (res.usable !== null || t > 6000) {
        const rsc = performance.getEntriesByType('resource').filter(e => e.name.includes('_rsc=') && e.startTime >= t0 - 5).map(e => ({ start: e.startTime - t0, resp: e.responseStart - t0, end: e.responseEnd - t0 }));
        res.rsc = rsc; res.error = res.usable === null ? 'timeout' : undefined;
        return resolve(res);
      }
      requestAnimationFrame(tick);
    };
    link.click();
    requestAnimationFrame(tick);
  }), { linkSel, pred, HELPERS });
}

async function settle(page, ms = 900) { await page.waitForTimeout(ms); }

// Chain: overview -> data -> observation -> back -> sites -> site -> forms, then pass 2 (chunks cached):
// overview(tab) -> data -> observation -> back -> sites -> site -> forms.
async function warmChain(browser, base, passes = 2) {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const foreign = new Set();
  page.on('request', q => { const u = new URL(q.url()); if (u.origin !== new URL(base).origin) foreign.add(u.origin); });
  await page.goto(base + ROUTES.overview.path, { waitUntil: 'load' });
  await page.waitForFunction(pred => { const f = new Function(`${pred.h} return ${pred.p}`); return f(); }, { h: HELPERS, p: ROUTES.overview.pred }, { timeout: 15000 });
  await settle(page, 1500);
  const out = [];
  const step = async (name, pass, linkSel, dest) => {
    const r = await click(page, linkSel, ROUTES[dest].pred);
    out.push({ name, pass, ...r });
    await settle(page);
  };
  for (let pass = 1; pass <= passes; pass++) {
    if (pass > 1) { await step('x->overview', pass, `a[href="${P}"]`, 'overview'); }
    await step('overview->data', pass, `a[href="${P}/data"]`, 'data');
    await step('data->observation', pass, `a[href$="/data/${OBS}"]`, 'obs');
    await page.goBack(); // client-side back to data
    await page.waitForFunction(pred => { const f = new Function(`${pred.h} return ${pred.p}`); return f(); }, { h: HELPERS, p: ROUTES.data.pred }, { timeout: 8000 });
    await settle(page);
    await step('data->sites', pass, `a[href="${P}/sites"]`, 'sites');
    await step('sites->site', pass, `a[href="${P}/sites/fall-creek"]`, 'site');
    await step('site->forms', pass, `a[href="${P}/forms"]`, 'forms');
    // site->zones is also checked (within the sites segment): go back to site first
    await step('forms->sites', pass, `a[href="${P}/sites"]`, 'sites');
    await step('sites->site(2)', pass, `a[href="${P}/sites/fall-creek"]`, 'site');
    await step('site->zones', pass, `a[href="${P}/sites/fall-creek/zones"]`, 'zones');
    await step('zones->forms', pass, `a[href="${P}/forms"]`, 'forms');
  }
  const hard = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await ctx.close();
  return { steps: out, foreign: [...foreign] };
}

module.exports = { chromium, ROUTES, cold, warmChain, P, OBS };
