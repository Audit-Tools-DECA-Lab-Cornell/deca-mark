const c = require("./common.cjs");
(async () => { const b = await c.launch(); const ctx = await b.newContext({ storageState: c.authFile("manager") }); const p = await ctx.newPage(); await p.goto(c.BASE + "/account"); console.log("Full name now:", await p.getByLabel(/^full name/i).first().inputValue()); await b.close(); })();
