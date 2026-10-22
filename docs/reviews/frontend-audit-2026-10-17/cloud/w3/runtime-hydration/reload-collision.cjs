// Deterministic: hold the Server Action response (H ms) AND hold the reload's document response (R ms) so that the action
// result lands while the reload navigation is pending. Logs history.pushState/replaceState and navigation events.
const c = require("./common.cjs");
const mode = process.argv[2] || "collide"; // collide | actionFirst | reloadFirst
(async () => {
  const browser = await c.launch(); const out = [];
  for (let i = 0; i < 4; i++) {
    await c.setDescription(`OLD-col-${i}`);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { window.__hist = []; for (const m of ["pushState", "replaceState"]) { const f = history[m]; history[m] = function (...a) { window.__hist.push({ m, t: Math.round(performance.now()) }); sessionStorage.setItem("__hist", JSON.stringify(window.__hist)); return f.apply(this, a); }; } });
    const page = await ctx.newPage(); const T0 = Date.now(); const ev = []; const L = (k, x) => ev.push(`${Date.now() - T0}:${k}${x ? "(" + x + ")" : ""}`);
    const cdp = await ctx.newCDPSession(page); await cdp.send("Page.enable"); cdp.on("Page.javascriptDialogOpening", e => L("dialogOpening", e.type)); cdp.on("Page.javascriptDialogClosed", e => L("dialogClosed", e.result));
    page.on("requestfailed", r => L("requestfailed", (r.failure() || {}).errorText)); page.on("load", () => L("load")); page.on("framenavigated", f => f === page.mainFrame() && L("framenavigated"));
    await page.goto(c.BASE + c.projectPath + "/settings");
    await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }); await page.waitForTimeout(400);
    let armed = false, releaseAction;
    const actionGate = new Promise(r => (releaseAction = r));
    await page.route("**/*", async route => {
      const rq = route.request();
      if (armed && rq.method() === "POST" && rq.headers()["next-action"]) { const resp = await route.fetch(); L("actionServerDone-holding"); await actionGate; L("actionResponseReleased"); await route.fulfill({ response: resp }); }
      else if (armed && rq.resourceType() === "document" && rq.method() === "GET") { L("reloadDocRequest-holding"); const resp = await route.fetch(); await new Promise(r => setTimeout(r, 1500)); L("reloadDocResponseReleased"); await route.fulfill({ response: resp }); }
      else await route.continue();
    });
    await page.getByLabel(/^description/i).first().fill(`NEW-col-${i}`); armed = true;
    await page.getByRole("button", { name: /^save/i }).first().click(); L("clickDone");
    while ((await c.getProject()).description !== `NEW-col-${i}`) await new Promise(r => setTimeout(r, 15));
    L("apiStored");
    setTimeout(() => releaseAction(), 700);   // the action result lands 700 ms into the pending reload (reload doc response is held 1500 ms)
    let result = "reloaded", err = ""; const tr = Date.now(); L("reloadCalled");
    try { await page.reload({ timeout: 10000 }); } catch (e) { result = "FAILED after " + (Date.now() - tr) + " ms"; err = String(e.message).split("\n")[0]; }
    L("reloadReturned", result);
    await page.waitForTimeout(500);
    const hist = await page.evaluate(() => sessionStorage.getItem("__hist")).catch(() => null);
    const row = { i, result, err, events: ev, historyCallsInLastDocument: hist }; out.push(row); console.log(JSON.stringify(row)); await ctx.close();
  }
  require("fs").writeFileSync(`${__dirname}/out/reload-collision-${mode}.json`, JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
