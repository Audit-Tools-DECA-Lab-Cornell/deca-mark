import { expect, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { projectPath } from "./support/manifest";

test.use({ storageState: authFile("manager") });

test("custom report dates remain selected while being entered and All removes date bounds", async ({ page }) => {
	await page.goto(projectPath("reports?round=reliability&from=2026-10-07"));
	const range = page.getByLabel("Date Range");
	const from = page.getByLabel("From");
	const to = page.getByLabel("To");

	await expect(range).toHaveValue("custom");
	await expect(from).toHaveValue("2026-10-07");
	await expect(to).toBeVisible();
	await to.fill("2026-10-08");
	await expect(range).toHaveValue("custom");
	await expect(page).toHaveURL(/from=2026-10-07/);
	await expect(page).toHaveURL(/to=2026-10-08/);

	await range.selectOption("all");
	await expect(page).toHaveURL(/round=reliability/);
	await expect(page).not.toHaveURL(/(?:^|[?&])(?:from|to)=/);
	await expect(page.getByLabel("From")).toHaveCount(0);
	await expect(page.getByLabel("To")).toHaveCount(0);
	await range.selectOption("custom");
	await expect(range).toHaveValue("custom");
	await expect(page.getByLabel("From")).toBeVisible();
	await expect(page.getByLabel("To")).toBeVisible();
});
