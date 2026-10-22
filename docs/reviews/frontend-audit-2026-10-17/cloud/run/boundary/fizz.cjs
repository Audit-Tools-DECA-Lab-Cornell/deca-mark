const { chromium, ROUTES } = require('./lib.cjs');
const INIT = `(() => { const L = window.__fizz = []; let v; Object.defineProperty(window, '$RT', { configurable: true, get() { return v; }, set(x) { v = x; L.push(['RT=', +x.toFixed(1), 'at', +performance.now().toFixed(1)]); } });
 const st = window.setTimeout; window.setTimeout = function (fn, d, ...a) { if (fn && fn.name === 'bound $RV') L.push(['setTimeout($RV)', 'delay', +d.toFixed(1), 'scheduled at', +performance.now().toFixed(1), 'fires at ~', +(performance.now() + d).toFixed(1)]); return st.call(this, fn, d, ...a); };
 const raf = window.requestAnimationFrame; window.requestAnimationFrame = function (fn) { if (fn && fn.name === 'bound $RV') L.push(['rAF($RV) immediate reveal', 'scheduled at', +performance.now().toFixed(1)]); return raf.call(this, fn); };
 })();`;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [route, port, state] of [['sites', 3000, 'manager'], ['data', 3000, 'manager'], ['overview', 3000, 'manager'], ['sites', 3004, 'manager']]) {
    const ctx = await browser.newContext({ storageState: `/home/user/deca-mark/web/e2e/.auth/${state}.json`, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); await page.addInitScript(INIT);
    await page.addInitScript(`(() => { window.__u = null; const f = () => { if (window.__u === null && document.querySelector('main a[href*="/sites/"], main a[href*="/data/"], main dl') && !document.querySelector('[aria-busy="true"]')) window.__u = performance.now(); if (window.__u === null) requestAnimationFrame(f); }; requestAnimationFrame(f); })();`);
    await page.goto(`http://127.0.0.1:${port}${ROUTES[route].path}`, { waitUntil: 'load' }); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ L: window.__fizz, firstContentFrame: window.__u, docEnd: performance.getEntriesByType('navigation')[0].responseEnd }));
    console.log(`:${port} ${route}`, 'docEnd', r.docEnd.toFixed(0), 'content-visible frame', r.firstContentFrame && r.firstContentFrame.toFixed(0)); for (const l of r.L) console.log('   ', l.join(' '));
    await ctx.close();
  }
  await browser.close();
})();
