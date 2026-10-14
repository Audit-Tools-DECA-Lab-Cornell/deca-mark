import { randomUUID } from "node:crypto";

import { type BrowserContext, expect, type Page, type Request, test } from "@playwright/test";

import { freshSite, signInToZones, ZONE_MANIFEST, zoneApi, type ZoneDraftRead, zoneFixture } from "./support/zones";

/**
 * Plan WEB-28 and WEB-35 (UI plan WUI-12 and 5.8): what the zone editor does when the person signed in
 * changes under it, in a second tab of the same browser. Signing out pauses saving with the edit kept in the
 * tab, and signing back in as the same person saves it as the next revision. Another account signing in
 * replaces the editor: the previous account's unsaved edit is neither shown nor sent. Runs on a site of its
 * own on the synthetic zone review project (`scripts/e2e-local.sh --zones`).
 *
 * Playwright keeps every page visible, so switching tabs is emulated: the editor's tab is marked hidden while
 * the other tab is used, and visible again on coming back, with the `visibilitychange` event a browser sends.
 * The sign-in client and the editor react to that event with their own listeners; nothing else is stubbed.
 */

test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

const LAWN = "Synthetic account lawn";

/** Signs out through the account menu, as a person would, and waits for the sign-in page. */
async function signOutThroughMenu(page: Page) {
	await page.getByRole("button", { name: /^Account, / }).click();
	await page.getByRole("menuitem", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

/** Draft writes this page sends to DECA Mark from now on (the editor's saves and checks). */
function draftWrites(page: Page, draftId: string): Request[] {
	const sent: Request[] = [];
	page.on("request", request => {
		if (request.method() !== "GET" && request.url().includes(`/zone-drafts/${draftId}`)) sent.push(request);
	});
	return sent;
}

/**
 * Marks a page's tab hidden (another tab is in front) or visible (the person came back), as a browser does
 * when switching tabs, and sends the bubbling `visibilitychange` event that goes with it.
 */
async function showTab(page: Page, visible: boolean) {
	await page.evaluate(shown => {
		const state = shown ? "visible" : "hidden";
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
		Object.defineProperty(document, "hidden", { configurable: true, get: () => !shown });
		document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
	}, visible);
}

/** A second tab in the same browser, which shares the first one's sign-in. */
async function secondTab(context: BrowserContext, path: string): Promise<Page> {
	const other = await context.newPage();
	await other.goto(path);
	await expect(other.getByRole("button", { name: /^Account, / })).toBeVisible({ timeout: 30_000 });
	return other;
}

async function renameLawn(page: Page, name: string) {
	const main = page.getByRole("main");
	await main
		.getByRole("listbox", { name: "Zones" })
		.getByRole("option", { name: new RegExp(LAWN) })
		.click();
	await main.getByLabel("Name", { exact: true }).fill(name);
}

test("signing out in another tab pauses saving, and signing back in saves the edit", async ({ page, context }) => {
	test.setTimeout(180_000);
	const { path, projectId } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "account");
	const drafts = `/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts`;
	const draft = await call<ZoneDraftRead>("POST", drafts, { request_id: randomUUID(), base_package_id: v1 });
	const read = () => call<ZoneDraftRead>("GET", `${drafts}/${draft.draft_id}`);
	const labels = async () => (await read()).zones.map(zone => zone.zone_label);
	const editor = `${path}/sites/${site.code}/zones/drafts/${draft.draft_id}`;
	const main = page.getByRole("main");

	try {
		await signInToZones(page, "manager");
		await page.goto(editor);
		await expect(main).toContainText("· revision 1", { timeout: 30_000 });
		const other = await secondTab(context, path);

		await test.step("signed out in the other tab, an edit here says so and is kept", async () => {
			await showTab(page, false);
			await signOutThroughMenu(other);
			await showTab(page, true);
			await renameLawn(page, `${LAWN} kept`);
			await expect(main).toContainText(
				"Not saved · you were signed out. Sign in again in another tab, then come back to save.",
				{ timeout: 30_000 }
			);
			await expect(main.getByLabel("Name", { exact: true })).toHaveValue(`${LAWN} kept`);
			expect(await labels()).toContain(LAWN);
			expect((await read()).revision).toBe(1);
		});

		await test.step("signed back in as the same person, coming back saves it as the next revision", async () => {
			await showTab(page, false);
			await signInToZones(other, "manager");
			await showTab(page, true);
			await expect(main).toContainText("· revision 2", { timeout: 30_000 });
			await expect.poll(labels, { timeout: 30_000 }).toContain(`${LAWN} kept`);
		});
	} finally {
		const latest = await read();
		await call("DELETE", `${drafts}/${latest.draft_id}`, undefined, latest.etag);
	}
});

test("another account signing in replaces the editor, and sends nothing of the previous account's", async ({
	page,
	context
}) => {
	test.setTimeout(180_000);
	const { path, projectId, accounts } = zoneFixture();
	const call = await zoneApi("manager");
	const { site, v1 } = await freshSite(call, "account");
	const drafts = `/v1/projects/${projectId}/sites/${site.site_id}/zone-drafts`;
	const draft = await call<ZoneDraftRead>("POST", drafts, { request_id: randomUUID(), base_package_id: v1 });
	const read = () => call<ZoneDraftRead>("GET", `${drafts}/${draft.draft_id}`);
	const editor = `${path}/sites/${site.code}/zones/drafts/${draft.draft_id}`;
	const main = page.getByRole("main");
	const unsaved = `${LAWN} not for the next account`;

	try {
		await signInToZones(page, "manager");
		await page.goto(editor);
		await expect(main).toContainText("· revision 1", { timeout: 30_000 });

		await test.step("an edit saved before the change is the draft's last revision", async () => {
			await renameLawn(page, `${LAWN} saved`);
			await expect(main).toContainText("· revision 2", { timeout: 30_000 });
		});

		const other = await secondTab(context, path);
		const sent = draftWrites(page, draft.draft_id);

		await test.step("signed out in the other tab, an edit here waits unsent", async () => {
			await showTab(page, false);
			await signOutThroughMenu(other);
			await showTab(page, true);
			await renameLawn(page, unsaved);
			await expect(main).toContainText("Not saved · you were signed out.", { timeout: 30_000 });
		});

		await test.step("another manager signs in in the other tab", async () => {
			await showTab(page, false);
			await signInToZones(other, "manager2");
			await expect(other.getByRole("button", { name: /^Account, / })).toBeVisible({ timeout: 30_000 });
		});

		await test.step("coming back, this tab replaces the editor and keeps nothing of the edit", async () => {
			await showTab(page, true);
			await expect(main.getByRole("heading", { name: "You are signed in as someone else." })).toBeVisible({
				timeout: 30_000
			});
			await expect(main).toContainText("This draft belongs to the previous account");
			await expect(main.getByRole("link", { name: "Open your projects" })).toBeVisible();
			await expect(main).not.toContainText(unsaved);
			await expect(main.getByRole("listbox", { name: "Zones" })).toHaveCount(0);
		});

		await test.step("DECA Mark still has the previous account's last saved revision", async () => {
			// Longer than the editor's 10 s save ceiling, so a save it still meant to send would have gone.
			await page.waitForTimeout(12_000);
			expect(sent.map(request => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([]);
			const latest = await read();
			expect(latest.revision).toBe(2);
			expect(latest.zones.map(zone => zone.zone_label)).toContain(`${LAWN} saved`);
			expect(latest.zones.map(zone => zone.zone_label)).not.toContain(unsaved);
			expect(accounts.manager2!.id).not.toBe(accounts.manager!.id);
		});
	} finally {
		const latest = await read();
		await call("DELETE", `${drafts}/${latest.draft_id}`, undefined, latest.etag);
	}
});
