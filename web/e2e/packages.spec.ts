import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, type Page, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

import { currentPackageVersion, currentZone, newestPackageVersion } from "./support/api";
import { authFile } from "./support/auth";
import { projectPath, SEED } from "./support/manifest";
import { chooseFiles } from "./support/ui";

/** Plan step 4: a new map package goes from QGIS layers to the current package. */

test.use({ storageState: authFile("manager") });

/** The Fall Creek layers the seed uploads too (the zones layer carries `properties.id`). */
const LAYERS_DIR = fileURLToPath(new URL("../../qgis/fall-creek/upload-sample/", import.meta.url));
const LAYERS = ["ground", "zones", "trees"].map(layer => ({ layer, file: `${LAYERS_DIR}${layer}.geojson` }));

async function chooseLayers(page: Page) {
	await chooseFiles(
		page.getByLabel("Choose files from the QGIS export", { exact: true }),
		LAYERS.map(item => item.file),
		page.getByLabel("Remove the Ground file", { exact: true })
	);
}

async function chooseProject(page: Page, includeSources: boolean) {
	await chooseFiles(
		page.getByLabel("QGIS project and source files", { exact: true }),
		qgisUpload(includeSources),
		page.getByRole("button", { name: "Read project", exact: true }).and(page.locator(":enabled"))
	);
}

/**
 * The file's zone A is the site's current zone A: a matching code is only a suggestion, so the manager
 * says so. Returns the zone's identity, which the next version keeps.
 */
async function keepZoneA(page: Page): Promise<string> {
	const zone = await currentZone(SEED.sites.fallCreek, "A");
	const choice = page.getByLabel("Zone A is", { exact: true });
	await expect(choice).toHaveValue("");
	await expect(page.getByRole("button", { name: "Upload package", exact: true })).toBeDisabled();
	await choice.selectOption(zone.zone_id);
	return zone.zone_id;
}

test("uploading a new package from QGIS layers makes it the current one", async ({ page }) => {
	test.setTimeout(120_000);
	const site = SEED.sites.fallCreek;
	const next = (await newestPackageVersion(site)) + 1;

	await page.goto(projectPath(`sites/${site}`));
	await page.getByRole("link", { name: "Upload a new version", exact: true }).click();
	await expect(page).toHaveURL(/\/packages\?(.*&)?step=upload/);

	await chooseLayers(page);
	const zoneId = await keepZoneA(page);
	await page.getByLabel("What changed", { exact: true }).fill("Browser acceptance upload");
	await page.getByRole("button", { name: "Upload package", exact: true }).click();

	await expect.poll(() => currentPackageVersion(site), { timeout: 60_000 }).toBe(next);
	// The same zone, so its records stay together across versions.
	expect((await currentZone(site, "A")).zone_id).toBe(zoneId);
	const versionWords = new RegExp(`\\b(v|version\\s+)${next}\\b`, "i");
	await expect(page.getByRole("main").getByText(versionWords).filter({ visible: true }).first()).toBeVisible({
		timeout: 30_000
	});

	// The history marks the new version Active (the site names it as current) with its note.
	await page.goto(projectPath(`sites/${site}/packages`));
	const row = page
		.getByRole("main")
		.locator('tr:visible, li:visible, [role="row"]:visible')
		.filter({ has: page.getByRole("link", { name: `v${next}`, exact: true }) });
	await expect(row).toContainText("Active");
	await expect(row).toContainText("Browser acceptance upload");
});

function qgisUpload(includeSources: boolean) {
	const project = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
		<qgis><title>Fall Creek</title><projectlayers>${LAYERS.map(
			({ layer }) =>
				`<maplayer type="vector"><layername>${layer}</layername><provider>ogr</provider><datasource>${layer}.geojson</datasource></maplayer>`
		).join("")}</projectlayers></qgis>`;
	return {
		name: "fall-creek.qgz",
		mimeType: "application/zip",
		buffer: Buffer.from(
			zipSync({
				"fall-creek.qgs": strToU8(project),
				...(includeSources
					? Object.fromEntries(LAYERS.map(({ layer, file }) => [`${layer}.geojson`, readFileSync(file)]))
					: {})
			})
		)
	};
}

test("a self-contained QGIS project becomes the site's current map without separate GeoJSON files", async ({
	page
}) => {
	test.setTimeout(120_000);
	const site = SEED.sites.fallCreek;
	const next = (await newestPackageVersion(site)) + 1;
	await page.goto(projectPath(`sites/${site}/packages?step=upload`));
	await chooseProject(page, true);
	await page.getByRole("button", { name: "Read project", exact: true }).click();
	await expect(page.getByText("3 layers read. Nothing saved yet.", { exact: true })).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => currentPackageVersion(site)).toBe(next - 1);
	await keepZoneA(page);
	await page.getByRole("button", { name: "Upload package", exact: true }).click();
	await expect.poll(() => currentPackageVersion(site), { timeout: 60_000 }).toBe(next);
	await expect(page.getByText("3 layers read. Nothing saved yet.", { exact: true })).not.toBeVisible();
	await page.goto(projectPath(`sites/${site}`));
	await expect(
		page
			.getByRole("main")
			.getByText(new RegExp(`\\bv${next}\\b`))
			.filter({ visible: true })
			.first()
	).toBeVisible();
});

test("a project with missing sources names them and accepts optional GeoJSON exports", async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto(projectPath(`sites/${SEED.sites.fallCreek}/packages?step=upload`));
	await chooseProject(page, false);
	await page.getByRole("button", { name: "Read project", exact: true }).click();
	await expect(page.getByText(/Include ground.geojson with this project/)).toBeVisible({ timeout: 60_000 });
	await expect(page.getByRole("button", { name: "Upload package", exact: true })).toBeDisabled();
	await page
		.getByLabel("Choose files from the QGIS export", { exact: true })
		.setInputFiles(LAYERS.map(item => item.file));
	await keepZoneA(page);
	await expect(page.getByRole("button", { name: "Upload package", exact: true })).toBeEnabled();
});
