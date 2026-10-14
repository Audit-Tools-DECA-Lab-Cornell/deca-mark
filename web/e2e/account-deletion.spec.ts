import { expect, type Page, test } from "@playwright/test";

import { codeFrom } from "./support/mail";

/**
 * Plan WEB-06: a deletion goes only to the account the dialog was opened for. A browser's tabs share one
 * sign-in, so another tab can sign in as someone else while the dialog is open; every try then deletes
 * nothing. Each run signs up two new synthetic addresses against local Supabase Auth and Mailpit.
 *
 * The local API has no Auth Admin key (backend/config.auth-local.json), so DELETE /v1/me answers 503 before it
 * changes anything: "Deleting accounts is not available yet" is how this spec sees a request reach the API.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "DecamarkDeletion!1014";
const REACHED_API = "Deleting accounts is not available yet. Nothing was deleted.";

async function signUp(page: Page, email: string) {
	await page.goto("/sign-up");
	await page.getByLabel("Email address").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByLabel("Confirm password").fill(PASSWORD);
	await page.getByRole("checkbox", { name: /privacy information/ }).check();
	await page.getByRole("button", { name: "Send verification code" }).click();
	await expect(page).toHaveURL(/\/verify(\?|$)/, { timeout: 30_000 });
	await page.getByLabel("Verification code").pressSequentially(await codeFrom(email, "verification code"));
	await expect(page).not.toHaveURL(/\/verify(\?|$)/, { timeout: 30_000 });
}

async function signOut(page: Page) {
	await page.goto("/account");
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(page).toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

async function signInWith(page: Page, email: string) {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

/** Opens the deletion review on the account page and types the confirmation. */
async function confirmDeletion(page: Page, email: string) {
	await page.goto("/account");
	await expect(page.getByRole("main")).toContainText(email);
	await page.getByRole("button", { name: "Review account deletion" }).click();
	const dialog = page.getByRole("dialog", { name: "Delete your account?" });
	await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
	return dialog;
}

test("a deletion confirmed for one account deletes nothing once another signs in from a second tab", async ({
	page,
	context
}, info) => {
	test.setTimeout(150_000);
	const stamp = `${info.project.name}-${Date.now()}`;
	const first = `decamark-delete-a-${stamp}@example.com`;
	const second = `decamark-delete-b-${stamp}@example.com`;
	await signUp(page, second);
	await signOut(page);
	await signUp(page, first);

	const dialog = await confirmDeletion(page, first);

	await test.step("a second tab signs out and signs in as the other account", async () => {
		const other = await context.newPage();
		await signOut(other);
		await signInWith(other, second);
		await other.close();
	});

	await test.step("the first tab's request is refused before it reaches the API", async () => {
		await dialog.getByRole("button", { name: "Request account deletion" }).click();
		await expect(dialog).toContainText(
			"Nothing was deleted. A different account is signed in on this browser now. Reload the page to see which."
		);
		await expect(dialog).not.toContainText(REACHED_API);
	});

	await test.step("the other account is still signed in, with its profile", async () => {
		await page.goto("/account");
		await expect(page.getByRole("main")).toContainText(second);
		await expect(page.getByRole("button", { name: "Review account deletion" })).toBeVisible();
	});

	await test.step("the account that confirmed sends its own deletion to the API", async () => {
		await signOut(page);
		await signInWith(page, first);
		const own = await confirmDeletion(page, first);
		await own.getByRole("button", { name: "Request account deletion" }).click();
		await expect(own).toContainText(REACHED_API);
		await expect(own).not.toContainText("A different account");
	});
});
