const L = require('./lib.cjs');
(async () => {
  const b = await L.launch();
  for (const [name, state, path] of [['wa','wa-manager',L.WA_PATH],['zr','zr-manager',L.ZR_PATH]]) {
    const ctx = await L.ctxFor(b, state);
    const page = await ctx.newPage();
    for (const [tag, rest] of [['forms','/forms'],['versions','/forms/versions'],['overview',''],['data','/data']]) {
      const r = await page.goto(L.BASE + path + rest, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${L.F}/shots/explore-${name}-${tag}.png`, fullPage: true });
      const txt = (await page.locator('main').innerText().catch(()=>'')).replace(/\n+/g,' | ');
      console.log(`== ${name} ${tag} ${r.status()} ${page.url()}\n${txt.slice(0,1800)}`);
    }
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 800)); process.exit(1); });
