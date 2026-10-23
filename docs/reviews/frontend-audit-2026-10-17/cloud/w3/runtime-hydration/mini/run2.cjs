// Which of initTextarea's two writes collapses the selection? Neutralise each in turn (init script) and repeat select-all / hydrate / insertText.
const http = require("http"), fs = require("fs");
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const html = `<!doctype html><meta charset=utf-8><body><div id=root><textarea id=t>OLD</textarea></div><script src="/bundle.js" defer></script>`;
const srv = http.createServer((q, s) => { if (q.url === "/bundle.js") { s.setHeader("content-type", "text/javascript"); s.end(fs.readFileSync(__dirname + "/bundle.js")); } else { s.setHeader("content-type", "text/html"); s.end(html); } }).listen(0, "127.0.0.1", async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`; const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const out = {};
  const variants = {
    "unpatched": "",
    "defaultValue setter = no-op": `Object.defineProperty(HTMLTextAreaElement.prototype,'defaultValue',{...Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'defaultValue'),set(v){window.__dv=(window.__dv||0)+1}})`,
    "value setter = no-op": `{const d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value'); Object.defineProperty(HTMLTextAreaElement.prototype,'value',{...d,set(v){window.__vs=(window.__vs||0)+1}})}`,
  };
  for (const [label, init] of Object.entries(variants)) {
    const res = [];
    for (let k = 0; k < 4; k++) {
      const ctx = await b.newContext(); const p = await ctx.newPage(); if (init) await p.addInitScript(init);
      let release; const gate = new Promise(r => (release = r)); await p.route("**/bundle.js", async r => { await gate; r.continue(); });
      p.goto(url, { waitUntil: "commit" }).catch(() => {}); await p.waitForSelector("#t");
      await p.focus("#t"); await p.evaluate(() => document.getElementById("t").select());
      release(); await p.waitForFunction(() => Object.keys(document.getElementById("t")).some(k => k.startsWith("__reactProps$")));
      await p.keyboard.insertText("NEW"); await p.waitForTimeout(150);
      res.push(await p.evaluate(() => ({ dom: document.getElementById("t").value, dvCalls: window.__dv || 0, valueSetterCalls: window.__vs || 0 }))); await ctx.close();
    }
    out[label] = res.map(r => `${r.dom} (defaultValue= calls ${r.dvCalls}, value= calls ${r.valueSetterCalls})`);
  }
  console.log(JSON.stringify(out, null, 1)); await b.close(); srv.close();
});
