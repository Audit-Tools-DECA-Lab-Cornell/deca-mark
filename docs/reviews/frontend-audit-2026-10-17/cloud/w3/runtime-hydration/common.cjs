// Shared helpers for the hydration experiments. Never prints tokens or cookies.
const fs = require("fs");
const { chromium } = require("/home/user/deca-mark/web/node_modules/@playwright/test");
const REPO = "/home/user/deca-mark";
const manifest = JSON.parse(fs.readFileSync(`${REPO}/database/.local/web-workspace.json`, "utf8"));
const BASE = "http://127.0.0.1:3000";
function authFile(role) { return `${REPO}/web/e2e/.auth/${role}.json`; }
function token(role) {
  const st = JSON.parse(fs.readFileSync(authFile(role), "utf8"));
  const parts = st.cookies.filter(c => /^sb-.+-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  let v = parts.map(c => c.value).join("");
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64").toString("utf8"); else v = decodeURIComponent(v);
  return JSON.parse(v).access_token;
}
async function api(role, method, path, body) {
  const r = await fetch(`${manifest.apiUrl}${path}`, { method, headers: { Authorization: `Bearer ${token(role)}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`);
  const t = await r.text(); return t ? JSON.parse(t) : undefined;
}
const projectPath = manifest.path.replace(/\/+$/, "");
const getProject = () => api("manager", "GET", `/v1/projects/${manifest.projectId}`);
const setDescription = d => api("manager", "PATCH", `/v1/projects/${manifest.projectId}`, { description: d });
async function launch() { return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
// Hold every script chunk until release() is called (deterministic "server HTML visible, not hydrated").
async function gateChunks(context, opts = {}) {
  let release; const gate = new Promise(r => (release = r));
  let held = 0;
  await context.route(/\/_next\/static\/(chunks|[^/]+)\/.*\.js(\?.*)?$/, async route => {
    held++;
    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
    else await gate;
    await route.continue();
  });
  return { release: () => release(), held: () => held };
}
const hydrated = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && Object.keys(e).some(k => k.startsWith("__reactProps$")); }, sel);
module.exports = { fs, chromium, manifest, BASE, authFile, api, projectPath, getProject, setDescription, launch, gateChunks, hydrated };
