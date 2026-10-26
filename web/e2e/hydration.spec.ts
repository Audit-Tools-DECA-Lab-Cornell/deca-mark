import { expect, type Locator, type Page, test } from "@playwright/test";

import { api, getProject } from "./support/api";
import { authFile, PASSWORD } from "./support/auth";
import { manifest, projectPath } from "./support/manifest";

/**
 * Plan WEB-46 (audit C07): a text field is inert until the page is interactive.
 *
 * React 19.3 overwrites a controlled <textarea> when it hydrates, and an <input> keeps typed text on screen
 * but not in state, so text typed in the window between "the server's HTML is visible" and "React is
 * listening" is reverted, merged with the old text or never saved. The window is 0.1 to 0.2 s in the lab
 * and seconds on a slow phone. The fix is a gate: the four Contour text primitives are read-only, and
 * form submit buttons are disabled, until the page has hydrated.
 *
 * The window is made deterministic here by holding every script under /_next/static until the test
 * releases them: the page shows the server's HTML and nothing runs. Typing is attempted in that state and
 * must go nowhere; after the release a fill must save exactly the new text.
 */

/** Runs of the settings save, per project (desktop-1440 and phone-390). */
const RUNS = 20;

/** Holds every Next script until `release()`. Pending routes are dropped with the page. */
async function holdScripts(page: Page): Promise<() => void> {
	let release: () => void = () => undefined;
	const gate = new Promise<void>(resolve => {
		release = resolve;
	});
	await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, async route => {
		await gate;
		await route.continue().catch(() => undefined);
	});
	return release;
}

/** Types at the keyboard into a field the way a person does before the page is ready. */
async function typeEarly(page: Page, field: Locator, text: string) {
	await field.focus();
	await page.keyboard.press("ControlOrMeta+A");
	await page.keyboard.type(text);
}

/** The summed score of every layout shift the page has had so far (buffered), after a short settle. */
async function layoutShift(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			new Promise<number>(resolve => {
				let total = 0;
				const observer = new PerformanceObserver(list => {
					for (const entry of list.getEntries()) {
						const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
						if (!shift.hadRecentInput) total += shift.value;
					}
				});
				observer.observe({ type: "layout-shift", buffered: true });
				setTimeout(() => {
					observer.disconnect();
					resolve(total);
				}, 800);
			})
	);
}

const setDescription = (description: string) =>
	api("manager", "PATCH", `/v1/projects/${manifest().projectId}`, { description });

test.describe("project settings before and after the page is interactive", () => {
	test.use({ storageState: authFile("manager") });
	test.setTimeout(300_000);

	let original: string | null = null;
	test.beforeAll(async () => {
		original = (await getProject()).description;
	});
	test.afterAll(async () => {
		await setDescription(original ?? "");
	});

	test(`typing before release goes nowhere and a fill after release saves exactly the new text (${RUNS} runs)`, async ({
		context
	}) => {
		for (let run = 0; run < RUNS; run++) {
			const oldText = `Hydration old text ${run}`;
			const newText = `Hydration new text ${run}`;
			await setDescription(oldText);

			const page = await context.newPage();
			const release = await holdScripts(page);
			await page.goto(projectPath("settings"), { waitUntil: "commit" });

			const field = page.getByLabel(/^description/i).first();
			const save = page.getByRole("button", { name: /^save/i }).first();
			await expect(field).toBeVisible();
			await expect(field).toHaveValue(oldText);

			// The page is only server HTML now: the field takes no text and Save does nothing.
			await expect(field).toHaveJSProperty("readOnly", true);
			await expect(save).toBeDisabled();
			await typeEarly(page, field, "EARLY TEXT");
			await expect(field).toHaveValue(oldText);

			release();
			await expect(field).toBeEditable();
			await expect(save).toBeEnabled();
			await expect(field).toHaveValue(oldText);

			await field.fill(newText);
			await save.click();
			await expect(page.getByText("Project settings saved.", { exact: true })).toBeVisible();
			await expect.poll(async () => (await getProject()).description).toBe(newText);
			await page.close();
		}
	});

	test("the settings page does not shift when it becomes interactive", async ({ page }) => {
		await page.goto(projectPath("settings"));
		await expect(page.getByLabel(/^description/i).first()).toBeEditable();
		expect(await layoutShift(page)).toBe(0);
	});
});

test.describe("sign-in before and after the page is interactive", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("sign-in refuses typing until the page is ready, then submits what is shown", async ({ page }) => {
		const { email } = manifest().accounts.manager;
		const release = await holdScripts(page);
		await page.goto("/sign-in", { waitUntil: "commit" });

		const emailField = page.getByLabel("Email address");
		const passwordField = page.getByLabel("Password", { exact: true });
		const submit = page.getByRole("button", { name: "Sign in", exact: true });
		await expect(emailField).toBeVisible();
		await expect(emailField).toHaveJSProperty("readOnly", true);
		await expect(passwordField).toHaveJSProperty("readOnly", true);
		await expect(submit).toBeDisabled();

		await typeEarly(page, emailField, "typed-too-early");
		await typeEarly(page, passwordField, "typed-too-early");
		await expect(emailField).toHaveValue("");
		await expect(passwordField).toHaveValue("");

		release();
		await expect(emailField).toBeEditable();
		await expect(submit).toBeEnabled();
		// Nothing typed early is shown, so what the page holds is what it shows.
		await expect(emailField).toHaveValue("");
		await expect(passwordField).toHaveValue("");

		await emailField.fill(email);
		await passwordField.fill(PASSWORD);
		await submit.click();
		await expect(page).not.toHaveURL(/\/sign-in(\?|$)/, { timeout: 30_000 });
	});

	test("the email field is focused once the page is ready and the page does not shift", async ({ page }) => {
		await page.goto("/sign-in");
		const emailField = page.getByLabel("Email address");
		await expect(emailField).toBeEditable();
		await expect(emailField).toBeFocused();
		expect(await layoutShift(page)).toBe(0);
	});
});
