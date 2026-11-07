import { expect, type Locator, type Page, type Request, test } from "@playwright/test";

import { blankDefinition } from "../src/features/forms/starter";
import { api, getProject } from "./support/api";
import { accessToken, authFile } from "./support/auth";
import { loopbackOrigin, manifest, projectPath } from "./support/manifest";
import { projectTabs } from "./support/ui";
import { signInToZones, ZONE_MANIFEST, zoneFixture } from "./support/zones";

/**
 * Plan WEB-44 (audit C03, decision D34): a Server Action call that rejects instead of answering never
 * loses typed work. The editor, Settings and "Show the next 20" are driven through every way a call can
 * fail, at desktop-1440 and phone-390:
 *
 * - an aborted POST, offline, and a reply lost after the server committed (`route.fetch()` then abort):
 *   DECA Mark cannot know whether the change landed;
 * - cleared cookies (the proxy stops the POST) and a bogus action id (a page older than the server's
 *   build): the action did not run.
 *
 * In every case the screen stays mounted, the typed wording stays in its field, the error page never
 * shows, and the leave guard stays armed. "Nothing was saved" is said only where it is known; a reply lost
 * after the commit never says it, and its second Save (a 412) reads the draft back before it says the
 * earlier save went through. If another manager saved in between, the read-back differs and the page ends
 * in the conflict choice with this page's wording kept.
 */

test.use({ storageState: authFile("manager") });

const ORIGINAL = "Notes";
const COULD_NOT_CONFIRM =
	"DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected.";
const UPDATED =
	"DECA Mark was updated while this page was open. Nothing was saved. Copy your wording, reload, then paste and save.";
const SIGNED_OUT =
	"You were signed out. Nothing was saved. Your wording is still here. Open DECA Mark in another tab, sign in, then save here.";

const isAction = (request: Request) => request.method() === "POST" && request.headers()["next-action"] !== undefined;

/** How a call can fail, and how to put it right again when the page can do that. */
type Failure = {
	name: string;
	says: string;
	arm: (page: Page) => Promise<void>;
	/** Puts the connection back. Absent when only a new sign-in would. */
	disarm?: (page: Page) => Promise<void>;
};

const ABORT_ACTIONS = async (page: Page) =>
	page.route("**/*", route => (isAction(route.request()) ? route.abort("failed") : route.continue()));

const FAILURES: Failure[] = [
	{
		name: "an aborted POST",
		says: COULD_NOT_CONFIRM,
		arm: ABORT_ACTIONS,
		disarm: page => page.unroute("**/*")
	},
	{
		name: "offline",
		says: COULD_NOT_CONFIRM,
		arm: page => page.context().setOffline(true),
		disarm: page => page.context().setOffline(false)
	},
	{
		name: "cleared cookies",
		says: SIGNED_OUT,
		arm: page => page.context().clearCookies()
	},
	{
		name: "a bogus action id",
		says: UPDATED,
		arm: page =>
			page.route("**/*", route =>
				isAction(route.request())
					? route.continue({
							headers: { ...route.request().headers(), "next-action": `40${"ab".repeat(20)}` }
						})
					: route.continue()
			),
		disarm: page => page.unroute("**/*")
	}
];

/** The reply is lost after the server has the change: the request goes through, the page never hears. */
const LOSE_THE_REPLY = async (page: Page) =>
	page.route("**/*", async route => {
		if (!isAction(route.request())) return route.continue();
		await route.fetch();
		await route.abort("failed");
	});

/** The error page's words (REQUEST INTERRUPTED · Something went wrong · What failed). */
async function expectNoErrorPage(page: Page) {
	await expect(page.getByRole("heading", { name: /something went wrong/i })).toHaveCount(0);
	await expect(page.getByText("The page could not load its records")).toHaveCount(0);
}

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ── The proxy ────────────────────────────────────────────────────────────── */

