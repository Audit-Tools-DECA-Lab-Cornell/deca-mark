const c = require("./common.cjs");
(async () => { const b = await c.launch(); const ctx = await b.newContext({ storageState: c.authFile("manager") }); const p = await ctx.newPage(); await p.goto(c.BASE + "/account");
 await p.getByLabel(/^full name/i).first().waitFor(); for (let i=0;i<100 && !(await p.getByLabel(/^full name/i).first().evaluate(e => Object.keys(e).some(k => k.startsWith("__reactProps$")))); i++) await p.waitForTimeout(100); await p.waitForTimeout(800);
 await p.getByLabel(/^full name/i).first().fill("Local manager"); await p.getByRole("button", { name: /^save/i }).first().click(); await p.waitForTimeout(1500);
 await p.reload(); console.log("Full name now:", await p.getByLabel(/^full name/i).first().inputValue()); await b.close(); })();
