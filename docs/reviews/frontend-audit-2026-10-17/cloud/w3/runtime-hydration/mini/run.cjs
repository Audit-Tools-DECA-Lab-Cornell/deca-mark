// Real react-dom (Next's compiled 19.3.0-canary) hydrating <textarea value={state}> / <input value={state}>, hydration gated.
const http = require("http"), fs = require("fs");
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const html = `<!doctype html><meta charset=utf-8><body><div id=root><textarea id=t>OLD</textarea></div><script src="/bundle.js" defer></script>`;
const srv = http.createServer((q, s) => { if (q.url === "/bundle.js") { s.setHeader("content-type", "text/javascript"); s.end(fs.readFileSync(__dirname + "/bundle.js")); } else { s.setHeader("content-type", "text/html"); s.end(html); } }).listen(0, "127.0.0.1", async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const out = {};
  async function open() {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    let release; const gate = new Promise(r => (release = r));
    await p.route("**/bundle.js", async r => { await gate; r.continue(); });
    p.goto(url, { waitUntil: "commit" }).catch(() => {});
    await p.waitForSelector("#t");
    return { ctx, p, release };
  }
  const hydrated = p => p.waitForFunction(() => window.__state !== undefined && Object.keys(document.getElementById("t")).some(k => k.startsWith("__reactProps$")));
  const read = p => p.evaluate(() => ({ dom: document.getElementById("t").value, reactState: window.__state, onChangeCalls: window.__onChange || 0 }));
  // 1. type before hydration, then hydrate
  { const { ctx, p, release } = await open(); await p.focus("#t"); await p.keyboard.press("Control+A"); await p.keyboard.type("typed-before-hydration");
    const before = await read(p); release(); await hydrated(p); await p.waitForTimeout(300);
    out["1 typed before hydration"] = { beforeHydration: before.dom, after: await read(p) }; await ctx.close(); }
  // 2. fill's two steps with hydration between them (select-all, hydrate, insertText)
  const res2 = [];
  for (let k = 0; k < 5; k++) { const { ctx, p, release } = await open(); await p.focus("#t"); await p.evaluate(() => document.getElementById("t").select());
    release(); await hydrated(p); await p.keyboard.insertText("NEW"); await p.waitForTimeout(200); res2.push(await read(p)); await ctx.close(); }
  out["2 select-all, hydrate, insertText (Playwright fill split at its two steps) x5"] = res2;
  // 3. control: hydrate first, then fill-equivalent
  { const { ctx, p, release } = await open(); release(); await hydrated(p); await p.focus("#t"); await p.evaluate(() => document.getElementById("t").select()); await p.keyboard.insertText("NEW"); await p.waitForTimeout(200);
    out["3 control: hydrate, select-all, insertText"] = await read(p); await ctx.close(); }
  out.react = await (async () => { const { ctx, p, release } = await open(); release(); await hydrated(p); const v = await p.evaluate(() => window.__REACT_VERSION); await ctx.close(); return v; })();
  console.log(JSON.stringify(out, null, 1)); await b.close(); srv.close();
});
