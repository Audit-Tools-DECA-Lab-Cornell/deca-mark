import { randomUUID } from "node:crypto";
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

/** One sign-in per account and test worker: local Auth allows 30 sign-ins per 5 minutes. */
const tokens = new Map<string, Promise<string>>();

async function tokenFor(role: string): Promise<string> {
	const { supabaseUrl, publishableKey, accounts } = zoneFixture();
	const signedIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
		method: "POST",
		headers: { apikey: publishableKey, "Content-Type": "application/json" },
		body: JSON.stringify({ email: accounts[role]!.email, password: PASSWORD }),
		signal: AbortSignal.timeout(20_000)
	});
	if (!signedIn.ok) throw new Error(`Zone ${role} sign-in: HTTP ${signedIn.status}`);
	return ((await signedIn.json()) as { access_token: string }).access_token;
}

/** API calls as one of the fixture's accounts, to arrange state or undo what a spec made. */
export async function zoneApi(role: string) {
	const { apiUrl } = zoneFixture();
	if (!tokens.has(role)) tokens.set(role, tokenFor(role));
	const token = await tokens.get(role)!.catch(error => {
		tokens.delete(role);
		throw error;
	});
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

export type ZoneCall = Awaited<ReturnType<typeof zoneApi>>;
export type ZoneSite = { site_id: string; code: string; name: string };
export type ZoneHistory = {
	current_package_id: string | null;
	packages: { package_id: string; package_version: number; change_note: string }[];
};
export type Position = [number, number];

/** A closed ring around a box, west to east and south to north. */
export const ring = (west: number, south: number, east: number, north: number): Position[] => [
	[west, south],
	[east, south],
	[east, north],
	[west, north],
	[west, south]
];

/** Where a fresh site's zones are: A, a lawn, and B, small beds just east of it, inside the site boundary. */
export const FRESH = {
	site: ring(-76.4865, 42.447, -76.4835, 42.449),
	a: ring(-76.4864, 42.4478, -76.485, 42.4489),
	b: ring(-76.4849, 42.4477, -76.4845, 42.448)
} as const;

/** A site of its own with a first map package of two zones, A ("… lawn") and B ("… beds"). */
export async function freshSite(call: ZoneCall, prefix = "publish"): Promise<{ site: ZoneSite; v1: string }> {
	const { projectId } = zoneFixture();
	const tag = randomUUID().slice(0, 8);
	const name = `Synthetic ${prefix}`;
	const site = await call<ZoneSite>("POST", `/v1/projects/${projectId}/sites`, {
		code: `${prefix}-${tag}`,
		name: `${name} ${tag}`
	});
	const first = await call<{ package: { package_id: string } }>("POST", `/v1/projects/${projectId}/packages`, {
		site_id: site.site_id,
		request_id: randomUUID(),
		expected_current_package_id: null,
		form_version: "zone-review-play-v1",
		inventory_form_version: "zone-review-inventory-v1",
		change_note: "Synthetic first map; local acceptance only",
		zone_identity_map: [
			{ source_feature_id: "A", zone_id: randomUUID(), zone_code: "A" },
			{ source_feature_id: "B", zone_id: randomUUID(), zone_code: "B" }
		],
		layers: {
			ground: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: { kind: "site" },
						geometry: { type: "Polygon", coordinates: [FRESH.site] }
					}
				]
			},
			zones: {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						properties: { id: "A", name: `${name} lawn` },
						geometry: { type: "Polygon", coordinates: [FRESH.a] }
					},
					{
						type: "Feature",
						properties: { id: "B", name: `${name} beds` },
						geometry: { type: "Polygon", coordinates: [FRESH.b] }
					}
				]
			}
		}
	});
	return { site, v1: first.package.package_id };
}

/** A draft from `base`, with zone A renamed so it differs from it. */
export async function renamedDraft(call: ZoneCall, siteId: string, base: string, name: string): Promise<ZoneDraftRead> {
	const { projectId } = zoneFixture();
	const drafts = `/v1/projects/${projectId}/sites/${siteId}/zone-drafts`;
	const draft = await call<ZoneDraftRead>("POST", drafts, { request_id: randomUUID(), base_package_id: base });
	const zones = draft.zones.map(zone => (zone.zone_code === "A" ? { ...zone, zone_label: name } : zone));
	return call<ZoneDraftRead>("PUT", `${drafts}/${draft.draft_id}`, { zones, change_note: "" }, draft.etag);
}
