const L = require('./lib.cjs');
const P = L.BASE + L.WA_PATH;
(async () => {
  const b = await L.launch();
  const ctx = await L.ctxFor(b, 'wa-manager');
  const page = await ctx.newPage();
  await page.goto(P + '/forms/versions/workspace-check-v5', { waitUntil: 'load' }); await page.waitForTimeout(1000);
  // Published read-only version detail for reference (v1, the one Fall Creek binds)
  await page.getByRole('link', { name: 'Publish', exact: true }).first().click();
  await page.waitForURL(/publish$/);
  console.log('PUBLISH PAGE:', (await L.snap(page, 'j4-01-publish-page')).slice(0, 3500));
  await page.getByRole('checkbox').first().check();
  await L.snap(page, 'j4-02-publish-confirmed');
  await page.getByRole('button', { name: /^Publish\b/ }).click();
  await page.waitForURL(/forms\/versions\?form=/, { timeout: 30000 });
  console.log('AFTER PUBLISH url', page.url());
  console.log('VERSIONS:', (await L.snap(page, 'j4-03-versions-after-publish')).slice(0, 1500));
  await page.goto(P + '/forms', { waitUntil: 'load' });
  console.log('FORMS LIST:', (await L.snap(page, 'j4-04-forms-list-after-publish')).slice(0, 1500));
  await page.goto(P, { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const ov = await L.snap(page, 'j4-05-overview-after-publish');
  const i = ov.indexOf('Needs attention'); console.log('OVERVIEW ATTENTION:', ov.slice(i, i + 1100));
  await page.goto(P + '/sites/fall-creek', { waitUntil: 'load' });
  const site = await L.snap(page, 'j4-06-site-fall-creek');
  const j = site.indexOf('Form version'); console.log('SITE:', site.slice(Math.max(0, j - 400), j + 300));
  await page.goto(P + '/forms/versions/workspace-check-v1', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  console.log('V1 DETAIL:', (await L.snap(page, 'j4-07-version-detail-v1-published')).slice(0, 1800));
  await ctx.close(); await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
