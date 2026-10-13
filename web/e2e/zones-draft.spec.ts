import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { authFile, PASSWORD } from "./support/auth";
import { loopbackOrigin, projectPath, SEED } from "./support/manifest";

/**
 * Plan WEB-35: a zone draft saves itself to DECA Mark a moment after each change, with a new revision
 * each time; DECA Mark checks the saved revision; and a save made over someone else's newer revision opens
 * the conflict dialog with the edits in this tab kept. Runs on the synthetic zone review project
 * (`scripts/e2e-local.sh --zones`), on a draft each run makes and discards, so the fixture's own drafts are
 * never touched.
 */

type ZoneManifest = {
	apiUrl: string;
	supabaseUrl: string;
	publishableKey: string;
	projectId: string;
	siteId: string;
	path: string;
	accounts: Record<string, { email: string }>;
};

const MANIFEST = process.env.E2E_ZONE_MANIFEST;
const SITE = "review-site";
const SITE_NAME = "Synthetic review-site";
const LAWN = "Synthetic smaller lawn v2";

function fixture(): ZoneManifest {
	const read = JSON.parse(readFileSync(MANIFEST!, "utf8")) as ZoneManifest;
	loopbackOrigin(read.apiUrl, "The zone fixture's API address");
	loopbackOrigin(read.supabaseUrl, "The zone fixture's Auth address");
	return read;
}

type Draft = { draft_id: string; revision: number; etag: string; zones: { zone_label: string }[] };

/** The zone manager's API calls, to make the run's draft, change it elsewhere and discard it. */
async function managerApi() {
	const { supabaseUrl, publishableKey, apiUrl, accounts } = fixture();
	const signedIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
		method: "POST",
		headers: { apikey: publishableKey, "Content-Type": "application/json" },
		body: JSON.stringify({ email: accounts.manager!.email, password: PASSWORD }),
		signal: AbortSignal.timeout(20_000)
	});
	if (!signedIn.ok) throw new Error(`Zone manager sign-in: HTTP ${signedIn.status}`);
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

