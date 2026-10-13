import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";

import { api, currentPackageVersion, currentZone, newestPackageVersion, siteByCode } from "./support/api";
import { authFile } from "./support/auth";
import { manifest, projectPath, runStamp, SEED } from "./support/manifest";

/**
 * Plan WEB-42: every upload says which zone each zone of the file is. A later version keeps a zone's
 * identity (and so its records), adds new zones and leaves others out; a map that changed meanwhile is
 * never overwritten.
 */

test.use({ storageState: authFile("manager") });

const SITE = SEED.sites.fallCreek;
const DIR = fileURLToPath(new URL("../../qgis/fall-creek/upload-sample/", import.meta.url));
const ground = JSON.parse(readFileSync(`${DIR}ground.geojson`, "utf8"));
const sample = JSON.parse(readFileSync(`${DIR}zones.geojson`, "utf8"));

// The sample's one zone is the whole site; the specs split it along a north–south line through its middle.
const ring: [number, number][] = sample.features[0].geometry.coordinates[0];
const west = Math.min(...ring.map(point => point[0]));
const east = Math.max(...ring.map(point => point[0]));
const south = Math.min(...ring.map(point => point[1]));
const north = Math.max(...ring.map(point => point[1]));
const middle = Number(((west + east) / 2).toFixed(7));

const box = (from: number, to: number) => ({
	type: "Polygon",
	coordinates: [
		[
			[from, south],
			[to, south],
			[to, north],
			[from, north],
			[from, south]
		]
	]
});
const zone = (id: string, name: string, geometry: unknown) => ({ type: "Feature", properties: { id, name }, geometry });
const collection = (features: unknown[]) => ({ type: "FeatureCollection", features });
const file = (name: string, value: unknown) => ({
	name,
	mimeType: "application/geo+json",
	buffer: Buffer.from(JSON.stringify(value))
});

async function openUpload(page: Page, zones: unknown) {
	await page.goto(projectPath(`sites/${SITE}/packages?step=upload`));
	await page
		.getByLabel("Choose files from the QGIS export", { exact: true })
		.setInputFiles([file("ground.geojson", ground), file("zones.geojson", zones)]);
}

async function upload(page: Page, note: string, next: number) {
	await page.getByLabel("What changed", { exact: true }).fill(note);
	await page.getByRole("button", { name: "Upload package", exact: true }).click();
	await expect.poll(() => currentPackageVersion(SITE), { timeout: 60_000 }).toBe(next);
	await expect(
		page
			.getByRole("main")
			.getByText(new RegExp(`\\bversion ${next}\\b`, "i"))
			.first()
	).toBeVisible({
		timeout: 30_000
	});
}

const zoneCodes = async () =>
	(await siteByCode(SITE)).zones.map(entry => [entry.zone_code, entry.zone_id] as const).sort();

test("a later upload keeps one zone, adds one and leaves one out, and the records stay with their zone", async ({
	page
}) => {
	test.setTimeout(240_000);
	const { baseline } = manifest();
	const kept = await currentZone(SITE, baseline.zone);
	const stamp = runStamp();
	const first = `E${stamp}`;
	const second = `F${stamp}`;

	// 1. Zone A becomes the west half; the east half is a new zone.
	let next = (await newestPackageVersion(SITE)) + 1;
	await openUpload(
		page,
		collection([zone("A", kept.label, box(west, middle)), zone(first, "East half", box(middle, east))])
	);
	await page.getByLabel("Zone A is", { exact: true }).selectOption(kept.zone_id);
	// No feature carries an identity, and none of the new zone's names match: it is new, coded by its id.
	await expect(page.getByLabel(`Zone ${first} is`, { exact: true })).toHaveValue("~new");
	await expect(page.getByLabel("Code of the new zone", { exact: true })).toHaveValue(first);
	await upload(page, "Split the playground", next);
	const added = await currentZone(SITE, first);
	expect(await zoneCodes()).toEqual([
		[baseline.zone, kept.zone_id],
		[first, added.zone_id]
	]);

	// 2. One mapped, one new, one left out: the page names the zone that goes.
	next += 1;
	await openUpload(
		page,
		collection([zone("A", kept.label, box(west, middle)), zone(second, "East corner", box(middle, east))])
	);
	await page.getByLabel("Zone A is", { exact: true }).selectOption(kept.zone_id);
	await expect(page.getByText("Removed from the next version: East half.", { exact: true })).toBeVisible();
	await upload(page, "Replace the east half", next);
	const replaced = await currentZone(SITE, second);
	expect(replaced.zone_id).not.toBe(added.zone_id);
	expect(await zoneCodes()).toEqual([
		[baseline.zone, kept.zone_id],
		[second, replaced.zone_id]
	]);

	// The records collected in zone A on the first map are still counted in zone A.
	await page.goto(projectPath(`sites/${SITE}`));
	const row = page.getByRole("main").locator("li, tr").filter({ hasText: kept.label }).first();
	await expect(row).toContainText(new RegExp(`\\b${baseline.total} observations\\b`));

	// 3. Back to the sample's one zone, so the other specs see the seeded site.
	next += 1;
	await openUpload(page, sample);
	await page.getByLabel("Zone A is", { exact: true }).selectOption(kept.zone_id);
	await expect(page.getByText("Removed from the next version: East corner.", { exact: true })).toBeVisible();
	await upload(page, "Back to one zone", next);
	expect(await zoneCodes()).toEqual([[baseline.zone, kept.zone_id]]);
});

test("an upload checked against a map that changed meanwhile is refused, and nothing is replaced", async ({ page }) => {
	test.setTimeout(120_000);
	const { baseline } = manifest();
	const kept = await currentZone(SITE, baseline.zone);
	await openUpload(page, sample);
	await page.getByLabel("Zone A is", { exact: true }).selectOption(kept.zone_id);
	await expect(page.getByRole("button", { name: "Upload package", exact: true })).toBeEnabled();

	// Another manager uploads a version while this page still shows the earlier one.
	const site = await siteByCode(SITE);
	const meanwhile = (await newestPackageVersion(SITE)) + 1;
	await api("manager", "POST", `/v1/projects/${manifest().projectId}/packages`, {
		site_id: site.site_id,
		request_id: randomUUID(),
		expected_current_package_id: site.current_package_id,
		form_version: site.package?.forms.play.form_version,
		layers: {
			ground,
			zones: collection(
				sample.features.map((entry: { properties: { label: string } }) => ({
					...entry,
					properties: { ...entry.properties, name: entry.properties.label }
				}))
			)
		},
		zone_identity_map: [{ source_feature_id: "A", zone_id: kept.zone_id, zone_code: kept.zone_code }],
		change_note: "Uploaded meanwhile"
	});
	expect(await currentPackageVersion(SITE)).toBe(meanwhile);

	await page.getByRole("button", { name: "Upload package", exact: true }).click();
	const refusal = page.getByRole("main").getByText(/^Not uploaded\. .*meanwhile\. Read the current version/);
	await expect(refusal).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText("The package was not uploaded.", { exact: true })).toBeVisible();
	expect(await currentPackageVersion(SITE)).toBe(meanwhile);
	expect(await newestPackageVersion(SITE)).toBe(meanwhile);
});
