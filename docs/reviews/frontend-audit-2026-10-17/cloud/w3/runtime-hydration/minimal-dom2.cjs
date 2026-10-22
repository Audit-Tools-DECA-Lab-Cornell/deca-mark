const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const sel = () => p.evaluate(() => { const t = document.getElementById("t"); return [t.selectionStart, t.selectionEnd, t.value]; });
  const out = {};
  for (const [label, html] of Object.entries({
    plain: `<textarea id=t>OLD</textarea>`,
    "with-maxlength": `<textarea id=t maxlength=1000>OLD</textarea>`,
    "streamed-via-template-swap": `<div id=slot></div><template id=tpl><textarea id=t>OLD</textarea></template><script>document.getElementById('slot').replaceWith(document.getElementById('tpl').content)</script>`,
  })) {
    await p.setContent(html);
    await p.focus("#t");
    await p.evaluate(() => document.getElementById("t").select());
    const a = await sel();
    await p.evaluate(() => { document.getElementById("t").defaultValue = "OLD"; });
    const b2 = await sel();
    await p.evaluate(() => { const t = document.getElementById("t"); t.value = t.textContent; });
    const c = await sel();
    await p.keyboard.insertText("NEW");
    out[label] = { afterSelect: a, afterDefaultValueWrite: b2, afterValueWrite: c, afterInsertText: (await sel())[2] };
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
