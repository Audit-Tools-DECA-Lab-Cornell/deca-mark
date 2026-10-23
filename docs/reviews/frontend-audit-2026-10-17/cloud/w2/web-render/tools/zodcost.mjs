import fs from "node:fs";
import vm from "node:vm";
const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
function once() {
  const ctx = vm.createContext({ document: undefined, console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, queueMicrotask, structuredClone });
  ctx.globalThis = ctx;
  const t0 = performance.now();
  const script = new vm.Script(src, { filename: "chunk.js" });
  const t1 = performance.now();
  script.runInContext(ctx);
  const t2 = performance.now();
  const entry = ctx.TURBOPACK.flat();
  let fn;
  for (let i = 0; i < entry.length; i++) if (typeof entry[i] === "function") fn = entry[i];
  let exported;
  const mod = { s(x) { exported = x; }, i() { return {}; }, v() {}, g: ctx, n() {}, e() {}, j() {} };
  const t3 = performance.now();
  try { fn(mod); } catch (e) { console.error("eval error", e.message); }
  const t4 = performance.now();
  return { compile: t1 - t0, run: t2 - t1, init: t4 - t3, ok: !!exported };
}
const rs = Array.from({ length: 15 }, once);
const med = k => rs.map(r => r[k]).sort((a, b) => a - b)[Math.floor(rs.length / 2)];
console.log(file.split("/").pop(), "ok", rs[0].ok, "compile ms", med("compile").toFixed(2), "run(push) ms", med("run").toFixed(2), "zod init ms", med("init").toFixed(2), "first-run init", rs[0].init.toFixed(2), "first compile", rs[0].compile.toFixed(2));
