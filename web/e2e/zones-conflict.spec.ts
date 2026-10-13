import { randomUUID } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

import {
	freshSite,
	renamedDraft,
	signInToZones,
	ZONE_MANIFEST,
	zoneApi,
	type ZoneDraftRead,
	zoneFixture,
	type ZoneHistory
} from "./support/zones";

/**
 * Plan WEB-28 (UI plan section 10, item 2): two managers in two browsers, and two tabs of one manager. Both
 * save on the same revision: one wins, and the other keeps its edits and chooses. Two publications from one
 * base: the first becomes v2 and the second is refused with its draft kept. Two tabs publish the same
 * revision with their own requests: the second says the draft was already published as v2. Editor, review
 * and Back to the editor save without a conflict. Each test runs on a site of its own.
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const LAWN = "Synthetic conflict lawn";
const BEDS = "Synthetic conflict beds";

const row = (page: Page, label: string) =>
	page
		.getByRole("main")
		.getByRole("listbox", { name: "Zones" })
		.getByRole("option", { name: new RegExp(label) });

/** Waits for the review's own check of the draft. */
const ready = (page: Page) =>
	expect(page.getByRole("main").getByRole("region", { name: "Ready to publish?" })).toContainText(
		"Ready to publish",
		{ timeout: 30_000 }
	);

async function publish(page: Page) {
	const main = page.getByRole("main");
	await main.getByText("I understand published boundaries cannot be edited.").click();
	await main.getByRole("button", { name: "Publish v2" }).click();
}

test("two managers save the same revision: one wins, the other keeps its edits and chooses", async ({
	page,
	browser
}) => {
	test.setTimeout(180_000);
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "conflict");
	const draft = await renamedDraft(call, site.site_id, v1, `${LAWN} start`);
	const address = `/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts/${draft.draft_id}`;
	const read = () => call<ZoneDraftRead>("GET", address);
	const labels = async () => (await read()).zones.map(zone => zone.zone_label).sort();
	const editor = `${path}/sites/${site.code}/zones/drafts/${draft.draft_id}`;
	const second = await browser.newContext();
	const theirs = await second.newPage();
	try {
		await signInToZones(page, "manager");
		await signInToZones(theirs, "manager2");
		for (const tab of [page, theirs]) {
			await tab.goto(editor);
			await expect(tab.getByRole("main")).toContainText(`· revision ${draft.revision}`, { timeout: 30_000 });
		}

		await test.step("the first save wins", async () => {
			await row(page, `${LAWN} start`).click();
			await page.getByRole("main").getByLabel("Name", { exact: true }).fill(`${LAWN} first`);
			await expect.poll(labels, { timeout: 30_000 }).toEqual([BEDS, `${LAWN} first`]);
		});

		await test.step("the second, on the same revision, asks which to keep with its edits intact", async () => {
			const main = theirs.getByRole("main");
			await row(theirs, BEDS).click();
			await main.getByLabel("Name", { exact: true }).fill(`${BEDS} second`);
			const dialog = theirs.getByRole("dialog", { name: "Someone else saved this draft" });
			await expect(dialog).toContainText("Zones that differ:", { timeout: 30_000 });
			await expect(main.getByLabel("Name", { exact: true })).toHaveValue(`${BEDS} second`);
			expect(await labels()).toEqual([BEDS, `${LAWN} first`]);

			const file = theirs.waitForEvent("download");
			await dialog.getByRole("button", { name: "Save my edits as a file" }).click();
			expect((await file).suggestedFilename()).toBe(`${site.code}-zones-draft-r${draft.revision}.geojson`);

			// Deciding later leaves a note that asks again.
			await dialog.getByRole("button", { name: "Decide later" }).click();
			await expect(dialog).toHaveCount(0);
			await main.getByRole("button", { name: "Choose what to keep" }).click();
			await dialog.getByRole("button", { name: "Replace the saved draft with my edits" }).click();
			await theirs
				.getByRole("dialog", { name: "Replace the saved draft?" })
				.getByRole("button", { name: "Replace the saved draft", exact: true })
				.click();
			// Replacing keeps everything in that tab, including the lawn's earlier name.
			await expect.poll(labels, { timeout: 30_000 }).toEqual([`${BEDS} second`, `${LAWN} start`]);
		});
	} finally {
		await second.close();
		const latest = await read();
		await call("DELETE", address, undefined, latest.etag);
	}
});

