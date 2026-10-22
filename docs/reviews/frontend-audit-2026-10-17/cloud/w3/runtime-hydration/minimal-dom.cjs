// Minimal DOM experiment: no React, no server. Replays the two writes react-dom's initTextarea does at hydration
// (element.defaultValue = V; then element.value = element.textContent) between Playwright's fill steps (select, insertText).
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const html = `<textarea id=t>OLD</textarea><input id=i value=OLD>`;
  const out = {};
  async function trial(label, between, prep) {
    await p.setContent(html);
    await p.evaluate(() => { const t = document.getElementById("t"); t.focus(); });
    if (prep) await prep();
    await p.evaluate(() => document.getElementById("t").select());           // fill step 1
    if (between) await p.evaluate(between);                                  // the hydration writes
    await p.keyboard.insertText("NEW");                                      // fill step 2
    out[label] = await p.evaluate(() => { const t = document.getElementById("t"); return { value: t.value, selStart: t.selectionStart, selEnd: t.selectionEnd }; });
  }
  const react = () => { const t = document.getElementById("t"); t.defaultValue = "OLD"; if (t.textContent === "OLD" && t.textContent !== "") t.value = t.textContent; };
  await trial("A_no_hydration_write", null);
  await trial("B_react_initTextarea_writes", react);
  await trial("C_only_defaultValue_set", () => { document.getElementById("t").defaultValue = "OLD"; });
  await trial("D_only_value_set_same", () => { const t = document.getElementById("t"); t.value = t.value; });
  // user already typed (dirty) before the hydration writes, caret after typing:
  await p.setContent(html);
  await p.focus("#t"); await p.keyboard.press("Control+A"); await p.keyboard.type("typed-by-user");
  await p.evaluate(react);
  out["E_dirty_then_react_writes"] = await p.evaluate(() => { const t = document.getElementById("t"); return { value: t.value, selStart: t.selectionStart }; });
  // input element: react's hydrating initInput does NOT write value
  await p.setContent(html);
  await p.focus("#i"); await p.keyboard.press("Control+A"); await p.keyboard.type("typed-by-user");
  await p.evaluate(() => { const i = document.getElementById("i"); i.defaultValue = "OLD"; /* isHydrating: value not written */ });
  out["F_input_dirty_then_react_hydrating_initInput"] = await p.evaluate(() => document.getElementById("i").value);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
