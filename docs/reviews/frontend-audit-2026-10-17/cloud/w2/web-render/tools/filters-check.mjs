import { readFileSync } from "node:fs";
import { z } from "zod";
const REPO = "/home/user/deca-mark/";
const { load } = await import(REPO + "web/tests/unit/support.mjs");
const { viewFilters, parseView, paramsReader } = await load("features/data/view.ts");
const { clock } = await load("lib/time.ts");
// Copy the schema text verbatim from actions.ts so it cannot drift from this check.
const src = readFileSync(REPO + "web/src/features/data/actions.ts", "utf8");
const body = src.slice(src.indexOf("const filtersSchema"), src.indexOf("export type NextPage"));
const filtersSchema = new Function("z", body + "\nreturn filtersSchema;")(z);
const U = n => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const c = clock("America/New_York");
let n = 0, bad = 0;
for (const zones of [[], [U(1)], [U(1), U(2)]]) for (const round of [null, "standard", "inventory"]) for (const observer of [null, "AB"]) for (const from of [null, "2026-10-01"]) for (const to of [null, "2026-10-31"]) {
  const q = new URLSearchParams(); q.set("site", "fall-creek"); zones.forEach(z => q.append("zone", z)); if (round) q.set("round", round); if (observer) q.set("observer", observer); if (from) q.set("from", from); if (to) q.set("to", to); if (zones.length) q.set("version", "2");
  const view = parseView(q);
  const f = viewFilters(view, { siteId: U(99), packageId: U(98) }, c);
  n++; const r = filtersSchema.safeParse(f); if (!r.success) { bad++; console.log("REJECTED", JSON.stringify(f), r.error.issues[0].message); }
}
console.log(`viewFilters combos checked ${n}, rejected by filtersSchema ${bad}`);
// strict() on an extra key: what loadMore would see
try { filtersSchema.parse({ siteId: U(1), formVersion: "play-v2" }); } catch (e) { console.log("extra key ->", e.constructor.name, e.issues?.[0]?.code, e.issues?.[0]?.keys); }
