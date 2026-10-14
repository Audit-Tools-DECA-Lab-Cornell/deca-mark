#!/usr/bin/env node
// Sets up a study on a DECA Mark API, signed in as its manager: the organization and project, Janet's
// two forms (published), a site with its map package, and invitations. Every step is idempotent, so the
// script can be run again to finish or extend a set-up; what already exists is kept, never replaced.
//
//   DECAMARK_API_URL=https://… SUPABASE_URL=https://….supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
//   MANAGER_EMAIL=you@example.org node scripts/bootstrap-study.mjs \
//     --invite janet@example.org:manager --join-code observer:25
//
// The password is read from MANAGER_PASSWORD or asked for, never taken as an argument. Invitation
// tokens and join codes are printed once; the server keeps only their hashes. Plain Node 24, no
// dependencies.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const { values } = parseArgs({
  options: {
    "org-name": { type: "string", default: "DECA Lab" },
    "org-slug": { type: "string", default: "deca-lab" },
    "project-name": { type: "string", default: "Play Study" },
    "project-code": { type: "string", default: "play-study" },
    timezone: { type: "string", default: "America/New_York" },
    "site-code": { type: "string", default: "fall-creek" },
    "site-name": { type: "string", default: "Fall Creek Elementary playground" },
    package: { type: "string", default: "fall-creek" },
    invite: { type: "string", multiple: true, default: [] },
    "join-code": { type: "string", multiple: true, default: [] },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`Usage: node scripts/bootstrap-study.mjs [options]

Environment: DECAMARK_API_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, MANAGER_EMAIL, MANAGER_PASSWORD (asked if unset)

  --org-name, --org-slug           organization (default DECA Lab, deca-lab)
  --project-name, --project-code   project (default Play Study, play-study)
  --site-code, --site-name         site (default fall-creek)
  --package fall-creek|<dir>       map package: the Fall Creek drawings, or a folder of
                                   ground/zones/trees/paths .geojson files (and an optional .qgz)
  --invite email:role              an invitation bound to that email (role manager, observer or viewer)
  --join-code role:uses            a join code anyone with it may redeem, up to that many times`);
  process.exit(0);
}

