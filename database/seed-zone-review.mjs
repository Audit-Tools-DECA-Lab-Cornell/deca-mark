#!/usr/bin/env node
// Opt-in synthetic local fixture. All application writes use the authenticated /v1 API.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { localUrl } from "./seed-web-workspace.mjs";
import { localAccounts } from "./local-seed-api.mjs";
import { definition, observations, packageRequest, successorZones, uuid } from "./zone-review-fixture.mjs";
import { verifyReview, verifySavedDraft } from "./zone-review-verify.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    "api-url": { type: "string", default: "http://127.0.0.1:8001" }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("Usage: node database/seed-zone-review.mjs [--api-url http://127.0.0.1:8001]\n"
      + "Local Supabase and config.auth-local.json only. No resets or hosted services.\n"
      + "Synthetic accounts: zone-<owner|manager|manager2|observer|viewer>@fieldmaps.test; password FieldMaps-local-only-42!.");
    return;
  }
  const apiUrl = localUrl(values["api-url"], 8001);
  const { accounts, authUrl, publicKey } = await localAccounts(root, apiUrl);
  const owner = accounts.owner.api;
  let org = (await owner("/v1/orgs")).find(item => item.slug === "zone-review-acceptance");
  if (!org) org = await owner("/v1/orgs", "POST", {
    name: "Synthetic zone review acceptance", slug: "zone-review-acceptance",
    project: { name: "Synthetic zone review", code: "zone-review", timezone: "America/New_York" },
  });
  const project = (await owner(`/v1/orgs/${org.id}/projects`)).find(item => item.code === "zone-review");
  assert.ok(project, "Fixture project was changed; use a separate local stack");
  const base = `/v1/projects/${project.project_id}`;
  for (const role of ["manager", "manager2", "observer", "viewer"]) {
    const memberRole = role === "manager2" ? "manager" : role;
    const member = (await owner(`${base}/members`)).find(item => item.user_id === accounts[role].id);
    if (member) assert.equal(member.role, memberRole, "Fixture membership was changed");
    else {
      const invite = await owner(`${base}/invitations`, "POST", { role: memberRole, email: accounts[role].email });
      await accounts[role].api("/v1/invitations/redeem", "POST", { token: invite.token });
    }
  }
  const api = accounts.manager.api;
  for (const kind of ["play", "inventory"]) {
    const code = `zone-review-${kind}`;
    if (!(await api(`${base}/forms`)).some(item => item.code === code))
      await api(`${base}/forms`, "POST", { code, name: `Synthetic ${kind} form`, definition: definition(kind) });
    let version = await api(`${base}/form-versions/${code}-v1`);
    if (version.state === "draft") version = await api(`${base}/form-versions/${code}-v1/publish`, "POST");
    assert.equal(version.state, "published", "Fixture form was retired; seed will not rewrite it");
  }
  const sites = {};
  for (const code of ["review-site", "no-package"]) {
    let site = (await api(`${base}/sites`)).find(item => item.code === code);
    if (!site) site = await api(`${base}/sites`, "POST", {
      code, name: `Synthetic ${code}`, description: "Synthetic local acceptance only; not research data.",
    });
    sites[code] = site.site_id;
  }
  const siteId = sites["review-site"], siteUrl = `${base}/sites/${siteId}`;
  const first = (await api(`${base}/packages`, "POST", packageRequest(siteId))).package;
  assert.equal(first.package_version, 1);
  const draftUrl = `${siteUrl}/zone-drafts`;
  const original = await api(`${siteUrl}/zones?package_id=${first.package_id}`);
  const inputZones = zones => zones.map(({ zone_id, zone_code, zone_label, geometry }) => ({ zone_id, zone_code, zone_label, geometry }));
  const expectedZones = successorZones(inputZones(original.zones));
  const changeNote = "Synthetic smaller boundary and renamed zone; local acceptance only";
  let draft = await api(draftUrl, "POST", { request_id: uuid(11), base_package_id: first.package_id });
  const publicationUrl = `${draftUrl}/${draft.draft_id}`;
  if (draft.state === "draft") {
    if (draft.revision === 1) {
      assert.deepEqual(draft.zones, inputZones(original.zones), "Initial publication draft was changed");
      draft = await api(publicationUrl, "PUT", { zones: expectedZones, change_note: changeNote }, { "If-Match": draft.etag });
    }
    verifySavedDraft(draft, expectedZones, changeNote);
    await api(`${publicationUrl}/validate`, "POST", undefined, { "If-Match": draft.etag });
    await api(`${publicationUrl}/publish`, "POST", {
      request_id: uuid(12), expected_current_package_id: first.package_id,
    }, { "If-Match": draft.etag });
    draft = await api(publicationUrl);
  }
  assert.equal(draft.state, "published", "Fixture publication draft was discarded");
  verifySavedDraft(draft, expectedZones, changeNote, 3);
  const packageIds = [first.package_id, draft.published_package_id];
  const history = await api(`${base}/packages?site_id=${siteId}`);
  assert.equal(history.packages.length, 2, "Fixture has unexpected extra map versions");
  assert.equal(history.current_package_id, packageIds[1]);
  assert.equal(history.packages.find(item => item.package_id === packageIds[1])?.package_version, 2);
  const empty = await api(`${base}/sites/${sites["no-package"]}`);
  assert.equal(empty.current_package_id, null, "Empty fixture site was changed");
  const openDrafts = {};
  const current = await api(`${siteUrl}/zones?package_id=${packageIds[1]}`);
  for (const [index, role] of ["manager", "manager2"].entries()) {
    const managerApi = accounts[role].api;
    let open = await managerApi(draftUrl, "POST", { request_id: uuid(20 + index), base_package_id: packageIds[1] });
    assert.equal(open.state, "draft", "Open fixture draft was published/discarded; seed will not replace it");
    const note = `Synthetic ${role} open draft`;
    if (open.revision === 1) open = await managerApi(`${draftUrl}/${open.draft_id}`, "PUT", {
      zones: open.zones, change_note: note,
    }, { "If-Match": open.etag });
    assert.equal(open.created_by, accounts[role].id);
    verifySavedDraft(open, inputZones(current.zones), note);
    openDrafts[role] = { draftId: open.draft_id, etag: open.etag, revision: open.revision };
  }
  // Upload v1 records after v2 publication to exercise delayed offline attribution.
  const records = observations(siteId, packageIds);
  for (const row of records) await accounts.observer.api(`${base}/observations/${row.id}`, "PUT", row.body);
  const baseline = await verifyReview(accounts.viewer.api, base, siteId, packageIds);
  const manifest = {
    synthetic: true, apiUrl, supabaseUrl: authUrl, publishableKey: publicKey,
    accounts: Object.fromEntries(Object.entries(accounts).map(([role, account]) => [role, { id: account.id, email: account.email }])),
    organizationId: org.id, projectId: project.project_id, path: "/o/zone-review-acceptance/p/zone-review",
    siteId, emptySiteId: sites["no-package"], packageIds, drafts: openDrafts,
    observations: records.map(row => row.id), baseline,
  };
  mkdirSync(join(root, "database/.local"), { recursive: true, mode: 0o700 });
  const destination = join(root, "database/.local/zone-review.json");
  writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Zone review fixture verified: 520 synthetic observations, maps v1/v2, 40 inventories, two open manager drafts. Manifest: ${destination}`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => { console.error(error instanceof Error ? error.message : "Zone seed failed"); process.exitCode = 1; });
