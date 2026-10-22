// The proposed test-only change (no product change): retry the fill until React has taken it (value correct AND "Unsaved changes" visible),
// then wait for the save to finish in the UI (toast) before polling the API and reloading.
const c = require("./common.cjs");
const N = Number(process.argv[2] || 40), VP = process.argv[3] === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
(async () => {
  const browser = await c.launch(); let fail = 0, retried = 0; const kinds = {};
  for (let i = 0; i < N; i++) {
    await c.setDescription(`OLD-fixed-${i}`); const desc = `NEW-fixed-${i}`;
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: VP }); const page = await ctx.newPage();
    try {
      await page.goto(c.BASE + c.projectPath + "/settings");
      const field = page.getByLabel(/^description/i).first(); let tries = 0, ok = false;
      for (; tries < 8 && !ok; tries++) { await field.fill(desc); try { await page.getByText("Unsaved changes").waitFor({ timeout: 700 }); if ((await field.inputValue()) === desc) ok = true; } catch {} }
      if (tries > 1) retried++;
      if (!ok) throw new Error("never took the text");
      await page.getByRole("button", { name: /^save/i }).first().click();
      await page.getByText("Project settings saved.", { exact: true }).waitFor({ timeout: 10000 });
      const t0 = Date.now(); let stored; while (Date.now() - t0 < 20000) { stored = (await c.getProject()).description; if (stored === desc) break; await new Promise(r => setTimeout(r, 100)); }
      if (stored !== desc) throw new Error("stored=" + stored);
      await page.reload({ timeout: 15000 });
      if ((await page.getByLabel(/^description/i).first().inputValue()) !== desc) throw new Error("reload value differs");
    } catch (e) { fail++; kinds[String(e.message).split("\n")[0].slice(0, 80)] = (kinds[String(e.message).split("\n")[0].slice(0, 80)] || 0) + 1; }
    await ctx.close();
  }
  console.log(`runs ${N}, failures ${fail}, runs that needed a fill retry ${retried}`, JSON.stringify(kinds)); await browser.close();
})();
