// (a) natural: after Save click, when does the API show the value vs when does the browser's save finish (action response; toast)?
// (b) forced: hold the Server Action response for 3 s; once the API has the value call page.reload() (as the e2e test does).
const c = require("./common.cjs");
(async () => {
  const browser = await c.launch(); const out = { natural: [], forced: [] };
  for (let i = 0; i < 10; i++) {
    await c.setDescription(`OLD-win-${i}`);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(c.BASE + c.projectPath + "/settings");
    await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); });
    await page.waitForTimeout(500);
    const field = page.getByLabel(/^description/i).first(); await field.fill(`NEW-win-${i}`);
    let tResp = null, tReq = null;
    page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"] && !tReq) tReq = Date.now(); });
    page.on("response", r => { if (r.request().method() === "POST" && r.request().headers()["next-action"] && !tResp) tResp = Date.now(); });
    const t0 = Date.now(); await page.getByRole("button", { name: /^save/i }).first().click();
    let tStored = null; while (Date.now() - t0 < 8000) { if ((await c.getProject()).description === `NEW-win-${i}`) { tStored = Date.now(); break; } await new Promise(r => setTimeout(r, 10)); }
    await page.getByText("Project settings saved.", { exact: true }).waitFor({ timeout: 8000 }); const tToast = Date.now();
    out.natural.push({ i, storedMs: tStored - t0, actionRequestMs: tReq - t0, actionResponseHeadersMs: tResp - t0, toastMs: tToast - t0, windowStoredToToast: tToast - tStored });
    console.log("natural", JSON.stringify(out.natural.at(-1)));
    await ctx.close();
  }
  for (const mode of ["dialog-listener", "no-listener"]) {
    for (let i = 0; i < 3; i++) {
      await c.setDescription(`OLD-forced-${mode}-${i}`);
      const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage(); const dialogs = [];
      if (mode === "dialog-listener") page.on("dialog", d => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
      await page.route(r => true && false, () => {});
      await page.goto(c.BASE + c.projectPath + "/settings");
      await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }); await page.waitForTimeout(500);
      await page.route("**/*", async route => { const rq = route.request(); if (rq.method() === "POST" && rq.headers()["next-action"]) { const resp = await route.fetch(); await new Promise(r => setTimeout(r, 3000)); await route.fulfill({ response: resp }); } else await route.continue(); });
      const field = page.getByLabel(/^description/i).first(); await field.fill(`NEW-forced-${mode}-${i}`);
      await page.getByRole("button", { name: /^save/i }).first().click();
      const t0 = Date.now(); while ((await c.getProject()).description !== `NEW-forced-${mode}-${i}`) await new Promise(r => setTimeout(r, 20));
      const stored = Date.now() - t0;
      const state = await page.evaluate(() => ({ saving: !!document.querySelector("button[aria-busy='true'], fieldset[disabled]"), badgeUnsaved: document.body.innerText.includes("Unsaved changes") }));
      const t1 = Date.now(); let result;
      try { await page.reload({ timeout: 8000 }); result = "reloaded"; } catch (e) { result = "reload TIMEOUT: " + String(e.message).split("\n")[0]; }
      const r = { mode, i, apiStoredAfterMs: stored, uiStateAtReload: state, reloadResult: result, reloadMs: Date.now() - t1, dialogs };
      // after the response arrives (3 s hold) does the page settle back to a clean state?
      await page.waitForTimeout(3500);
      r.afterHold = await page.evaluate(() => ({ unsaved: document.body.innerText.includes("Unsaved changes"), url: location.pathname, value: document.querySelector("textarea")?.value }));
      out.forced.push(r); console.log("forced", JSON.stringify(r)); await ctx.close();
    }
  }
  require("fs").writeFileSync(`${__dirname}/out/reload-window.json`, JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