test("two managers publish from one base: the first becomes v2, the second is refused", async ({ page, browser }) => {
	test.setTimeout(180_000);
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "conflict");
	const mine = await renamedDraft(call, site.site_id, v1, `${LAWN} mine`);
	const theirs = await renamedDraft(await zoneApi("manager2"), site.site_id, v1, `${LAWN} theirs`);
	const review = (id: string) => `${path}/sites/${site.code}/zones/drafts/${id}/publish`;
	const second = await browser.newContext();
	const other = await second.newPage();
	try {
		await signInToZones(page, "manager");
		await signInToZones(other, "manager2");
		await page.goto(review(mine.draft_id));
		await other.goto(review(theirs.draft_id));
		await ready(page);
		await ready(other);

		await publish(other);
		await expect(other).toHaveURL(new RegExp(`/sites/${site.code}/zones$`), { timeout: 30_000 });

		await publish(page);
		await expect(page.getByRole("main")).toContainText(
			"v2 was published while you were reviewing. Your draft is based on v1 and is unchanged.",
			{ timeout: 30_000 }
		);
		const history = await call<ZoneHistory>("GET", `/v1/projects/${projectId}/packages?site_id=${site.site_id}`);
		expect(history.packages).toHaveLength(2);
		const kept = await call<{ state: string }>(
			"GET",
			`/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts/${mine.draft_id}`
		);
		expect(kept.state).toBe("draft");
	} finally {
		await second.close();
	}
});

test("two tabs publish the same revision with their own requests: the second says it was already published", async ({
	page,
	context
}) => {
	test.setTimeout(180_000);
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "conflict");
	const draft = await renamedDraft(call, site.site_id, v1, `${LAWN} tabs`);
	const review = `${path}/sites/${site.code}/zones/drafts/${draft.draft_id}/publish`;
	await signInToZones(page, "manager");
	// Each tab keeps its own request ID for the revision (session storage is per tab).
	const tab = await context.newPage();
	await page.goto(review);
	await tab.goto(review);
	await ready(page);
	await ready(tab);

	await publish(page);
	await expect(page).toHaveURL(new RegExp(`/sites/${site.code}/zones$`), { timeout: 30_000 });

	await publish(tab);
	const main = tab.getByRole("main");
	await expect(main).toContainText("This draft was already published as v2.", { timeout: 30_000 });
	await expect(main).toContainText("v2 is the current version.");
	await expect(main.getByRole("link", { name: "Open v2" })).toBeVisible();
	const history = await call<ZoneHistory>("GET", `/v1/projects/${projectId}/packages?site_id=${site.site_id}`);
	expect(history.packages).toHaveLength(2);
	await tab.close();
});

test("the editor, its review and Back to the editor save without a conflict", async ({ page }) => {
	test.setTimeout(180_000);
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "conflict");
	const drafts = `/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts`;
	const draft = await call<ZoneDraftRead>("POST", drafts, { request_id: randomUUID(), base_package_id: v1 });
	const read = () => call<ZoneDraftRead>("GET", `${drafts}/${draft.draft_id}`);
	const main = page.getByRole("main");
	try {
		await signInToZones(page, "manager");
		await page.goto(`${path}/sites/${site.code}/zones/drafts/${draft.draft_id}`);
		await expect(main).toContainText("· revision 1", { timeout: 30_000 });
		await row(page, LAWN).click();
		await main.getByLabel("Name", { exact: true }).fill(`${LAWN} before review`);
		await main.getByRole("button", { name: "Review and publish" }).click();
		await expect(page).toHaveURL(/\/publish$/, { timeout: 30_000 });
		await ready(page);
		await main.getByRole("link", { name: "Back to the editor" }).click();
		await expect(page).toHaveURL(/\/zones\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await expect(main).toContainText("· revision 2", { timeout: 30_000 });
		await row(page, `${LAWN} before review`).click();
		await main.getByLabel("Name", { exact: true }).fill(`${LAWN} after review`);
		await expect(main).toContainText("· revision 3", { timeout: 30_000 });
		await expect(page.getByRole("dialog", { name: "Someone else saved this draft" })).toHaveCount(0);
		expect((await read()).zones.map(zone => zone.zone_label)).toContain(`${LAWN} after review`);
	} finally {
		const latest = await read();
		await call("DELETE", `${drafts}/${latest.draft_id}`, undefined, latest.etag);
	}
});
