const { chromium, cold, warmChain } = require('./lib.cjs');
(async () => {
  const base = process.argv[2];
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const r of ['overview','data','sites','zones']) console.log(r, JSON.stringify(await cold(browser, base, r)));
  const w = await warmChain(browser, base, 2);
  for (const s of w.steps) console.log(s.pass, s.name, 'usable', s.usable?.toFixed(0), 'fbFirst', s.fbFirst?.toFixed(0), 'fbGone', s.fbGone?.toFixed(0), 'rsc', JSON.stringify(s.rsc?.map(x=>({s:+x.start.toFixed(0),r:+x.resp.toFixed(0),e:+x.end.toFixed(0)}))), s.error||'');
  console.log('foreign', w.foreign);
  await browser.close();
})();
