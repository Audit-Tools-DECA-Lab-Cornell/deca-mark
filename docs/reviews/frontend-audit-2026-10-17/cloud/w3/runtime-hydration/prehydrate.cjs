// usage: node prehydrate.cjs <mode: fill|type|click|selectall-fill> <n>
const c = require("./common.cjs");
const mode = process.argv[2], N = Number(process.argv[3] || 5);
(async () => {
  const browser = await c.launch();
  const results = [];
  for (let i = 0; i < N; i++) {
    const OLD = `OLD-${mode}-${i}`;
    const NEW = `NEW-${mode}-${i}`;
    await c.setDescription(OLD);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const delayMs = mode === "fill-delay" ? 1000 + Math.floor(Math.random() * 2000) : 0;
    const gate = await c.gateChunks(ctx, delayMs ? { delayMs } : {});
    const actions = [];
    page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"]) actions.push(r.postData()); });
    await page.goto(c.BASE + c.projectPath + "/settings", { waitUntil: "commit" });
    const field = page.getByLabel(/^description/i).first();
    await field.waitFor({ state: "visible", timeout: 20000 });
    const pre = { value: await field.inputValue(), hydrated: await c.hydrated(page, "textarea") };
    if (mode === "fill" || mode === "fill-delay") await field.fill(NEW);
    else if (mode === "fillsplit") { await field.focus(); await field.evaluate(e => e.select()); /* fill step 1: select-all, then hydration happens, then step 2 */ gate.release(); await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }, null, { timeout: 30000 }); await page.keyboard.insertText(NEW); }
    else if (mode === "typethrough") { await field.click(); await page.keyboard.press("Control+A"); setTimeout(() => gate.release(), 280); await page.keyboard.type(NEW, { delay: 80 }); }
    else if (mode === "type") { await field.click(); await page.keyboard.press("Control+A"); await page.keyboard.type(NEW, { delay: 80 }); }
    else if (mode === "click") { await field.click(); await page.keyboard.press("End"); await page.keyboard.type("+xyz", { delay: 80 }); }
    else if (mode === "pressSequentially") { await field.click(); await field.pressSequentially(NEW, { delay: 80 }); }
    const afterAction = await field.inputValue();
    gate.release();
    await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const afterHydration = await field.inputValue();
    const badge = await page.getByText("Unsaved changes").count();
    await page.getByRole("button", { name: /^save/i }).first().click();
    await page.waitForTimeout(2500);
    const stored = (await c.getProject()).description;
    const sent = actions.map(a => (a || "").slice(0, 400));
    results.push({ i, OLD, NEW, pre, afterAction, afterHydration, unsavedBadgeAfterHydration: badge > 0, sent, stored });
    console.log(JSON.stringify(results[results.length - 1]));
    await ctx.close();
  }
  await browser.close();
  require("fs").writeFileSync(`${__dirname}/out/prehydrate-${mode}.json`, JSON.stringify(results, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
