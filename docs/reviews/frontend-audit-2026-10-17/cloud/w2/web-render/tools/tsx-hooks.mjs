import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "/home/user/deca-mark/web/node_modules/typescript/lib/typescript.js";
const SRC = new URL("file:///home/user/deca-mark/web/src/");
const MOCKS = {
  "next/link": new URL("./mock-link.mjs", import.meta.url).href,
  "next/navigation": new URL("./mock-nav.mjs", import.meta.url).href
};
const EXT = /\.(?:[cm]?[jt]sx?|json|mjs)$/;
const find = url => { for (const c of [url, `${url}.ts`, `${url}.tsx`, `${url}/index.ts`, `${url}/index.tsx`]) if (existsSync(fileURLToPath(c)) && !c.endsWith("/")) { try { if (readFileSync(fileURLToPath(c), "utf8") !== undefined) return c; } catch {} } return null; };
registerHooks({
  resolve(spec, ctx, next) {
    if (MOCKS[spec]) return { url: MOCKS[spec], shortCircuit: true };
    if (spec.startsWith("@/")) { const f = find(new URL(spec.slice(2), SRC).href); if (f) return { url: f, shortCircuit: true }; }
    if (ctx.parentURL && /\.tsx?$/.test(ctx.parentURL) && spec.startsWith(".") && !EXT.test(spec)) { const f = find(new URL(spec, ctx.parentURL).href); if (f) return { url: f, shortCircuit: true }; }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (/\.tsx?$/.test(url) && url.startsWith("file:///home/user/deca-mark/web/src/")) {
      const out = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false } });
      return { format: "module", source: out.outputText, shortCircuit: true };
    }
    return next(url, ctx);
  }
});
