const L = require('./lib.cjs');
const P = L.BASE + L.WA_PATH;
async function run(b, name, url, act) {
  const ctx = await L.ctxFor(b, 'wa-manager');
  const page = await ctx.newPage();
  const ev = [];
  page.on('console', m => { if (m.type() === 'error') ev.push(m.text().slice(0, 120)); });
  await page.goto(P + url, { waitUntil: 'load' }); await page.waitForTimeout(1000);
  await page.route('**/*', r => (r.request().method() === 'POST' && r.request().headers()['next-action']) ? r.abort('failed') : r.continue());
  await act(page);
  await page.waitForTimeout(3500);
  const body = (await page.locator('body').innerText()).replace(/\n+/g, ' | ');
  const r = { name, boundary: /Something went wrong/.test(body), url: page.url().replace(L.BASE, ''), inlineNote: (/Nothing was \w+\.[^|]*/.exec(body) || [null])[0], dialogStillOpen: await page.getByRole('dialog').count() > 0 };
  await page.screenshot({ path: `${L.F}/shots/j3-${name}.png`, fullPage: false });
  console.log(JSON.stringify(r));
  await ctx.close();
}
(async () => {
  const b = await L.launch();
  await run(b, 'start-new-draft', '/forms/versions?form=workspace-check', async p => { await p.getByRole('button', { name: 'Start new draft', exact: true }).first().click(); });
  await run(b, 'publish', '/forms/versions/workspace-check-v5/publish', async p => { await p.getByRole('checkbox').first().check(); await p.getByRole('button', { name: /^Publish\b/ }).click(); });
  await run(b, 'retire', '/forms/versions?form=workspace-check', async p => { await p.getByRole('button', { name: 'Retire workspace-check-v3' }).click(); await p.getByRole('dialog').getByRole('button', { name: /Retire/ }).last().click(); });
  await run(b, 'discard', '/forms/versions?form=workspace-check', async p => { await p.getByRole('button', { name: 'Discard workspace-check-v2' }).click(); await p.getByRole('dialog').getByRole('button', { name: /Discard/ }).last().click(); });
  await run(b, 'start-from-published', '/forms/versions/workspace-check-v4', async p => { await p.getByRole('button', { name: /Start a new draft from this version/ }).click(); });
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
