// Release the held Server Action response at an offset (ms) after the beforeunload dialog is accepted, to see which reload outcomes the
// action-completion race produces: reloaded / fast ERR_ABORTED / hang until timeout.
const c = require("./common.cjs");
(async () => {
  const browser = await c.launch(); const out = [];
  for (const off of [-20, -10, -5, 0, 3, 8, 15, 30, 60]) for (let rep = 0; rep < 3; rep++) {
    await c.setDescription(`OLD-ph`);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send("Page.enable");
    await page.goto(c.BASE + c.projectPath + "/settings");
    await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }); await page.waitForTimeout(400);
    let release; const gate = new Promise(r => (release = r)); let armed = false;
    await page.route("**/*", async route => { const rq = route.request(); if (armed && rq.method() === "POST" && rq.headers()["next-action"]) { const resp = await route.fetch(); await gate; await route.fulfill({ response: resp }); } else await route.continue(); });
    cdp.on("Page.javascriptDialogOpening", () => { if (off >= 0) setTimeout(() => release(), off); });
    await page.getByLabel(/^description/i).first().fill(`NEW-ph`); armed = true;
    await page.getByRole("button", { name: /^save/i }).first().click();
    while ((await c.getProject()).description !== `NEW-ph`) await new Promise(r => setTimeout(r, 10));
    if (off < 0) setTimeout(() => release(), 0);          // release the action before the reload is even called
    const t = Date.now(); let res = "reloaded", note = "";
    const reloadP = page.reload({ timeout: 7000 }).catch(e => { res = String(e.message).includes("ERR_ABORTED") ? "ERR_ABORTED(fast)" : "HANG->timeout"; });
    if (off < 0) setTimeout(() => {}, 0);
    await reloadP; const ms = Date.now() - t; out.push({ off, rep, res, ms }); console.log(off, rep, res, ms + "ms"); await ctx.close();
  }
  require("fs").writeFileSync(`${__dirname}/out/reload-phase.json`, JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
