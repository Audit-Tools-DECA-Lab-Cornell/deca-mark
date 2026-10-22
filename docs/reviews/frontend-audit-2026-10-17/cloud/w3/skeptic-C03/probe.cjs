// Read-only probe: which form versions are drafts in the synthetic web-acceptance project.
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const BASE = "http://127.0.0.1:3000", P = "/o/web-acceptance/p/play-study";
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ storageState: "/home/user/deca-mark/web/e2e/.auth/manager.json", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const r = await page.goto(BASE + P + "/forms/versions", { waitUntil: "load" });
  console.log("status", r.status(), page.url().replace(BASE, ""));
  const rows = await page.locator("tr").allInnerTexts();
  console.log(rows.map(t => t.replace(/\s+/g, " ").slice(0, 140)).join("\n"));
  await b.close();
})();
