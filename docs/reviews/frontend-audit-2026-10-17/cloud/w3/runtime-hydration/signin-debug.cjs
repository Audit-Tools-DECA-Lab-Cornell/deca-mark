const c = require("./common.cjs");
(async () => {
  const b = await c.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); const gate = await c.gateChunks(ctx); const posts = [];
  page.on("request", r => r.method() === "POST" && posts.push("POST"));
  await page.goto(c.BASE + "/sign-in", { waitUntil: "commit" }); await page.locator("#sign-in-email").waitFor();
  await page.locator("#sign-in-email").fill("typed.before@example.test"); await page.locator("#sign-in-password").fill("not-a-real-password");
  gate.release(); for (let t = 0; t < 300; t++) { if (await page.locator("#sign-in-email").evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$")))) break; await page.waitForTimeout(100); } await page.waitForTimeout(1500);
  const v = async () => ({ email: await page.locator("#sign-in-email").inputValue(), pw: (await page.locator("#sign-in-password").inputValue()).length, pwType: await page.locator("#sign-in-password").getAttribute("type"), emailHydrated: await page.locator("#sign-in-email").evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$"))), pwHydrated: await page.locator("#sign-in-password").evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$"))) });
  console.log("after hydration", JSON.stringify(await v()));
  await page.locator("#sign-in-password").focus(); await page.keyboard.type("a"); console.log("after typing 'a' in password", JSON.stringify(await v()));
  await page.getByRole("button", { name: /^sign in/i }).click(); await page.waitForTimeout(2500);
  console.log("posts", posts.length, "messages", JSON.stringify((await page.locator("[role=alert],[role=status],.type-small").allInnerTexts()).map(s => s.trim()).filter(Boolean)));
  await b.close();
})();
