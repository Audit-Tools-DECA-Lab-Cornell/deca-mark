// No selection reads between the writes (reads were perturbing the earlier variant).
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); const out = {};
  const variants = {
    "defaultValue= only": () => { document.getElementById("t").defaultValue = "OLD"; },
    "value= only (same value)": () => { const t = document.getElementById("t"); t.value = t.textContent; },
    "react initTextarea order: defaultValue= then value=": () => { const t = document.getElementById("t"); t.defaultValue = "OLD"; if (t.textContent === "OLD") t.value = t.textContent; },
    "defaultValue= then a selectionStart read": () => { const t = document.getElementById("t"); t.defaultValue = "OLD"; void t.selectionStart; },
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
