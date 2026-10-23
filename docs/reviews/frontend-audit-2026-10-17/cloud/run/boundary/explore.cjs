const { chromium } = require('/home/user/deca-mark/web/node_modules/@playwright/test');
const fs = require('fs');
(async () => {
  const base = process.argv[2];
  const m = JSON.parse(fs.readFileSync('/home/user/deca-mark/database/.local/web-workspace.json','utf8'));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ storageState: '/home/user/deca-mark/web/e2e/.auth/manager.json', viewport:{width:1440,height:900}, locale:'en-US', timezoneId:'America/New_York' });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', r => { const u = new URL(r.url()); if (u.port !== new URL(base).port || /8001|54321/.test(u.port)) reqs.push(r.method()+' '+u.origin+u.pathname.slice(0,60)+(u.search.includes('_rsc')?' ?_rsc':'')); });
  const path = m.path;
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({
    nav: [...document.querySelectorAll('a')].filter(a=>a.href.includes('/p/')).slice(0,40).map(a => a.getAttribute('href') + ' | ' + a.textContent.trim().slice(0,30)),
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().slice(0,40) + ' inMain=' + !!h.closest('main')),
    main: !!document.querySelector('main'), dl: !!document.querySelector('main dl'),
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log(reqs.join('\n'));
  await browser.close();
})();
