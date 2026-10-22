const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const get = () => p.evaluate(() => { const t = document.getElementById("t"); return [t.selectionStart, t.selectionEnd, t.value]; });
  const out = {};
  async function run(label, focusFirst, steps) {
    await p.setContent(`<textarea id=t>OLD</textarea>`);
    if (focusFirst) await p.focus("#t");
    await p.evaluate(() => document.getElementById("t").select());
    const log = [await get()];
    for (const s of steps) { await p.evaluate(s); log.push(await get()); }
    await p.keyboard.insertText("NEW");
    out[label] = { log, final: (await get())[2] };
  }
  const dv = () => { document.getElementById("t").defaultValue = "OLD"; };
  const val = () => { const t = document.getElementById("t"); t.value = t.textContent; };
  await run("focused, defaultValue then value", true, [dv, val]);
  await run("NOT focused (select() only), defaultValue then value", false, [dv, val]);
  await run("focused, value only", true, [val]);
  await run("focused, defaultValue only", true, [dv]);
  console.log(JSON.stringify(out));
  await b.close();
})();
