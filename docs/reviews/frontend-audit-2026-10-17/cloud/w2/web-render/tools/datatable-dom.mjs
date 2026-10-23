import "./tsx-hooks.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { DataTable } = await import("@/features/data/DataTable.tsx");
const N = Number(process.argv[2] ?? 500);
const records = Array.from({ length: N }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, label: `OBS-${(i * 2654435761 >>> 0).toString(16).slice(0, 6).toUpperCase()}`,
  day: "Oct 17", time: "2:14 PM", when: "Oct 17 · 2:14 PM", siteName: "Fall Creek Playground", zoneLabel: "Climbing structure", zoneCode: "A-" + (i % 12),
  wholeZone: i % 9 === 0, mapVersion: "v3", roundName: "Round 2", observer: "AB", summary: { label: "What are they doing", value: "Climbing the ladder, two children waiting" }
}));
const full = renderToStaticMarkup(createElement(DataTable, { records, hrefOf: r => `/o/deca/p/zones/data/${r.id}`, selectedId: null, onSelect() {} }));
const count = html => (html.match(/<[a-zA-Z][^>/ ]*/g) ?? []).length;
const tableHtml = full.slice(full.indexOf('<div class="hidden md:block">'), full.indexOf('<ul class="divide-y'));
const cardsHtml = full.slice(full.indexOf('<ul class="divide-y'));
console.log(`records ${N}: total elements ${count(full)} (${(full.length / 1024).toFixed(0)} KiB html); table ${count(tableHtml)} el / ${(tableHtml.length / 1024).toFixed(0)} KiB; cards ${count(cardsHtml)} el / ${(cardsHtml.length / 1024).toFixed(0)} KiB; cards share ${(100 * count(cardsHtml) / count(full)).toFixed(0)}% of elements, ${(100 * cardsHtml.length / full.length).toFixed(0)}% of bytes`);
const t = [];
for (let k = 0; k < 15; k++) { const a = performance.now(); renderToStaticMarkup(createElement(DataTable, { records, hrefOf: r => `/x/${r.id}`, selectedId: null, onSelect() {} })); t.push(performance.now() - a); }
t.sort((a, b) => a - b);
console.log(`renderToStaticMarkup(DataTable, ${N} rows, table+cards): median ${t[7].toFixed(1)} ms, min ${t[0].toFixed(1)} ms (render-phase proxy only: no DOM diff, no commit)`);
