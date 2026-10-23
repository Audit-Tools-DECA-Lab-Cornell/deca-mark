// <input> controlled field typed before hydration: kept at hydration (initInput does not write value while hydrating), but is it wiped by the next re-render?
const c = require("./common.cjs");
(async () => {
  const b = await c.launch(); const out = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await b.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); const gate = await c.gateChunks(ctx);
    await page.goto(c.BASE + c.projectPath + "/settings", { waitUntil: "commit" }); const name = page.getByLabel(/^project name/i).first(); await name.waitFor();
    await name.fill("Typed before hydration"); gate.release();
    for (let t = 0; t < 300 && !(await name.evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$")))); t++) await page.waitForTimeout(100); await page.waitForTimeout(1200);
    const r = { afterHydration: await name.inputValue() };
    await page.getByLabel(/^description/i).first().focus(); await page.keyboard.type("x");   // any later state change re-renders SettingsScreen
    r.afterTypingOneCharInAnotherField = await name.inputValue(); r.unsavedBadge = (await page.getByText("Unsaved changes").count()) > 0;
    out.push(r); console.log(JSON.stringify(r)); await ctx.close();
    await c.setDescription("restored-after-input-wipe");
  }
  await b.close();
})();
