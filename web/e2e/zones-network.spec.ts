import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { freshSite, signInToZones, ZONE_MANIFEST, zoneApi, type ZoneDraftRead, zoneFixture } from "./support/zones";

/**
 * Plan WEB-28 (UI plan section 10, item 5): an edit made offline stays in the tab and saves on reconnecting,
 * and every way out with an edit not saved asks first: a `g` chord, the command palette and a link. Runs
 * on a site of its own on the synthetic zone review project (`scripts/e2e-local.sh --zones`).
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const LAWN = "Synthetic network lawn";

test("an edit made offline saves on reconnecting, and every way out asks first", async ({ page, context }) => {
	test.setTimeout(180_000);
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "network");
	const drafts = `/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts`;
	const draft = await call<ZoneDraftRead>("POST", drafts, { request_id: randomUUID(), base_package_id: v1 });
	const read = () => call<ZoneDraftRead>("GET", `${drafts}/${draft.draft_id}`);
	const labels = async () => (await read()).zones.map(zone => zone.zone_label);
	const editor = `${path}/sites/${site.code}/zones/drafts/${draft.draft_id}`;
	const main = page.getByRole("main");
	const leaving = page.getByRole("dialog", { name: "Save your changes first?" });
	/** Answers the leave dialog with Keep editing, and checks nothing moved. */
	const stay = async () => {
		await expect(leaving).toBeVisible();
		await leaving.getByRole("button", { name: "Keep editing" }).click();
		await expect(leaving).toHaveCount(0);
		await expect(page).toHaveURL(new RegExp(`${editor}$`));
	};

	try {
		await signInToZones(page, "manager");
		await page.goto(editor);
		await expect(main).toContainText("· revision 1", { timeout: 30_000 });

		await test.step("offline, an edit stays in the tab and says so", async () => {
			await context.setOffline(true);
			await main
				.getByRole("listbox", { name: "Zones" })
				.getByRole("option", { name: new RegExp(LAWN) })
				.click();
			await main.getByLabel("Name", { exact: true }).fill(`${LAWN} offline`);
			await expect(main).toContainText(
				"You are offline. Your changes stay in this tab and save when you reconnect.",
				{
					timeout: 30_000
				}
			);
			expect(await labels()).toContain(LAWN);
		});

		await test.step("a g chord asks first", async () => {
			await main.getByRole("heading", { level: 1 }).click();
			await page.keyboard.press("g");
			await page.keyboard.press("s");
			await stay();
		});

		await test.step("the command palette asks first", async () => {
			await main.getByRole("heading", { level: 1 }).click();
			await page.keyboard.press("Control+k");
			const palette = page.getByPlaceholder("Search or jump to…");
			await expect(palette).toBeFocused();
			await palette.fill("Data");
			await page.keyboard.press("Enter");
			await stay();
		});

		await test.step("a link asks first", async () => {
			await main
				.getByRole("navigation", { name: /breadcrumb/i })
				.getByRole("link", { name: "Sites" })
				.click();
			await stay();
		});

		await test.step("reconnecting saves the edit as the next revision", async () => {
			await context.setOffline(false);
			await expect(main).toContainText("· revision 2", { timeout: 30_000 });
			await expect.poll(labels, { timeout: 30_000 }).toContain(`${LAWN} offline`);
			// Saved, so leaving no longer asks.
			await main
				.getByRole("navigation", { name: /breadcrumb/i })
				.getByRole("link", { name: "Sites" })
				.click();
			await expect(page).toHaveURL(new RegExp(`${path}/sites$`), { timeout: 30_000 });
			await expect(leaving).toHaveCount(0);
		});
	} finally {
		await context.setOffline(false);
		const latest = await read();
		await call("DELETE", `${drafts}/${latest.draft_id}`, undefined, latest.etag);
	}
});
