// The Project name <input> (controlled TextInput) on the same page: type before hydration, then hydrate, then Save.
const c = require("./common.cjs");
const N = Number(process.argv[2] || 5);
(async () => {
  const browser = await c.launch(); const results = [];
  const original = await c.getProject();
  for (let i = 0; i < N; i++) {
    await c.setDescription(`DESC-${i}`);
    const ctx = await browser.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const gate = await c.gateChunks(ctx);
    const sent = []; page.on("request", r => { if (r.method() === "POST" && r.headers()["next-action"]) sent.push((r.postData() || "").slice(0, 300)); });
    await page.goto(c.BASE + c.projectPath + "/settings", { waitUntil: "commit" });
    const name = page.getByLabel(/^project name/i).first(); await name.waitFor({ state: "visible" });
    const typed = `Typed name ${i}`;
    await name.fill(typed);                                   // before hydration
    gate.release();
    await page.waitForFunction(() => { const e = document.querySelector("input[id$='-name']"); return e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }, null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const r = { i, typed, fieldAfterHydration: await name.inputValue(), unsavedBadge: (await page.getByText("Unsaved changes").count()) > 0 };
    // Save with nothing else changed
    await page.getByRole("button", { name: /^save/i }).first().click(); await page.waitForTimeout(800);
    r.messageAfterSave1 = (await page.getByRole("status").first().innerText()).trim();
    // now change the description after hydration and save
    const desc = page.getByLabel(/^description/i).first(); await desc.fill(`DESC-after-${i}`);
    await page.getByRole("button", { name: /^save/i }).first().click(); await page.waitForTimeout(2500);
    const p2 = await c.getProject();
    r.sentSecondSave = sent.map(s => s.replace(/\s+/g, " ")).slice(-1);
    r.fieldAfterSecondSave = await name.inputValue(); r.storedName = p2.name; r.storedDescription = p2.description;
    r.toast = (await page.getByText("Project settings saved.").count()) > 0;
    results.push(r); console.log(JSON.stringify(r));
    await ctx.close();
    await c.api("manager", "PATCH", `/v1/projects/${c.manifest.projectId}`, { name: original.name, description: original.description });
  }
  await browser.close();
  require("fs").writeFileSync(`${__dirname}/out/prehydrate-name.json`, JSON.stringify(results, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
