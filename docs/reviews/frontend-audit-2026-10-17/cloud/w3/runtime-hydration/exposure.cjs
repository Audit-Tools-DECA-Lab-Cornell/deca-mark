// Window between "the editable control is painted" and "React has hydrated it / a React handler responds", under the earlier throttled profile
// (CDP: 150 ms latency, 1.6 Mbps down, 750 Kbps up, 4x CPU). usage: node exposure.cjs <settings|site|signin|editor> <cold|warm|both> [n]
const c = require("./common.cjs");
const which = process.argv[2], temp = process.argv[3] || "both", N = Number(process.argv[4] || 3);
const P = c.projectPath;
const cfg = {
  settings: { role: "manager", path: P + "/settings", target: "textarea", probe: "archive" },
  site: { role: "manager", path: P + "/sites/fall-creek", target: "button.edit-details", targetFn: "[...document.querySelectorAll('button')].find(b=>/^edit details/i.test(b.textContent))", probe: "edit" },
  signin: { role: null, path: "/sign-in", target: "#sign-in-email" },
  editor: { role: "manager", path: P + "/forms/versions/workspace-check-v2", target: "input", targetFn: "[...document.querySelectorAll('input')].find(i=>i.labels&&i.labels[0]&&/^question label/i.test(i.labels[0].textContent))" },
}[which];
const INIT = (cfg) => {
  const m = window.__m = {}; const mark = (k) => { if (m[k] === undefined) m[k] = Math.round(performance.now()); };
  const find = () => cfg.targetFn ? (0, eval)(cfg.targetFn) : document.querySelector(cfg.target);
  let seen = false;
  const iv = setInterval(() => {
    const el = find();
    if (el && !seen) { seen = true; mark("targetInDOM"); requestAnimationFrame(() => requestAnimationFrame(() => mark("targetPainted_rAF2"))); }
    if (el && Object.keys(el).some(k => k.startsWith("__reactProps$"))) mark("targetHasReactProps");
    if (cfg.probe && !m.firstHandlerResponse) {
      const btn = [...document.querySelectorAll("button")].find(b => cfg.probe === "archive" ? /^archive project/i.test(b.textContent) : /^edit details/i.test(b.textContent));
      if (btn) { btn.click(); if (document.querySelector("[role=dialog]")) mark("firstHandlerResponse"); }
    }
    if (m.targetHasReactProps && (m.firstHandlerResponse || !cfg.probe)) clearInterval(iv);
  }, 10);
  for (const [proto, name] of [[HTMLTextAreaElement.prototype, "defaultValue"], [HTMLInputElement.prototype, "defaultValue"]]) { const d = Object.getOwnPropertyDescriptor(proto, name); Object.defineProperty(proto, name, { ...d, set(v) { if (!m.firstDefaultValueWrite) { const t = find(); if (!t || t === this) mark("firstDefaultValueWrite(controlled-field hydrated)"); } return d.set.call(this, v); } }); }
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") mark("FCP"); }).observe({ type: "paint", buffered: true });
};
(async () => {
  const browser = await c.launch(); const rows = [];
  async function sample(ctx, label) {
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
    if (!process.env.NT) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
    await page.addInitScript(INIT, { target: cfg.target, targetFn: cfg.targetFn, probe: cfg.probe });
    const t0 = Date.now(); await page.goto(c.BASE + cfg.path, { waitUntil: "commit", timeout: 90000 });
    let m = {}; for (let t = 0; t < 900; t++) { m = await page.evaluate(() => window.__m).catch(() => ({})) || {}; if (m.targetHasReactProps && (m.firstHandlerResponse || !cfg.probe)) break; await page.waitForTimeout(100); }
    const loadMs = Date.now() - t0;
    const row = { label, ...m, ms_paint_to_react_props: m.targetHasReactProps - m.targetPainted_rAF2, ms_paint_to_first_handler: cfg.probe ? m.firstHandlerResponse - m.targetPainted_rAF2 : undefined };
    rows.push(row); console.log(which, JSON.stringify(row)); await page.close();
  }
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ ...(cfg.role ? { storageState: c.authFile(cfg.role) } : {}), viewport: { width: 1440, height: 900 } });
    if (temp !== "warm") await sample(ctx, `cold#${i + 1}`);
    if (temp !== "cold") { if (temp === "warm") await sample(ctx, `(prime)`); rows.pop && 0; await sample(ctx, `warm#${i + 1}`); }
    await ctx.close();
  }
  require("fs").writeFileSync(`${__dirname}/out/exposure-${which}${process.env.NT ? "-unthrottled" : ""}.json`, JSON.stringify(rows, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
