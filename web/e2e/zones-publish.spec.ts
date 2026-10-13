import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { REVIEW_SITE, signInToZones, ZONE_MANIFEST, zoneApi, type ZoneDraftRead, zoneFixture } from "./support/zones";

/**
 * Plan WEB-38: publishing a zone draft and discarding one. A draft is reviewed for its exact revision and
 * published as the next version; a lost answer is asked again with the same request and publishes once; a
 * publication made elsewhere meanwhile is refused with the draft kept; Discard asks first. Runs on the
 * synthetic zone review project (`scripts/e2e-local.sh --zones`). Every publication happens on a site this
 * run makes, so the fixture's own site keeps its two versions.
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

type Call = Awaited<ReturnType<typeof zoneApi>>;
type Site = { site_id: string; code: string; name: string };
type History = {
	current_package_id: string | null;
	packages: { package_id: string; package_version: number; change_note: string }[];
};

const ring = (west: number, south: number, east: number, north: number) => [
	[west, south],
	[east, south],
	[east, north],
	[west, north],
	[west, south]
];

/** A site of its own with a first map package of two zones, A and B. */
async function freshSite(call: Call): Promise<{ site: Site; v1: string }> {
	const { projectId } = zoneFixture();
	const tag = randomUUID().slice(0, 8);
	const site = await call<Site>("POST", `/v1/projects/${projectId}/sites`, {
		code: `publish-${tag}`,
		name: `Synthetic publish ${tag}`
	});
	const first = await call<{ package: { package_id: string } }>("POST", `/v1/projects/${projectId}/packages`, {
		site_id: site.site_id,
		request_id: randomUUID(),
		expected_current_package_id: null,
		form_version: "zone-review-play-v1",
		inventory_form_version: "zone-review-inventory-v1",
		change_note: "Synthetic first map; local acceptance only",
		zone_identity_map: [
			{ source_feature_id: "A", zone_id: randomUUID(), zone_code: "A" },
			{ source_feature_id: "B", zone_id: randomUUID(), zone_code: "B" }
		],
		layers: {
			ground: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: { kind: "site" },
						geometry: { type: "Polygon", coordinates: [ring(-76.4865, 42.447, -76.4835, 42.449)] }
					}
				]
			},
			zones: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: { id: "A", name: "Synthetic publish lawn" },
						geometry: { type: "Polygon", coordinates: [ring(-76.4864, 42.4478, -76.485, 42.4489)] }
					},
					{
						type: "Feature",
						properties: { id: "B", name: "Synthetic publish beds" },
						geometry: { type: "Polygon", coordinates: [ring(-76.4849, 42.4477, -76.4845, 42.448)] }
					}
				]
			}
		}
	});
	return { site, v1: first.package.package_id };
}

/** A draft from `base`, with zone A renamed so it differs from it. */
async function renamedDraft(call: Call, siteId: string, base: string, name: string): Promise<ZoneDraftRead> {
	const { projectId } = zoneFixture();
	const drafts = `/v1/projects/${projectId}/sites/${siteId}/zone-drafts`;
	const draft = await call<ZoneDraftRead>("POST", drafts, { request_id: randomUUID(), base_package_id: base });
	const zones = draft.zones.map(zone => (zone.zone_code === "A" ? { ...zone, zone_label: name } : zone));
	return call<ZoneDraftRead>("PUT", `${drafts}/${draft.draft_id}`, { zones, change_note: "" }, draft.etag);
}

