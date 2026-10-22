const L = require('./lib.cjs');
const AxeBuilder = require('/home/user/deca-mark/web/node_modules/@axe-core/playwright').default || require('/home/user/deca-mark/web/node_modules/@axe-core/playwright');
const P = L.BASE + L.WA_PATH;
const ROUTES = [
  ['forms', '/forms'], ['forms-versions', '/forms/versions'],
  ['version-detail-published-v1', '/forms/versions/workspace-check-v1'], ['editor-draft-v2', '/forms/versions/workspace-check-v2'],
  ['publish-draft-v2 (extra)', '/forms/versions/workspace-check-v2/publish'],
];
(async () => {
  const b = await L.launch(); const out = [];
  for (const vp of ['desk', 'phone']) {
    for (const [name, rest] of ROUTES) {
      const ctx = await L.ctxFor(b, 'wa-manager', vp, { colorScheme: 'light' });
      const page = await ctx.newPage();
      await page.goto(P + rest, { waitUntil: 'load' }); await page.waitForTimeout(1500);
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const row = { route: name, vp, theme, violations: r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')), summary: v.nodes[0]?.failureSummary?.slice(0, 200) })), passes: r.passes.length, incomplete: r.incomplete.map(v => ({ id: v.id, n: v.nodes.length })) };
      out.push(row); console.log(JSON.stringify(row));
      if (name.startsWith('editor')) {
        // Dirty editor state too
        await page.getByRole('textbox', { name: /^question label/i }).first().fill('Dirty edit for axe');
        await page.waitForTimeout(400);
        const r2 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        const row2 = { route: name + ' + unsaved edit', vp, theme, violations: r2.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })), passes: r2.passes.length };
        out.push(row2); console.log(JSON.stringify(row2));
        await page.screenshot({ path: `${L.F}/shots/axe-editor-dirty-${vp}.png`, fullPage: true });
      }
      await page.screenshot({ path: `${L.F}/shots/axe-${name.split(' ')[0]}-${vp}.png`, fullPage: true });
      await ctx.close();
    }
  }
  L.fs.writeFileSync(`${L.F}/data/axe.json`, JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 1500)); process.exit(1); });
