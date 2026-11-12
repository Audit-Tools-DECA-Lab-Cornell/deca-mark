import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import type { Setup } from "../src/features/map-setup/schema";
import { REVIEW_SITE, signInToZones, ZONE_MANIFEST, zoneApi, zoneFixture } from "./support/zones";

test.skip(!ZONE_MANIFEST, "Needs local synthetic zone project");

for (const entry of [
	{ code: "no-package", action: "Set up map" },
	{ code: REVIEW_SITE, action: "Upload a new version" }
] as const) {
	test(`QGIS opens map setup for ${entry.code}`, async ({ page }) => {
		const fixture = zoneFixture();
		const call = await zoneApi("manager");
		const sites = await call<readonly { site_id: string; code: string }[]>(
			"GET",
			`/v1/projects/${fixture.projectId}/sites`
		);
		const site = sites.find(item => item.code === entry.code);
		if (!site) throw new Error(`The navigation fixture has no site ${entry.code}.`);
		const sitePath = `/v1/projects/${fixture.projectId}/sites/${site.site_id}`;
		const before = await call<{ name: string; current_package_id: string | null }>("GET", sitePath);
		await signInToZones(page, "manager");
		await page.goto(`${fixture.path}/qgis`);
		await expect(page.getByRole("region", { name: "Site maps" })).toContainText(
			"A map belongs to its site, so setting one up opens that site under Sites."
		);
		const row = page.getByRole("listitem").filter({
			has: page.locator(`a[href="${fixture.path}/sites/${entry.code}"]`)
		});
		const action = row.getByRole("link", { name: entry.action, exact: true });
		await expect(action).toHaveAttribute("href", `${fixture.path}/sites/${entry.code}/map-setup`);
		await action.click();
		await expect(page).toHaveURL(new RegExp(`/sites/${entry.code}/map-setup(?:/[^/]+/add-map)?$`));
		await expect(page.getByRole("heading", { name: `${before.name} · Map setup`, exact: true })).toBeVisible();
		// Arriving from QGIS, the page says it is this site's map, under Sites, with a way back to both.
		const trail = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(trail.getByRole("link", { name: "Sites", exact: true })).toBeVisible();
		await expect(trail.getByRole("link", { name: before.name, exact: true })).toHaveAttribute(
			"href",
			`${fixture.path}/sites/${entry.code}`
		);
		await expect(
			page.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Sites", exact: true })
		).toHaveAttribute("aria-current", "page");
		await expect(page.locator("#map-source-files")).toBeAttached();
		await expect(page.getByRole("heading", { name: "Advanced direct package upload", exact: true })).toHaveCount(0);
		const after = await call<{ current_package_id: string | null }>("GET", sitePath);
		expect(after.current_package_id).toBe(before.current_package_id);
	});
}

test("Overview and an old upload bookmark resume the acknowledged map setup", async ({ page }) => {
	test.setTimeout(120000);
	const fixture = zoneFixture();
	const call = await zoneApi("manager");
	const tag = randomUUID().slice(0, 8);
	const site = await call<{ site_id: string; code: string; name: string }>(
		"POST",
		`/v1/projects/${fixture.projectId}/sites`,
		{ code: `navigation-${tag}`, name: `Navigation ${tag}` }
	);
	const setupBase = `/v1/projects/${fixture.projectId}/sites/${site.site_id}/map-setups`;
	const imported = await call<Setup>("POST", `${setupBase}/import`, {
		request_id: randomUUID(),
		expected_current_package_id: null,
		mode: "geojson",
		files: [
			{
				file_name: "trees.geojson",
				content: Buffer.from(
					JSON.stringify({
						type: "FeatureCollection",
						features: [
							{
								type: "Feature",
								properties: {},
								geometry: { type: "Point", coordinates: [-76.48, 42.44] }
							}
						]
					})
				).toString("base64")
			}
		]
	});
	const setupPath = `${setupBase}/${imported.setup_id}`;
	let latest = imported;
	try {
		latest = await call<Setup>(
			"PUT",
			setupPath,
			{ ...imported.content, change_note: "Keep acknowledged navigation draft" },
			`"map-setup:${imported.setup_id}:${imported.revision}"`
		);
		await signInToZones(page, "manager");
		await page.goto(fixture.path);
		const attention = page.getByRole("region", { name: "Needs attention" });
		const item = attention.getByRole("listitem").filter({ hasText: `${site.name} has no ready map package.` });
		await expect(item).toBeVisible();
		const action = item.getByRole("link", { name: "Set up map", exact: true });
		await expect(action).toHaveAttribute("href", `${fixture.path}/sites/${site.code}/map-setup`);
		await action.click();
		await expect(page).toHaveURL(new RegExp(`/sites/${site.code}/map-setup/${latest.setup_id}/add-map$`));
		await expect(page.getByRole("heading", { name: `${site.name} · Map setup`, exact: true })).toBeVisible();
		await expect(page.locator("#map-source-files")).toBeVisible();
		expect(await call<Setup>("GET", setupPath)).toEqual(latest);
		await page.goto(`${fixture.path}/sites/${site.code}/packages?step=upload`);
		await expect(page).toHaveURL(new RegExp(`/sites/${site.code}/map-setup/${latest.setup_id}/add-map$`));
		expect(await call<Setup>("GET", setupPath)).toEqual(latest);
	} finally {
		const saved = await call<Setup>("GET", setupPath);
		await call("POST", `${setupPath}/discard`, undefined, `"map-setup:${saved.setup_id}:${saved.revision}"`);
	}
});

test("an old upload bookmark redirects before requiring a readable site", async ({ page }) => {
	const fixture = zoneFixture();
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/missing-navigation-site/packages?step=upload`);
	await expect(page).toHaveURL(new RegExp(`${fixture.path}/sites/missing-navigation-site/map-setup$`));
	await expect(page.getByRole("heading", { name: "Advanced direct package upload", exact: true })).toHaveCount(0);
});

test("prepared layers require an explicit advanced entry and offer a return to map setup", async ({ page }) => {
	const fixture = zoneFixture();
	await signInToZones(page, "manager");
	await page.goto(`${fixture.path}/sites/no-package/packages`);
	await page.getByRole("link", { name: "Advanced: upload prepared layers", exact: true }).click();
	await expect(page).toHaveURL(/\/packages\?step=advanced-upload$/);
	await expect(page.getByRole("heading", { name: "Advanced direct package upload", exact: true })).toBeVisible();
	await expect(
		page.getByRole("list", { name: "Package files", exact: true }).getByText("Required", { exact: true })
	).toHaveCount(2);
	await page.getByRole("link", { name: "Use map setup", exact: true }).click();
	await expect(page).toHaveURL(/\/sites\/no-package\/map-setup(?:\/[^/]+\/add-map)?$/);
	await expect(page.locator("#map-source-files")).toBeVisible();
});
