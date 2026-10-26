import { expect, type Page, test } from "@playwright/test";

import { codeFrom } from "./support/mail";
import { loopbackOrigin, manifest, workspacePaths } from "./support/manifest";

/**
 * Plan WEB-45 (audit C06, J-7): signing out on the web ends this browser's session and nothing else. The
 * phone collector signs in with the same account, and a sign-out that revoked every session stopped its
 * uploads at the next token refresh.
 *
 * The second browser here stands in for the phone: it holds its own session for the same account, and
 * "forced token refresh" is the call the collector's Auth client makes, sent to local Auth with that
 * session's refresh token. The refresh token of a revoked session is refused; this one must still work.
 * Each run signs up a new synthetic address against local Supabase Auth and Mailpit, so no seeded
 * account's saved sign-in is touched.
 *
 * Only the refresh-token assertions tell the fix from the base. The access token is a JWT the API and the
 * web server verify locally, so the second browser still reaches /account after a global sign-out until
 * that token expires; only the refresh grant sees the revoked session (400 on the base, 200 after).
 * A fresh account is a member of nothing, so the last place is written the way RememberPlace writes it
 * rather than by opening a project page.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "DecamarkSignOut!1024";
const PLACE_COOKIE = "fm-place";

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

async function signInWith(page: Page, email: string) {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

/** What RememberPlace writes in the browser on a project page (`features/shell/RememberPlace.tsx`). */
async function rememberPlace(page: Page, path: string) {
	await page.evaluate(
		({ name, value }) => {
			document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=3600; SameSite=Lax`;
		},
		{ name: PLACE_COOKIE, value: path }
	);
}

async function cookieNames(page: Page): Promise<string[]> {
	return (await page.context().cookies()).map(cookie => cookie.name);
}

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/** The refresh token inside the `sb-<ref>-auth-token` cookie (`base64-<base64url JSON>`, possibly in chunks). */
async function refreshTokenOf(page: Page): Promise<string> {
	const parts = (await page.context().cookies())
		.filter(cookie => SESSION_COOKIE.test(cookie.name))
		.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
	expect(parts.length, "the browser holds a session").toBeGreaterThan(0);
	let raw = parts.map(part => part.value).join("");
	raw = raw.startsWith("base64-")
		? Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")
		: decodeURIComponent(raw);
	const { refresh_token: token } = JSON.parse(raw) as { refresh_token?: string };
	if (!token) throw new Error("The session cookie holds no refresh token.");
	return token;
}

/**
 * The collector's forced token refresh: Auth's own endpoint, with the session's refresh token. Returns the
 * status and the next refresh token, which a rotation replaces.
 */
async function refreshSession(token: string): Promise<{ status: number; next: string | null }> {
	const { supabaseUrl, publishableKey } = manifest();
	const response = await fetch(
		`${loopbackOrigin(supabaseUrl, "The seeded Auth address")}/auth/v1/token?grant_type=refresh_token`,
		{
			method: "POST",
			headers: { apikey: publishableKey, "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: token })
		}
	);
	const body = (await response.json().catch(() => ({}))) as { refresh_token?: string };
	return { status: response.status, next: body.refresh_token ?? null };
}

test("signing out on the web leaves the account's other session alive and forgets the last place", async ({
	page,
	browser,
	baseURL
}, info) => {
	test.setTimeout(150_000);
	const email = `decamark-signout-${info.project.name}-${Date.now()}@example.com`;
	const project = workspacePaths().project;

	// The phone: a second browser signed in as the same person.
	await signUp(page, email);
	const phone = await browser.newContext({ baseURL: baseURL ?? undefined });
	const phonePage = await phone.newPage();
	try {
		await signInWith(phonePage, email);
		let phoneToken = await refreshTokenOf(phonePage);

		await test.step("Sign out on the Account page ends this browser and clears the last place", async () => {
			await rememberPlace(page, project);
			expect(await cookieNames(page)).toContain(PLACE_COOKIE);
			await page.goto("/account");
			await page.getByRole("button", { name: "Sign out", exact: true }).click();
			await expect(page).toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
			expect((await cookieNames(page)).filter(name => SESSION_COOKIE.test(name))).toEqual([]);
			expect.soft(await cookieNames(page), "the last place is gone after sign out").not.toContain(PLACE_COOKIE);
		});

		await test.step("the second browser is still signed in and its token refresh still works", async () => {
			const refreshed = await refreshSession(phoneToken);
			expect(refreshed.status, "the other session's refresh token is still accepted").toBe(200);
			phoneToken = refreshed.next ?? phoneToken;
			await phonePage.goto("/account");
			await expect(phonePage).not.toHaveURL(/\/sign-in(\?|$)/);
			await expect(phonePage.getByRole("main")).toContainText(email);
		});

		await test.step('"Not you?" on the join page does the same', async () => {
			await signInWith(page, email);
			await rememberPlace(page, project);
			await page.goto("/join");
			await page.getByRole("button", { name: "Not you?" }).click();
			await expect(page).toHaveURL(/\/sign-in\?next=%2Fjoin$/, { timeout: 30_000 });
			expect((await cookieNames(page)).filter(name => SESSION_COOKIE.test(name))).toEqual([]);
			expect.soft(await cookieNames(page), "the last place is gone after Not you?").not.toContain(PLACE_COOKIE);
			const refreshed = await refreshSession(phoneToken);
			expect(refreshed.status, "the other session's refresh token is still accepted").toBe(200);
		});
	} finally {
		await phone.close();
	}
});
