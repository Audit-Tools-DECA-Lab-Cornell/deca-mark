// Read-only: 'Show the next 500' with the action POST failing. No write.
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const fs = require("fs");
const BASE = "http://127.0.0.1:3000";
const ZR = JSON.parse(fs.readFileSync("/home/user/deca-mark/database/.local/zone-review.json", "utf8")).path;
const STATE = "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/state/zr-manager.json";
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const out = {};
  for (const mode of ["abort", "offline"]) {
    const ctx = await b.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const ev = [];
    page.on("pageerror", e => ev.push("pageerror: " + String(e.message).slice(0, 140)));
    page.on("console", m => { if (m.type() === "error") ev.push("console.error: " + m.text().slice(0, 140)); });
    const r = await page.goto(BASE + ZR + "/data", { waitUntil: "load" });
    const more = page.getByRole("button", { name: /^Show the next \d+/i }).first();
    await more.waitFor({ timeout: 20000 });
    await more.evaluate(e => new Promise(res => { const t = setInterval(() => { if (Object.keys(e).some(k => k.startsWith("__reactProps$"))) { clearInterval(t); res(); } }, 50); }));
    const before = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (mode === "abort") await page.route("**/*", rt => (rt.request().method() === "POST" && rt.request().headers()["next-action"]) ? rt.abort("failed") : rt.continue());
    else await ctx.setOffline(true);
    await more.click();
    await page.waitForTimeout(3000);
    const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    out[mode] = {
      status: r.status(), url: page.url().replace(BASE, ""),
      boundary: /Something went wrong/.test(after),
      buttonStillThere: (await more.count()) > 0, buttonEnabled: (await more.count()) ? await more.isEnabled() : null,
      nothingMoreMsg: /Nothing more was loaded|Check the connection/.test(after),
      sameText: before === after, events: ev,
    };
    console.log(mode, JSON.stringify(out[mode]));
    await ctx.close();
  }
  fs.writeFileSync(`${__dirname}/out/loadmore.json`, JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