async function signInAsZoneManager(page: Page) {
	await page.goto("/sign-in");
	await page.getByLabel("Email address").fill(fixture().accounts.manager!.email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
}

test.describe("the zone draft editor", () => {
	test.skip(!MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");

	test("saves each change as a new revision, checks it, and keeps edits through a conflict", async ({ page }) => {
		test.setTimeout(180_000);
		const { projectId, siteId, path } = fixture();
		const call = await managerApi();
		const drafts = `/v1/projects/${projectId}/sites/${siteId}/zone-drafts`;
		const history = await call<{ current_package_id: string }>(
			"GET",
			`/v1/projects/${projectId}/packages?site_id=${siteId}`
		);
		let draft = await call<Draft>("POST", drafts, {
			request_id: randomUUID(),
			base_package_id: history.current_package_id
		});
		const read = () => call<Draft>("GET", `${drafts}/${draft.draft_id}`);

		try {
			await signInAsZoneManager(page);
			await page.goto(`${path}/sites/${SITE}/zones/drafts/${draft.draft_id}`);
			const main = page.getByRole("main");
			await expect(main.getByRole("heading", { level: 1 })).toHaveText(`Edit zones · ${SITE_NAME}`);
			await expect(main).toContainText(`· revision ${draft.revision}`, { timeout: 30_000 });

			await test.step("a change saves itself as the next revision", async () => {
				await main
					.getByRole("listbox", { name: "Zones" })
					.getByRole("option", { name: new RegExp(LAWN) })
					.click();
				await main.getByLabel("Name", { exact: true }).fill(`${LAWN} edited`);
				await expect(main).toContainText(`· revision ${draft.revision + 1}`, { timeout: 30_000 });
				draft = await read();
				expect(draft.zones.map(zone => zone.zone_label)).toContain(`${LAWN} edited`);
			});

			await test.step("DECA Mark checks the saved revision", async () => {
				await main.getByRole("button", { name: "Check boundaries", exact: true }).click();
				await expect(main.getByRole("region", { name: "Problems" })).toContainText(
					`Checked revision ${draft.revision} at`,
					{ timeout: 30_000 }
				);
			});

			await test.step("a save over someone else's newer revision asks which to keep, edits intact", async () => {
				const elsewhere = draft.zones.map(zone =>
					zone.zone_label === `${LAWN} edited` ? { ...zone, zone_label: `${LAWN} elsewhere` } : zone
				);
				draft = await call<Draft>(
					"PUT",
					`${drafts}/${draft.draft_id}`,
					{ zones: elsewhere, change_note: "" },
					draft.etag
				);
				await main.getByLabel("Name", { exact: true }).fill(`${LAWN} mine`);
				const dialog = page.getByRole("dialog", { name: "Someone else saved this draft" });
				await expect(dialog).toBeVisible({ timeout: 30_000 });
				await expect(dialog).toContainText("Zones that differ:");
				await expect(main.getByLabel("Name", { exact: true })).toHaveValue(`${LAWN} mine`);
				expect((await read()).zones.map(zone => zone.zone_label)).toContain(`${LAWN} elsewhere`);

				await dialog.getByRole("button", { name: "Replace the saved draft with my edits" }).click();
				await page
					.getByRole("dialog", { name: "Replace the saved draft?" })
					.getByRole("button", { name: "Replace the saved draft", exact: true })
					.click();
				await expect(main).toContainText(`· revision ${draft.revision + 1}`, { timeout: 30_000 });
				draft = await read();
				expect(draft.zones.map(zone => zone.zone_label)).toContain(`${LAWN} mine`);
			});

			await test.step("loading the saved draft instead replaces the edits in this tab", async () => {
				const elsewhere = draft.zones.map(zone =>
					zone.zone_label === `${LAWN} mine` ? { ...zone, zone_label: `${LAWN} theirs` } : zone
				);
				draft = await call<Draft>(
					"PUT",
					`${drafts}/${draft.draft_id}`,
					{ zones: elsewhere, change_note: "" },
					draft.etag
				);
				await main.getByLabel("Name", { exact: true }).fill(`${LAWN} dropped`);
				const dialog = page.getByRole("dialog", { name: "Someone else saved this draft" });
				await expect(dialog).toBeVisible({ timeout: 30_000 });
				await dialog.getByRole("button", { name: "Discard my edits and load the saved draft" }).click();
				await expect(main).toContainText(`· revision ${draft.revision}`);
				await expect(main.getByRole("listbox", { name: "Zones" })).toContainText(`${LAWN} theirs`);
			});

			await test.step("leaving with a change not saved yet asks first, and Save and leave saves it", async () => {
				// Loading the saved draft started the editor again from it, with nothing selected.
				await main
					.getByRole("listbox", { name: "Zones" })
					.getByRole("option", { name: new RegExp(`${LAWN} theirs`) })
					.click();
				await main.getByLabel("Name", { exact: true }).fill(`${LAWN} kept on leaving`);
				await main
					.getByRole("navigation", { name: /breadcrumb/i })
					.getByRole("link", { name: "Sites" })
					.click();
				const leaving = page.getByRole("dialog", { name: "Save your changes first?" });
				await expect(leaving).toBeVisible();
				await leaving.getByRole("button", { name: "Save and leave" }).click();
				await expect(page).toHaveURL(/\/sites$/, { timeout: 30_000 });
				expect((await read()).zones.map(zone => zone.zone_label)).toContain(`${LAWN} kept on leaving`);
			});
		} finally {
			const latest = await read();
			await call("DELETE", `${drafts}/${latest.draft_id}`, undefined, latest.etag);
		}
	});
});

test.describe("a viewer", () => {
	test.use({ storageState: authFile("viewer") });

	test("cannot open a zone draft, and nothing about it is read", async ({ page }) => {
		await page.goto(projectPath(`sites/${SEED.sites.fallCreek}/zones/drafts/${randomUUID()}`));
		await expect(page.getByRole("main")).toContainText("Only project managers can edit zones.");
	});
});
