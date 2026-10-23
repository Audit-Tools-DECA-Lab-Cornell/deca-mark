const L = require('./lib.cjs');
(async () => {
  const b = await L.launch(); const ctx = await L.ctxFor(b, 'wa-manager'); const page = await ctx.newPage();
  await page.goto(L.BASE + '/o/web-acceptance/p/uxw2-clean/sites/site-a/packages?step=upload', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const sels = await page.locator('select').evaluateAll(els => els.map(e => ({ label: e.labels?.[0]?.innerText || e.getAttribute('aria-label'), value: e.value, selectedText: e.selectedOptions[0]?.text })));
  console.log(JSON.stringify(sels));
  await ctx.close(); await b.close();
})();
