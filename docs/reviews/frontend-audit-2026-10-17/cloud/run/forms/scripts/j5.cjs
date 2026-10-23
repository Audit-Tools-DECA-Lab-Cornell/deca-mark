const L = require('./lib.cjs');
const P = L.BASE + '/o/web-acceptance/p/uxw2-clean';
(async () => {
  const b = await L.launch();
  for (const vp of ['desk', 'phone']) {
    const ctx = await L.ctxFor(b, 'wa-manager', vp);
    const page = await ctx.newPage();
    for (const [tag, rest] of [['forms', '/forms'], ['versions', '/forms/versions'], ['overview', ''], ['site', '/sites/site-a'], ['upload', '/sites/site-a/packages?step=upload']]) {
      await page.goto(P + rest, { waitUntil: 'load' }); await page.waitForTimeout(1500);
      const t = await L.snap(page, `uxw2-${tag}-${vp}`, { full: true });
      if (vp === 'desk') console.log(`== ${tag}\n`, t.slice(0, 1600));
    }
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
