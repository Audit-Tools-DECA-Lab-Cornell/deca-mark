import { expect, type Page, test } from "@playwright/test";

import { authFile } from "./support/auth";
import { orgPath, projectPath } from "./support/manifest";
import { orgTabs, projectTabs } from "./support/ui";

/**
 * Plan WEB-61: the Library tab and its addresses (LIBRARY-UI.md section 3). Every address opens for the
 * roles it is for and shows the no-access state to the rest. Until the library can be read, each page
 * says it is not available yet and shows nothing that looks like data.
 */

const NOT_YET = "The library is not available yet.";
const ORG_ONLY = "Only organization owners and admins can open the organization library.";
const MANAGERS_ONLY = "Only project managers can add variables to the library.";
const SOME_ID = "3f0c1a52-6a55-4a37-9d57-1c5c7c2f9a10";

const ORG_PAGES = [
	"library",
	"library/variables/new",
	`library/variables/${SOME_ID}`,
	"library/templates",
	"library/templates/new",
	`library/templates/${SOME_ID}`
];
const PROJECT_PAGES = ["library", `library/variables/${SOME_ID}`, "library/templates"];

async function tabLabels(page: Page, kind: "project" | "organization"): Promise<string[]> {
	const nav = kind === "project" ? projectTabs(page) : orgTabs(page);
	return nav.getByRole("link").allInnerTexts();
}

test.describe("the owner", () => {
	test.use({ storageState: authFile("owner") });

	test("has Library as the fourth organization tab and opens every organization library page", async ({ page }) => {
		await page.goto(orgPath());
		expect(await tabLabels(page, "organization")).toEqual(["Projects", "Members", "Library", "Settings"]);

		for (const rest of ORG_PAGES) {
			const response = await page.goto(orgPath(rest));
			expect(response?.status(), rest).toBe(200);
			await expect(page.getByRole("main"), rest).toContainText(NOT_YET);
			await expect(orgTabs(page).getByRole("link", { name: "Library" }), rest).toHaveAttribute(
				"aria-current",
				"page"
			);
		}
	});

	test("may add a variable from inside a project", async ({ page }) => {
		await page.goto(projectPath("library/variables/new"));
		await expect(page.getByRole("main")).toContainText(NOT_YET);
	});
});

test.describe("a project manager who is not an owner or admin", () => {
	test.use({ storageState: authFile("manager") });

	test("has Library directly after Forms and opens every project library page", async ({ page }) => {
		await page.goto(projectPath());
		const labels = await tabLabels(page, "project");
		expect(labels).toHaveLength(9);
		expect(labels.indexOf("Library")).toBe(labels.indexOf("Forms") + 1);

		for (const rest of [...PROJECT_PAGES, "library/variables/new"]) {
			const response = await page.goto(projectPath(rest));
			expect(response?.status(), rest).toBe(200);
			await expect(page.getByRole("main"), rest).toContainText(NOT_YET);
			await expect(projectTabs(page).getByRole("link", { name: "Library" }), rest).toHaveAttribute(
				"aria-current",
				"page"
			);
		}
	});

	test("goes to the Library with g then l", async ({ page }) => {
		await page.goto(projectPath("forms"));
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await page.keyboard.press("g");
		await page.keyboard.press("l");
		await expect(page).toHaveURL(url => url.pathname === projectPath("library"));
	});

	test("has no organization Library tab, and its address says who can open it", async ({ page }) => {
		await page.goto(orgPath());
		expect(await tabLabels(page, "organization")).toEqual(["Projects"]);

		for (const rest of ORG_PAGES) {
			await page.goto(orgPath(rest));
			await expect(page.getByRole("main"), rest).toContainText(ORG_ONLY);
			await expect(page.getByRole("main"), rest).not.toContainText(NOT_YET);
		}
	});

	test("keeps the page from scrolling sideways at 768 px with nine tabs", async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto(projectPath("library"));
		await expect(projectTabs(page).getByRole("link", { name: "Library" })).toBeInViewport();
		const sideways = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(sideways).toBeLessThanOrEqual(0);
	});
});

test.describe("a viewer", () => {
	test.use({ storageState: authFile("viewer") });

	test("reads the project library but cannot add a variable", async ({ page }) => {
		for (const rest of PROJECT_PAGES) {
			await page.goto(projectPath(rest));
			await expect(page.getByRole("main"), rest).toContainText(NOT_YET);
		}
		expect(await tabLabels(page, "project")).toContain("Library");

		await page.goto(projectPath("library/variables/new"));
		await expect(page.getByRole("main")).toContainText(MANAGERS_ONLY);
		await expect(page.getByRole("main")).not.toContainText(NOT_YET);
	});
});

test.describe("an observer", () => {
	test.use({ storageState: authFile("observer") });

	test("is sent to the collect page, not into the library", async ({ page }) => {
		await page.goto(projectPath("library"));
		await expect(page).toHaveURL(url => url.pathname === orgPath("collect"));
		await expect(page.getByRole("main")).not.toContainText(NOT_YET);
	});
});
