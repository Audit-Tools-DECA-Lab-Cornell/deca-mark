import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { PASSWORD } from "./support/auth";
import { loopbackOrigin } from "./support/manifest";
import { chooseOption, csvLines, downloadText, recordRows } from "./support/ui";

/**
 * Plan WEB-39: Data reads every matching observation from DECA Mark, 500 at a time, with the filters
 * applied by the server, across map versions. Runs on the separate synthetic zone review project
 * (`scripts/e2e-local.sh --zones`): 520 observations of one zone, 260 on each of two map versions, the zone
 * renamed between them (its v1 name starts with "=", which an export must never let run as a formula).
 */

type ZoneManifest = {
	apiUrl: string;
	path: string;
	accounts: Record<string, { email: string }>;
	baseline: { total: number; inventory: number; perVersion: number };
};

const MANIFEST = process.env.E2E_ZONE_MANIFEST;
test.skip(!MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const ZONE = "72000000-0000-4000-8000-000000000001";
const V1_NAME = "=Synthetic lawn v1";
const V2_NAME = "Synthetic smaller lawn v2";

function fixture(): ZoneManifest {
	const read = JSON.parse(readFileSync(MANIFEST!, "utf8")) as ZoneManifest;
	loopbackOrigin(read.apiUrl, "The zone fixture's API address");
	return read;
}

/** One sign-in per run of this spec: local Auth allows 30 sign-ins per 5 minutes. */
async function signInAsZoneManager(page: Page) {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(fixture().accounts.manager!.email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

test("Data counts, pages and filters every matching observation across map versions", async ({ page }) => {
	test.setTimeout(180_000);
	const { path, baseline } = fixture();
	await signInAsZoneManager(page);
	await page.goto(`${path}/data?site=review-site`);
	const main = page.getByRole("main");
	const count = main.getByRole("status");

	await test.step("the first 500 load, and the count is every match", async () => {
		await expect(count).toContainText(`Showing 1–500 of ${baseline.total} matching observations`);
		await expect(await recordRows(main)).toHaveCount(500);
		await expect(main.getByText(/Based on the newest 500/)).toHaveCount(0);
	});

	await test.step("the next page loads the rest, once each", async () => {
		await main.getByRole("button", { name: `Show the next ${baseline.total - 500}`, exact: true }).click();
		await expect(count).toContainText(`Showing all ${baseline.total} matching observations`);
		await expect(await recordRows(main)).toHaveCount(baseline.total);
	});

	await test.step("a zone matches by identity on every map version, named as today's map names it", async () => {
		const zone = main.getByLabel("Zone", { exact: true });
		await expect(zone.locator(`option[value="${ZONE}"]`)).toHaveText(`${V2_NAME} · v1–v2`);
		await zone.selectOption(ZONE);
		await expect(page).toHaveURL(new RegExp(`zone=${ZONE}`));
		await expect(count).toContainText(`Showing 1–500 of ${baseline.total} matching observations`);
	});

	await test.step("one map version narrows it to what was recorded on that version", async () => {
		await chooseOption(main.getByLabel("Map versions", { exact: true }), /^Only map v1$/);
		await expect(page).toHaveURL(/version=1/);
		await expect(count).toContainText(`Showing all ${baseline.perVersion} matching observations`);
		// Each record keeps the name its zone had when it was recorded.
		await expect((await recordRows(main)).first()).toContainText(V1_NAME);
	});

	await test.step("inventories are whole-zone records, and Back undoes a filter", async () => {
		await chooseOption(main.getByLabel("Round type", { exact: true }), /inventory/i);
		await expect(page).toHaveURL(/round=inventory/);
		const inventories = baseline.inventory / 2;
		await expect(count).toContainText(`Showing all ${inventories} matching observations`);
		const rows = await recordRows(main);
		await expect(rows).toHaveCount(inventories);
		await expect(rows.filter({ hasText: "Whole zone" })).toHaveCount(inventories);
		await page.goBack();
		await expect(page).not.toHaveURL(/round=/);
		await expect(count).toContainText(`Showing all ${baseline.perVersion} matching observations`);
	});

	await test.step("the search finds words in the loaded observations only, and says so", async () => {
		await main.getByLabel("Search loaded observations", { exact: true }).fill("inventory");
		await expect(count).toContainText(
			`${baseline.inventory / 2} of ${baseline.perVersion} loaded match · ${baseline.perVersion} match the filters`
		);
		await main.getByLabel("Search loaded observations", { exact: true }).fill("");
	});

	await test.step("an export writes the recorded zone name so a spreadsheet cannot run it", async () => {
		await main.getByRole("button", { name: "Export", exact: true }).first().click();
		const dialog = page.getByRole("dialog");
		const csvChoice = dialog.getByRole("radio", { name: /csv/i });
		if ((await csvChoice.count()) > 0) await csvChoice.first().check();
		const { text } = await downloadText(page, () =>
			dialog
				.getByRole("button", { name: /(download|export)/i })
				.last()
				.click()
		);
		const [header, ...rows] = csvLines(text);
		const columns = header!.split(",");
		const label = columns.indexOf("zone_label_at_capture");
		const version = columns.indexOf("map_version");
		expect(rows).toHaveLength(baseline.perVersion);
		for (const row of rows) {
			const cells = row.split(",");
			expect(cells[label]).toBe(`'${V1_NAME}`);
			expect(cells[version]).toBe("1");
		}
	});
});
