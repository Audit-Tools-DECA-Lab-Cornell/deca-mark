const { chromium } = require('./lib.cjs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ storageState: '/home/user/deca-mark/web/e2e/.auth/manager.json', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3000/o/web-acceptance', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  console.log(page.url());
  const info = await page.evaluate(() => ({ links: [...document.querySelectorAll('a')].map(a => a.getAttribute('href') + ' | ' + a.textContent.trim().slice(0, 25)).filter(x => x.startsWith('/o/')).slice(0, 25), h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()), busy: document.querySelectorAll('[aria-busy=true]').length }));
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
