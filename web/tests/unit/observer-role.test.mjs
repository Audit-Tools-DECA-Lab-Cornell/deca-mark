import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

import { load } from "./support.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const src = new URL("../../src/", import.meta.url);
const components = ["AnswerTile", "Button", "Icon", "ModeStrip", "Note", "TextInput"];
registerHooks({
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : "";
		const name = components.find(name => relative === `components/contour/${name}.tsx`);
		if (name)
			return {
				format: "module",
				shortCircuit: true,
				source: `import React from "react"; export const ${name}=p=>React.createElement("${name}",p,p.children);`
			};
		if (relative === "components/map/SitePlan.tsx")
			return {
				format: "module",
				shortCircuit: true,
				source: 'import React from "react"; export const SitePlan=p=>React.createElement("SitePlan",p,p.children);'
			};
		if (relative === "lib/map-palette.ts")
			return {
				format: "module",
				shortCircuit: true,
				source: 'export const MAP_PALETTES={day:{observation:{fill:"#000000"}}};'
			};
		if (relative === "lib/plan.ts")
			return {
				format: "module",
				shortCircuit: true,
				source: "export const zoneBounds=()=>({minX:0,minY:0,maxX:1,maxY:1});"
			};
		if (url.endsWith(".tsx"))
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						jsx: ts.JsxEmit.ReactJSX,
						target: ts.ScriptTarget.ESNext
					}
				}).outputText
			};
		return next(url, context);
	}
});

const starter = await load("features/forms/starter.ts");
const operations = await load("features/forms/operations.ts");
const { formatPatch } = await load("features/forms/QuestionSettings.tsx");
const { loadDefinition } = await load("lib/forms/index.ts");
const { CollectorPreview } = await load("features/forms/CollectorPreview.tsx");
const readTemplate = name =>
	JSON.parse(readFileSync(new URL(`../../../contracts/forms/${name}.json`, import.meta.url), "utf8"));
const text = node =>
	typeof node === "string"
		? node
		: Array.isArray(node)
			? node.map(text).join(" ")
			: (node?.children ?? []).map(text).join(" ");

test("both shipped templates retain observer role and renamed ID-based columns", () => {
	for (const file of ["janet-test-v1", "janet-inventory-v1"]) {
		const template = readTemplate(file);
		const started = starter.startingDefinition(template, "study-form", "Study form");
		const observer = started.questions.find(question => question.id === "observer_initials");
		assert.equal(observer?.role, "observer", file);

		const renamed = operations.renameQuestion(started, "observer_initials", "collector_name");
		assert.equal(renamed.ok, true, file);
		if (!renamed.ok) continue;
		const question = renamed.raw.questions.find(entry => entry.id === "collector_name");
		assert.equal(question?.role, "observer", file);
		assert.equal(question?.exportColumn, "collector_name", file);
		assert.equal(loadDefinition(renamed.raw).problems.length, 0, file);
	}
});

test("changing an observer text question to another format clears its role", () => {
	const patch = formatPatch(
		{
			id: "collector_name",
			code: "observer_initials",
			exportColumn: "collector_name",
			label: "Observer initials",
			kind: "text",
			role: "observer",
			act: "Record",
			source: "Test"
		},
		"one"
	);
	assert.equal(patch.role, undefined);
});

test("preview carries a manually entered observer value into the next observation after rename", async () => {
	const parsed = loadDefinition({
		version: "study-form-v1",
		title: "Study form",
		summary: "Observer identity test",
		source: "Test",
		status: "draft",
		inclusion: "Every question is asked.",
		questions: [
			{
				id: "collector_name",
				code: "observer_initials",
				exportColumn: "collector_name",
				act: "Record",
				label: "Observer initials",
				kind: "text",
				role: "observer",
				required: true,
				source: "Test"
			}
		]
	});
	assert.deepEqual(parsed.problems, []);
	assert.ok(parsed.form);

	let tree;
	await act(async () => {
		tree = create(
			React.createElement(CollectorPreview, {
				form: parsed.form,
				versionLabel: "study-form-v1 draft",
				device: "phone",
				plan: null,
				zoneId: null,
				siteName: "Test site",
				zoneName: "Test zone",
				round: "Record",
				mapVersion: null
			})
		);
	});
	const button = label => tree.root.findAllByType("Button").find(node => text(node) === label);
	await act(async () => tree.root.findByType("textarea").props.onChange({ target: { value: "AB" } }));
	assert.equal(tree.root.findByType("textarea").props.value, "AB");
	await act(async () => button("Review").props.onClick());
	await act(async () => button("Finish").props.onClick());
	assert.match(text(tree.root), /collector_name AB/);
	await act(async () => button("Start the next observation").props.onClick());
	assert.equal(tree.root.findByType("textarea").props.value, "AB");
	await act(async () => tree.unmount());
});

test("ID-named observer columns are not promoted to semantic roles", async () => {
	const { questionIdColumns } = await load("features/forms/operations.ts");
	const raw = {
		version: "id-columns-v1",
		title: "Test",
		summary: "Test",
		source: "Test",
		status: "draft",
		inclusion: "Test",
		columnNaming: "questionId",
		questions: [
			{
				id: "observer",
				code: "unrelated",
				exportColumn: "observer",
				kind: "text",
				label: "Unrelated",
				source: "Test",
				act: "Record"
			},
			{
				id: "recorded_by",
				code: "operator",
				exportColumn: "recorded_by",
				kind: "text",
				role: "observer",
				label: "Observer",
				source: "Test",
				act: "Record"
			}
		]
	};
	const normalized = questionIdColumns(raw);
	assert.equal(normalized.questions[0].role, undefined);
	assert.equal(normalized.questions[1].role, "observer");
	assert.deepEqual(loadDefinition(normalized).problems, []);
});
