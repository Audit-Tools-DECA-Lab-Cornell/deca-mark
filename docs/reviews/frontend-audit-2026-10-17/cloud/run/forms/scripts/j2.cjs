const L = require('./lib.cjs');
const fs = L.fs;
const st = JSON.parse(fs.readFileSync(`${L.F}/data/j1-state.json`, 'utf8'));
const URL_ = L.BASE + L.WA_PATH + '/forms/versions/' + st.code;
async function scenario(b, name, setup, vp = 'desk') {
  const ctx = await L.ctxFor(b, 'wa-manager', vp);
  const page = await ctx.newPage();
  const events = [];
  page.on('pageerror', e => events.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') events.push('console.error: ' + m.text().slice(0, 200)); });
  page.on('response', r => { const q = r.request(); if (q.method() === 'POST') events.push(`POST ${new URL(q.url()).pathname} -> ${r.status()}`); });
  page.on('requestfailed', q => events.push(`requestfailed ${q.method()} ${new URL(q.url()).pathname}: ${q.failure()?.errorText}`));
  page.on('framenavigated', f => { if (f === page.mainFrame()) events.push('nav ' + new URL(f.url()).pathname + new URL(f.url()).search); });
  let dialogs = [];
  page.on('dialog', d => { dialogs.push(d.type() + ':' + d.message().slice(0, 80)); d.dismiss(); });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const label = page.getByRole('textbox', { name: /^question label/i }).first();
  const edit = `UNSAVED ${name} ${Date.now() % 100000}`;
  await label.fill(edit);
  await page.waitForTimeout(300);
  events.length = 0;
  await setup(ctx, page);
  const save = page.getByRole('button', { name: 'Save draft', exact: true });
  await save.click();
  await page.waitForTimeout(4000);
  const body = (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  const mounted = await label.count().then(n => n > 0).catch(() => false);
  const value = mounted ? await label.inputValue().catch(() => null) : null;
  const res = {
    scenario: name, url: page.url().replace(L.BASE, ''), editorMounted: mounted, fieldValueStillEdit: value === edit, fieldValue: value,
    errorBoundary: /Something went wrong/.test(body), saveButtonPresent: await save.count().then(n => n > 0),
    unsavedMeta: /Unsaved changes/.test(body), events, dialogs,
    bodyExcerpt: body.slice(body.indexOf('Workspace check') >= 0 ? 0 : 0, 700)
  };
  await page.screenshot({ path: `${L.F}/shots/j2-${name}-${vp}.png`, fullPage: true });
  fs.writeFileSync(`${L.F}/data/j2-${name}-${vp}.txt`, body);
  // Try again path if error boundary
  if (res.errorBoundary) {
    const retry = page.getByRole('button', { name: /try again/i });
    if (await retry.count()) {
      await retry.first().click(); await page.waitForTimeout(3000);
      const l2 = page.getByRole('textbox', { name: /^question label/i }).first();
      res.afterTryAgain = { editorMounted: await l2.count() > 0, value: await l2.inputValue().catch(() => null), editSurvived: (await l2.inputValue().catch(() => null)) === edit };
      await page.screenshot({ path: `${L.F}/shots/j2-${name}-${vp}-after-try-again.png`, fullPage: true });
    }
  }
  console.log(JSON.stringify(res, null, 1));
  await ctx.close();
  return res;
}
(async () => {
  const b = await L.launch();
  const which = process.argv[2] || 'all';
  const vp = process.argv[3] || 'desk';
  if (which === 'all' || which === 'cookies') await scenario(b, 'cookie-clear', async (ctx) => { await ctx.clearCookies(); }, vp);
  if (which === 'all' || which === 'abort') await scenario(b, 'abort-post', async (ctx, page) => {
    await page.route('**/*', r => (r.request().method() === 'POST' && r.request().headers()['next-action']) ? r.abort('failed') : r.continue());
  }, vp);
  if (which === 'all' || which === 'offline') await scenario(b, 'offline', async (ctx) => { await ctx.setOffline(true); }, vp);
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
