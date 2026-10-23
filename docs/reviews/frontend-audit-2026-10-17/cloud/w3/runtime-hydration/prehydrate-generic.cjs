// usage: node prehydrate-generic.cjs <signin|editor|account|datafilter|forgot|join> [n]
const c = require("./common.cjs");
const which = process.argv[2], N = Number(process.argv[3] || 3);
const cfg = {
  signin: { role: null, path: "/sign-in", fields: [["Email address", "typed.before@example.test"], ["Password", "not-a-real-password"]], submit: "Sign in" },
  editor: { role: "manager", path: c.projectPath + "/forms/versions/workspace-check-v2", fields: [["Question label", "Typed before hydration"]], submit: "Save draft" },
  account: { role: "manager", path: "/account", fields: [["Full name", "Typed Before Hydration"]], submit: "Save" },
  datafilter: { role: "manager", path: c.projectPath + "/data", fields: [["Observer", "typed-before"]], submit: null },
  forgot: { role: null, path: "/forgot-password", fields: [["Email address", "typed.before@example.test"]], submit: null },
  join: { role: "joiner", path: "/join", fields: [["Join code", "ABCD1234"]], submit: null },
}[which];
(async () => {
  const browser = await c.launch(); const results = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ ...(cfg.role ? { storageState: c.authFile(cfg.role) } : {}), viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const gate = await c.gateChunks(ctx); const posts = [];
    page.on("request", r => { if (r.method() === "POST") posts.push({ action: !!r.headers()["next-action"], len: (r.postData() || "").length }); });
    await page.goto(c.BASE + cfg.path, { waitUntil: "commit" });
    const loc = (label) => page.getByLabel(new RegExp("^" + label, "i")).first();
    await loc(cfg.fields[0][0]).waitFor({ state: "visible", timeout: 20000 });
    for (const [label, text] of cfg.fields) await loc(label).fill(text);
    const first = loc(cfg.fields[0][0]);
    const isHyd = () => first.evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$")));
    gate.release();
    for (let t = 0; t < 300 && !(await isHyd()); t++) await page.waitForTimeout(100);
    await page.waitForTimeout(1500);
    const r = { i, tag: await first.evaluate(e => e.tagName), after: {} };
    for (const [label, text] of cfg.fields) r.after[label] = (await loc(label).inputValue()) === text ? "kept typed text" : "REVERTED to " + JSON.stringify(await loc(label).inputValue());
    r.unsavedIndicator = (await page.getByText(/unsaved|draft changed|not saved/i).count()) > 0;
    if (cfg.submit) {
      const before = posts.length;
      const sb = page.getByRole("button", { name: new RegExp("^" + cfg.submit, "i") }).first();
      r.submitEnabledAfterHydration = await sb.isEnabled();
      if (!r.submitEnabledAfterHydration) { r.afterSubmit = "submit button is disabled: the editor does not know the field changed"; results.push(r); console.log(JSON.stringify(r)); await ctx.close(); continue; }
      await sb.click(); await page.waitForTimeout(1500);
      r.afterSubmit = { newPosts: posts.slice(before), alerts: (await page.locator("[role=alert],[role=status],.type-small").allInnerTexts()).map(s => s.trim()).filter(s => s && s.length < 160).slice(0, 4) };
      if (which === "signin") r.afterSubmit.url = new URL(page.url()).pathname;
    }
    results.push(r); console.log(JSON.stringify(r)); await ctx.close();
  }
  require("fs").writeFileSync(`${__dirname}/out/prehydrate-${which}.json`, JSON.stringify(results, null, 1)); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