test.describe("a browser that is signed out", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("gets a fixed 401 for a Server Action POST and the sign-in redirect for a page", async ({
		playwright,
		baseURL
	}) => {
		const context = await playwright.request.newContext({ baseURL, maxRedirects: 0 });
		const path = projectPath("settings");
		const action = await context.post(path, {
			headers: { "next-action": `40${"ab".repeat(20)}`, "content-type": "text/plain;charset=UTF-8" },
			data: "[]"
		});
		expect(action.status(), "the action is stopped before it runs").toBe(401);
		// The action runner reads an error body only when the type is exactly text/plain.
		expect(action.headers()["content-type"]).toBe("text/plain");
		expect(await action.text()).toBe("Signed out");

		const page = await context.get(path);
		expect(page.status()).toBe(307);
		// The address may be absolute or relative to this origin.
		expect(new URL(page.headers()["location"] ?? "", baseURL).pathname).toBe("/sign-in");
		await context.dispose();
	});
});

/* ── The form editor ──────────────────────────────────────────────────────── */

type Draft = { version: string };

async function newDraft(): Promise<Draft> {
	const code = `fail-${stamp()}`;
	await api("manager", "POST", `/v1/projects/${manifest().projectId}/forms`, {
		code,
		name: "Action failure acceptance",
		schema_version: 2,
		definition: blankDefinition(code, "Action failure acceptance")
	});
	return { version: `${code}-v1` };
}

type StoredDraft = { etag: string; definition: { questions: { label: string }[] } };

const draftPath = (draft: Draft) => `/v1/projects/${manifest().projectId}/form-versions/${draft.version}`;
const stored = (draft: Draft) => api<StoredDraft>("manager", "GET", draftPath(draft));
const storedLabel = async (draft: Draft) => (await stored(draft)).definition.questions[0]?.label;

/** Another manager saves the draft: the API call a second person's Save makes, with the etag they read. */
async function anotherManagerSaves(draft: Draft, label: string) {
	const origin = loopbackOrigin(manifest().apiUrl, "The API address");
	const headers = { Authorization: `Bearer ${accessToken("manager")}` };
	const current = await stored(draft);
	const definition = structuredClone(current.definition);
	definition.questions[0]!.label = label;
	const response = await fetch(`${origin}${draftPath(draft)}`, {
		method: "PUT",
		headers: { ...headers, "Content-Type": "application/json", "If-Match": current.etag },
		body: JSON.stringify({ definition, schema_version: 2 })
	});
	expect(response.ok, "the other manager's save").toBe(true);
}

async function openEditor(page: Page, draft: Draft): Promise<{ field: Locator; save: Locator }> {
	await page.goto(projectPath(`forms/versions/${draft.version}`));
	const field = page.getByRole("textbox", { name: /^question text/i }).first();
	await expect(field).toHaveValue(ORIGINAL);
	return { field, save: page.getByRole("button", { name: "Save draft", exact: true }) };
}

/** The editor is where it was: mounted, the typed wording in its field, still marked unsaved. */
async function expectEditorKept(page: Page, field: Locator, wording: string) {
	await expect(field).toHaveValue(wording);
	await expect(page.getByText("Unsaved changes")).toBeVisible();
	await expectNoErrorPage(page);
}

/** A link inside the workspace still asks first, and asking leaves the page where it is. */
async function expectGuardArmed(page: Page, link: Locator, title: string) {
	await link.click();
	const dialog = page.getByRole("dialog", { name: title });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Keep editing" }).click();
	await expect(dialog).toBeHidden();
}

