import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

import type { Setup as MapSetupRead } from "../src/features/map-setup/schema";
import type { PackageHistory } from "../src/lib/api/sites";
import { EMPTY_SITE, FRESH, signInToZones, ZONE_MANIFEST, zoneApi, type ZoneCall, zoneFixture } from "./support/zones";

test.skip(!ZONE_MANIFEST, "Needs local synthetic zone project");

/** Builds a QGIS project archive from named GeoJSON feature collections. */
function projectArchive(layers: Record<string, unknown>): Buffer {
	const projectLayers = Object.keys(layers)
		.map(
			name =>
				`<maplayer type="vector"><id>${name}</id><layername>${name}</layername><provider>ogr</provider><datasource>${name}.geojson</datasource></maplayer>`
		)
		.join("");
	const files: Record<string, Uint8Array> = {
		"map.qgs": strToU8(`<qgis><projectlayers>${projectLayers}</projectlayers></qgis>`)
	};
	for (const [name, collection] of Object.entries(layers)) {
		files[`${name}.geojson`] = strToU8(JSON.stringify(collection));
	}
	return Buffer.from(zipSync(files));
}

/** Builds a small QGIS project whose one local point gives boundary drawing real geographic context. */
function referenceProjectArchive(): Buffer {
	return projectArchive({
		trees: {
			type: "FeatureCollection",
			features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: FRESH.a[0] } }]
		}
	});
}

/** Complete first-map package: outline, one zone, and one tree reference. */
function completeProjectArchive(): Buffer {
	return projectArchive({
		ground: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { kind: "site" },
					geometry: { type: "Polygon", coordinates: [FRESH.site] }
				}
			]
		},
		zones: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { id: "A", label: "Lawn" },
					geometry: { type: "Polygon", coordinates: [FRESH.a] }
				}
			]
		},
		trees: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { label: "Tree" },
					geometry: { type: "Point", coordinates: FRESH.a[0] }
				}
			]
		}
	});
}

/** Outline-only package used when zones must be drawn in the app. */
function outlineOnlyProjectArchive(): Buffer {
	return projectArchive({
		ground: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { kind: "site" },
					geometry: { type: "Polygon", coordinates: [FRESH.site] }
				}
			]
		}
	});
}

async function publishReviewedSetup(page: Page): Promise<void> {
	await page.getByLabel("Published observation form", { exact: true }).selectOption("zone-review-play-v1");
	await page.getByLabel("What changed (optional)", { exact: true }).fill("Browser acceptance map setup");
	await page.getByRole("button", { name: "Check map", exact: true }).click();
	await expect(page.getByRole("button", { name: "Publish map", exact: true })).toBeEnabled({ timeout: 60000 });
	await page.getByRole("button", { name: "Publish map", exact: true }).click();
	await expect(page.getByText("Map version 1 published.", { exact: true })).toBeVisible({ timeout: 60000 });
}

/** Waits for project conversion to finish and the layer-review step to become actionable. */
async function awaitLayerReview(page: Page): Promise<void> {
	await expect(
		page
			.getByText("Reading project…", { exact: true })
			.or(page.getByRole("heading", { name: "Review the map layers" }))
	).toBeVisible({
		timeout: 30000
	});
	const review = page.getByRole("heading", { name: "Review the map layers" });
	await expect(review).toBeVisible({ timeout: 120000 });
	await review.scrollIntoViewIfNeeded();
}

/** Imports the reference project directly so a browser scenario can begin from one acknowledged revision. */
async function importReferenceSetup(call: ZoneCall, projectId: string, siteId: string): Promise<MapSetupRead> {
	return call<MapSetupRead>("POST", `/v1/projects/${projectId}/sites/${siteId}/map-setups/import`, {
		files: [{ file_name: "references-only.qgz", content: referenceProjectArchive().toString("base64") }],
		request_id: randomUUID(),
		expected_current_package_id: null,
		mode: "project"
	});
}

/** Returns the strong revision precondition represented by a map-setup response. */
function mapSetupEtag(setup: Pick<MapSetupRead, "setup_id" | "revision">): string {
	return `"map-setup:${setup.setup_id}:${setup.revision}"`;
}

