const c = require("./common.cjs");
(async () => {
  const b = await c.launch(); const ctx = await b.newContext({ storageState: c.authFile("manager") }); const page = await ctx.newPage(); const gate = await c.gateChunks(ctx); const reqs = [];
  page.on("request", r => r.resourceType() === "document" && reqs.push(r.method() + " " + r.url().replace(c.BASE, "")));
  await page.goto(c.BASE + c.projectPath + "/settings", { waitUntil: "commit" }); const f = page.getByLabel(/^description/i).first(); await f.waitFor();
  await f.fill("typed before hydration"); await page.getByRole("button", { name: /^save/i }).first().click().catch(e => console.log("click failed", e.message.split("\n")[0])); await page.waitForTimeout(1500);
  console.log("document requests:", JSON.stringify(reqs)); console.log("url now:", page.url().replace(c.BASE, "")); gate.release(); await b.close();
})();
