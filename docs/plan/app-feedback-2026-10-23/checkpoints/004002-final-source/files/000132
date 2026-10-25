import { expect, test } from "@playwright/test";

import { createProjectInvitation, ensureNotProjectMember, revokeProjectInvitation } from "./support/api";
import { authFile, signIn } from "./support/auth";
import { manifest, person, projectPath, SEED } from "./support/manifest";
import { projectTabs, tab } from "./support/ui";

/**
 * Plan step 11: someone opens a viewer invitation link, joins, and reads the project without the
 * manager-only Team and Settings tabs. The outsider account is taken back out before and after.
 */

test.use({ storageState: authFile("outsider") });
test.beforeEach(async () => {
	await ensureNotProjectMember("outsider");
	await ensureNotProjectMember("joiner");
});
test.afterEach(async () => {
	await ensureNotProjectMember("outsider");
	await ensureNotProjectMember("joiner");
});

test("a person invited as a viewer joins from the link and sees no Team or Settings", async ({ page }) => {
	const invitation = await createProjectInvitation({ role: "viewer", max_uses: 1, expires_in_days: 1 });
	try {
		await page.goto(`/invite#t=${invitation.token}`);
		const main = page.getByRole("main");
		await expect(main).toContainText(SEED.projectName);
		await expect(main).toContainText(/viewer/i);
		// The link's secret leaves the address bar once read.
		await expect(page).not.toHaveURL(new RegExp(invitation.token));

		await main.getByRole("button", { name: /^join/i }).click();
		await expect(page).toHaveURL(url => url.pathname === projectPath());

		const tabs = projectTabs(page);
		await expect(tab(tabs, "Overview")).toBeVisible();
		await expect(tab(tabs, "Data")).toBeVisible();
		await expect(tab(tabs, "Team")).toHaveCount(0);
		await expect(tab(tabs, "Settings")).toHaveCount(0);
	} finally {
		await revokeProjectInvitation(invitation.id).catch(() => undefined);
	}
});

test("an invitation survives a wrong-account refusal and switching to the invited account", async ({ page }) => {
	const invitation = await createProjectInvitation({ role: "viewer", email: manifest().accounts.joiner.email });
	try {
		await page.goto(`/invite#t=${invitation.token}`);
		const main = page.getByRole("main");
		await expect(main).toContainText(person("outsider").email);
		await main.getByRole("button", { name: "Join project", exact: true }).click();
		await expect(main.getByRole("button", { name: "Switch account", exact: true })).toBeVisible();
		expect(await page.evaluate(() => sessionStorage.getItem("fm-invite"))).toBe(invitation.token);
		await expect(main.getByRole("link", { name: "Open the project", exact: true })).toHaveCount(0);
		await main.getByRole("button", { name: "Switch account", exact: true }).click();
		await expect(page).toHaveURL(/\/sign-in\?next=/);
		await signIn(page, "joiner", { next: "/invite" });
		await expect(main).toContainText(person("joiner").email);
		await main.getByRole("button", { name: "Join project", exact: true }).click();
		await expect(page).toHaveURL(url => url.pathname === projectPath());
		expect(await page.evaluate(() => sessionStorage.getItem("fm-invite"))).toBeNull();
	} finally {
		await revokeProjectInvitation(invitation.id).catch(() => undefined);
	}
});
