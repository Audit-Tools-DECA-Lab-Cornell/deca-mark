import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { PASSWORD } from "./support/auth";
import { loopbackOrigin } from "./support/manifest";
import { chooseOption, csvLines, downloadZip, recordRows } from "./support/ui";

/**
 * Plans WEB-39 and WEB-40: Data reads every matching observation from DECA Mark, 500 at a time, with the
 * filters applied by the server, across map versions, and draws one map version at a time. Runs on the separate synthetic zone review project
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

	await test.step("the export is every match, written by DECA Mark, with the recorded zone name made safe", async () => {
		await main.getByRole("button", { name: "Export", exact: true }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByRole("radio", { name: /csv/i }).first().check();
		await expect(dialog).toContainText("only what was recorded on map v1");
		const { files } = await downloadZip(page, () =>
			dialog
				.getByRole("button", { name: `Export ${baseline.perVersion} matching observations`, exact: true })
				.click()
		);
		const [header, ...rows] = csvLines(files["observations.csv"]!);
		const columns = header!.split(",");
		const label = columns.indexOf("zone_label_at_capture");
		const version = columns.indexOf("map_version");
		expect(rows).toHaveLength(baseline.perVersion);
		// One snapshot: the metadata's count is the file's rows, and the codebook, forms and the zones as
		// recorded come with it.
		expect((JSON.parse(files["metadata.json"]!) as { total_matching: number }).total_matching).toBe(rows.length);
		for (const name of ["codebook.csv", "forms.json", "historical-zones.geojson"])
			expect(files[name], `${name} is in the export`).toBeTruthy();
		for (const row of rows) {
			const cells = row.split(",");
			expect(cells[label]).toBe(`'${V1_NAME}`);
			expect(cells[version]).toBe("1");
		}
	});
});

test("The plan draws one map version, dims the others and lists inventories by zone", async ({ page }) => {
	test.setTimeout(180_000);
	const { path, baseline } = fixture();
	await signInAsZoneManager(page);
	await page.goto(`${path}/data?site=review-site`);
	const main = page.getByRole("main");
	const plan = main.getByRole("region", { name: "Site plan" });
	const boundaries = plan.getByLabel("Boundaries", { exact: true });
	const inventories = main.getByRole("region", { name: "Zone inventories in this view" });
	const half = baseline.inventory / 2;

	await test.step("the current version is drawn, and v1's points are dimmed rather than placed on it", async () => {
		await expect(boundaries.locator("option")).toHaveText([
			`v2 (current) · ${baseline.perVersion} observations`,
			`v1 · ${baseline.perVersion} observations`
		]);
		await expect(plan).toContainText("Map v2 (current)");
		await expect(plan).toContainText("Drawn on map v2, the site's current version.");
		await expect(plan).toContainText(
			"Points recorded on v1 are dimmed. Their zones may differ from these boundaries."
		);
		await expect(plan).toContainText(`The map shows the 500 loaded of ${baseline.total} matching observations.`);
		await expect(
			plan.getByRole("button", { name: /, map v1, recorded on another map version$/ }).first()
		).toBeAttached();
		await expect(plan.getByRole("button", { name: /, map v2$/ }).first()).toBeAttached();
	});

	await test.step("inventories are listed by zone and version with every match counted, never drawn", async () => {
		const rows = inventories.getByRole("row").filter({ hasText: /v\d/ });
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0)).toContainText(V2_NAME);
		await expect(rows.nth(0)).toContainText(`v2${half}`);
		await expect(rows.nth(1)).toContainText(V1_NAME);
		await expect(rows.nth(1)).toContainText(`v1${half}`);
		await expect(plan.getByRole("button", { name: /inventory/i })).toHaveCount(0);
	});

	await test.step("v1 draws its own boundaries, and v2's points are dimmed on it", async () => {
		await chooseOption(boundaries, /^v1 · /);
		await expect(plan).toContainText("Map v1", { timeout: 30_000 });
		await expect(plan).toContainText("Drawn on map v1. v2 is current.");
		await expect(plan).toContainText("Points recorded on v2 are dimmed.");
		await expect(
			plan.getByRole("button", { name: /, map v2, recorded on another map version$/ }).first()
		).toBeAttached();
	});

	await test.step("choosing an inventory switches the plan to the version it was recorded on", async () => {
		await inventories.getByRole("row").filter({ hasText: V2_NAME }).click();
		await expect(boundaries).toHaveValue(
			(await boundaries.locator("option", { hasText: "v2 (current)" }).getAttribute("value")) ?? ""
		);
		await expect(plan).toContainText("Drawn on map v2, the site's current version.");
		// Back on v1, the plan is the one already read.
		await chooseOption(boundaries, /^v1 · /);
		await expect(plan).toContainText("Drawn on map v1. v2 is current.");
	});

	await test.step("a v1 record is drawn on v1 and says v2 is current", async () => {
		const row = (await recordRows(main)).filter({ hasText: V1_NAME }).filter({ hasNotText: "Whole zone" }).first();
		await row.getByRole("link").first().click();
		await expect(page).toHaveURL(/\/data\/[0-9a-f-]{36}$/);
		const record = page.getByRole("main");
		await expect(record).toContainText("Map v1, the version this observation was recorded with. v2 is current.");
		await expect(record).toContainText("· map v1");
		await expect(record.getByRole("region", { name: "Where it was placed" })).toContainText("Map v1");
	});
});
