import { expect, type Locator, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { manifest, projectPath, SEED } from "./support/manifest";
import { chooseFilter, csvLines, downloadZip, recordRows } from "./support/ui";

/** Plan step 7: filter the data, open a record, export CSV. */

test.use({ storageState: authFile("manager") });

test("the data lists every seeded record and the round filter narrows it", async ({ page }) => {
	const { baseline } = manifest();
	await page.goto(projectPath("data"));
	const main = page.getByRole("main");
	await expect(await recordRows(main)).toHaveCount(baseline.total);

	await chooseFilter(main, /round/i, /reliability/i);
	await expect(page).toHaveURL(/reliability/);
	await expect(await recordRows(main)).toHaveCount(baseline.reliability);
});

test("opening a record shows its answers labelled from its form", async ({ page }) => {
	const { observations } = manifest();
	await page.goto(projectPath("data"));
	const rows = await recordRows(page.getByRole("main"));
	await rows.first().getByRole("link").first().click();
	await expect(page).toHaveURL(url => observations.some(id => url.pathname === projectPath(`data/${id}`)));

	const main = page.getByRole("main");
	await expect(main).toContainText(SEED.question.label);
	await expect(main).toContainText(SEED.question.answerPrefix);
	await expect(main).toContainText(SEED.form.published);
	await expect(main).toContainText(/OBS-[0-9A-F]{6}/);
});

test("lowercase observer initials match, and the Data breadcrumb returns to the filtered view", async ({ page }) => {
	const { baseline } = manifest();
	await page.goto(projectPath("data"));
	const main = page.getByRole("main");
	// The filters are drawn with the page; choosing before they are there would find a plan marker instead.
	await expect(main.getByRole("combobox", { name: /round/i })).toBeVisible();
	await chooseFilter(main, /round/i, /reliability/i);
	await expect(page).toHaveURL(/round=reliability/);

	// "ob" is typed in lowercase; observer codes are recorded in capitals.
	const observer = main.getByLabel("Observer", { exact: true });
	await observer.fill("ob");
	await observer.press("Enter");
	await expect(page).toHaveURL(/observer=OB/);
	await expect(observer).toHaveValue("OB");
	await expect(await recordRows(main)).toHaveCount(baseline.reliability);

	await (await recordRows(main)).first().getByRole("link").first().click();
	await expect(page).toHaveURL(/\/data\/[0-9a-f-]{36}\?/);
	await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Data", exact: true }).click();
	await expect(page).toHaveURL(url => url.pathname === projectPath("data"));
	await expect(page).toHaveURL(/round=reliability/);
	await expect(page).toHaveURL(/observer=OB/);
	await expect(main.getByLabel("Observer", { exact: true })).toHaveValue("OB");
	await expect(await recordRows(main)).toHaveCount(baseline.reliability);
});

test("Data is one list that is a table from 768 px and cards below, with the plan first below 1280 px", async ({
	page
}, info) => {
	test.skip(info.project.name !== "desktop-1440", "Sets its own widths; run once.");
	const { baseline } = manifest();
	const main = page.getByRole("main");
	const plan = main.getByRole("region", { name: "Site plan" });
	const top = async (target: Locator) => (await target.boundingBox())!.y;

	await test.step("each record is in the page once at every width", async () => {
		for (const [width, height] of [
			[390, 844],
			[768, 1024],
			[1024, 768],
			[1440, 900]
		] as const) {
			await page.setViewportSize({ width, height });
			await page.goto(projectPath("data"));
			await expect(await recordRows(main)).toHaveCount(baseline.total);
			expect(await main.locator("[data-record-id]").count(), `${width} px`).toBe(baseline.total);
			expect(await main.getByRole("list", { name: "Observations in this view" }).count()).toBe(0);
		}
	});

	await test.step("phone: a row is a card with its link, round and answer", async () => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(projectPath("data"));
		const card = (await recordRows(main)).first();
		expect(await card.evaluate(row => getComputedStyle(row).display)).toBe("flex");
		await expect(card.getByRole("link", { name: /^OBS-[0-9A-F]{6}$/ })).toBeVisible();
		// The word "Observer" is drawn by the cell's ::before, so it is not in the text: read the style.
		const observer = card.getByRole("cell").nth(6);
		await expect(observer).toHaveText("OB");
		expect(await observer.evaluate(cell => getComputedStyle(cell, "::before").content)).toContain("Observer");
		await expect(card).toContainText(SEED.question.answerPrefix);
		// The cards have no sideways scroll.
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	});

	await test.step("tablet: the plan is above the first row, and a marker does not scroll away from it", async () => {
		for (const [width, height] of [
			[1024, 768],
			[768, 1024]
		] as const) {
			await page.setViewportSize({ width, height });
			await page.goto(projectPath("data"));
			const rows = await recordRows(main);
			await expect(plan).toBeVisible();
			expect(await top(plan), `${width}x${height}: the plan starts above the rows`).toBeLessThan(
				await top(rows.first())
			);
			const before = await page.evaluate(() => window.scrollY);
			// Markers drawn at one spot stack, and a pointer click makes Playwright scroll the page to find a
			// reachable point, which would hide what is measured. The click event goes to the marker itself.
			await plan
				.getByRole("button", { name: /^OBS-[0-9A-F]{6},/ })
				.last()
				.dispatchEvent("click");
			await expect(plan).toContainText("Open observation");
			expect(await page.evaluate(() => window.scrollY), `${width}x${height}: the page stays on the plan`).toBe(
				before
			);
		}
	});

	await test.step("desktop: the plan sits beside the table and stays in view", async () => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(projectPath("data"));
		const rows = await recordRows(main);
		const table = (await rows.first().boundingBox())!;
		const drawn = (await plan.boundingBox())!;
		expect(drawn.x).toBeGreaterThan(table.x + table.width - 1);
		expect(await plan.locator("xpath=..").evaluate(element => getComputedStyle(element).position)).toBe("sticky");
	});
});

test("exporting downloads every matching record as DECA Mark writes it, with its codebook", async ({ page }) => {
	const { baseline, observations } = manifest();
	await page.goto(projectPath("data"));
	await page.getByRole("button", { name: "Export", exact: true }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("radio", { name: /csv/i }).first().check();
	await expect(dialog).toContainText("All sites");

	const { name, files } = await downloadZip(page, () =>
		dialog.getByRole("button", { name: `Export ${baseline.total} matching observations`, exact: true }).click()
	);
	expect(name).toMatch(/^play-study-observations-\d{4}-\d{2}-\d{2}\.zip$/);
	expect(Object.keys(files)).toEqual(expect.arrayContaining(["observations.csv", "codebook.csv"]));
	const [header, ...rows] = csvLines(files["observations.csv"]!);
	const columns = header!.split(",");
	for (const column of [
		"observation_id",
		"label",
		"site_code",
		"zone_id",
		"map_version",
		"round_type",
		"observed_at"
	]) {
		expect(columns, `the CSV has ${column}`).toContain(column);
	}
	expect(rows).toHaveLength(baseline.total);
	const ids = new Set(rows.map(row => row.split(",")[columns.indexOf("observation_id")]));
	expect([...ids].sort()).toEqual([...observations].sort());
});
