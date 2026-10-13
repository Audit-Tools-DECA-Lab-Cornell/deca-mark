import assert from "node:assert/strict";
import { test } from "node:test";
import { localUrl, main, workspaceObservation, workspacePackageRequest } from "./seed-web-workspace.mjs";

test("the seed refuses hosted, ambiguous and credential-bearing targets", async () => {
  for (const target of ["https://example.supabase.co", "http://localhost.evil:8001",
    "http://127.0.0.1:8000", "http://user:password@127.0.0.1:8001",
    "http://127.0.0.1:8001/path", "http://127.0.0.1:8001/?next=hosted"])
    await assert.rejects(main(["--api-url", target]), /loopback/);
});

test("browser seed binds the current package contract and omits point fields for inventory", () => {
  const request = workspacePackageRequest("site", "workspace-check-v1", {});
  assert.equal(request.site_id, "site");
  assert.equal(request.expected_current_package_id, null);
  assert.equal(request.inventory_form_version, "workspace-check-v1");
  const zone = { zone_id: "zone", display_anchor: [-76.4956, 42.4508] };
  const point = workspaceObservation(0, "site", "package", zone);
  assert.deepEqual(point.coordinates, zone.display_anchor);
  assert.equal(point.package_id, "package");
  assert.equal(point.zone_id, "zone");
  assert.match(point.answers.note, /^Synthetic record/);
  const inventory = workspaceObservation(6, "site", "package", zone);
  assert.equal(inventory.round_type, "inventory");
  assert.equal("coordinates" in inventory, false);
  assert.equal("first_round" in inventory, false);
});

test("the seed accepts only the documented local ports and origins", () => {
  assert.equal(localUrl("http://127.0.0.1:8001/", 8001), "http://127.0.0.1:8001");
  assert.equal(localUrl("http://localhost:54321", 54321), "http://localhost:54321");
  assert.throws(() => localUrl("https://example.supabase.co", 54321), /loopback/);
});
