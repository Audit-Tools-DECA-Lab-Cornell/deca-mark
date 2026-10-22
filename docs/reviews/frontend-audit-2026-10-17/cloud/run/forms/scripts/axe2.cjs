const L = require('./lib.cjs');
const AxeBuilder = require('/home/user/deca-mark/web/node_modules/@axe-core/playwright').default;
(async () => {
  const b = await L.launch();
  for (const vp of ['desk','phone']) {
    const ctx = await L.ctxFor(b, 'wa-manager', vp, { colorScheme: 'light' }); const page = await ctx.newPage();
    await page.goto(L.BASE + L.WA_PATH + '/forms/versions/workspace-check-v2', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    for (const v of r.incomplete) console.log(vp, v.id, v.nodes.slice(0,12).map(n => n.target.join(' ').slice(0,70) + ' :: ' + (n.any[0]?.message||'').slice(0,80)).join('\n   '));
    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    console.log(vp, 'scrollWidth', JSON.stringify(sw));
    await ctx.close();
  }
  await b.close();
})();
