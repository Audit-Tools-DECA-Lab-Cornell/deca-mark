#!/usr/bin/env node
// Synthetic local acceptance data. Application writes go through the authenticated API.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Public test credential, deliberately unrelated to any real user.
const password = "FieldMaps-local-only-42!";
const roles = ["owner", "admin", "manager", "observer", "viewer", "outsider", "joiner", "other-owner"];

export function localUrl(value, port) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.port !== String(port) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Use a literal loopback HTTP URL on port ${port}; hosted targets are refused.`);
  }
  return url.origin;
}

async function request(url, headers, method = "GET", body, allowMissing = false) {
  const response = await fetch(url, {
    method, redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new Error(`${method} ${new URL(url).pathname}: invalid JSON response`); }
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) {
    // No response bodies: Auth failures and invitations can carry credentials.
    throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status}`);
  }
  return data;
}

const definition = {
  version: "workspace-check-v1", title: "Workspace acceptance form", status: "draft",
  summary: "Synthetic data for local web acceptance only.", source: "Local acceptance fixture",
  inclusion: "Not a research instrument.", questions: [{
    id: "note", code: "Note", exportColumn: "Note", act: "Record", kind: "text",
    label: "Test note", source: "Local acceptance fixture", required: true,
  }],
};

export function workspacePackageRequest(siteId, formVersion, layers) {
  return {
    site_id: siteId, form_version: formVersion, inventory_form_version: formVersion, layers,
    request_id: "70000000-0000-4000-8000-000000000010", expected_current_package_id: null,
    zone_identity_map: [{ source_feature_id: "A", zone_id: "70000000-0000-4000-8000-000000000011", zone_code: "A" }],
    change_note: "Synthetic browser acceptance map",
  };
}

