import { expect, test } from "@playwright/test";

import { currentZone, listSites } from "./support/api";
import { authFile } from "./support/auth";
import { manifest, projectPath, runStamp, SEED } from "./support/manifest";
import { countPattern } from "./support/ui";

/** Plan step 3, and creating a site. */

test.use({ storageState: authFile("manager") });

test("the Fall Creek site plan shows Zone A and its observations", async ({ page }) => {
	const { baseline } = manifest();
	await page.goto(projectPath("sites"));
	await page
		.getByRole("link", { name: new RegExp(SEED.siteNames.fallCreek) })
		.first()
		.click();
	await expect(page).toHaveURL(url => url.pathname === projectPath(`sites/${SEED.sites.fallCreek}`));

	const main = page.getByRole("main");
	// The zone is drawn and listed from the current package's zones layer.
	await expect(main.getByText(new RegExp(`Zone ${baseline.zone}\\b`)).first()).toBeVisible();
	// Its row leads to the data filtered to that zone, by its identity.
	const zone = await currentZone(SEED.sites.fallCreek, baseline.zone);
	const zoneLink = main.locator(`a[href*="zone=${zone.zone_id}"]`).first();
	await expect(zoneLink).toBeVisible();
	await expect(main).toContainText(countPattern(baseline.total, "observation"));
});

test("a manager creates a site", async ({ page }) => {
	const name = `E2E site ${runStamp()}`;
	await page.goto(projectPath("sites"));
	await page.getByRole("button", { name: /^Create site$/ }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel(/^Name/i).fill(name);
	await dialog.getByRole("button", { name: /^Create site$/ }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole("main").getByText(name).first()).toBeVisible();
	expect(
		(await listSites()).some(site => site.name === name),
		"the site exists in the project"
	).toBe(true);
});
