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
const primitives = ["Button", "Field", "Note", "Select", "TextInput"];
registerHooks({
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : "";
		const name = primitives.find(name => relative === `components/contour/${name}.tsx`);
		if (name)
			return {
				format: "module",
				shortCircuit: true,
				source: `import React from "react"; export const ${name}=p=>React.createElement("${name}",p,p.children);`
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

const { DynamicOptionsEditor } = await load("features/forms/DynamicOptionsEditor.tsx");
const { loadDefinition } = await load("lib/forms/index.ts");
const { blankDefinition } = await load("features/forms/starter.ts");
const { questionIdColumns } = await load("features/forms/operations.ts");
const option = (code, label = code) => ({ code, label });
const parent = (overrides = {}) => ({
	id: "parent",
	code: "parent",
	exportColumn: "parent",
	label: "Parent",
	kind: "one",
	act: "Record",
	source: "Added in DECA Mark — no workbook row",
	options: [],
	...overrides
});
const child = () => ({
	id: "child",
	code: "child",
	exportColumn: "child",
	label: "Child",
	kind: "one",
	act: "Record",
	source: "Added in DECA Mark — no workbook row",
	options: []
});
const rendered = async (question, earlier, onChange = () => {}) => {
	let tree;
	await act(async () => {
		tree = create(React.createElement(DynamicOptionsEditor, { question, earlier, readOnly: false, onChange }));
	});
	return { tree, close: () => act(async () => tree.unmount()) };
};
const control = (tree, label) =>
	tree.root
		.findAllByType("Field")
		.find(node => node.props.label === label)
		.findByType("Select");
const text = node =>
	typeof node === "string"
		? node
		: Array.isArray(node)
			? node.map(text).join(" ")
			: (node?.children ?? []).map(text).join(" ");

test("dynamic-only parent is not offered and saved invalid state remains visible", async () => {
	const onlyDynamic = parent({
		dynamicFrom: {
			question: "grandparent",
			sets: { nested: { code: "nested", label: "Nested", exportColumn: "nested", options: [option("a")] } }
		}
	});
	const saved = {
		...child(),
		dynamicFrom: {
			question: "parent",
			sets: {
				nested: { code: "child_nested", label: "Nested", exportColumn: "child_nested", options: [option("a")] }
			}
		}
	};
	const view = await rendered(saved, [onlyDynamic]);
	assert.equal(control(view.tree, "Controlling question").props.value, "parent");
	assert.match(
		view.tree.root
			.findAllByType("Note")
			.map(node => node.props.children)
			.join(" "),
		/has no fixed answer options/
	);
	assert.equal(
		control(view.tree, "Options come from")
			.findAllByType("option")
			.some(node => node.props.value === "dynamic" && node.props.disabled),
		true
	);
	await view.close();
});

test("mixed parent creates child sets only for fixed answers", async () => {
	const mixed = parent({
		options: [option("yes", "Yes"), option("no", "No")],
		dynamicFrom: {
			question: "grandparent",
			sets: { nested: { code: "nested", label: "Nested", exportColumn: "nested", options: [option("a")] } }
		}
	});
	const saved = {
		...child(),
		dynamicFrom: {
			question: "parent",
			sets: { yes: { code: "child_yes", label: "Yes", exportColumn: "child_yes", options: [option("a")] } }
		}
	};
	const view = await rendered(saved, [mixed]);
	const parentSelect = control(view.tree, "Controlling question");
	assert.deepEqual(
		parentSelect.findAllByType("option").map(node => node.props.value),
		["parent"]
	);
	assert.doesNotMatch(text(view.tree.toJSON()), /No option list for Nested/);
	await view.close();

	const updates = [];
	const fixedView = await rendered(child(), [mixed], patch => updates.push(patch));
	await act(async () =>
		control(fixedView.tree, "Options come from").props.onChange({ target: { value: "dynamic" } })
	);
	assert.deepEqual(Object.keys(updates[0].dynamicFrom.sets), ["yes", "no"]);
	assert.equal(updates[0].dynamicFrom.question, "parent");
	const definition = blankDefinition("accept", "Acceptance");
	const grandparent = parent({
		id: "grandparent",
		code: "grandparent",
		exportColumn: "grandparent",
		options: [option("nested", "Nested")]
	});
	const completeChild = {
		...child(),
		dynamicFrom: {
			...updates[0].dynamicFrom,
			sets: Object.fromEntries(
				Object.entries(updates[0].dynamicFrom.sets).map(([code, set]) => [
					code,
					{ ...set, options: [option("answer")] }
				])
			)
		}
	};
	const loaded = loadDefinition({
		...questionIdColumns({ ...definition, questions: [grandparent, mixed, completeChild] })
	});
	assert.deepEqual(loaded.problems, []);
	await fixedView.close();
});