async function activate(page: Page, name: string, touch: boolean): Promise<void> {
	const button = page.getByRole("button", { name, exact: true });
	if (touch) {
		await button.tap();
		return;
	}
	await button.focus();
	await page.keyboard.press("Enter");
}

async function addCoordinateRing(page: Page, points: readonly (readonly [number, number])[]): Promise<void> {
	for (const [longitude, latitude] of points) {
		const longitudeInput = page.getByLabel("Longitude", { exact: true });
		await longitudeInput.fill("");
		await longitudeInput.focus();
		await page.keyboard.type(String(longitude));
		const latitudeInput = page.getByLabel("Latitude", { exact: true });
		await latitudeInput.fill("");
		await latitudeInput.focus();
		await page.keyboard.type(String(latitude));
		await page.getByRole("button", { name: "Add point", exact: true }).focus();
		await page.keyboard.press("Enter");
	}
}

async function tapMapRing(page: Page, points: readonly (readonly [number, number])[]): Promise<void> {
	const map = page.locator('[aria-roledescription="map"][aria-label="Site outline"]');
	await map.scrollIntoViewIfNeeded();
	const box = await map.boundingBox();
	if (!box) throw new Error("The site outline map is not visible for touch drawing.");
	for (const [x, y] of points) {
		await page.touchscreen.tap(box.x + box.width * x, box.y + box.height * y);
	}
}

async function expectNoViolations(page: Page): Promise<void> {
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.exclude("nextjs-portal")
		.analyze();
	expect(results.violations.map(violation => violation.id)).toEqual([]);
}

