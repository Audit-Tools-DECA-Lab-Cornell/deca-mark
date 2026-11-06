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
registerHooks({
	resolve(specifier, context, next) {
		return next(specifier === "next/link" ? "next/link.js" : specifier, context);
	},
	load(url, context, next) {
		if (url.endsWith("/contracts/map-palettes.json"))
			return {
				format: "module",
				shortCircuit: true,
				source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`
			};
		if (url.endsWith("/node_modules/next/link.js"))
			return {
				format: "module",
				shortCircuit: true,
				source: 'import React from "react"; export default p=>React.createElement("a",p,p.children);'
			};
		if (url.startsWith(src.href) && url.endsWith(".tsx"))
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

const { CollectorPreview } = await load("features/forms/CollectorPreview.tsx");
const { PreviewNumberInput } = await load("features/forms/PreviewNumberInput.tsx");
const { previewAnswers } = await load("features/forms/preview-answers.ts");
const { parseFormDefinition, reviewProblems } = await load("lib/forms/index.ts");
const form = questions =>
	parseFormDefinition({
		version: "number-draft-v1",
		title: "Numeric draft test",
		summary: "Test",
		source: "Test",
		status: "draft",
		inclusion: "Test",
		questions: questions.map(question => ({
			code: question.id,
			exportColumn: question.id,
			act: "Record",
			label: question.id,
			source: "Test",
			...question
		}))
	});
const text = node =>
	(typeof node === "string"
		? node
		: Array.isArray(node)
			? node.map(text).join(" ")
			: (node?.children ?? []).map(text).join(" ")
	)
		.replace(/\s+/g, " ")
		.trim();

async function mount(t, definition) {
	let tree;
	await act(async () => {
		tree = create(
			React.createElement(CollectorPreview, {
				form: definition,
				versionLabel: "number-draft-v1 draft",
				device: "phone",
				plan: null,
				zoneId: null,
				siteName: "Test site",
				zoneName: null,
				round: "Record",
				mapVersion: null,
				captureInstant: "2026-10-25T12:00:00.000Z"
			})
		);
	});
	t.after(async () => act(async () => tree.unmount()));
	return {
		tree,
		input: () => tree.root.findByType("input"),
		write: raw => act(async () => tree.root.findByType("input").props.onChange({ target: { value: raw } })),
		click: label =>
			act(async () => {
				const button = tree.root.findAllByType("button").find(node => text(node).trim() === label);
				assert.ok(button, `Button ${label} is present`);
				button.props.onClick();
			})
	};
}

for (const [partial, completed, expected] of [
	["-", "-2.5", -2.5],
	["1e", "1e2", 100]
]) {
	test(`preview retains ${partial} across question navigation and refuses it at finish`, async t => {
		// Given a numeric question followed by another question.
		const preview = await mount(
			t,
			form([
				{ id: "count", kind: "number", numberMode: "decimal", required: true },
				{ id: "notes", kind: "text" }
			])
		);
		// When an incomplete number is entered and the question is reopened.
		await preview.write(partial);
		await preview.click("Next");
		await preview.click("Back");
		// Then the original draft text survives, and finish refuses it.
		assert.equal(preview.input().props.value, partial);
		assert.equal(preview.input().props["aria-invalid"], true);
		await preview.click("Next");
		await preview.click("Review");
		await preview.click("Finish");
		assert.match(text(preview.tree.root), /1 answer needs attention/);
		assert.doesNotMatch(text(preview.tree.root), /Nothing was stored/);
		await preview.click(`count ${partial}`);
		assert.equal(preview.input().props.value, partial);
		await preview.write(completed);
		await preview.click("Next");
		await preview.click("Review");
		await preview.click("Finish");
		assert.equal(text(preview.tree.root.findAllByType("dd")[0]), String(expected));
		await preview.click("Start the next observation");
		assert.equal(preview.input().props.value, "");
	});
}

test("numeric control emits draft strings while preserving valid transitional formatting", async t => {
	// Given the control with its parent answer updated on every keystroke.
	const emitted = [];
	function ControlledInput() {
		const [value, setValue] = React.useState();
		return React.createElement(PreviewNumberInput, {
			value,
			decimal: true,
			label: "count",
			onChange: next => {
				emitted.push(next);
				setValue(next);
			}
		});
	}
	let tree;
	await act(async () => {
		tree = create(React.createElement(ControlledInput));
	});
	t.after(async () => act(async () => tree.unmount()));
	// When draft text is completed to a decimal and then cleared.
	for (const raw of ["-", "1e", "1", "1.", "1.00", "1.5", " "]) {
		await act(async () => tree.root.findByType("input").props.onChange({ target: { value: raw } }));
		assert.equal(tree.root.findByType("input").props.value, raw);
	}
	// Then drafts are strings, complete answers are numbers, and blank clears the answer.
	assert.deepEqual(emitted, ["-", "1e", 1, 1, 1, 1.5, undefined]);
});

test("preview pruning retains numeric drafts and their dependents but removes hidden answers", () => {
	// Given a visible numeric draft with an answered-condition dependent.
	const definition = form([
		{ id: "gate", kind: "text" },
		{ id: "count", kind: "number", dependsOn: { kind: "answered", question: "gate" } },
		{ id: "detail", kind: "text", dependsOn: { kind: "answered", question: "count" } }
	]);
	const capture = { instant: "2026-10-25T12:00:00.000Z" };
	const draft = { gate: "show", count: "-", detail: "keep" };
	// When preview answers are pruned with the gate shown or cleared.
	const retained = previewAnswers(definition, draft, capture);
	const hidden = previewAnswers(definition, { count: "-", detail: "keep" }, capture);
	// Then drafts and dependents survive together, review is strict, and hidden answers clear.
	assert.deepEqual(retained, draft);
	assert.equal(reviewProblems(definition, retained)[0].reason, "type");
	assert.deepEqual(hidden, {});
});

test("preview keeps dependent text while a numeric parent is incomplete and clears it when blank", async t => {
	// Given a dependent answer recorded after an incomplete number.
	const preview = await mount(
		t,
		form([
			{ id: "count", kind: "number", numberMode: "decimal" },
			{ id: "detail", kind: "text", dependsOn: { kind: "answered", question: "count" } }
		])
	);
	await preview.write("-");
	await preview.click("Next");
	await act(async () => preview.tree.root.findByType("textarea").props.onChange({ target: { value: "keep" } }));
	await preview.click("Back");
	// When the parent is changed to another partial number and reopened.
	await preview.write("1e");
	await preview.click("Next");
	// Then the dependent remains until blanking its parent hides and prunes it.
	assert.equal(preview.tree.root.findByType("textarea").props.value, "keep");
	await preview.click("Back");
	await preview.write("");
	assert.equal(preview.input().props.value, "");
	await preview.click("Review");
	assert.doesNotMatch(text(preview.tree.root), /detail/);
	await preview.click("count Not answered");
	await preview.write("2");
	await preview.click("Next");
	assert.equal(preview.tree.root.findByType("textarea").props.value, "");
});
