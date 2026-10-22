import { expect, test } from "@playwright/test";

import { getProject } from "./support/api";
import { authFile } from "./support/auth";
import { projectPath, runStamp } from "./support/manifest";

/** Plan step 9: change a project setting and save it. */

test.use({ storageState: authFile("manager") });

test("a manager changes the project description and it is saved", async ({ page }) => {
	const description = `Local acceptance run ${runStamp()}`;
	await page.goto(projectPath("settings"));
	const field = page.getByLabel(/^description/i).first();
	await field.fill(description);
	await page.getByRole("button", { name: /^save/i }).first().click();

	await expect.poll(async () => (await getProject()).description, { timeout: 20_000 }).toBe(description);
	await page.reload();
	await expect(page.getByLabel(/^description/i).first()).toHaveValue(description);
});