test("first map keeps an incomplete draft and draws its missing boundaries", async ({ page }, info) => {
	test.setTimeout(180000);
	const touch = info.project.name === "phone-390";
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Synthetic first-map setup",
		code: `setup-${randomUUID().slice(0, 8)}`
	});
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);
	let loseInitialReply = true;
	await page.route("**/map-setups/import", async route => {
		if (route.request().method() === "POST" && loseInitialReply) {
			loseInitialReply = false;
			await route.fetch();
			await route.abort("failed");
			return;
		}
		await route.continue();
	});
	await page.getByLabel("QGIS project and its data files", { exact: true }).setInputFiles({
		name: "references-only.qgz",
		mimeType: "application/zip",
		buffer: referenceProjectArchive()
	});
	await expect(page.getByRole("heading", { name: "Review the map layers" })).toBeVisible({ timeout: 60000 });
	const activeSetups = await call<readonly { setup_id: string }[]>(
		"GET",
		`/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups`
	);
	expect(activeSetups).toHaveLength(1);
	await page.getByLabel("Trees · feature 1", { exact: true }).selectOption("trees");
	await page.screenshot({ path: info.outputPath("import-review.png"), fullPage: true });
	await page.getByRole("button", { name: "Continue to boundaries", exact: true }).click();
	await activate(page, "Draw site outline", touch);
	if (touch) {
		await tapMapRing(page, [
			[0.25, 0.35],
			[0.75, 0.35],
			[0.75, 0.78],
			[0.25, 0.78]
		]);
	} else {
		await addCoordinateRing(page, FRESH.site.slice(0, -1));
	}
	await activate(page, "Finish outline", touch);
	await activate(page, "Draw a zone with coordinates", touch);
	if (touch) {
		await tapMapRing(page, [
			[0.4, 0.48],
			[0.62, 0.48],
			[0.62, 0.66],
			[0.4, 0.66]
		]);
	} else {
		await addCoordinateRing(page, FRESH.a.slice(0, -1));
	}
	await activate(page, "Finish zone", touch);
	await page.getByRole("option").filter({ hasText: "Z1" }).click();
	await expect(page.getByLabel("Code", { exact: true })).toBeEditable();
	await expectNoViolations(page);
	let releaseSave: () => void = () => {};
	const heldSave = new Promise<void>(resolve => {
		releaseSave = resolve;
	});
	let held = false;
	await page.route("**/map-setups/*", async route => {
		if (route.request().method() === "PUT" && !held) {
			held = true;
			await heldSave;
		}
		await route.continue();
	});
	const saving = page.waitForRequest(request => request.method() === "PUT" && request.url().includes("/map-setups/"));
	await page.getByLabel("Name", { exact: true }).fill("Earlier lawn");
	await saving;
	await page.getByLabel("Name", { exact: true }).fill("Lawn");
	const leave = page.getByRole("button", { name: "Save and leave", exact: true }).click();
	releaseSave();
	await leave;
	await page.getByRole("link", { name: "Resume map setup", exact: true }).click();
	await page.getByRole("button", { name: "Set boundaries", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Review the zones", exact: true })).toBeVisible();
	await page.getByRole("option").filter({ hasText: "Lawn" }).click();
	await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Lawn");
	await page.screenshot({ path: info.outputPath("boundaries-desktop.png"), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: info.outputPath("boundaries-phone.png"), fullPage: true });
	await page.setViewportSize({ width: 768, height: 1024 });
	await page.screenshot({ path: info.outputPath("boundaries-tablet.png"), fullPage: true });
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dusk"));
	await page.screenshot({ path: info.outputPath("boundaries-dusk.png"), fullPage: true });
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "day"));
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole("button", { name: "Review map", exact: true }).click();
	await expect(page.getByText("1 imported map feature included · 0 features or sources left out.")).toBeVisible();
	await page.getByLabel("Published observation form", { exact: true }).selectOption("zone-review-play-v1");
	await page.getByLabel("What changed (optional)", { exact: true }).fill("Initial site outline and observation zone");
	await page.getByRole("button", { name: "Check map", exact: true }).click();
	await expect(page.getByRole("button", { name: "Publish map", exact: true })).toBeEnabled();
	let droppedPublication = false;
	await page.route("**/map-setups/*/publish", async route => {
		if (route.request().method() !== "POST" || droppedPublication) {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		if (!response.ok()) {
			await route.fulfill({ response });
			return;
		}
		droppedPublication = true;
		await route.abort("failed");
	});
	await page.getByRole("button", { name: "Publish map", exact: true }).click();
	await expect(
		page.getByText(
			"We could not confirm publication. Press Publish map again to check the same request; it will not create another version.",
			{ exact: true }
		)
	).toBeVisible({ timeout: 60000 });
	expect(droppedPublication).toBe(true);
	await page.getByRole("button", { name: "Publish map", exact: true }).click();
	await expect(page.getByText("Map version 1 published.", { exact: true })).toBeVisible({ timeout: 60000 });
	await expect(
		page.getByText(
			"We could not confirm publication. Press Publish map again to check the same request; it will not create another version.",
			{ exact: true }
		)
	).toHaveCount(0);
	const history = await call<PackageHistory>(
		"GET",
		`/v1/projects/${fixture.projectId}/packages?site_id=${site.site_id}`
	);
	expect(history.packages.map(item => item.package_version)).toEqual([1]);
	expect(history.current_package_id).toBe(history.packages[0]?.package_id);
	await page.screenshot({ path: info.outputPath("first-map-published.png"), fullPage: true });
});

test("a complete imported map publishes without redrawing outline or zones", async ({ page }) => {
	test.setTimeout(180000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Complete imported setup",
		code: `complete-${randomUUID().slice(0, 8)}`
	});
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);
	await page.getByLabel("QGIS project and its data files", { exact: true }).setInputFiles({
		name: "complete.qgz",
		mimeType: "application/zip",
		buffer: completeProjectArchive()
	});
	await awaitLayerReview(page);
	await page.getByLabel("ground · feature 1", { exact: true }).selectOption("outline");
	await page.getByLabel("zones · feature 1", { exact: true }).selectOption("zones");
	await page.getByLabel("trees · feature 1", { exact: true }).selectOption("trees");
	await page.getByRole("button", { name: "Continue to boundaries", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Review the zones", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Draw site outline", exact: true })).toHaveCount(0);
	await expect(page.getByRole("option").filter({ hasText: "Lawn" })).toBeVisible();
	await page.getByRole("button", { name: "Review map", exact: true }).click();
	await expect(page.getByText(/3 imported map features included/)).toBeVisible();
	await publishReviewedSetup(page);
	const history = await call<PackageHistory>(
		"GET",
		`/v1/projects/${fixture.projectId}/packages?site_id=${site.site_id}`
	);
	expect(history.packages.map(item => item.package_version)).toEqual([1]);
});

