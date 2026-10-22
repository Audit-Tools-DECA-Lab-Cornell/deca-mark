// Read-only failure reproductions against the running stack. No action reaches the server except the
// bogus-id case (the server refuses an unknown action id before running anything). Never prints cookies or tokens.
const fs = require("fs");
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const BASE = "http://127.0.0.1:3000", P = "/o/web-acceptance/p/play-study";
const EDITOR = BASE + P + "/forms/versions/workspace-check-v2";
const VP = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const isAction = r => r.method() === "POST" && !!r.headers()["next-action"];
const scenarios = {
  offline: async (ctx) => ctx.setOffline(true),
  abort: async (ctx, page) => page.route("**/*", r => isAction(r.request()) ? r.abort("failed") : r.continue()),
  cookies: async (ctx) => ctx.clearCookies(),
  bogusId: async (ctx, page) => page.route("**/*", r => isAction(r.request()) ? r.continue({ headers: { ...r.request().headers(), "next-action": "40" + "ab".repeat(20) } }) : r.continue()),
  plain401: async (ctx, page) => page.route("**/*", r => isAction(r.request()) ? r.fulfill({ status: 401, contentType: "text/plain", body: "Signed out" }) : r.continue()),
};
(async () => {
  const which = (process.argv[2] || Object.keys(scenarios).join(",")).split(",");
  const vp = process.argv[3] || "desk";
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const out = {};
  for (const name of which) {
    const ctx = await b.newContext({ storageState: "/home/user/deca-mark/web/e2e/.auth/manager.json", viewport: VP[vp] });
    const page = await ctx.newPage();
    const ev = [];
    page.on("pageerror", e => ev.push("pageerror: " + String(e.message).slice(0, 160)));
    page.on("console", m => { if (m.type() === "error") ev.push("console.error: " + m.text().slice(0, 160)); });
    page.on("response", r => { if (r.request().method() === "POST") ev.push(`POST ${new URL(r.url()).pathname} -> ${r.status()} ${r.headers()["x-nextjs-action-not-found"] ? "(action-not-found)" : ""}`); });
    page.on("requestfailed", q => { if (q.method() === "POST") ev.push(`POST failed ${new URL(q.url()).pathname}: ${q.failure()?.errorText}`); });
    page.on("dialog", d => { ev.push("dialog " + d.type()); d.dismiss(); });
    await page.goto(EDITOR, { waitUntil: "load" });
    const label = page.getByRole("textbox", { name: /^question label/i }).first();
    await label.waitFor();
    await label.evaluate(e => new Promise(res => { const t = setInterval(() => { if (Object.keys(e).some(k => k.startsWith("__reactProps$"))) { clearInterval(t); res(); } }, 50); }));
    const original = await label.inputValue();
    const edit = `SKEPTIC unsaved ${name} ${Date.now() % 100000}`;
    await label.fill(edit);
    await page.waitForTimeout(300);
    await scenarios[name](ctx, page);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.waitForTimeout(4000);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const mounted = (await label.count()) > 0;
    const res = {
      url: page.url().replace(BASE, ""), editorMounted: mounted,
      value: mounted ? await label.inputValue() : null, editKept: mounted && (await label.inputValue()) === edit,
      boundary: /Something went wrong/.test(body), whatFailed: (body.match(/What failed\s*(.{0,45})/) || [])[1] || null,
      inlineNothingSaved: /Nothing was saved/.test(body), events: ev,
    };
    await page.screenshot({ path: `${__dirname}/out/editor-${name}-${vp}.png` });
    // Restore the connection and see what Try again gives back.
    if (name === "offline") await ctx.setOffline(false);
    await page.unroute("**/*").catch(() => {});
    if (res.boundary) {
      await page.getByRole("button", { name: /try again/i }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      const l2 = page.getByRole("textbox", { name: /^question label/i }).first();
      res.afterTryAgain = { url: page.url().replace(BASE, ""), mounted: (await l2.count()) > 0, value: (await l2.count()) ? await l2.inputValue() : null, equalsSavedOriginal: (await l2.count()) ? (await l2.inputValue()) === original : null };
    }
    out[name] = res;
    console.log(name, vp, JSON.stringify(res));
    await ctx.close();
  }
  fs.writeFileSync(`${__dirname}/out/repro-${vp}.json`, JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
