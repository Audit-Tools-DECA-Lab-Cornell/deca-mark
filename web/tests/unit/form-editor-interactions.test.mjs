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
const primitives = [
	"Button",
	"Checkbox",
	"Dialog",
	"DialogClose",
	"Field",
	"Icon",
	"IconButton",
	"Note",
	"Select",
	"StateBadge",
	"TextInput"
];
// Keep editor state, controls and operations real; replace only visual primitives.
registerHooks({
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : "";
		const name = primitives.find(name => relative === `components/contour/${name}.tsx`);
		if (name)
			return {
				format: "module",
				shortCircuit: true,
				source: `import React from "react"; export const ${name}=p=>React.createElement("${name}",p,p.children); ${name === "Dialog" ? 'export const DialogClose=p=>React.createElement("DialogClose",p,p.children);' : ""}`
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
const { AddQuestionDialog } = await load("features/forms/AddQuestionDialog.tsx");
const { QuestionSettings, saveProblem } = await load("features/forms/QuestionSettings.tsx");
const { QuestionList } = await load("features/forms/QuestionList.tsx");
const { blankDefinition } = await load("features/forms/starter.ts");
const { renameQuestion, moveQuestion } = await load("features/forms/operations.ts");
const text = node => (typeof node === "string" ? node : (node?.children ?? []).map(text).join(" "));
const button = (tree, label) => tree.root.findAllByType("Button").find(node => text(node) === label);
const control = (tree, label, type = "Select", index = 0) =>
	tree.root
		.findAllByType("Field")
		.filter(node => node.props.label === label)
		[index].findByType(type);
const change = (node, value) => act(async () => node.props.onChange({ target: { value } }));
const question = (id, kind = "one") => ({
	id,
	code: id,
	exportColumn: id,
	label: id,
	kind,
	act: "Record",
	source: "Added in DECA Mark — no workbook row",
	...(kind === "one" || kind === "many"
		? {
				options: [
					{ code: "yes", label: "Yes" },
					{ code: "no", label: "No" }
				]
			}
		: {})
});
async function settings(initial, earlier = []) {
	let current = initial;
	let tree;
	const props = () => ({
		question: current,
		questions: [...earlier, current],
		readOnly: false,
		problems: {},
		onRename: () => null,
		onChange: patch => {
			current = { ...current, ...patch };
			tree.update(React.createElement(QuestionSettings, props()));
		}
	});
	await act(async () => {
		tree = create(React.createElement(QuestionSettings, props()));
	});
	return { tree, current: () => current, close: () => act(async () => tree.unmount()) };
}

test("each add and reopen after cancel starts at single response", async () => {
	const added = [];
	let tree;
	await act(async () => {
		tree = create(React.createElement(AddQuestionDialog, { onAdd: (label, kind) => added.push({ label, kind }) }));
	});
	const open = value => act(async () => tree.root.findByType("Dialog").props.onOpenChange(value));
	await open(true);
	await change(control(tree, "Question Text", "TextInput"), " First ");
	await change(control(tree, "Answer format"), "number");
	await act(async () => tree.root.findByType("form").props.onSubmit({ preventDefault() {} }));
	assert.deepEqual(added, [{ label: "First", kind: "number" }]);
	await open(true);
	assert.equal(control(tree, "Answer format").props.value, "one");
	assert.equal(control(tree, "Question Text", "TextInput").props.value, "");
	await change(control(tree, "Answer format"), "many");
	await open(false);
	await open(true);
	assert.equal(control(tree, "Answer format").props.value, "one");
	await act(async () => tree.unmount());
});

test("ID edits buffer blank and duplicate values, cancel safely, and atomically rename references", async () => {
	let raw = {
		...blankDefinition("accept", "Acceptance"),
		questions: [
			question("parent"),
			{
				...question("child"),
				dependsOn: { kind: "all", of: [{ kind: "equals", question: "parent", option: "yes" }] },
				dynamicFrom: {
					question: "parent",
					sets: {
						yes: {
							code: "child_yes",
							label: "Yes",
							exportColumn: "child",
							options: [{ code: "a", label: "A" }]
						}
					}
				}
			}
		]
	};
	const before = structuredClone(raw);
	let tree;
	const props = () => ({
		question: raw.questions[0],
		questions: raw.questions,
		readOnly: false,
		problems: {},
		onChange() {},
		onRename: id => {
			const result = renameQuestion(raw, "parent", id);
			if (!result.ok) return result.problem;
			raw = result.raw;
			tree.update(React.createElement(QuestionSettings, props()));
			return null;
		}
	});
	await act(async () => {
		tree = create(React.createElement(QuestionSettings, props()));
	});
	await act(async () => button(tree, "Edit ID").props.onClick());
	for (const invalid of ["", "child"]) {
		await change(control(tree, "Question ID", "TextInput"), invalid);
		assert.deepEqual(raw, before);
		await act(async () => button(tree, "Apply ID").props.onClick());
		assert.ok(tree.root.findAllByType("Field").find(node => node.props.label === "Question ID").props.error);
		assert.deepEqual(raw, before);
	}
	await act(async () => button(tree, "Cancel").props.onClick());
	assert.equal(control(tree, "Question ID", "TextInput").props.value, "parent");
	await act(async () => button(tree, "Edit ID").props.onClick());
	await change(control(tree, "Question ID", "TextInput"), " renamed ");
	await act(async () =>
		control(tree, "Question ID", "TextInput").props.onKeyDown({ key: "Enter", preventDefault() {} })
	);
	assert.equal(raw.questions[0].id, "renamed");
	assert.equal(raw.questions[0].exportColumn, "renamed");
	assert.equal(raw.questions[1].dependsOn.of[0].question, "renamed");
	assert.equal(raw.questions[1].dynamicFrom.question, "renamed");
	assert.equal(before.questions[1].dynamicFrom.question, "parent");
	await act(async () => tree.unmount());
});

test("number bounds keep invalid editing text visible and refuse invalid or reversed saves", async () => {
	const view = await settings(question("count", "number"));
	for (const value of ["-", "1.5", "9007199254740992"]) {
		await change(control(view.tree, "Minimum", "TextInput"), value);
		assert.equal(control(view.tree, "Minimum", "TextInput").props.value, value);
		assert.match(saveProblem(view.current()), /whole number/);
	}
	await change(control(view.tree, "Minimum", "TextInput"), "9");
	await change(control(view.tree, "Maximum", "TextInput"), "3");
	assert.match(saveProblem(view.current()), /Minimum/);
	await change(control(view.tree, "Minimum", "TextInput"), "");
	assert.equal(view.current().min, undefined);
	assert.equal(saveProblem(view.current()), null);
	await change(control(view.tree, "Number type"), "decimal");
	await change(control(view.tree, "Minimum", "TextInput"), "-1.25");
	assert.equal(view.current().min, -1.25);
	assert.equal(saveProblem(view.current()), null);
	await view.close();
});

test("conditions author equals, includes and nested Any groups with earlier answer codes", async () => {
	const view = await settings(question("child", "text"), [question("single"), question("multiple", "many")]);
	await change(control(view.tree, "Show this question"), "conditions");
	await change(control(view.tree, "Condition"), "equals");
	await change(control(view.tree, "Answer"), "no");
	assert.deepEqual(view.current().dependsOn.of[0], { kind: "equals", question: "single", option: "no" });
	await act(async () => button(view.tree, "Add group").props.onClick());
	await change(control(view.tree, "Match", "Select", 1), "any");
	await change(control(view.tree, "Earlier question", "Select", 1), "multiple");
	assert.equal(
		control(view.tree, "Condition", "Select", 1)
			.findAllByType("option")
			.some(node => node.props.value === "equals"),
		false
	);
	await change(control(view.tree, "Condition", "Select", 1), "includes");
	assert.deepEqual(view.current().dependsOn.of[1], {
		kind: "any",
		of: [{ kind: "includes", question: "multiple", option: "yes" }]
	});
	await view.close();
});

test("fixed and dependent option wording changes preserve codes and export columns", async () => {
	const view = await settings(question("child"), [question("parent")]);
	await change(
		view.tree.root.findAllByType("TextInput").find(node => node.props["aria-label"] === "Options: option 1"),
		"Affirmative"
	);
	assert.equal(view.current().options[0].code, "yes");
	await change(control(view.tree, "Options come from"), "dynamic");
	await act(async () =>
		view.tree.root
			.findAllByType("Button")
			.find(node => text(node) === "Add an option")
			.props.onClick()
	);
	const option = view.tree.root
		.findAllByType("TextInput")
		.find(node => node.props["aria-label"] === "When the answer is Yes: option 1");
	const code = view.current().dynamicFrom.sets.yes.options[0].code;
	await change(option, "Changed dependent wording");
	assert.equal(view.current().dynamicFrom.sets.yes.options[0].code, code);
	assert.equal(view.current().dynamicFrom.sets.yes.options[0].label, "Changed dependent wording");
	assert.equal(view.current().dynamicFrom.question, "parent");
	await view.close();
});

test("move controls and pointer handles preserve selection and refuse child-before-parent order", async () => {
	let raw = {
		...blankDefinition("accept", "Acceptance"),
		questions: [
			question("parent"),
			{ ...question("child"), dependsOn: { kind: "answered", question: "parent" } },
			question("free")
		]
	};
	let selected = "child";
	let tree;
	const props = () => ({
		questions: raw.questions,
		selectedId: selected,
		changed: new Set(),
		unsaved: new Set(),
		refused: new Set(),
		readOnly: false,
		onSelect: id => {
			selected = id;
			tree.update(React.createElement(QuestionList, props()));
		},
		onMove: (id, target) => {
			const result = moveQuestion(raw, id, target);
			if (!result.ok) return result.problem;
			raw = result.raw;
			tree.update(React.createElement(QuestionList, props()));
			return null;
		}
	});
	await act(async () => {
		tree = create(React.createElement(QuestionList, props()), {
			createNodeMock: element =>
				element.type === "ul"
					? {
							querySelectorAll: () =>
								[100, 200, 300].map(bottom => ({ getBoundingClientRect: () => ({ bottom }) }))
						}
					: null
		});
	});
	const icon = label => tree.root.findAllByType("IconButton").find(node => node.props.label === label);
	await act(async () => icon("Move child up").props.onClick());
	assert.deepEqual(
		raw.questions.map(entry => entry.id),
		["parent", "child", "free"]
	);
	assert.match(text(tree.root.findByProps({ role: "status" })), /because it uses that answer/);
	await act(async () => icon("Move child down").props.onClick());
	assert.deepEqual(
		raw.questions.map(entry => entry.id),
		["parent", "free", "child"]
	);
	assert.equal(selected, "child");
	await act(async () =>
		icon("Drag free to reorder").props.onPointerDown({
			isPrimary: true,
			button: 0,
			clientY: 150,
			pointerId: 1,
			currentTarget: { setPointerCapture() {} }
		})
	);
	await act(async () => icon("Drag free to reorder").props.onPointerMove({ clientY: 20 }));
	await act(async () => icon("Drag free to reorder").props.onPointerUp());
	assert.deepEqual(
		raw.questions.map(entry => entry.id),
		["free", "parent", "child"]
	);
	assert.equal(selected, "free");
	assert.match(text(tree.root.findByProps({ role: "status" })), /position 1/);
	await act(async () => tree.unmount());
});