test("an outline-only project draws its missing zone before first publication", async ({ page }, info) => {
	test.setTimeout(240000);
	const touch = info.project.name === "phone-390";
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Outline without zones",
		code: `outline-${randomUUID().slice(0, 8)}`
	});
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);
	await page.getByLabel("QGIS project and its data files", { exact: true }).setInputFiles({
		name: "outline-no-zones.qgz",
		mimeType: "application/zip",
		buffer: outlineOnlyProjectArchive()
	});
	await awaitLayerReview(page);
	await page.getByLabel("ground · feature 1", { exact: true }).selectOption("outline");
	await page.getByRole("button", { name: "Continue to boundaries", exact: true }).click();
	await expect(page.getByText("No zones in this project. Draw them here.", { exact: true })).toBeVisible();
	await activate(page, "Draw a zone with coordinates", touch);
	if (touch) {
		await tapMapRing(page, [
			[0.4, 0.48],
			[0.62, 0.48],
			[0.62, 0.66],
			[0.4, 0.66]
		]);
	} else {
		await addCoordinateRing(page, FRESH.a.slice(0, -1));
	}
	await activate(page, "Finish zone", touch);
	await page.getByRole("option").filter({ hasText: "Z1" }).click();
	await page.getByLabel("Name", { exact: true }).fill("Lawn");
	await page.getByRole("button", { name: "Review map", exact: true }).click();
	await publishReviewedSetup(page);
});

test("a deep link to Review before boundaries are ready explains the remaining work", async ({ page }) => {
	test.setTimeout(180000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Deep-link prerequisite",
		code: `prereq-${randomUUID().slice(0, 8)}`
	});
	const imported = await importReferenceSetup(call, fixture.projectId, site.site_id);
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup/${imported.setup_id}/review`);
	const prerequisite = page.getByText("Finish this step first.", { exact: true });
	await expect(prerequisite).toBeVisible();
	await expect(prerequisite.locator("..")).toContainText(
		"Review every imported feature before opening Set boundaries."
	);
	await expect(page.getByRole("heading", { name: "Review and publish", exact: true })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Review the map layers" })).toBeVisible();
});

test("an observer opening map setup directly is routed away without setup controls", async ({ page }) => {
	const fixture = zoneFixture();
	await signInToZones(page, "observer");
	await page.goto(`${fixture.path}/sites/${EMPTY_SITE}/map-setup`);

	const main = page.getByRole("main");
	await expect(main.getByRole("heading", { name: "Collect with the DECA Mark app", exact: true })).toBeVisible();
	await expect(main).toContainText("Observers collect in the app. This site is for managers and viewers.");
	await expect(main.getByLabel("QGIS project and its data files", { exact: true })).toHaveCount(0);
	await expect(main.getByRole("button", { name: "Continue to boundaries", exact: true })).toHaveCount(0);
});

test("a remote-only project is recoverable but cannot open a blank boundary canvas", async ({ page }) => {
	test.setTimeout(180000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Remote-only setup",
		code: `remote-${randomUUID().slice(0, 8)}`
	});
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);
	const remoteProject = `<qgis><projectlayers><maplayer type="raster"><id>remote-background</id><layername>Background</layername><provider>wms</provider><datasource>type=xyz&amp;url=https://example.invalid/{z}/{x}/{y}.png</datasource></maplayer></projectlayers></qgis>`;
	await page.getByLabel("QGIS project and its data files", { exact: true }).setInputFiles({
		name: "remote-only.qgz",
		mimeType: "application/zip",
		buffer: Buffer.from(zipSync({ "map.qgs": strToU8(remoteProject) }))
	});

	await expect(page.getByRole("heading", { name: "Review the map layers" })).toBeVisible({ timeout: 60000 });
	const main = page.getByRole("main");
	await expect(page.getByText("Draft saved. Observers cannot use it yet.", { exact: true })).toBeVisible();
	await expect(main).toContainText("This project has no local vector map features.");
	await expect(main).toContainText(
		"Online background maps and other remote layers cannot provide editable boundaries."
	);
	await expect(main).toContainText(
		"This is an online background map. It is not converted or uploaded; observers see the vector layers only."
	);
	await expect(page.getByRole("button", { name: "Continue to boundaries", exact: true })).toBeDisabled();
	await page.getByRole("button", { name: "Set boundaries", exact: true }).click();
	await expect(main).toContainText(
		"This project has no local vector map features. Add local vector files or GeoJSON exports before continuing to boundaries."
	);
	await expect(page.getByRole("heading", { name: "Review the zones", exact: true })).toHaveCount(0);
	const setups = await call<readonly { setup_id: string }[]>(
		"GET",
		`/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups`
	);
	expect(setups).toHaveLength(1);
	const setupId = setups[0]?.setup_id;
	if (!setupId) throw new Error("The remote-only setup summary is missing its identity.");
	const setup = await call<MapSetupRead>(
		"GET",
		`/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups/${setupId}`
	);
	expect(setup.layers).toHaveLength(0);
});