function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}. See --help.`);
    process.exit(2);
  }
  return value.replace(/\/$/, "");
}

const apiUrl = env("DECAMARK_API_URL");
const supabaseUrl = env("SUPABASE_URL");
const publishableKey = env("SUPABASE_PUBLISHABLE_KEY");
const email = env("MANAGER_EMAIL");

async function password() {
  if (process.env.MANAGER_PASSWORD) return process.env.MANAGER_PASSWORD;
  const prompt = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const answer = await prompt.question(`Password for ${email}: `);
  prompt.close();
  return answer;
}

async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: await password() }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    console.error(`Sign-in failed (${response.status}): ${body.msg ?? body.error_description ?? "check the email and password"}`);
    process.exit(1);
  }
  return body.access_token;
}

const token = await signIn();

async function api(method, path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = parsed?.error?.message ?? text;
    const issues = (parsed?.error?.details?.issues ?? [])
      .map((issue) => `\n  - ${issue.message ?? issue.code}${issue.path ? ` (${issue.path})` : ""}`)
      .join("");
    throw new Error(`${method} ${path} → ${response.status}: ${message}${issues}`);
  }
  return parsed;
}

function step(text) {
  console.log(`• ${text}`);
}

// 1. The account's profile exists once /v1/me has been read.
const me = await api("GET", "/v1/me");
step(`Signed in as ${email}`);

// 2. The organization, with its first project, by slug.
let org = (await api("GET", "/v1/orgs")).find((entry) => entry.slug === values["org-slug"]);
if (!org) {
  org = await api("POST", "/v1/orgs", {
    name: values["org-name"],
    slug: values["org-slug"],
    project: { name: values["project-name"], code: values["project-code"], timezone: values.timezone },
  });
  step(`Created the organization ${org.name} (${org.slug})`);
} else step(`Organization ${org.name} (${org.slug}) already exists`);

// 3. The project, by code.
let project = (await api("GET", `/v1/orgs/${org.id}/projects`)).find(
  (entry) => entry.code === values["project-code"],
);
if (!project) {
  project = await api("POST", `/v1/orgs/${org.id}/projects`, {
    name: values["project-name"],
    code: values["project-code"],
    timezone: values.timezone,
  });
  step(`Created the project ${project.name}`);
} else step(`Project ${project.name} already exists`);
const base = `/v1/projects/${project.project_id}`;

// 4. Janet's forms, published. A form already published is left as it is.
function definition(file) {
  return JSON.parse(readFileSync(join(root, "contracts", "forms", file), "utf8"));
}
const FORMS = [
  { code: "behaviour-mapping", name: "Behaviour mapping", file: "janet-test-v1.json" },
  { code: "zone-inventory", name: "Zone inventory", file: "janet-inventory-v1.json" },
];
const published = {};
for (const form of FORMS) {
  const listed = (await api("GET", `${base}/forms`)).find((entry) => entry.code === form.code);
  const live = listed?.versions.find((version) => version.state === "published");
  if (live) {
    published[form.code] = live.code;
    step(`Form ${form.name} is published as ${live.code}`);
    continue;
  }
  const draft = listed
    ? listed.versions.find((version) => version.state === "draft") ??
      (await api("POST", `${base}/forms/${form.code}/versions`, { definition: definition(form.file) }))
    : await api("POST", `${base}/forms`, {
        code: form.code,
        name: form.name,
        definition: definition(form.file),
      });
  const done = await api("POST", `${base}/form-versions/${draft.code}/publish`);
  published[form.code] = done.code;
  step(`Published ${form.name} as ${done.code}`);
}

// 5. The site, by code.
let site = (await api("GET", `${base}/sites`)).find((entry) => entry.code === values["site-code"]);
if (!site) {
  site = await api("POST", `${base}/sites`, { code: values["site-code"], name: values["site-name"] });
  step(`Created the site ${site.name}`);
} else step(`Site ${site.name} already exists`);

// 6. Its map package, unless it has one.
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Fall Creek from the committed drawings: the outline, the surfaces, equipment, tree canopies, one zone. */
function fallCreek() {
  const sample = join(root, "qgis", "fall-creek", "upload-sample");
  const drawings = join(root, "mobile", "src", "maps", "sites", "fall-creek");
  const outline = readJson(join(sample, "ground.geojson"));
  const surfaces = readJson(join(drawings, "surfaces.json"));
  const equipment = readJson(join(drawings, "equipment.json"));
  const zones = readJson(join(sample, "zones.geojson"));
  return {
    ground: {
      type: "FeatureCollection",
      features: [
        ...outline.features,
        ...surfaces.features,
        // The palette colours equipment as one kind; the drawing's own kind is kept as its type.
        ...equipment.features.map((feature) => ({
          ...feature,
          properties: { ...feature.properties, kind: "equipment", type: feature.properties.kind },
        })),
      ],
    },
    trees: readJson(join(drawings, "trees.json")),
    // The QGIS sample's display label is the zone's name, which the import requires.
    zones: {
      ...zones,
      features: zones.features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, name: feature.properties.name ?? feature.properties.label },
      })),
    },
  };
}

function folder(path) {
  const layers = {};
  for (const name of ["ground", "zones", "trees", "paths"]) {
    try {
      layers[name] = readJson(join(path, `${name}.geojson`));
    } catch {
      // A layer that is not there is left out; the API says which ones it needs.
    }
  }
  return layers;
}

/** Zone codes the API accepts (contract "Zone identity"). */
const ZONE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

if (site.package) {
  step(`Site ${site.name} already has map v${site.package.package_version}`);
} else {
  const layers = values.package === "fall-creek" ? fallCreek() : folder(values.package);
  // A first map: every feature of the zones layer becomes a new zone, coded by its `id`. A refused
  // package is answered with its reasons, which `api` prints.
  const zones = (layers.zones?.features ?? []).map((feature) => String(feature.properties?.id ?? ""));
  const unusable = zones.filter((code) => code.length > 100 || !ZONE_CODE.test(code));
  if (unusable.length > 0) {
    console.error(`Each zone needs an \`id\` of letters, digits, ".", "_" or "-": ${JSON.stringify(unusable)}`);
    process.exit(1);
  }
  const publication = await api("POST", `${base}/packages`, {
    site_id: site.site_id,
    request_id: randomUUID(),
    expected_current_package_id: site.current_package_id ?? null,
    form_version: published["behaviour-mapping"],
    inventory_form_version: published["zone-inventory"],
    change_note: "First map, set up with the bootstrap script",
    zone_identity_map: zones.map((code) => ({ source_feature_id: code, zone_id: randomUUID(), zone_code: code })),
    layers,
  });
  step(`Published map v${publication.package.package_version} for ${site.name}`);
}

// 7. Invitations and join codes, printed once.
const invitations = [];
for (const entry of values.invite) {
  const [inviteEmail, role] = entry.split(":");
  const created = await api("POST", `${base}/invitations`, {
    role,
    email: inviteEmail,
    expires_in_days: 30,
  });
  invitations.push(`${role.padEnd(8)} ${inviteEmail}  code ${created.code}`);
}
for (const entry of values["join-code"]) {
  const [role, uses] = entry.split(":");
  const created = await api("POST", `${base}/invitations`, {
    role,
    max_uses: Number(uses ?? 1),
    expires_in_days: 30,
  });
  invitations.push(`${role.padEnd(8)} up to ${uses ?? 1} people  code ${created.code}`);
}

console.log(`
Ready: ${org.name} · ${project.name} (${project.project_id})
Signed in as profile ${me.profile.user_id}.`);
if (invitations.length > 0)
  console.log(`
Codes — shown once, the server keeps only their hashes. Enter one in the app under Join a project:
  ${invitations.join("\n  ")}`);
