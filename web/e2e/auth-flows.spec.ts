import { expect, type Page, test } from "@playwright/test";

import { loopbackOrigin } from "./support/manifest";

/**
 * Plan WEB-04 (and WEB-15's sign-up and password reset): the Contour identity screens against local
 * Supabase Auth, with the six-digit codes read from the local Mailpit inbox, as a person would read them
 * from their email. Each run signs up a new synthetic address, verifies it, signs out, resets the password
 * through the recovery code and signs in with the new one. Nothing here leaves this machine.
 */

const MAILPIT = loopbackOrigin(process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324", "Mailpit");
const PASSWORD = "DecamarkFlows!1014";
const NEXT_PASSWORD = "DecamarkFlowsReset!1014";

type Listing = { messages: { ID: string; Subject: string; To: { Address: string }[] }[] };

/** The six-digit code in the newest email to `email` whose subject contains `subject`. */
async function codeFrom(email: string, subject: string): Promise<string> {
	let found = "";
	await expect
		.poll(
			async () => {
				const listing = (await fetch(`${MAILPIT}/api/v1/messages`).then(answer => answer.json())) as Listing;
				const message = listing.messages.find(
					item => item.Subject.includes(subject) && item.To.some(to => to.Address === email)
				);
				if (!message) return "";
				const detail = (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`).then(answer =>
					answer.json()
				)) as {
					Text: string;
					HTML: string;
				};
				found = /\b(\d{6})\b/.exec(`${detail.Text} ${detail.HTML}`)?.[1] ?? "";
				return found;
			},
			{ timeout: 20_000, message: `an email "${subject}" to ${email}` }
		)
		.toMatch(/^\d{6}$/);
	return found;
}

async function signOutFromAccount(page: Page) {
	await page.goto("/account");
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(page).toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

async function signInWith(page: Page, email: string, password: string) {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("signs up with an email code, then resets the password with a recovery code", async ({ page }, info) => {
	test.setTimeout(120_000);
	const email = `decamark-flow-${info.project.name}-${Date.now()}@example.com`;
	const main = page.getByRole("main");

	await test.step("sign up sends a verification code and never puts the email in the address", async () => {
		await page.goto("/sign-up");
		await page.getByLabel("Email address").fill(email);
		await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
		await page.getByLabel("Confirm password").fill(PASSWORD);
		await expect(main).toContainText("Passwords match");
		await page.getByRole("checkbox", { name: /privacy information/ }).check();
		await page.getByRole("button", { name: "Send verification code" }).click();
		await expect(page).toHaveURL(/\/verify(\?|$)/, { timeout: 30_000 });
		expect(page.url()).not.toContain(encodeURIComponent(email));
		expect(page.url()).not.toContain(email);
	});

	await test.step("a wrong code is refused, and the right one verifies by itself at the sixth digit", async () => {
		const code = await codeFrom(email, "verification code");
		const field = page.getByLabel("Verification code");
		await field.fill(code === "000000" ? "111111" : "000000");
		await expect(main).toContainText(/invalid or expired/i, { timeout: 30_000 });
		await field.fill("");
		await field.pressSequentially(code);
		await expect(page).not.toHaveURL(/\/verify(\?|$)/, { timeout: 30_000 });
		await page.goto("/account");
		await expect(main).toContainText(email);
	});

	await signOutFromAccount(page);

	await test.step("forgot password sends a recovery code, and the new password replaces the old", async () => {
		await page.goto("/forgot-password");
		await page.getByLabel("Email address").fill(email);
		await page.getByRole("button", { name: "Send recovery code" }).click();
		await expect(page).toHaveURL(/\/reset-password(\?|$)/, { timeout: 30_000 });
		expect(page.url()).not.toContain(email);
		const code = await codeFrom(email, "password reset code");
		await page.getByLabel("Six-digit recovery code").fill(code);
		await page.getByLabel("New password", { exact: true }).fill(NEXT_PASSWORD);
		await page.getByLabel("Confirm new password").fill(NEXT_PASSWORD);
		await page.getByRole("button", { name: "Save new password" }).click();
		await expect(page).not.toHaveURL(/\/reset-password(\?|$)/, { timeout: 30_000 });
	});

	await signOutFromAccount(page);

	await test.step("the old password no longer signs in; the new one does", async () => {
		await signInWith(page, email, PASSWORD);
		await expect(main).toContainText(/email or password is incorrect/i, { timeout: 30_000 });
		await signInWith(page, email, NEXT_PASSWORD);
		await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
		await page.goto("/account");
		await expect(main).toContainText(email);
	});
});
