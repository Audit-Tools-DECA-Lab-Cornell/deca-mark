import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "./seed-zone-review.mjs";
import { observations, packageRequest, zoneId } from "./zone-review-fixture.mjs";
import { verifyReview, verifySavedDraft } from "./zone-review-verify.mjs";

test("zone seed rejects hosted and ambiguous targets before reading runtime credentials", async () => {
  for (const target of ["https://example.supabase.co", "http://localhost.evil:8001",
    "http://127.0.0.1:8000", "http://user:password@127.0.0.1:8001",
    "http://127.0.0.1:8001/path", "http://127.0.0.1:8001/?next=hosted"])
    await assert.rejects(main(["--api-url", target]), /loopback/);
});

test("fixture exercises paging and both historical map versions with zone inventories", () => {
  const rows = observations("site", ["old-package", "current-package"]);
  assert.equal(rows.length, 520);
  assert.equal(new Set(rows.map(row => row.id)).size, 520);
  assert.deepEqual(rows, observations("site", ["old-package", "current-package"]));
  for (const packageId of ["old-package", "current-package"]) {
    const bodies = rows.filter(row => row.body.package_id === packageId).map(row => row.body);
    assert.equal(bodies.length, 260);
    assert.equal(bodies.filter(body => body.round_type === "inventory").length, 20);
    for (const body of bodies) {
      assert.equal(body.zone_id, zoneId);
      assert.match(body.answers.note, /^Synthetic /);
      if (body.round_type === "inventory") {
        assert.equal(body.placement, "zone");
        assert.equal("coordinates" in body, false);
        assert.equal("first_round" in body, false);
      } else assert.equal(body.coordinates.length, 2);
    }
  }
  const request = packageRequest("site");
  assert.equal(request.expected_current_package_id, null);
  assert.equal(request.zone_identity_map[0].zone_id, zoneId);
  assert.equal(request.layers.zones.features[0].geometry.coordinates.length, 2);
  assert.equal(request.layers.zones.features[1].geometry.type, "MultiPolygon");
});

test("acceptance verifier rejects partial pagination instead of accepting a truncated fixture", async () => {
  const api = async () => ({ items: [], total_matching: 520, next_cursor: null });
  await assert.rejects(verifyReview(api, "/project", "site", ["v1", "v2"]), /520/);
});

test("resume refuses another manager's saved geometry, code, revision or note changes", () => {
  const zones = [{ zone_id: zoneId, zone_code: "A", zone_label: "Synthetic A" },
    { zone_id: "second-zone", zone_code: "B", zone_label: "Synthetic B" }];
  const draft = { revision: 2, change_note: "Synthetic fixture", zones };
  verifySavedDraft(draft, zones, "Synthetic fixture");
  // The server advances the revision once more when it closes a published draft.
  verifySavedDraft({ ...draft, revision: 3 }, zones, "Synthetic fixture", 3);
  for (const changed of [
    { ...draft, revision: 3 }, { ...draft, change_note: "Someone else's note" },
    { ...draft, zones: [{ ...zones[0], zone_code: "changed" }, zones[1]] },
    { ...draft, zones: [zones[0], { ...zones[1], geometry: { type: "Polygon", coordinates: [] } }] },
  ]) assert.throws(() => verifySavedDraft(changed, zones, "Synthetic fixture"));
});