test.describe("the form editor", () => {
	for (const failure of FAILURES) {
		test(`keeps the edit when Save draft meets ${failure.name}`, async ({ page }) => {
			const draft = await newDraft();
			const { field, save } = await openEditor(page, draft);
			const wording = `${ORIGINAL} ${stamp()}`;
			await field.fill(wording);
			await failure.arm(page);
			await save.click();

			await expect(page.getByText(failure.says)).toBeVisible();
			await expectEditorKept(page, field, wording);
			expect(await storedLabel(draft), "the failed save wrote nothing").toBe(ORIGINAL);
			await expectGuardArmed(
				page,
				page.getByRole("link", { name: "Forms", exact: true }).first(),
				"Save your changes first?"
			);

			if (!failure.disarm) return;
			await failure.disarm(page);
			await save.click();
			await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
			await expect.poll(() => storedLabel(draft)).toBe(wording);
			await expect(page.getByText("Unsaved changes")).toHaveCount(0);
		});
	}

	test("a reply lost after the commit never says nothing was saved, and its second Save reads the draft back", async ({
		page
	}) => {
		const draft = await newDraft();
		const { field, save } = await openEditor(page, draft);
		const wording = `${ORIGINAL} ${stamp()}`;
		await field.fill(wording);
		await LOSE_THE_REPLY(page);
		await save.click();

		await expect(page.getByText(COULD_NOT_CONFIRM)).toBeVisible();
		await expect(page.getByRole("main")).not.toContainText("Nothing was saved");
		await expectEditorKept(page, field, wording);
		expect(await storedLabel(draft), "the server did commit it").toBe(wording);
		await expectGuardArmed(
			page,
			page.getByRole("link", { name: "Forms", exact: true }).first(),
			"Save your changes first?"
		);

		// The page still holds the etag from before the commit, so this Save is a 412. The draft read back
		// is exactly this page's wording, so the earlier save is reported and the unsaved state is cleared.
		await page.unroute("**/*");
		await save.click();
		await expect(page.getByText("Your earlier save went through.", { exact: true })).toBeVisible();
		await expect(page.getByText("Unsaved changes")).toHaveCount(0);
		await expect(page.getByText("This draft changed")).toHaveCount(0);
		await expect(field).toHaveValue(wording);
		await expect(save).toBeDisabled();
		expect(await storedLabel(draft)).toBe(wording);
	});

	test("a second manager saving between the lost reply and the retry ends in the conflict choice", async ({
		page
	}) => {
		const draft = await newDraft();
		const { field, save } = await openEditor(page, draft);
		const wording = `${ORIGINAL} ${stamp()}`;
		const theirs = `${ORIGINAL} theirs ${stamp()}`;
		await field.fill(wording);
		await LOSE_THE_REPLY(page);
		await save.click();
		await expect(page.getByText(COULD_NOT_CONFIRM)).toBeVisible();
		await page.unroute("**/*");
		expect(await storedLabel(draft)).toBe(wording);

		await anotherManagerSaves(draft, theirs);
		await save.click();

		// The 412 proves nothing by itself: the draft now says something this page never sent.
		await expect(page.getByText(/This draft changed\./)).toBeVisible();
		await expect(page.getByRole("button", { name: "Open latest draft" })).toBeVisible();
		await expect(page.getByText("Your unsaved edits are still here.", { exact: false })).toBeVisible();
		await expect(page.getByText("Your earlier save went through.")).toHaveCount(0);
		await expectEditorKept(page, field, wording);
		await expect(save).toBeDisabled();
		expect(await storedLabel(draft), "this page wrote nothing over theirs").toBe(theirs);
		await expectGuardArmed(
			page,
			page.getByRole("link", { name: "Forms", exact: true }).first(),
			"Save your changes first?"
		);
	});
});

/* ── Project settings ─────────────────────────────────────────────────────── */

