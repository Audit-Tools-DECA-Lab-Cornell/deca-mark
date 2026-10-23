const c = require("./common.cjs");
(async () => {
  const b = await c.launch(); const ctx = await b.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await p.goto(c.BASE + c.projectPath + "/forms");
  await p.waitForFunction(() => document.querySelector("button") && Object.keys(document.querySelector("main button") || {}).some(k => k.startsWith("__reactProps$")));
  await p.waitForTimeout(500);
  const btn = p.getByRole("button", { name: "Start new draft", exact: true }).first();
  if (await btn.count()) { await btn.click(); await p.waitForURL(u => /forms\/versions\//.test(u.pathname), { timeout: 20000 }); }
  console.log(p.url().replace(c.BASE, ""));
  require("fs").writeFileSync(`${__dirname}/out/draft-url.txt`, p.url().replace(c.BASE, ""));
  await b.close();
})();
