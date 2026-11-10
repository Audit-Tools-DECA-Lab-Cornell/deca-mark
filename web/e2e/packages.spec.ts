import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
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

async function chooseProject(page: Page, includeSources: boolean, withBasemap = false) {
	await chooseFiles(
		page.getByLabel("QGIS project and source files", { exact: true }),
		qgisUpload(includeSources, withBasemap),
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
	await expect(page).toHaveURL(/\/map-setup/);
	// The advanced legacy uploader remains available through package history.
	await page.goto(projectPath(`sites/${site}/packages?step=upload`));

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

/** The project's online background map: an XYZ layer, which a package never carries (D35). */
const BASEMAP = { name: "Satellite", host: "mt1.google.com" };
const XYZ_LAYER = `<maplayer type="raster"><layername>${BASEMAP.name}</layername><provider>wms</provider><datasource>type=xyz&amp;url=https://${BASEMAP.host}/vt/lyrs%3Ds%26x%3D{x}%26y%3D{y}%26z%3D{z}</datasource></maplayer>`;

function qgisUpload(includeSources: boolean, withBasemap = false) {
	const project = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
		<qgis><title>Fall Creek</title><projectlayers>${LAYERS.map(
			({ layer }) =>
				`<maplayer type="vector"><layername>${layer}</layername><provider>ogr</provider><datasource>${layer}.geojson</datasource></maplayer>`
		).join("")}${withBasemap ? XYZ_LAYER : ""}</projectlayers></qgis>`;
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

/** D35 / WEB-60: a project with an online background map asks before it uploads without the map. */

const MAP_LINE = `${BASEMAP.name} (${BASEMAP.host}) is an online background map.`;
const PACKAGE_POST = /\/v1\/projects\/[^/]+\/packages$/;
const upload = (page: Page) => page.getByRole("button", { name: "Upload package", exact: true });
const question = (page: Page) => page.getByRole("dialog", { name: "Upload without the background map?" });

/** The package requests the page sends, as their JSON bodies. */
function watchUploads(page: Page): Record<string, unknown>[] {
	const sent: Record<string, unknown>[] = [];
	page.on("request", request => {
		if (request.method() === "POST" && PACKAGE_POST.test(new URL(request.url()).pathname))
			sent.push(request.postDataJSON() as Record<string, unknown>);
	});
	return sent;
}

async function readMarkedProject(page: Page, site: string, unmarked: boolean) {
	if (unmarked)
		// Read project's answer without the mark, as if the file changed after it was read.
		await page.route(/\/packages\/import$/, async route => {
			const response = await route.fetch();
			const body = (await response.json()) as { issues: Record<string, unknown>[] };
			body.issues = body.issues.map(issue => ({ layer: issue.layer, message: issue.message }));
			await route.fulfill({ response, json: body });
		});
	await page.goto(projectPath(`sites/${site}/packages?step=upload`));
	await chooseProject(page, true, true);
	await page.getByRole("button", { name: "Read project", exact: true }).click();
	await expect(page.getByText("3 layers read. Nothing saved yet.", { exact: true })).toBeVisible({ timeout: 60_000 });
	await keepZoneA(page);
}

async function expectNoViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.exclude("nextjs-portal")
		.analyze();
	expect(results.violations.map(violation => violation.id)).toEqual([]);
}

test("Cancel on the background map question uploads nothing and keeps the files", async ({ page }) => {
	test.setTimeout(120_000);
	const site = SEED.sites.fallCreek;
	const before = await newestPackageVersion(site);
	const sent = watchUploads(page);
	await readMarkedProject(page, site, false);
	await expect(page.getByText(`${MAP_LINE} It will not be uploaded.`, { exact: true })).toBeVisible();
	await expect(page.getByText("Satellite: ")).toHaveCount(0);

	await upload(page).click();
	await expect(question(page)).toBeVisible();
	await expect(question(page)).toContainText(`${BASEMAP.name} (${BASEMAP.host})`);
	await expect(question(page)).toContainText("Observers see the vector layers only.");
	await expectNoViolations(page);
	await question(page).getByRole("button", { name: "Cancel", exact: true }).click();

	await expect(question(page)).toBeHidden();
	await expect(
		page.getByText("Not uploaded. Remove the background map from the project in QGIS, or upload without it.", {
			exact: false
		})
	).toBeVisible();
	await expect(upload(page)).toBeFocused();
	await expect(upload(page)).toBeEnabled();
	await expect(page.getByText("3 layers read. Nothing saved yet.", { exact: true })).toBeVisible();
	await expect(page.getByText(/\bring/i)).toHaveCount(0);
	expect(sent).toHaveLength(0);
	expect(await newestPackageVersion(site)).toBe(before);
});

test("confirming leaves the background map out, and the new version shows the warning", async ({ page }) => {
	test.setTimeout(120_000);
	const site = SEED.sites.fallCreek;
	const next = (await newestPackageVersion(site)) + 1;
	const sent = watchUploads(page);
	await readMarkedProject(page, site, false);
	await upload(page).click();
	await question(page).getByRole("button", { name: "Upload without it", exact: true }).click();
	await expect.poll(() => currentPackageVersion(site), { timeout: 60_000 }).toBe(next);
	expect(sent).toHaveLength(1);
	expect(sent[0]?.leave_out_online_basemaps).toEqual([BASEMAP.name]);

	await page.goto(projectPath(`sites/${site}/packages`));
	const row = page
		.getByRole("main")
		.locator('tr:visible, li:visible, [role="row"]:visible')
		.filter({ has: page.getByRole("link", { name: `v${next}`, exact: true }) });
	await expect(row).toContainText(`${MAP_LINE} It was not uploaded; observers see the vector layers only.`);
	await expect(row).toContainText("Warning");
});

test("an answer that names the background map opens the same question, and the retry publishes", async ({ page }) => {
	test.setTimeout(120_000);
	const site = SEED.sites.fallCreek;
	const next = (await newestPackageVersion(site)) + 1;
	const sent = watchUploads(page);
	await readMarkedProject(page, site, true);
	await expect(page.getByText(`${MAP_LINE} It will not be uploaded.`)).toHaveCount(0);

	await upload(page).click();
	await expect(question(page)).toBeVisible({ timeout: 30_000 });
	await expect(question(page)).toContainText(`${BASEMAP.name} (${BASEMAP.host})`);
	await expect(page.getByText(/\bring/i)).toHaveCount(0);
	await expect(page.getByText("The package was not uploaded.")).toHaveCount(0);
	expect(await newestPackageVersion(site)).toBe(next - 1);
	await expectNoViolations(page);

	await question(page).getByRole("button", { name: "Upload without it", exact: true }).click();
	await expect.poll(() => currentPackageVersion(site), { timeout: 60_000 }).toBe(next);
	expect(sent).toHaveLength(2);
	expect(sent[0]?.leave_out_online_basemaps).toBeUndefined();
	expect(sent[1]?.leave_out_online_basemaps).toEqual([BASEMAP.name]);
	// The refused request stored nothing, so the confirmed retry is the same request.
	expect(sent[1]?.request_id).toBe(sent[0]?.request_id);
});