test.describe("project settings", () => {
	let original: string | null = null;
	const setDescription = (description: string) =>
		api("manager", "PATCH", `/v1/projects/${manifest().projectId}`, { description });
	test.beforeAll(async () => {
		original = (await getProject()).description;
	});
	test.afterEach(async () => {
		await setDescription(original ?? "");
	});

	async function openSettings(page: Page) {
		await page.goto(projectPath("settings"));
		return {
			field: page.getByLabel(/^description/i).first(),
			save: page.getByRole("button", { name: /^save/i }).first()
		};
	}

	async function expectSettingsKept(page: Page, field: Locator, wording: string) {
		await expect(field).toHaveValue(wording);
		await expect(page.getByText("Unsaved changes")).toBeVisible();
		await expectNoErrorPage(page);
	}

	for (const failure of FAILURES) {
		test(`keeps the edit when Save changes meets ${failure.name}`, async ({ page }) => {
			const { field, save } = await openSettings(page);
			const before = (await getProject()).description;
			const wording = `Action failure ${stamp()}`;
			await field.fill(wording);
			await failure.arm(page);
			await save.click();

			await expect(page.getByText(failure.says)).toBeVisible();
			await expectSettingsKept(page, field, wording);
			expect((await getProject()).description, "the failed save wrote nothing").toBe(before);
			await expectGuardArmed(
				page,
				projectTabs(page).getByRole("link", { name: /^Overview/ }),
				"Leave without saving?"
			);

			if (!failure.disarm) return;
			await failure.disarm(page);
			await save.click();
			await expect(page.getByText("Project settings saved.", { exact: true })).toBeVisible();
			await expect.poll(async () => (await getProject()).description).toBe(wording);
		});
	}

	test("a reply lost after the commit never says nothing was saved, and saving again finishes", async ({ page }) => {
		const { field, save } = await openSettings(page);
		const wording = `Action failure ${stamp()}`;
		await field.fill(wording);
		await LOSE_THE_REPLY(page);
		await save.click();

		await expect(page.getByText(COULD_NOT_CONFIRM)).toBeVisible();
		await expect(page.getByRole("main")).not.toContainText("Nothing was saved");
		await expectSettingsKept(page, field, wording);
		expect((await getProject()).description, "the server did commit it").toBe(wording);
		await expectGuardArmed(
			page,
			projectTabs(page).getByRole("link", { name: /^Overview/ }),
			"Leave without saving?"
		);

		await page.unroute("**/*");
		await save.click();
		await expect(page.getByText("Project settings saved.", { exact: true })).toBeVisible();
		await expect(page.getByText("Unsaved changes")).toHaveCount(0);
		await expect(field).toHaveValue(wording);
	});
});

/* ── Show the next observations ───────────────────────────────────────────── */

test.describe("Show the next observations", () => {
	test.skip(!ZONE_MANIFEST, "Needs the zone review fixture: scripts/e2e-local.sh --zones");
	test.use({ storageState: { cookies: [], origins: [] } });

	test("says it could not load, whatever way the call failed", async ({ page }) => {
		test.setTimeout(120_000);
		await signInToZones(page, "manager");
		const address = `${zoneFixture().path}/data?site=review-site`;
		const more = page.getByRole("button", { name: /^Show the next \d+/ });
		const note = page.getByText("The next observations did not load.");

		/** Presses the button until the note shows: a press before the page has hydrated reaches nothing. */
		async function pressUntilNoted(says: string) {
			await expect(async () => {
				await more.click();
				await expect(note).toBeVisible({ timeout: 2_000 });
			}).toPass({ timeout: 30_000 });
			await expect(page.getByText(says)).toBeVisible();
			await expect(more).toBeEnabled();
			await expectNoErrorPage(page);
		}

		await test.step("an aborted POST", async () => {
			await page.goto(address);
			await ABORT_ACTIONS(page);
			await pressUntilNoted("Nothing more was loaded. Check the connection and try again.");
			await page.unroute("**/*");
		});
		await test.step("offline", async () => {
			await page.goto(address);
			await page.context().setOffline(true);
			await pressUntilNoted("Nothing more was loaded. Check the connection and try again.");
			await page.context().setOffline(false);
		});
		await test.step("a bogus action id", async () => {
			await page.goto(address);
			await FAILURES[3]!.arm(page);
			await pressUntilNoted("Nothing more was loaded. DECA Mark was updated while this page was open.");
			await page.unroute("**/*");
		});
		await test.step("cleared cookies", async () => {
			await page.goto(address);
			await expect(more).toBeVisible();
			await page.context().clearCookies();
			await pressUntilNoted("You were signed out.");
		});
	});
});
