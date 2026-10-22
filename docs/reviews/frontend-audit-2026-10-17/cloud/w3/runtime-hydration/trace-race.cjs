// usage: node trace-race.cjs <natural|gate> <n>   natural = test-like goto('load') then fill; gate = release chunks at random offset around fill
const c = require("./common.cjs");
const mode = process.argv[2], N = Number(process.argv[3] || 10);
const INIT = () => {
  window.__log = []; const T0 = performance.now(); const L = (op, extra) => window.__log.push({ t: Math.round(performance.now() - T0), op, ...extra });
  const TA = HTMLTextAreaElement.prototype;
  const wrap = (proto, name, kind) => { const d = Object.getOwnPropertyDescriptor(proto, name); if (!d) return;
    if (kind === "set") Object.defineProperty(proto, name, { ...d, set(v) { L(name + "=", { v: String(v).slice(0, 60), sel: [this.selectionStart, this.selectionEnd], cur: this.value.slice(0, 60) }); return d.set.call(this, v); } });
    else { const f = d.value; Object.defineProperty(proto, name, { ...d, value(...a) { L(name + "()", { a: a.slice(0, 3), curLen: this.value.length }); return f.apply(this, a); } }); } };
  wrap(TA, "value", "set"); wrap(TA, "defaultValue", "set"); wrap(TA, "textContent", "set");
  wrap(TA, "select", "fn"); wrap(TA, "setSelectionRange", "fn");
  for (const ev of ["beforeinput", "input"]) document.addEventListener(ev, e => { if (e.target instanceof HTMLTextAreaElement) L(ev, { inputType: e.inputType, data: e.data && e.data.slice(0, 30), val: e.target.value.slice(0, 80), sel: [e.target.selectionStart, e.target.selectionEnd] }); }, true);
  document.addEventListener("focusin", e => L("focusin", { tag: e.target.tagName }), true);
  const iv = setInterval(() => { const e = document.querySelector("textarea"); if (e && Object.keys(e).some(k => k.startsWith("__reactProps$"))) { L("HYDRATED(textarea has react props)"); clearInterval(iv); } }, 2);
};
(async () => {
  const browser = await c.launch(); const out = []; let bad = 0;
  for (let i = 0; i < N; i++) {
    const OLD = `OLD-${mode}-${i}`, NEW = `NEW-${mode}-${i}`;
    await c.setDescription(OLD);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const posts = []; page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"]) posts.push(Date.now()); });
    let gate = null;
    if (mode === "gate") gate = await c.gateChunks(ctx);
    const url = c.BASE + c.projectPath + "/settings";
    if (mode === "natural") await page.goto(url);
    else { await page.goto(url, { waitUntil: "commit" }); }
    const field = page.getByLabel(/^description/i).first();
    let delay = null;
    if (mode === "gate") { await field.waitFor({ state: "visible" }); delay = Math.floor(Math.random() * 40); setTimeout(() => gate.release(), delay); }
    await field.fill(NEW);
    await page.getByRole("button", { name: /^save/i }).first().click();
    await page.waitForTimeout(2500);
    const stored = (await c.getProject()).description;
    const log = await page.evaluate(() => window.__log);
    const final = await field.inputValue().catch(() => "?");
    const r = { i, OLD, NEW, delay, stored, final, ok: stored === NEW, kind: stored === NEW ? "ok" : stored === OLD ? "lost" : stored === NEW + OLD ? "NEW+OLD" : "other", log };
    if (!r.ok) bad++;
    out.push(r); console.log(i, r.kind, delay ?? "", JSON.stringify(stored));
    await ctx.close();
  }
  console.log(`non-ok ${bad}/${N}`);
  require("fs").writeFileSync(`${__dirname}/out/trace-${mode}.json`, JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