test("a bare map-setup address adopts the active setup URL without losing saved assignments", async ({ page }) => {
	test.setTimeout(180000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Canonical setup route",
		code: `canonical-${randomUUID().slice(0, 8)}`
	});
	const imported = await importReferenceSetup(call, fixture.projectId, site.site_id);
	const layer = imported.layers.find(item => item.name === "Trees");
	const feature = layer?.features[0];
	if (!layer || !feature) throw new Error("The reference setup did not retain its tree feature.");
	const saved = await call<MapSetupRead>(
		"PUT",
		`/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups/${imported.setup_id}`,
		{
			...imported.content,
			assignments: [
				{
					source_id: layer.source_id,
					feature_key: feature.feature_key,
					role: "trees",
					zone_id: null
				}
			],
			change_note: "Keep this acknowledged setup"
		},
		mapSetupEtag(imported)
	);

	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);
	await expect(page.getByLabel("Trees · feature 1", { exact: true })).toHaveValue("trees");
	await expect(page).toHaveURL(new RegExp(`/sites/${site.code}/map-setup/${saved.setup_id}/add-map$`), {
		timeout: 30000
	});
	const unchanged = await call<MapSetupRead>(
		"GET",
		`/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups/${saved.setup_id}`
	);
	expect(unchanged.revision).toBe(saved.revision);
	expect(unchanged.content.assignments).toEqual(saved.content.assignments);
	expect(unchanged.content.change_note).toBe("Keep this acknowledged setup");
});