test("a draft is reviewed and published once, a conflict keeps it, and Discard asks first", async ({ page }) => {
	test.setTimeout(240_000);
	const { path, projectId, siteId: reviewSiteId } = zoneFixture();
	const call = await zoneApi("manager");
	await signInToZones(page, "manager");
	const main = page.getByRole("main");
	const history = (siteId: string) => call<History>("GET", `/v1/projects/${projectId}/packages?site_id=${siteId}`);

	await test.step("start, edit, review and publish as v2", async () => {
		const { site } = await freshSite(call);
		const zones = `${path}/sites/${site.code}/zones`;
		await page.goto(zones);
		await main.getByRole("button", { name: "Start a draft from v1" }).click();
		await page.getByRole("dialog").getByRole("button", { name: "Start the draft" }).click();
		await expect(page).toHaveURL(/\/zones\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await main
			.getByRole("listbox", { name: "Zones" })
			.getByRole("option", { name: /Synthetic publish lawn/ })
			.click();
		await main.getByLabel("Name", { exact: true }).fill("Synthetic publish lawn renamed");
		await main.getByRole("button", { name: "Review and publish" }).click();
		await expect(page).toHaveURL(/\/publish$/, { timeout: 30_000 });

		await expect(main.getByRole("region", { name: "Ready to publish?" })).toContainText(
			"Ready to publish: revision 2",
			{
				timeout: 30_000
			}
		);
		await expect(main.getByRole("region", { name: "Changes" })).toContainText("Name changed");
		await main.getByLabel("Change note").fill("Renamed the lawn");
		// Leaving before the note is saved asks first; Save and leave saves it, and the review opens again.
		await main.getByRole("link", { name: "Back to the editor" }).click();
		const leaving = page.getByRole("dialog", { name: "Save your changes first?" });
		await expect(leaving).toBeVisible();
		await leaving.getByRole("button", { name: "Save and leave" }).click();
		await expect(page).toHaveURL(/\/zones\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await main.getByRole("button", { name: "Review and publish" }).click();
		await expect(page).toHaveURL(/\/publish$/, { timeout: 30_000 });
		await expect(main.getByLabel("Change note")).toHaveValue("Renamed the lawn");
		await expect(main.getByRole("region", { name: "Ready to publish?" })).toContainText(
			"Ready to publish: revision 3",
			{
				timeout: 30_000
			}
		);
		const publish = main.getByRole("button", { name: "Publish v2" });
		await expect(publish).toBeDisabled();
		await main.getByText("I understand published boundaries cannot be edited.").click();
		await publish.click();

		await expect(page).toHaveURL(new RegExp(`${zones}$`), { timeout: 30_000 });
		// The toast's words are shown and announced, so they are on the page twice.
		await expect(page.getByText("v2 is published.").first()).toBeVisible();
		await expect(main.getByRole("region", { name: "Versions" })).toContainText("Replaced by v2");
		const after = await history(site.site_id);
		const v2 = after.packages.find(item => item.package_id === after.current_package_id);
		expect(v2?.package_version).toBe(2);
		expect(v2?.change_note).toBe("Renamed the lawn");
	});

	await test.step("a lost answer is asked again with the same request, and publishes once", async () => {
		const { site, v1 } = await freshSite(call);
		const draft = await renamedDraft(call, site.site_id, v1, "Lost answer lawn");
		await page.goto(`${path}/sites/${site.code}/zones/drafts/${draft.draft_id}/publish`);
		await expect(main.getByRole("region", { name: "Ready to publish?" })).toContainText("Ready to publish", {
			timeout: 30_000
		});
		// The request reaches DECA Mark; its answer never reaches the page.
		let reached = 0;
		await page.route(
			/\/zone-drafts\/[0-9a-f-]{36}\/publish$/,
			async route => {
				reached = (await route.fetch()).status();
				await route.abort("connectionreset");
			},
			{ times: 1 }
		);
		await main.getByText("I understand published boundaries cannot be edited.").click();
		await main.getByRole("button", { name: "Publish v2" }).click();
		await expect.poll(() => reached, { timeout: 30_000 }).toBe(201);
		await expect(main).toContainText("This draft was already published as v2.", { timeout: 30_000 });
		await expect(main).toContainText("v2 is the current version.");
		expect((await history(site.site_id)).packages).toHaveLength(2);
	});

	await test.step("a version published elsewhere meanwhile is refused, and the draft is kept", async () => {
		const { site, v1 } = await freshSite(call);
		const mine = await renamedDraft(call, site.site_id, v1, "Mine lawn");
		const theirs = await renamedDraft(call, site.site_id, v1, "Theirs lawn");
		await page.goto(`${path}/sites/${site.code}/zones/drafts/${mine.draft_id}/publish`);
		await expect(main.getByRole("region", { name: "Ready to publish?" })).toContainText("Ready to publish", {
			timeout: 30_000
		});
		// Another manager publishes first (DECA Mark allows each manager 10 publications a minute).
		await (
			await zoneApi("manager2")
		)(
			"POST",
			`/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts/${theirs.draft_id}/publish`,
			{ request_id: randomUUID(), expected_current_package_id: v1 },
			theirs.etag
		);
		await main.getByText("I understand published boundaries cannot be edited.").click();
		await main.getByRole("button", { name: "Publish v2" }).click();
		await expect(main).toContainText(
			"v2 was published while you were reviewing. Your draft is based on v1 and is unchanged.",
			{ timeout: 30_000 }
		);
		await expect(main.getByRole("button", { name: "Start a draft from v2" })).toBeVisible();
		const kept = await call<ZoneDraftRead & { state: string }>(
			"GET",
			`/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts/${mine.draft_id}`
		);
		expect(kept.state).toBe("draft");
		expect((await history(site.site_id)).packages).toHaveLength(2);
	});

	await test.step("Discard asks first, then the draft is gone", async () => {
		const current = (await history(reviewSiteId)).current_package_id!;
		const draft = await renamedDraft(call, reviewSiteId, current, "Discarded lawn");
		await page.goto(`${path}/sites/${REVIEW_SITE}/zones/drafts/${draft.draft_id}`);
		await expect(main).toContainText(`· revision ${draft.revision}`, { timeout: 30_000 });
		await main.getByRole("button", { name: "Discard draft" }).click();
		const dialog = page.getByRole("dialog", { name: "Discard this draft?" });
		await expect(dialog).toContainText("Published versions and observations are not affected.");
		await dialog.getByRole("button", { name: "Discard draft" }).click();
		await expect(page).toHaveURL(new RegExp(`/sites/${REVIEW_SITE}/zones$`), { timeout: 30_000 });
		const gone = await call<{ state: string }>(
			"GET",
			`/v1/projects/${projectId}/sites/${reviewSiteId}/zone-drafts/${draft.draft_id}`
		);
		expect(gone.state).toBe("discarded");
	});
});
