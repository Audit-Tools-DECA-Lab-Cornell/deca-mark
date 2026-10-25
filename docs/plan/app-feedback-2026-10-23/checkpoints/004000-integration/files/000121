import { expect, test } from "@playwright/test";

import type { RawDefinition } from "../src/features/forms/raw";
import { blankDefinition } from "../src/features/forms/starter";
import { api } from "./support/api";
import { authFile } from "./support/auth";
import { manifest, projectPath } from "./support/manifest";

test.use({ storageState: authFile("manager") });

test("editor reorders, renames a conditional parent, and saves bounds across reload without narrow overflow", async ({
	page
}) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	const code = `editor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	const definition: RawDefinition = {
		...blankDefinition(code, "Editor interaction acceptance"),
		questions: [
			{
				id: "parent",
				code: "parent",
				exportColumn: "parent",
				label: "Parent answer",
				act: "Record",
				kind: "one",
				source: "Added in DECA Mark — no workbook row",
				options: [
					{ code: "yes", label: "Yes" },
					{ code: "no", label: "No" }
				]
			},
			{
				id: "child",
				code: "child",
				exportColumn: "child",
				label: "Conditional count",
				act: "Record",
				kind: "number",
				source: "Added in DECA Mark — no workbook row"
			},
			{
				id: "free",
				code: "free",
				exportColumn: "free",
				label: "Independent notes",
				act: "Record",
				kind: "text",
				maxLength: 200,
				source: "Added in DECA Mark — no workbook row"
			}
		]
	};
	await api("manager", "POST", `/v1/projects/${manifest().projectId}/forms`, {
		code,
		name: definition.title,
		schema_version: 2,
		definition
	});
	const version = `${code}-v1`;
	const read = () =>
		api<{ definition: RawDefinition }>(
			"manager",
			"GET",
			`/v1/projects/${manifest().projectId}/form-versions/${version}`
		);
	await page.goto(projectPath(`forms/versions/${version}`));
	const list = page.getByRole("list", { name: "Questions in this version" });
	const rows = list.locator(":scope > li");
	const select = (label: string) => list.locator("button[data-question-select]").filter({ hasText: label });

	// Real pointer capture drag, then a keyboard-activated move button.
	const handle = list.getByRole("button", { name: "Drag Independent notes to reorder", exact: true });
	await handle.scrollIntoViewIfNeeded();
	const from = await handle.boundingBox();
	const to = await rows.first().boundingBox();
	expect(from).not.toBeNull();
	expect(to).not.toBeNull();
	if (!from || !to) throw new Error("Question drag geometry is unavailable.");
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(to.x + 25, to.y + 10, { steps: 12 });
	await page.mouse.up();
	await expect(rows.first()).toContainText("Independent notes");
	const move = list.getByRole("button", { name: "Move Independent notes down", exact: true });
	await move.focus();
	await page.keyboard.press("Enter");
	await expect(rows.nth(1)).toContainText("Independent notes");

	await select("Conditional count").click();
	await page.getByLabel("Show this question", { exact: true }).selectOption("conditions");
	await page.getByLabel("Condition", { exact: true }).selectOption("equals");
	await page.getByLabel("Answer", { exact: true }).selectOption("yes");
	await page.getByLabel("Minimum", { exact: true }).fill("9");
	await page.getByLabel("Maximum", { exact: true }).fill("3");
	await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
	await page.getByLabel("Minimum", { exact: true }).fill("-2");

	await select("Parent answer").click();
	await page.getByRole("button", { name: "Edit ID", exact: true }).click();
	await page.getByLabel("Question ID", { exact: true }).fill("renamed_parent");
	await page.getByRole("button", { name: "Apply ID", exact: true }).click();
	await expect(page.getByLabel("Question ID", { exact: true })).toHaveValue("renamed_parent");
	await select("Conditional count").click();
	await list.getByRole("button", { name: "Move Conditional count up", exact: true }).click();
	await expect(rows.nth(1)).toContainText("Conditional count");
	await list.getByRole("button", { name: "Move Conditional count up", exact: true }).click();
	await expect(page.getByRole("status").filter({ hasText: "because it uses that answer" })).toBeVisible();
	await expect(rows.first()).toContainText("Parent answer");

	await page.getByRole("button", { name: "Save draft", exact: true }).click();
	await expect
		.poll(async () => (await read()).definition.questions.map(question => question.id))
		.toEqual(["renamed_parent", "child", "free"]);
	const saved = (await read()).definition;
	expect(saved.questions[1].min).toBe(-2);
	expect(saved.questions[1].max).toBe(3);
	expect(saved.questions[1].dependsOn).toEqual({
		kind: "all",
		of: [{ kind: "equals", question: "renamed_parent", option: "yes" }]
	});
	await page.reload();
	await select("Conditional count").click();
	await expect(page.getByLabel("Minimum", { exact: true })).toHaveValue("-2");
	await expect(page.getByLabel("Maximum", { exact: true })).toHaveValue("3");
	await expect(page.getByLabel("Earlier question", { exact: true })).toHaveValue("renamed_parent");
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByLabel("Question Text", { exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
