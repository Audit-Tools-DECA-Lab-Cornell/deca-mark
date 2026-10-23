const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ storageState: process.argv[3], viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const r = await page.goto("http://127.0.0.1:3000" + process.argv[2], { waitUntil: "load" });
  await page.waitForTimeout(2000);
  console.log(r.status(), page.url());
  const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log(t.slice(0, 600)); console.log("...", (t.match(/.{0,80}(500|more|Show).{0,80}/gi) || []).slice(0, 6));
  console.log(await page.getByRole("button").allInnerTexts());
  await b.close();
})();
