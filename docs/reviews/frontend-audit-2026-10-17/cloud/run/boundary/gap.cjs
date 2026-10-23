const { chromium, ROUTES } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [label, port] of [['A', 3000], ['B', 3001], ['A', 3000], ['B', 3001]]) {
    const ctx = await browser.newContext({ storageState: '/home/user/deca-mark/web/e2e/.auth/manager.json', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${ROUTES.sites.path}`, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint').map(p => `${p.name}=${p.startTime.toFixed(0)}`);
      const res = performance.getEntriesByType('resource').map(e => `${e.initiatorType}:${e.name.split('/').slice(-1)[0].slice(0, 28)} start=${e.startTime.toFixed(0)} end=${e.responseEnd.toFixed(0)}`);
      return { ttfb: nav.responseStart.toFixed(0), docEnd: nav.responseEnd.toFixed(0), dcl: nav.domContentLoadedEventEnd.toFixed(0), load: nav.loadEventEnd.toFixed(0), paints, res: res.filter(x => /css|font|link|script/.test(x)).slice(0, 14) };
    });
    console.log(label, port, JSON.stringify(r, null, 0));
    await ctx.close();
  }
  await browser.close();
})();
