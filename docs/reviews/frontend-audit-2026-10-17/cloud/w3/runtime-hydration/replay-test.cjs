// Standalone replica of e2e/settings.spec.ts with the SAME poll cadence ([100,250,500,1000] ms) and an observer-only CDP dialog probe
// (CDP events do not register a Playwright dialog handler, so Playwright's default beforeunload handling is unchanged).
const c = require("./common.cjs");
const N = Number(process.argv[2] || 20), VP = process.argv[3] === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
(async () => {
  const browser = await c.launch(); const out = [];
  for (let i = 0; i < N; i++) {
    await c.setDescription(`OLD-replay-${i}`);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: VP, locale: "en-US", timezoneId: "America/New_York" });
    const page = await ctx.newPage(); const ev = []; const T0 = Date.now(); const L = (k, x) => ev.push({ t: Date.now() - T0, k, ...x });
    const cdp = await ctx.newCDPSession(page); await cdp.send("Page.enable");
    cdp.on("Page.javascriptDialogOpening", e => L("dialogOpening", { type: e.type, hasBrowserHandler: e.hasBrowserHandler }));
    cdp.on("Page.javascriptDialogClosed", e => L("dialogClosed", { result: e.result }));
    page.on("request", r => { if (r.resourceType() === "document") L("docRequest", { m: r.method() }); else if (r.method() === "POST" && r.headers()["next-action"]) L("actionPOST"); });
    page.on("response", r => { if (r.request().resourceType() === "document") L("docResponse", { s: r.status() }); else if (r.request().method() === "POST" && r.request().headers()["next-action"]) L("actionResponse", { s: r.status() }); });
    page.on("requestfailed", r => L("requestfailed", { u: r.url().replace(/\?.*/, "").slice(-60), e: r.failure()?.errorText }));
    page.on("framenavigated", f => { if (f === page.mainFrame()) L("framenavigated"); });
    page.on("load", () => L("load"));
    const desc = `NEW-replay-${i}`;
    await page.goto(c.BASE + c.projectPath + "/settings");
    L("goto done");
    await page.getByLabel(/^description/i).first().fill(desc);
    L("fill done");
    await page.getByRole("button", { name: /^save/i }).first().click();
    L("click done");
    // expect.poll cadence
    const intervals = [100, 250, 500, 1000]; let k = 0, stored = null; const tp = Date.now();
    while (Date.now() - tp < 20000) { const d = (await c.getProject()).description; if (d === desc) { stored = d; break; } if (d !== `OLD-replay-${i}`) { stored = d; break; } await new Promise(r => setTimeout(r, intervals[Math.min(k++, 3)])); }
    L("poll done", { polls: k + 1, stored: stored === desc ? "NEW" : stored });
    let result = "reloaded"; const tr = Date.now();
    L("reload called");
    try { await page.reload({ timeout: 12000 }); /* hang variant: ends in timeout */ } catch (e) { result = "RELOAD FAILED: " + String(e.message).split("\n")[0].slice(0, 80); }
    L("reload returned", { result });
    let after = null; if (result === "reloaded") after = await page.getByLabel(/^description/i).first().inputValue();
    const state = await page.evaluate(() => ({ unsaved: document.body.innerText.includes("Unsaved changes"), saving: !!document.querySelector("fieldset[disabled]"), active: document.activeElement?.tagName + ":" + (document.activeElement?.textContent || "").slice(0, 20), toast: document.body.innerText.includes("Project settings saved.") })).catch(() => null);
    const row = { i, merged: stored !== desc, result, state, after, events: ev }; out.push(row);
    console.log(i, result, stored === desc ? "ok" : "stored=" + stored, JSON.stringify(state), "docEvents:", ev.filter(e => /doc|dialog|load|failed|reload/.test(e.k)).map(e => `${e.t}:${e.k}${e.type ? "(" + e.type + ")" : ""}${e.s ? "(" + e.s + ")" : ""}${e.result ? "(" + e.result + ")" : ""}`).join(" "));
    await ctx.close();
  }
  require("fs").writeFileSync(`${__dirname}/out/replay-${process.argv[3] || "desktop"}.json`, JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
