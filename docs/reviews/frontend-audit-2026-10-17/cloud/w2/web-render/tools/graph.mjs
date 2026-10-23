// Static import walker over web/src. Usage: node graph.mjs <entry file> <target pkg regex>
import fs from "node:fs";
import path from "node:path";
const SRC = "/home/user/deca-mark/web/src";
const exts = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of exts) if (fs.existsSync(base + e)) return base + e;
  return null;
}
const importRe = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)([^;]*?)\bfrom\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
export function deps(file) {
  const s = fs.readFileSync(file, "utf8");
  const out = [];
  let m;
  importRe.lastIndex = 0;
  while ((m = importRe.exec(s))) {
    const spec = m[2] ?? m[3] ?? m[4];
    const dynamic = m[4] !== undefined;
    // skip pure type imports: `import { type A }` only is hard; treat `import type` as skipped already
    out.push({ spec, dynamic });
  }
  return out;
}
export function isClient(file) {
  return /^\s*["']use client["']/.test(fs.readFileSync(file, "utf8").slice(0, 200));
}
// find shortest path from entry to any file importing pkg matching re
export function paths(entry, pkgRe, { stopAtServer = false, skipDynamic = true } = {}) {
  const seen = new Map([[entry, null]]);
  const queue = [entry];
  const hits = [];
  while (queue.length) {
    const f = queue.shift();
    for (const { spec, dynamic } of deps(f)) {
      if (dynamic && skipDynamic) continue;
      if (pkgRe.test(spec)) { hits.push([f, spec]); continue; }
      const r = resolve(f, spec);
      if (!r || seen.has(r)) continue;
      seen.set(r, f);
      queue.push(r);
    }
  }
  const chain = f => { const c = []; for (let x = f; x; x = seen.get(x)) c.push(path.relative(SRC, x)); return c.reverse(); };
  return hits.map(([f, spec]) => ({ spec, chain: chain(f) }));
}
if (process.argv[1].endsWith("graph.mjs") && process.argv[2]) {
  const entry = path.resolve(SRC, process.argv[2]);
  const re = new RegExp(process.argv[3]);
  for (const h of paths(entry, re)) console.log(h.spec, "<-", h.chain.join(" > "));
}
