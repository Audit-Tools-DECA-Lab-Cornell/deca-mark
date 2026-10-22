// Is there a stuck-dirty / stuck-pending state a person can reach? Fail the Server Action POST (network drop, 500, never answers) and look at the UI.
const c = require("./common.cjs");
(async () => {
  const browser = await c.launch(); const out = {};
  for (const mode of ["network-drop", "http-500", "never-answers-8s"]) {
    await c.setDescription(`OLD-fail`);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e.message).slice(0, 120)));
    await page.goto(c.BASE + c.projectPath + "/settings");
    await page.waitForFunction(() => { const e = document.querySelector("textarea"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }); await page.waitForTimeout(400);
    await page.route("**/*", async route => { const rq = route.request(); if (rq.method() === "POST" && rq.headers()["next-action"]) { if (mode === "network-drop") await route.abort("connectionreset"); else if (mode === "http-500") await route.fulfill({ status: 500, body: "x" }); else { await new Promise(r => setTimeout(r, 8000)); await route.abort(); } } else await route.continue(); });
    await page.getByLabel(/^description/i).first().fill(`typed text that must not be lost`);
    await page.getByRole("button", { name: /^save/i }).first().click();
    await page.waitForTimeout(mode === "never-answers-8s" ? 3000 : 2500);
    const snap = async () => page.evaluate(() => ({ heading: document.querySelector("h1")?.textContent, textarea: document.querySelector("textarea")?.value ?? null, unsaved: document.body.innerText.includes("Unsaved changes"), fieldsetDisabled: !!document.querySelector("fieldset[disabled]"), saveBusy: document.querySelector("button[type=submit]")?.getAttribute("aria-busy"), bodyStart: document.body.innerText.slice(0, 0), alert: [...document.querySelectorAll("[role=alert]")].map(e => e.textContent.trim().slice(0, 120)).filter(Boolean) }));
    const a = await snap();
    let b = null; if (mode === "never-answers-8s") { await page.waitForTimeout(7000); b = await snap(); }
    out[mode] = { at2_5s: a, after15s: b, pageerrors: errs };
    console.log(mode, JSON.stringify(out[mode])); await ctx.close();
  }
  require("fs").writeFileSync(`${__dirname}/out/save-failure.json`, JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