test("a stale map-setup save keeps local work and can explicitly replace the saved version", async ({ page }) => {
	test.setTimeout(180000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const other = await zoneApi("manager2");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Map setup save conflict",
		code: `setup-conflict-${randomUUID().slice(0, 8)}`
	});
	const imported = await importReferenceSetup(call, fixture.projectId, site.site_id);
	const setupUrl = `/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups/${imported.setup_id}`;

	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup/${imported.setup_id}/add-map`);
	const role = page.getByLabel("Trees · feature 1", { exact: true });
	await expect(role).toHaveValue("");
	await other<MapSetupRead>(
		"PUT",
		setupUrl,
		{ ...imported.content, change_note: "Saved by the other manager" },
		mapSetupEtag(imported)
	);

	await role.selectOption("trees");
	await expect(page.getByText("Map setup needs attention.", { exact: true })).toBeVisible({ timeout: 30000 });
	await expect(
		page.getByText(
			"Someone changed this map setup. Your changes are still here. Open the saved version to compare before continuing.",
			{ exact: true }
		)
	).toBeVisible();
	await expect(role).toHaveValue("trees");
	expect((await call<MapSetupRead>("GET", setupUrl)).content.assignments).toHaveLength(0);

	page.once("dialog", dialog => dialog.accept());
	await page.getByRole("button", { name: "Keep my version", exact: true }).click();
	await expect(page.getByText("Map setup needs attention.", { exact: true })).toHaveCount(0);
	await expect(page.getByText("Draft saved. Observers cannot use it yet.", { exact: true })).toBeVisible();
	await expect
		.poll(async () => (await call<MapSetupRead>("GET", setupUrl)).content.assignments.map(item => item.role), {
			timeout: 30000
		})
		.toEqual(["trees"]);
});

test("a missing bare map-setups list shows setup capability as unavailable", async ({ page }) => {
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Unavailable setup capability",
		code: `unavailable-${randomUUID().slice(0, 8)}`
	});
	await signInToZones(page, "manager");
	await page.route("**/map-setups", async route => {
		if (route.request().method() !== "GET") {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 404,
			contentType: "application/json",
			body: JSON.stringify({ error: { code: "not_found", message: "Map setup is unavailable." } })
		});
	});
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);

	const main = page.getByRole("main");
	await expect(main.getByText("Starting or resuming map setup is not available yet.", { exact: true })).toBeVisible();
	await expect(main).toContainText("This DECA Mark release cannot load unfinished map setups.");
	await expect(main).toContainText("Ask the operator to finish the map-setup update before choosing project files.");
	await expect(main.getByLabel("QGIS project and its data files", { exact: true })).toHaveCount(0);
	await expect(main.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
});

test("missing sources can be reviewed, cancelled and recovered without running layer names", async ({ page }, info) => {
	test.setTimeout(180000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const site = await call<{ site_id: string; code: string }>("POST", `/v1/projects/${fixture.projectId}/sites`, {
		name: "Source recovery",
		code: `recover-${randomUUID().slice(0, 8)}`
	});
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/${site.code}/map-setup`);
	const name = '<img src=x onerror="window.__mapInjection=true">';
	const xml =
		'<qgis><projectlayers><maplayer type="vector"><id>ground</id><layername>&lt;img src=x onerror=&quot;window.__mapInjection=true&quot;&gt;</layername><provider>ogr</provider><datasource>ground.geojson</datasource></maplayer><maplayer type="vector"><id>trees</id><layername>Trees</layername><provider>ogr</provider><datasource>missing.geojson</datasource></maplayer></projectlayers></qgis>';
	const ground = {
		type: "FeatureCollection",
		features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [FRESH.site] } }]
	};
	await page.getByLabel("QGIS project and its data files", { exact: true }).setInputFiles({
		name: "missing.qgz",
		mimeType: "application/zip",
		buffer: Buffer.from(zipSync({ "map.qgs": strToU8(xml), "ground.geojson": strToU8(JSON.stringify(ground)) }))
	});
	await expect(page.getByRole("heading", { name: "Review the map layers" })).toBeVisible();
	await expect(page.getByText(/Include missing.geojson/)).toBeVisible();
	await expect(page.getByRole("group", { name: new RegExp("onerror") })).toBeVisible();
	await expect(page.locator('img[src="x"]')).toHaveCount(0);
	await page.getByLabel(`${name} · feature 1`, { exact: true }).selectOption("outline");
	await page.getByRole("button", { name: "Save and leave", exact: true }).click();
	await page.getByRole("link", { name: "Resume map setup", exact: true }).click();
	const file = {
		name: "missing.geojson",
		mimeType: "application/geo+json",
		buffer: Buffer.from(
			JSON.stringify({
				type: "FeatureCollection",
				features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: FRESH.a[0] } }]
			})
		)
	};
	await page.getByLabel("Missing data files or replacement project", { exact: true }).setInputFiles(file);
	await expect(page.getByText("Review the added files before keeping them.", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Cancel added files", exact: true }).click();
	await expect(page.getByText(/Include missing.geojson/)).toBeVisible();
	await page.getByLabel("Missing data files or replacement project", { exact: true }).setInputFiles(file);
	let loseSourceReply = true;
	await page.route("**/map-setups/*/sources", async route => {
		if (route.request().postDataJSON()?.preview === false && loseSourceReply) {
			loseSourceReply = false;
			await route.fetch();
			await route.abort("failed");
		} else await route.continue();
	});
	await page.getByRole("button", { name: "Keep added files", exact: true }).click();
	await expect(
		page
			.getByRole("alert")
			.filter({ hasText: "The added files could not be confirmed. Your saved setup is still available." })
	).toBeVisible();
	await page.getByRole("button", { name: "Keep added files", exact: true }).click();
	await expect(page.getByText(/Include missing.geojson/)).toHaveCount(0);
	await expect(page.getByLabel("Trees · feature 1", { exact: true })).toBeVisible();
	await page.screenshot({ path: info.outputPath("source-recovered.png"), fullPage: true });
	page.once("dialog", dialog => dialog.accept());
	await page.getByRole("button", { name: "Discard map setup", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/sites/${site.code}$`));
	await expect(page.getByRole("link", { name: "Resume map setup", exact: true })).toHaveCount(0);
});
