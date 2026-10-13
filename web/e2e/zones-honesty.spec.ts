import { test } from "@playwright/test";

import { scanRoute } from "./support/scan";
import { EMPTY_SITE, REVIEW_SITE, signInToZones, ZONE_MANIFEST, zoneFixture } from "./support/zones";

/**
 * Plan WEB-28 (UI plan section 10, item 8): every zone route reads honestly as the account that opens it,
 * in Day and Dusk: no banned words, one primary action, no sideways scroll and no serious or critical axe
 * findings. The routes are on the synthetic zone review project (`scripts/e2e-local.sh --zones`), which has
 * map versions 1 and 2, a site with no package and open drafts; nothing is edited. One sign-in per role
 * keeps the run inside local Auth's sign-in limit.
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const ROUTES: Record<string, { name: string; path: (base: string, draft: string) => string }[]> = {
	manager: [
		{ name: "zones-current", path: base => `${base}/sites/${REVIEW_SITE}/zones` },
		{ name: "zones-earlier-version", path: base => `${base}/sites/${REVIEW_SITE}/zones?version=1` },
		{ name: "zones-no-package", path: base => `${base}/sites/${EMPTY_SITE}/zones` },
		{ name: "zone-draft-editor", path: (base, draft) => `${base}/sites/${REVIEW_SITE}/zones/drafts/${draft}` },
		{
			name: "zone-draft-publish",
			path: (base, draft) => `${base}/sites/${REVIEW_SITE}/zones/drafts/${draft}/publish`
		}
	],
	viewer: [
		{ name: "viewer-zones-current", path: base => `${base}/sites/${REVIEW_SITE}/zones` },
		{ name: "viewer-zone-draft", path: (base, draft) => `${base}/sites/${REVIEW_SITE}/zones/drafts/${draft}` }
	]
};

for (const [role, routes] of Object.entries(ROUTES)) {
	test(`the zone routes read honestly as the ${role}`, async ({ page }, testInfo) => {
		test.setTimeout(300_000);
		const { path, drafts } = zoneFixture();
		const axe = testInfo.project.metadata.axe !== false;
		await signInToZones(page, role);
		for (const route of routes)
			await test.step(route.name, () =>
				scanRoute(page, testInfo, route.path(path, drafts.manager!.draftId), {
					name: route.name,
					axe,
					workspace: true
				})
			);
	});
}
