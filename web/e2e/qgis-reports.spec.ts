import { expect, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { manifest, projectPath } from "./support/manifest";
import { downloadText } from "./support/ui";

/** Plan step 8: the QGIS page's GeoJSON export and the reports. */

test.use({ storageState: authFile("manager") });

type Feature = { geometry: { type: string; coordinates: number[] } | null; properties: Record<string, unknown> };

test("the QGIS page exports the records as GeoJSON: points, and inventories as whole-zone records", async ({
	page
}) => {
	const { baseline, observations } = manifest();
	await page.goto(projectPath("qgis"));
	const main = page.getByRole("main");
	const geojson = main.getByRole("button", { name: /geojson/i }).or(main.getByRole("radio", { name: /geojson/i }));
	await expect(geojson.first()).toBeVisible();

	const { name, text } = await downloadText(page, async () => {
		const role = await geojson.first().getAttribute("role");
		if (role === "radio") {
			await geojson.first().check();
			await main
				.getByRole("button", { name: /(download|export)/i })
				.first()
				.click();
		} else {
			await geojson.first().click();
		}
	});
	expect(name).toMatch(/\.geojson$/);
	const collection = JSON.parse(text) as { type: string; features: Feature[] };
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
