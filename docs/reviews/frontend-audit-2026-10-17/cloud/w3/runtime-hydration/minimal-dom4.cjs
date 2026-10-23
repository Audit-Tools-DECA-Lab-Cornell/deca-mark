const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage(); const out = {};
  for (const [label, html] of Object.entries({ "textarea only": `<textarea id=t>OLD</textarea>`, "textarea + input after": `<textarea id=t>OLD</textarea><input id=i value=OLD>` })) {
    for (const first of [true, false]) {
      await p.setContent(html);
      if (first) { await p.evaluate(() => document.getElementById("t").focus()); }
      await p.evaluate(() => document.getElementById("t").select());
      await p.evaluate(() => { document.getElementById("t").defaultValue = "OLD"; });
      await p.keyboard.insertText("NEW");
      out[label + (first ? " / evaluate-focus" : " / no focus call")] = await p.evaluate(() => document.getElementById("t").value);
    }
  }
  console.log(JSON.stringify(out, null, 1)); await b.close();
})();
