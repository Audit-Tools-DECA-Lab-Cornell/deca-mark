import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { screenshotPath } from "../support/scan";

/**
 * The Contour gallery (`/dev/contour`, WEB-20): every section renders at 1440, 1024, 768 and 390 in Day
 * and Dusk, with no page error and no sideways scroll, and each is screenshotted for the comparison
 * against the Contour system pages (a manual check). The gallery shows every variant side by side, so the
 * honesty scan's one-primary and copy rules do not apply to it.
 */

const SECTIONS = [
	"tokens",
	"buttons",
	"links",
	"icon-buttons",
	"islands",
	"notes",
	"facts",
	"states",
	"coverage",
	"data",
	"identity",
	"inputs",
	"navigation",
	"table",
	"screen-states",
	"feedback",
	"maps"
] as const;

const WIDTHS = [
	{ width: 1440, height: 900 },
	{ width: 1024, height: 768 },
	{ width: 768, height: 1024 },
	{ width: 390, height: 844 }
] as const;

async function setTheme(page: Page, theme: "day" | "dusk") {
	await page.evaluate(choice => {
		try {
			localStorage.setItem("fm-theme", choice);
		} catch {
			// Storage refused: the attribute below still applies the theme for this load.
		}
		document.documentElement.setAttribute("data-theme", choice);
	}, theme);
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

test.describe("the Contour gallery", () => {
	// One pass covers every width, so the phone project would only repeat it.
	test.skip(({ isMobile }) => isMobile, "Widths are set inside the test.");

	test("renders every section in Day and Dusk at 1440, 1024, 768 and 390", async ({ page }, testInfo) => {
		test.setTimeout(240_000);
		const errors: string[] = [];
		page.on("pageerror", error => errors.push(error.message));
		await page.goto("/dev/contour");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

		for (const theme of ["day", "dusk"] as const) {
			await setTheme(page, theme);
			for (const size of WIDTHS) {
				await page.setViewportSize(size);
				for (const id of SECTIONS) {
					const section = page.locator(`#${id}`);
					await expect(section, `${id} at ${size.width} in ${theme}`).toBeVisible();
					expect((await section.innerText()).trim().length, `${id} has content`).toBeGreaterThan(0);
				}
				const sideways = await page.evaluate(() => {
					const root = document.scrollingElement ?? document.documentElement;
					return root.scrollWidth - root.clientWidth;
				});
				expect(sideways, `sideways scroll at ${size.width} in ${theme}`).toBeLessThanOrEqual(0);
				const path = screenshotPath(`gallery-${size.width}`, theme, "dev-contour");
				mkdirSync(dirname(path), { recursive: true });
				await page.screenshot({ path, fullPage: true, animations: "disabled" });
			}
		}
		expect(errors, "page errors").toEqual([]);
		await testInfo.attach("gallery-sections.json", {
			body: JSON.stringify({ sections: SECTIONS, widths: WIDTHS.map(size => size.width) }),
			contentType: "application/json"
		});
	});
});
