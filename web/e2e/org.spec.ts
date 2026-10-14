import { expect, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { orgPath, person, runStamp, SEED } from "./support/manifest";
import { orgTabs, projectTabs, tab } from "./support/ui";

/** Plan step 10: the organization's pages open for its owner, and only for those who may see them. */

test.describe("the owner", () => {
	test.use({ storageState: authFile("owner") });

	test("opens the organization's projects, members and settings", async ({ page }) => {
		await page.goto(orgPath());
		const main = page.getByRole("main");
		await expect(main.getByRole("link", { name: new RegExp(SEED.projectName) }).first()).toBeVisible();

		await tab(orgTabs(page), "Members").click();
		await expect(page).toHaveURL(url => url.pathname === orgPath("members"));
		await expect(main).toContainText(person("owner").name);
		await expect(main).toContainText(person("admin").name);

		await tab(orgTabs(page), "Settings").click();
		await expect(page).toHaveURL(url => url.pathname === orgPath("settings"));
		await expect(page.getByLabel(/^name/i).first()).toHaveValue(SEED.orgName);
	});
});

test.describe("a project manager who is not an owner or admin", () => {
	test.use({ storageState: authFile("manager") });

	test("sees the projects but no Members or Settings", async ({ page }) => {
		await page.goto(orgPath());
		await expect(tab(orgTabs(page), "Projects")).toBeVisible();
		await expect(tab(orgTabs(page), "Members")).toHaveCount(0);
		await expect(tab(orgTabs(page), "Settings")).toHaveCount(0);
	});
});

test.describe("the owner of another organization", () => {
	test.use({ storageState: authFile("other-owner") });

	test("cannot open this organization", async ({ page }) => {
		const response = await page.goto(orgPath());
		expect(response?.status()).toBe(404);
		await expect(page.getByRole("main")).not.toContainText(SEED.projectName);
	});

	// J1 step 2 as D30 has it: the organization comes from the bootstrap script, and its owner creates the
	// project on the web. In the other organization, so the acceptance organization keeps its one project.
	test("creates a project in their own organization and lands in it as its manager", async ({ page }, info) => {
		const name = `Synthetic study ${info.project.name} ${runStamp()}`;
		await page.goto(`/o/${SEED.otherOrgSlug}`);
		const main = page.getByRole("main");
		await main.getByRole("button", { name: "Create project" }).click();
		const dialog = page.getByRole("dialog", { name: "Create project" });
		await dialog.getByLabel("Name", { exact: true }).fill(name);
		await expect(dialog.getByLabel("Project code")).not.toHaveValue("");
		const code = await dialog.getByLabel("Project code").inputValue();
		await dialog.getByRole("button", { name: "Create project" }).click();
		await expect(page).toHaveURL(url => url.pathname === `/o/${SEED.otherOrgSlug}/p/${code}`, {
			timeout: 30_000
		});
		await expect(page.getByRole("button", { name: new RegExp(`project: ${name}$`, "i") })).toBeVisible();
		await expect(projectTabs(page).getByRole("link", { name: "Team" })).toBeVisible();
		await expect(projectTabs(page).getByRole("link", { name: "Settings" })).toBeVisible();
	});
});
