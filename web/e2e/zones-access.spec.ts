import { expect, test } from "@playwright/test";

import {
	EMPTY_SITE,
	REVIEW_SITE,
	REVIEW_SITE_NAME,
	signInToZones,
	ZONE_MANIFEST,
	zoneApi,
	type ZoneDraftRead,
	zoneFixture
} from "./support/zones";

/**
 * Plan WEB-37: a site's Zones page. A manager finds their own and other managers' drafts, starts a draft
 * from the current version and restores an earlier version's boundaries in a new one; a viewer sees the
 * versions and no drafts; an observer never reaches it; a site with no package says so. Runs on the
 * synthetic zone review project (`scripts/e2e-local.sh --zones`); drafts a run starts are discarded.
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const V1_NAME = "=Synthetic lawn v1";

/** Discards the drafts a run started, read back for their ETags. */
async function discard(draftIds: readonly string[]) {
	const { projectId, siteId } = zoneFixture();
	const call = await zoneApi("manager");
	const drafts = `/v1/projects/${projectId}/sites/${siteId}/zone-drafts`;
	for (const id of draftIds) {
		const draft = await call<ZoneDraftRead>("GET", `${drafts}/${id}`);
		await call("DELETE", `${drafts}/${id}`, undefined, draft.etag);
	}
}

test("a manager finds the drafts, starts one and restores an earlier version", async ({ page }) => {
	test.setTimeout(180_000);
	const { path, drafts } = zoneFixture();
	const zones = `${path}/sites/${REVIEW_SITE}/zones`;
	const started: string[] = [];
	const draftAt = () => new URL(page.url()).pathname.match(/\/zones\/drafts\/([0-9a-f-]{36})$/)?.[1];

	try {
		await signInToZones(page, "manager");
		await page.goto(zones);
		const main = page.getByRole("main");
		await expect(main.getByRole("heading", { level: 1 })).toHaveText(`Zones · ${REVIEW_SITE_NAME}`);
		await expect(main).toContainText("Map v2 · published");

		await test.step("the open drafts list this manager's and another manager's", async () => {
			const open = main.getByRole("region", { name: "Open drafts" });
			await expect(open).toContainText("Your draft");
			await expect(open.getByRole("listitem").filter({ hasText: "’s draft" }).first()).toBeVisible();
			await main.getByRole("link", { name: "Open your draft" }).click();
			await expect(page).toHaveURL(new RegExp(`/zones/drafts/${drafts.manager!.draftId}$`));
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Edit zones · ${REVIEW_SITE_NAME}`);
		});

		await test.step("starting another draft says who else has one, and opens the new draft", async () => {
			await page.goto(zones);
			await main.getByRole("button", { name: "Start another draft" }).click();
			const dialog = page.getByRole("dialog", { name: "Start a draft from v2?" });
			await expect(dialog).toContainText("has a draft based on v2");
			await expect(dialog).toContainText("only the first one published becomes v3");
			await dialog.getByRole("button", { name: "Start the draft" }).click();
			await expect(page).toHaveURL(/\/zones\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
			started.push(draftAt()!);
			await expect(page.getByRole("main")).toContainText("· revision 1", { timeout: 30_000 });
		});

		await test.step("an earlier version is shown read only", async () => {
			await page.goto(`${zones}?version=1`);
			await expect(main).toContainText("Map v1, an earlier version.");
			await expect(main.getByRole("region", { name: "Zones of v1" })).toContainText(V1_NAME);
		});

		await test.step("restoring v1 starts a draft from v2 with v1's boundaries, opened for review", async () => {
			const versions = main.getByRole("region", { name: "Versions" });
			await versions.getByRole("button", { name: "Restore v1 boundaries in a new draft" }).click();
			const dialog = page.getByRole("dialog", { name: "Restore v1 boundaries?" });
			await dialog.getByRole("button", { name: "Start the draft" }).click();
			await expect(page).toHaveURL(/\/zones\/drafts\/[0-9a-f-]{36}\/publish$/, { timeout: 30_000 });
			const id = new URL(page.url()).pathname.match(/\/drafts\/([0-9a-f-]{36})\/publish$/)![1]!;
			started.push(id);
			const { projectId, siteId } = zoneFixture();
			const draft = await (
				await zoneApi("manager")
			)<ZoneDraftRead>("GET", `/v1/projects/${projectId}/sites/${siteId}/zone-drafts/${id}`);
			expect(draft.change_note).toBe("Restores v1 boundaries");
			expect(draft.zones.map(zone => zone.zone_label)).toContain(V1_NAME);
			await expect(page.getByLabel("Change note")).toHaveValue("Restores v1 boundaries");
			await expect(main.getByRole("region", { name: "Changes" })).toContainText(V1_NAME, { timeout: 30_000 });
		});
	} finally {
		await discard(started);
	}
});

test("a viewer sees every version and no drafts, and cannot open a draft or its review", async ({ page }) => {
	const { path, drafts } = zoneFixture();
	await signInToZones(page, "viewer");
	await page.goto(`${path}/sites/${REVIEW_SITE}/zones`);
	const main = page.getByRole("main");
	await expect(main.getByRole("region", { name: "Versions" })).toContainText("v1");
	await expect(main.getByRole("region", { name: "Versions" })).toContainText("Replaced by v2");
	await expect(main.getByRole("region", { name: "Open drafts" })).toHaveCount(0);
	await expect(main.getByRole("button", { name: /Start a draft|Restore v1/ })).toHaveCount(0);

	await page.goto(`${path}/sites/${REVIEW_SITE}`);
	await expect(main.getByRole("link", { name: "Zone versions" })).toBeVisible();

	await page.goto(`${path}/sites/${EMPTY_SITE}/zones`);
	await expect(main).toContainText("No map package yet");

	// Opened directly, a draft and its review say who can, and show nothing of the draft.
	const draft = `${path}/sites/${REVIEW_SITE}/zones/drafts/${drafts.manager!.draftId}`;
	await page.goto(draft);
	await expect(main).toContainText("Only project managers can edit zones.");
	await expect(main.getByRole("listbox", { name: "Zones" })).toHaveCount(0);
	await page.goto(`${draft}/publish`);
	await expect(main).toContainText("Only project managers can publish zones.");
	await expect(main.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
});

test("an observer never reaches the zones or a draft", async ({ page }) => {
	const { path, drafts } = zoneFixture();
	await signInToZones(page, "observer");
	for (const address of [
		`${path}/sites/${REVIEW_SITE}/zones`,
		`${path}/sites/${REVIEW_SITE}/zones/drafts/${drafts.manager!.draftId}`
	]) {
		await page.goto(address);
		await expect(page).not.toHaveURL(/\/zones/);
		await expect(page.getByRole("main")).not.toContainText("Edit zones");
	}
});
