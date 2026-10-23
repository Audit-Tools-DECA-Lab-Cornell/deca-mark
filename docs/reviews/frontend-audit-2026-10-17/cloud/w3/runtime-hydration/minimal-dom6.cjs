const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); const out = {};
  const variants = {
    "defaultValue= then read .value": () => { const t = document.getElementById("t"); t.defaultValue = "OLD"; void t.value; },
    "react order + track-style .value read": () => { const t = document.getElementById("t"); t.defaultValue = "OLD"; if (t.textContent === "OLD") t.value = t.textContent; void t.value; },
    "react order, then 0ms task, then nothing": async () => { const t = document.getElementById("t"); t.defaultValue = "OLD"; if (t.textContent === "OLD") t.value = t.textContent; await new Promise(r => setTimeout(r, 0)); },
    "defaultValue= only, then rAF": async () => { document.getElementById("t").defaultValue = "OLD"; await new Promise(r => requestAnimationFrame(() => r())); },
  };
  for (const [label, fn] of Object.entries(variants)) {
    const res = [];
    for (let k = 0; k < 5; k++) {
      await p.setContent(`<textarea id=t>OLD</textarea>`);
      await p.evaluate(() => { const t = document.getElementById("t"); t.focus(); t.select(); });
      await p.evaluate(fn);
      await p.keyboard.insertText("NEW");
      res.push(await p.evaluate(() => document.getElementById("t").value));
    }
    out[label] = [...new Set(res)];
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
