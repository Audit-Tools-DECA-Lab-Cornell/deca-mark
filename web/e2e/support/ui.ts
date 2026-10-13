import { readFileSync } from "node:fs";

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Small, tolerant ways to read the screens by what a person sees: accessible names, visible words and
 * counts. The screens are free to change their layout as long as the words and roles stay.
 */

/** "8 observations" or a stat that reads "Observations 8", in either order, case-insensitive. */
export function countPattern(count: number, noun: string): RegExp {
	const word = count === 1 ? noun : `${noun}s`;
	return new RegExp(`\\b${count}\\s+${word}\\b|\\b${word}\\s+${count}\\b`, "i");
}

/** The project tabs (Overview · Data · Sites · Forms · Team · QGIS · Reports · Settings). */
export function projectTabs(page: Page): Locator {
	return page.getByRole("navigation", { name: "Project" });
}

/** The organization tabs (Projects · Members · Settings). */
export function orgTabs(page: Page): Locator {
	return page.getByRole("navigation", { name: "Organization" });
}

/** A tab link by its label; a count badge may follow the label. */
export function tab(nav: Locator, label: string): Locator {
	return nav.getByRole("link", { name: new RegExp(`^${label}\\b`) });
}

/** The visible text of an element plus the values of its inputs (a link or a code shown in a read-only field). */
export async function textWithValues(locator: Locator): Promise<string> {
	return locator.evaluate(element => {
		const values = Array.from(element.querySelectorAll("input, textarea")).map(
			input => (input as HTMLInputElement).value
		);
		return `${(element as HTMLElement).innerText}\n${values.join("\n")}`;
	});
}

/**
 * The rows of observation records: table rows on wide screens, row cards (list items) on narrow ones.
 * A record row carries its `OBS-` label.
 */
export async function recordRows(scope: Locator): Promise<Locator> {
	const rows = scope.getByRole("row").filter({ hasText: /OBS-[0-9A-F]{6}/ });
	const cards = scope.getByRole("listitem").filter({ hasText: /OBS-[0-9A-F]{6}/ });
	// The list streams in after the page loads: wait for whichever form this width shows.
	await expect(rows.or(cards).first()).toBeVisible();
	return (await rows.count()) > 0 ? rows : cards;
}

/** Picks an option in a native select by the words of the option, not its value. */
export async function chooseOption(select: Locator, label: RegExp): Promise<void> {
	const options = await select
		.locator("option")
		.evaluateAll(list =>
			list.map(option => ({ value: (option as HTMLOptionElement).value, text: option.textContent ?? "" }))
		);
	const match = options.find(option => label.test(option.text));
	if (!match) throw new Error(`No option matching ${label} in ${JSON.stringify(options.map(option => option.text))}`);
	await select.selectOption(match.value);
}

/**
 * Chooses a value in a filter that may be a native select, a segmented control (radios) or a set of
 * toggle buttons, named by `field`.
 */
export async function chooseFilter(scope: Locator | Page, field: RegExp, value: RegExp): Promise<void> {
	const select = scope.getByRole("combobox", { name: field });
	if ((await select.count()) > 0) return chooseOption(select.first(), value);
	const group = scope.getByRole("radiogroup", { name: field });
	if ((await group.count()) > 0) return group.first().getByRole("radio", { name: value }).check();
	await scope.getByRole("button", { name: value }).first().click();
}

/** Clicks `trigger` and returns the text of the file the browser downloads, with its suggested name. */
export async function downloadText(page: Page, trigger: () => Promise<void>): Promise<{ name: string; text: string }> {
	const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), trigger()]);
	const path = await download.path();
	expect(path, "the download finished").toBeTruthy();
	return { name: download.suggestedFilename(), text: readFileSync(path, "utf8") };
}

/** Rows of a simple CSV (no quoted line breaks), header first. */
export function csvLines(text: string): string[] {
	return text
		.replace(/^﻿/, "")
		.split(/\r?\n/)
		.filter(line => line.trim().length > 0);
}
