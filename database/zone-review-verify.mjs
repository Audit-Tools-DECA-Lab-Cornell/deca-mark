import assert from "node:assert/strict";
import { labels, observations, zoneId } from "./zone-review-fixture.mjs";

export function verifySavedDraft(draft, expectedZones, note, revision = 2) {
  assert.equal(draft.revision, revision, "Fixture draft was edited; refusing to publish or overwrite it");
  assert.equal(draft.change_note, note);
  assert.deepEqual(draft.zones, expectedZones, "Fixture draft changed; refusing to publish or overwrite edits");
}

// Verify the persisted API projection, including the page beyond the 500-row limit.
export async function verifyReview(api, base, siteId, packageIds) {
  const query = `${base}/observations?site_id=${siteId}&limit=500`;
  const rows = [], cursors = new Set();
  let cursor = null;
  do {
    const page = await api(query + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""));
    assert.equal(page.total_matching, 520, "Expected exactly 520 synthetic records; fixture was changed");
    assert.ok(Array.isArray(page.items), "API observation page must contain items");
    rows.push(...page.items);
    cursor = page.next_cursor;
    assert.ok(cursor === null || (typeof cursor === "string" && !cursors.has(cursor)), "Invalid/repeated paging cursor");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  assert.equal(rows.length, 520, "Expected 520 rows across every API page");
  const expected = new Map(observations(siteId, packageIds).map(row => [row.id, row.body]));
  assert.equal(new Set(rows.map(row => row.observation_id)).size, 520);
  for (const row of rows) {
    const body = expected.get(row.observation_id);
    assert.ok(body, "Unexpected record in synthetic fixture project");
    const version = packageIds.indexOf(body.package_id) + 1;
    assert.equal(row.package_id, body.package_id);
    assert.equal(row.revision, 1, "Seed replay must not revise a historical record");
    assert.equal(row.site_id, body.site_id);
    assert.equal(row.package_version, version);
    assert.equal(row.zone_id, zoneId);
    assert.equal(row.zone_label, labels[version - 1]);
    assert.deepEqual(row.answers, body.answers);
    assert.equal(row.round_type, body.round_type);
    if (body.round_type === "inventory") {
      assert.equal(row.geometry, null);
      assert.equal(row.spatial_support, "zone");
    } else assert.deepEqual(row.geometry.coordinates, body.coordinates);
  }
  const summary = await api(`${base}/observations/summary?site_id=${siteId}`);
  assert.equal(summary.total_matching, 520);
  assert.equal(summary.groups.reduce((sum, group) => sum + group.count, 0), 520);
  const inventory = rows.filter(row => row.round_type === "inventory").length;
  assert.equal(inventory, 40);
  return { total: 520, standard: 400, reliability: 80, inventory, versions: [1, 2], perVersion: 260 };
}
