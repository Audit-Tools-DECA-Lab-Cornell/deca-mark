const c = require("./common.cjs");
(async () => {
  const b = await c.launch(); const out = {};
  async function open() { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); const gate = await c.gateChunks(ctx); const posts = []; page.on("request", r => r.method() === "POST" && posts.push(r.headers()["next-action"] ? "server-action fetch" : "native form POST " + new URL(r.url()).pathname));
    await page.goto(c.BASE + "/sign-in", { waitUntil: "commit" }); await page.getByLabel(/^email address/i).waitFor(); return { ctx, page, gate, posts }; }
  const hydrated = async page => { for (let t = 0; t < 300; t++) { if (await page.getByLabel(/^email address/i).evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$")))) break; await page.waitForTimeout(100); } await page.waitForTimeout(1200); };
  const msgs = page => page.locator("[role=alert],[role=status],.type-small").allInnerTexts().then(a => a.map(s => s.trim()).filter(s => s && s.length < 160));
  { const { ctx, page, gate, posts } = await open(); await page.getByLabel(/^email address/i).fill("typed.before@example.test"); await page.locator("#sign-in-password").fill("not-a-real-password"); gate.release(); await hydrated(page);
    // one extra keystroke in each field after hydration
    for (const sel of ["#sign-in-email", "#sign-in-password"]) { await page.locator(sel).focus(); await page.keyboard.press("End"); await page.keyboard.type("a"); await page.keyboard.press("Backspace"); }
    await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForTimeout(2500);
    out["A: typed before hydration, one extra keystroke per field after, then Sign in"] = { posts, messages: await msgs(page) }; await ctx.close(); }
  { const { ctx, page, gate, posts } = await open(); await page.getByLabel(/^email address/i).fill("typed.before@example.test"); await page.locator("#sign-in-password").fill("not-a-real-password"); await page.keyboard.press("Enter");
    await page.waitForTimeout(2500); out["B: typed and pressed Enter BEFORE hydration (chunks still held)"] = { posts, url: new URL(page.url()).pathname + new URL(page.url()).search.replace(/(password|email)=[^&]*/g, "$1=…"), messages: await msgs(page) }; gate.release(); await ctx.close(); }
  console.log(JSON.stringify(out, null, 1)); require("fs").writeFileSync(`${__dirname}/out/signin-extra.json`, JSON.stringify(out, null, 1)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
