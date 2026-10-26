import { expect, test } from "@playwright/test";

import { api, listForms } from "./support/api";
import { authFile } from "./support/auth";
import { manifest, projectPath, runStamp, SEED } from "./support/manifest";

/** Plan step 5: edit a form by starting a new draft, saving it and publishing it. */

test.use({ storageState: authFile("manager") });

/** The stored draft, to confirm Save draft wrote the change. */
function formVersion(code: string): Promise<unknown> {
	return api("manager", "GET", `/v1/projects/${manifest().projectId}/form-versions/${code}`);
}

async function versionState(code: string): Promise<string | undefined> {
	const form = (await listForms()).find(item => item.code === SEED.form.code);
	return form?.versions.find(version => version.code === code)?.state;
}

test("a manager starts a new draft, saves a change and publishes it", async ({ page }) => {
	test.setTimeout(120_000);
	const known = new Set(
		((await listForms()).find(item => item.code === SEED.form.code)?.versions ?? []).map(version => version.code)
	);

	await page.goto(projectPath("forms"));
	await page
		.getByRole("link", { name: new RegExp(SEED.form.name) })
		.first()
		.click();
	await page.getByRole("button", { name: "Start new draft", exact: true }).first().click();

	// The new draft opens in the editor.
	await expect(page).toHaveURL(new RegExp(`/forms/versions/${SEED.form.code}-v\\d+$`));
	const code = new URL(page.url()).pathname.split("/").pop() ?? "";
	expect(known.has(code), `${code} is a new version`).toBe(false);
	expect(await versionState(code)).toBe("draft");

	// Change the question's wording and save the draft.
	const wording = `${SEED.question.label} ${runStamp()}`;
	const field = page.getByRole("textbox", { name: /^question text/i }).first();
	await field.fill(wording);
	await page.getByRole("button", { name: "Save draft", exact: true }).click();
	await expect(page.getByText(/saved/i).first()).toBeVisible();
	await expect.poll(async () => JSON.stringify(await formVersion(code)), { timeout: 20_000 }).toContain(wording);

	// Publish it.
	await page.getByRole("link", { name: "Publish", exact: true }).first().click();
	await expect(page).toHaveURL(url => url.pathname === projectPath(`forms/versions/${code}/publish`));
	await page.getByRole("checkbox").first().check();
	await page.getByRole("button", { name: /^Publish\b/ }).click();

	await expect.poll(() => versionState(code), { timeout: 30_000 }).toBe("published");
	await expect(page.getByText(/published/i).first()).toBeVisible();
});
