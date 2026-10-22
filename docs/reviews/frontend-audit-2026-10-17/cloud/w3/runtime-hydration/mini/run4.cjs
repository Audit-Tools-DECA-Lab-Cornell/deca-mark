// Fix candidates in the minimal app: (1) uncontrolled defaultValue, (2) disabled until hydrated. Same two scenarios as before.
const http = require("http"), fs = require("fs");
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const html = `<!doctype html><meta charset=utf-8><body><div id=root><div><input id=n value="OLDNAME"><textarea id=t>OLD</textarea></div></div><script src="/bundle.js" defer></script>`;
const htmlRO = html.replace('<input id=n value="OLDNAME"><textarea id=t>OLD</textarea>', '<input id=n value="OLDNAME" readonly><textarea id=t readonly>OLD</textarea>');
const htmlDisabled = html.replace('<input id=n value="OLDNAME"><textarea id=t>OLD</textarea>', '<input id=n value="OLDNAME" disabled><textarea id=t disabled>OLD</textarea>');
const srv = http.createServer((q, s) => { if (q.url.startsWith("/bundle.js")) { s.setHeader("content-type", "text/javascript"); s.end(fs.readFileSync(__dirname + "/bundle.js")); } else { s.setHeader("content-type", "text/html"); s.end(q.url.includes("v=disabled") ? htmlDisabled : q.url.includes("v=readonly") ? htmlRO : html); } }).listen(0, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${srv.address().port}/`; const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const out = {};
  async function open(v) { const ctx = await b.newContext(); const p = await ctx.newPage(); let release; const gate = new Promise(r => (release = r)); await p.route("**/bundle.js", async r => { await gate; r.continue(); }); p.goto(base + "?v=" + v, { waitUntil: "commit" }).catch(() => {}); await p.waitForSelector("#t"); return { ctx, p, release }; }
  const hydrated = p => p.waitForFunction(() => Object.keys(document.getElementById("t")).some(k => k.startsWith("__reactProps$"))).then(() => p.waitForTimeout(250));
  const dom = p => p.evaluate(() => ({ textarea: document.getElementById("t").value, input: document.getElementById("n").value }));
  for (const v of ["readonly"]) {
    const r = {};
    { const { ctx, p, release } = await open(v);   // S1: user types in both fields before hydration, then hydration completes (Playwright type via keyboard where possible)
      await p.locator("#t").click({ timeout: 1500 }).catch(() => (r.note1 = "textarea not clickable/focusable pre-hydration (disabled)"));
      await p.keyboard.press("Control+A"); await p.keyboard.type("typed-ta");
      await p.locator("#n").click({ timeout: 1500 }).catch(() => {}); await p.keyboard.press("Control+A"); await p.keyboard.type("typed-in");
      r.beforeHydration = await dom(p); release(); await hydrated(p); await p.locator("#n").focus(); await p.keyboard.type("!"); r.afterHydrationPlusOneKeystrokeInInput = await dom(p); await ctx.close(); }
    { const { ctx, p, release } = await open(v);   // S2: Playwright fill racing hydration (fill step 1, hydration, step 2); fill() itself auto-waits for enabled
      const el = p.locator("#t"); setTimeout(() => release(), 150);
      let fillResult = "ok"; await el.fill("NEW", { timeout: 5000 }).catch(e => (fillResult = "fill failed: " + String(e.message).split("\n")[0]));
      await hydrated(p); await p.waitForTimeout(200); r.fillRacingHydration = { fillResult, ...(await dom(p)) }; await ctx.close(); }
    { const { ctx, p, release } = await open(v);   // S3: forced split (select-all, hydrate, insertText) — works only if the field can take focus pre-hydration
      const focused = await p.locator("#t").focus({ timeout: 800 }).then(() => true).catch(() => false);
      if (focused) { await p.evaluate(() => document.getElementById("t").select()); release(); await hydrated(p); await p.keyboard.insertText("NEW"); await p.waitForTimeout(200); r.forcedSplit = (await dom(p)).textarea; } else { r.forcedSplit = "not reachable: field cannot take focus before hydration"; release(); }
      await ctx.close(); }
    out[v] = r;
  }
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(__dirname + "/../out/minimal-fix-readonly.json", JSON.stringify(out, null, 1)); await b.close(); srv.close();
});
