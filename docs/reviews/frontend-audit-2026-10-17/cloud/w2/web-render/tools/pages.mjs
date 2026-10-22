// For each page.tsx: server walk to client boundaries (incl. layouts up the tree + error/loading/not-found), then client walk.
import fs from "node:fs";
import path from "node:path";
import { deps, isClient } from "./graph.mjs";
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
const head = f => fs.readFileSync(f, "utf8").slice(0, 200);
const isServerAction = f => /^\s*["']use server["']/.test(head(f));
const TARGET = new RegExp(process.argv[2] ?? "^zod");
const EXCLUDE = (process.argv[3] ?? "").split(",").filter(Boolean);
// client closure: files reachable from a client file (static imports), not crossing "use server" files
function clientClosure(entry, excluded) {
  const seen = new Map([[entry, null]]); const q = [entry]; const hits = [];
  while (q.length) {
    const f = q.shift();
    for (const { spec, dynamic } of deps(f)) {
      if (dynamic) continue;
      if (TARGET.test(spec)) { hits.push([f, spec]); continue; }
      const r = resolve(f, spec);
      if (!r || seen.has(r) || isServerAction(r)) continue;
      if (excluded.some(e => r.endsWith(e))) continue;
      seen.set(r, f); q.push(r);
    }
  }
  const chain = f => { const c = []; for (let x = f; x; x = seen.get(x)) c.push(path.relative(SRC, x)); return c.reverse(); };
  return hits.map(([f, s]) => chain(f).join(" > ") + " -> " + s);
}
function boundaries(entry) {
  const seen = new Set([entry]); const q = [entry]; const out = new Set();
  while (q.length) {
    const f = q.shift();
    for (const { spec } of deps(f)) {
      const r = resolve(f, spec);
      if (!r || seen.has(r)) continue;
      seen.add(r);
      if (isClient(r)) out.add(r); else q.push(r);
    }
  }
  return out;
}
function specials(dir) {
  const out = [];
  let d = dir;
  while (d.startsWith(path.join(SRC, "app"))) {
    for (const n of ["layout", "template", "error", "loading", "not-found", "global-error"]) for (const e of [".tsx", ".ts"]) {
      const f = path.join(d, n + e); if (fs.existsSync(f)) out.push(f);
    }
    d = path.dirname(d);
  }
  return out;
}
function walkPages(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkPages(p, acc); else if (/^page\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const rows = [];
for (const page of walkPages(path.join(SRC, "app"))) {
  const entries = [page, ...specials(path.dirname(page))];
  const cb = new Set();
  for (const e of entries) { if (isClient(e)) cb.add(e); else for (const b of boundaries(e)) cb.add(b); }
  const hit = [];
  for (const b of cb) { if (EXCLUDE.some(e => b.endsWith(e))) continue; const h = clientClosure(b, EXCLUDE); if (h.length) hit.push([path.relative(SRC, b), h[0]]); }
  rows.push([path.relative(path.join(SRC, "app"), page), cb.size, hit]);
}
for (const [p, n, hit] of rows) {
  console.log(`${hit.length ? "ZOD" : "---"} ${p} (client boundaries ${n}) ${hit.length}`);
  if (process.env.V) for (const [b, c] of hit) console.log("     ", b, "::", c);
}
