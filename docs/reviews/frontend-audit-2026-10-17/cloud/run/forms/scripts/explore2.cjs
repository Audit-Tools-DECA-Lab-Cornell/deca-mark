const L = require('./lib.cjs');
(async () => {
  const b = await L.launch();
  for (const [name, state, path] of [['wa','wa-manager',L.WA_PATH],['zr','zr-manager',L.ZR_PATH]]) {
    const ctx = await L.ctxFor(b, state);
    const page = await ctx.newPage();
    await page.goto(L.BASE + path, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const t = (await page.locator('main').innerText()).replace(/\n+/g,' | ');
    const i = t.indexOf('Needs attention'); console.log(`== ${name} overview attention/rest\n`, t.slice(i, i+2500));
    console.log('could-not-be-loaded:', /could not be loaded/i.test(t), ' Forms card:', /\bForms\b/.test(t));
    await page.goto(L.BASE + path + '/data', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const d = (await page.locator('main').innerText()); console.log(name,'data could-not-be-loaded:', /could not be loaded/i.test(d));
    await ctx.close();
  }
  await b.close();
})();
