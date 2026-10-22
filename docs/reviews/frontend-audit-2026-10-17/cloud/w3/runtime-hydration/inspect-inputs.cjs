const c = require("./common.cjs");
const paths = process.argv.slice(2);
(async () => {
  const b = await c.launch();
  for (const path of paths) {
    const ctx = await b.newContext({ storageState: c.authFile("manager"), viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const g = await c.gateChunks(ctx);
    await p.goto(c.BASE + path, { waitUntil: "commit" }); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => [...document.querySelectorAll("input,textarea,select")].map(e => ({ tag: e.tagName, type: e.type, name: e.name || "", id: (e.id || "").slice(-14), label: (e.labels?.[0]?.textContent || e.getAttribute("aria-label") || "").slice(0, 28), ro: e.readOnly || false, hidden: e.type === "hidden", visible: !!(e.offsetWidth || e.offsetHeight) })).filter(x => !x.hidden));
    console.log(path.replace(c.projectPath, "<p>"), "title:", await p.title(), "\n ", r.map(x => `${x.tag}[${x.type}]${x.ro ? "(ro)" : ""}"${x.label}"${x.visible ? "" : "(hidden)"}`).join("  "));
    g.release(); await ctx.close();
  }
  await b.close();
})();
