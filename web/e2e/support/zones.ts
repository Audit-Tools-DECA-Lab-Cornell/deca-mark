import { readFileSync } from "node:fs";

import { expect, type Page } from "@playwright/test";

import { PASSWORD } from "./auth";
import { loopbackOrigin } from "./manifest";

/**
 * The synthetic zone review project (`scripts/e2e-local.sh --zones`, `database/seed-zone-review.mjs`): one
 * site with map versions 1 and 2, a site with no package, two managers' open drafts, a viewer and an
 * observer. Specs read its manifest, sign in through the UI, and arrange or undo state through the API.
 */

export type ZoneManifest = {
	apiUrl: string;
	supabaseUrl: string;
	publishableKey: string;
	projectId: string;
	siteId: string;
	path: string;
	packageIds: string[];
	accounts: Record<string, { id: string; email: string }>;
	drafts: Record<string, { draftId: string }>;
};

export const ZONE_MANIFEST = process.env.E2E_ZONE_MANIFEST;
export const REVIEW_SITE = "review-site";
export const REVIEW_SITE_NAME = "Synthetic review-site";
export const EMPTY_SITE = "no-package";

export function zoneFixture(): ZoneManifest {
	const read = JSON.parse(readFileSync(ZONE_MANIFEST!, "utf8")) as ZoneManifest;
	loopbackOrigin(read.apiUrl, "The zone fixture's API address");
	loopbackOrigin(read.supabaseUrl, "The zone fixture's Auth address");
	return read;
}

export type ZoneDraftRead = {
	draft_id: string;
	revision: number;
	etag: string;
	change_note: string;
	zones: { zone_id: string; zone_code: string; zone_label: string; geometry: unknown }[];
};

/** API calls as one of the fixture's accounts, to arrange state or undo what a spec made. */
export async function zoneApi(role: string) {
	const { supabaseUrl, publishableKey, apiUrl, accounts } = zoneFixture();
	const signedIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
		method: "POST",
		headers: { apikey: publishableKey, "Content-Type": "application/json" },
		body: JSON.stringify({ email: accounts[role]!.email, password: PASSWORD }),
		signal: AbortSignal.timeout(20_000)
	});
	if (!signedIn.ok) throw new Error(`Zone ${role} sign-in: HTTP ${signedIn.status}`);
	const { access_token: token } = (await signedIn.json()) as { access_token: string };
	return async function call<T>(method: string, path: string, body?: unknown, etag?: string): Promise<T> {
		const response = await fetch(`${apiUrl}${path}`, {
			method,
			redirect: "error",
			signal: AbortSignal.timeout(20_000),
			headers: {
				Authorization: `Bearer ${token}`,
				...(etag ? { "If-Match": etag } : {}),
				...(body === undefined ? {} : { "Content-Type": "application/json" })
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
		if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
		return (response.status === 204 ? undefined : await response.json()) as T;
	};
}

/** Signs in through the page as one of the fixture's accounts (local Auth allows 30 sign-ins per 5 minutes). */
export async function signInToZones(page: Page, role: string) {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(zoneFixture().accounts[role]!.email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}