export function workspaceObservation(index, siteId, packageId, zone) {
  const round = index < 4 ? "standard" : index < 6 ? "reliability" : "inventory";
  return {
    site_id: siteId, package_id: packageId, zone_id: zone.zone_id, form_version: definition.version,
    observer: "OB", observed_at: `2026-10-07T14:${String(index).padStart(2, "0")}:00Z`,
    round_type: round, placement: round === "inventory" ? "zone" : "hand",
    ...(round === "inventory" ? {} : { first_round: index % 2 === 0, coordinates: zone.display_anchor }),
    answers: { note: `Synthetic record ${index + 1} — 🌿` },
  };
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    "api-url": { type: "string", default: "http://127.0.0.1:8001" },
    help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("Usage: node database/seed-web-workspace.mjs [--api-url http://127.0.0.1:8001]\n"
      + "Start local Supabase and the API with config.auth-local.json first. No hosted targets or resets.\n"
      + "Local test accounts use <role>@fieldmaps.test and password FieldMaps-local-only-42!.");
    return;
  }
  const apiUrl = localUrl(values["api-url"], 8001);
  // Read the pinned CLI's runtime status in memory, never an .env or credential file.
  let status;
  try {
    status = JSON.parse(execFileSync("pnpm", ["dlx", "supabase@2.118.0", "status", "--output", "json"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
    }));
  } catch {
    throw new Error("Could not read local Supabase status. Start it with pnpm db:start first.");
  }
  const authUrl = localUrl(status.API_URL, 54321);
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const adminKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  if (!publicKey || !adminKey) throw new Error("Local Supabase status is missing Auth keys.");
  await request(`${apiUrl}/ready`, {});
  const adminHeaders = { apikey: adminKey, Authorization: `Bearer ${adminKey}` };
  const accounts = {};
  for (const [index, role] of roles.entries()) {
    const email = `${role}@fieldmaps.test`;
    const id = `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    // Read only this fixture user. Unrelated legacy SQL fixtures may not be listable by Auth.
    let user = await request(`${authUrl}/auth/v1/admin/users/${id}`, adminHeaders, "GET", undefined, true);
    if (!user) user = await request(`${authUrl}/auth/v1/admin/users`, adminHeaders, "POST", {
      id, email, password, email_confirm: true, user_metadata: { fixture: "fieldmaps-web-acceptance" },
    });
    if (user.email !== email || user.user_metadata?.fixture !== "fieldmaps-web-acceptance") {
      throw new Error(`Refusing to reuse an unrelated local account: ${email}`);
    }
    const session = await request(`${authUrl}/auth/v1/token?grant_type=password`, { apikey: publicKey },
      "POST", { email, password });
    const api = (path, method = "GET", body) => request(`${apiUrl}${path}`,
      { Authorization: `Bearer ${session.access_token}` }, method, body);
    await api("/v1/me");
    await api("/v1/me", "PATCH", { display_name: `Local ${role}`, observer_initials: role === "observer" ? "OB" : "QA" });
    accounts[role] = { email, id: user.id, api };
  }
  async function study(account, slug) {
    let org = (await account.api("/v1/orgs")).find((item) => item.slug === slug);
    if (!org) org = await account.api("/v1/orgs", "POST", {
      name: slug === "web-acceptance" ? "Web acceptance lab" : "Other acceptance lab", slug,
      project: { name: "Play study acceptance", code: "play-study", timezone: "America/New_York" },
    });
    const project = (await account.api(`/v1/orgs/${org.id}/projects`)).find((item) => item.code === "play-study");
    if (!project) throw new Error("The local acceptance project was changed; use a separate local stack.");
    return { org, project };
  }
  const { org, project } = await study(accounts.owner, "web-acceptance");
  const other = await study(accounts["other-owner"], "web-acceptance-other");
  const base = `/v1/projects/${project.project_id}`;
  for (const role of ["admin", "manager", "observer", "viewer"]) {
    const scope = role === "admin" ? `/v1/orgs/${org.id}` : base;
    const members = await accounts.owner.api(`${scope}/members`);
    const existing = members.find((member) => member.user_id === accounts[role].id);
    if (existing) {
      if (existing.role !== role) throw new Error(`The ${role} fixture membership was changed.`);
      continue;
    }
    const invite = await accounts.owner.api(`${scope}/invitations`, "POST", { role, email: accounts[role].email });
    await accounts[role].api("/v1/invitations/redeem", "POST", { token: invite.token });
  }
  const api = accounts.manager.api;
  let forms = await api(`${base}/forms`);
  if (!forms.some((form) => form.code === "workspace-check")) {
    await api(`${base}/forms`, "POST", { code: "workspace-check", name: "Workspace check", definition });
  }
  let version = await api(`${base}/form-versions/workspace-check-v1`);
  if (version.state === "draft") version = await api(`${base}/form-versions/${version.code}/publish`, "POST");
  if (version.state !== "published") throw new Error("The fixture form was retired; seed does not rewrite it.");
  forms = await api(`${base}/forms`);
  if (forms.find((form) => form.code === "workspace-check").versions.length === 1) {
    await api(`${base}/forms/workspace-check/versions`, "POST", {});
  }
  for (const code of ["fall-creek", "empty-site"]) {
    if (!(await api(`${base}/sites`)).some((site) => site.code === code)) {
      await api(`${base}/sites`, "POST", { code, name: code === "fall-creek" ? "Fall Creek test site" : "Empty test site" });
    }
  }
  const layers = Object.fromEntries(["ground", "zones"].map((layer) => [layer,
    JSON.parse(readFileSync(join(root, "qgis/fall-creek/upload-sample", `${layer}.geojson`), "utf8"))]));
  // The QGIS sample's display label becomes the current import contract's required name.
  layers.zones.features = layers.zones.features.map(feature => ({ ...feature,
    properties: { ...feature.properties, name: feature.properties.label },
  }));
  const site = (await api(`${base}/sites`)).find(item => item.code === "fall-creek");
  const prepared = await api(`${base}/packages`, "POST", workspacePackageRequest(site.site_id, version.code, layers));
  if (prepared.package.state !== "ready") throw new Error("The fixture package is unexpectedly blocked.");
  // Invalid imports are rejected by the current API; no artificial blocked package is stored.
  const history = await api(`${base}/sites/${site.site_id}/zones?package_id=${prepared.package.package_id}`);
  const zone = history.zones.find(item => item.zone_code === "A");
  if (!zone) throw new Error("The fixture package has no zone A.");
  const observations = [];
  for (let index = 0; index < 8; index++) {
    const id = `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const payload = workspaceObservation(index, site.site_id, prepared.package.package_id, zone);
    await accounts.observer.api(`${base}/observations/${id}`, "PUT", payload);
    observations.push(id);
  }
  const manifest = {
    apiUrl, supabaseUrl: authUrl, publishableKey: publicKey,
    accounts: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, { email: account.email, id: account.id }])),
    organizationId: org.id, projectId: project.project_id,
    otherProjectId: other.project.project_id, path: "/o/web-acceptance/p/play-study", observations,
    baseline: { total: 8, standard: 4, reliability: 2, inventory: 2, date: "2026-10-07", zone: "A" },
  };
  mkdirSync(join(root, "database/.local"), { recursive: true });
  writeFileSync(join(root, "database/.local/web-workspace.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("Local workspace ready: /o/web-acceptance/p/play-study. Eight synthetic observations; no reset.\n"
    + "Public fixture manifest: database/.local/web-workspace.json. No tokens or admin keys are written.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Local workspace setup failed.");
    process.exitCode = 1;
  });
}
