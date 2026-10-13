import { expect, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { manifest, projectPath } from "./support/manifest";
import { downloadText, downloadZip } from "./support/ui";

/** Plan step 8: the QGIS page's GeoJSON export and the reports. */

test.use({ storageState: authFile("manager") });

type Feature = { geometry: { type: string; coordinates: number[] } | null; properties: Record<string, unknown> };

test("the QGIS page exports every record as GeoJSON: points, and inventories as whole-zone records", async ({
	page
}) => {
	const { baseline, observations } = manifest();
	await page.goto(projectPath("qgis"));
	const main = page.getByRole("main");
	await expect(main.getByRole("status")).toContainText(`${baseline.total} observations`);

	const { name, files } = await downloadZip(page, () =>
		main.getByRole("button", { name: "Download GeoJSON", exact: true }).click()
	);
	expect(name).toMatch(/\.zip$/);
	expect(Object.keys(files)).toEqual(expect.arrayContaining(["observations.geojson", "codebook.csv"]));
	const collection = JSON.parse(files["observations.geojson"]!) as { type: string; features: Feature[] };
	expect(collection.type).toBe("FeatureCollection");
	expect(collection.features).toHaveLength(baseline.total);
	for (const feature of collection.features) {
		expect(observations).toContain(feature.properties.observation_id);
		if (feature.properties.round_type === "inventory") {
			// An inventory describes the whole zone: no point, joined to the zone by its identity.
			expect(feature.geometry).toBeNull();
			expect(feature.properties.spatial_support).toBe("zone");
			expect(feature.properties.zone_id).toEqual(expect.any(String));
		} else expect(feature.geometry?.type).toBe("Point");
	}
	expect(collection.features.filter(feature => feature.geometry === null)).toHaveLength(baseline.inventory);
});

test("the QGIS page downloads a map version's zone boundaries for joining inventories", async ({ page }) => {
	const { baseline } = manifest();
	await page.goto(projectPath("qgis"));
	const button = page.getByRole("button", { name: /^Download the zone boundaries of .+ map v\d+$/ }).first();
	const { name, text } = await downloadText(page, () => button.click());
	expect(name).toMatch(/^fall-creek-zones-v\d+\.geojson$/);
	const zones = JSON.parse(text) as {
		features: { geometry: { type: string }; properties: Record<string, unknown> }[];
	};
	const zone = zones.features.find(feature => feature.properties.zone_code === baseline.zone);
	expect(zone?.geometry.type).toBe("MultiPolygon");
	expect(zone?.properties.zone_id).toEqual(expect.any(String));
	expect(zone?.properties.map_version).toEqual(expect.any(Number));
});

test("the reports count the records by round type and zone, and can be printed", async ({ page }) => {
	const { baseline } = manifest();
	await page.goto(projectPath("reports"));
	const main = page.getByRole("main");
	await expect(main).toContainText(new RegExp(`Standard[^\\d]{0,40}\\b${baseline.standard}\\b`, "i"));
	await expect(main).toContainText(new RegExp(`Reliability[^\\d]{0,40}\\b${baseline.reliability}\\b`, "i"));
	await expect(main).toContainText(new RegExp(`Inventory[^\\d]{0,40}\\b${baseline.inventory}\\b`, "i"));
	await expect(main).toContainText(new RegExp(`\\b${baseline.zone}\\b[^\\d]{0,40}\\b${baseline.total}\\b`));
	await expect(main.getByRole("button", { name: /print/i })).toBeVisible();
});
