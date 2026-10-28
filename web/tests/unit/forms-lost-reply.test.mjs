import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

import { load } from "./support.mjs";

/**
 * WEB-44 (audit C03, decision D34): the real form editor, with only the Server Action boundary replaced.
 * The fake "server" below holds one draft with the compare-and-set the API has (a write needs the etag the
 * draft has now, else it is refused with a conflict). A call can reject after the write was committed (a
 * lost reply), or without reaching the server at all (the server did not recognise the action).
 *
 * What the editor must do: stay mounted with the typed wording, say it could not confirm the save and never
 * "Nothing was saved", and on the next Save's conflict read the draft back: report the earlier save only
 * when the draft holds exactly the wording this page sent, and otherwise keep the wording and offer the
 * normal conflict choice. `e2e/action-failures.spec.ts` drives the same cases through a browser.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const lost = { toasts: [], left: 0, reads: 0, server: null, rejectNext: null, leavingTo: null };
globalThis.__lostReply = lost;
const src = new URL("../../src/", import.meta.url);

const CONFLICT = {
	status: "failed",
	message: "Nothing was saved. This draft changed. Reload and review the latest draft before trying again.",
	conflict: true
};

const mocks = new Map([
	[
		"next/navigation",
		'export const useRouter=()=>({push(){},refresh(){}}); export const notFound=()=>{throw Error("not found")}; export const unstable_isUnrecognizedActionError=error=>error?.name==="UnrecognizedActionError";'
	],
	[
		"features/shell/useLeaveGuard.ts",
		"export const useLeaveGuard=()=>({leavingTo:globalThis.__lostReply.leavingTo,stay(){},leave(){globalThis.__lostReply.left++}});"
	],
	["components/contour/Toast.tsx", "export const useToast=()=>t=>globalThis.__lostReply.toasts.push(t);"],
	[
		"features/forms/actions.ts",
		`export const saveDraftAction = async input => {
			const { server } = globalThis.__lostReply;
			if (input.etag !== server.etag) return ${JSON.stringify(CONFLICT)};
			server.definition = input.definition;
			server.etag = "e" + (Number(server.etag.slice(1)) + 1);
			const rejection = globalThis.__lostReply.rejectNext;
			if (rejection) { globalThis.__lostReply.rejectNext = null; throw rejection; }
			return { status: "done", etag: server.etag, revision: 1 };
		};
		export const readDraftAction = async () => {
			const { server } = globalThis.__lostReply;
			globalThis.__lostReply.reads++;
			return { status: "done", etag: server.etag, state: server.state, definition: server.definition };
		};
		export const startDraftAction = async () => ({ status: "failed", message: "not used" });`
	]
]);
const visuals = {
	"components/contour/Button.tsx": ["Button", "ButtonLink"],
	"components/contour/Dialog.tsx": ["Dialog", "DialogClose"],
	"components/contour/Island.tsx": ["Island"],
	"components/contour/Mono.tsx": ["Mono"],
	"components/contour/Note.tsx": ["Note"],
	"components/contour/PageHeader.tsx": ["PageHeader"],
	"components/contour/ScreenState.tsx": ["ScreenState"],
	"components/contour/Segmented.tsx": ["Segmented"],
	"components/contour/StateBadge.tsx": ["StateBadge"],
	"features/forms/AddQuestionDialog.tsx": ["AddQuestionDialog"],
	"features/forms/CollectorPreview.tsx": ["CollectorPreview"],
	"features/forms/QuestionList.tsx": ["QuestionList"],
	"features/forms/QuestionSettings.tsx": ["QuestionSettings"]
};
for (const [path, names] of Object.entries(visuals)) {
	mocks.set(
		path,
		`import React from "react"; ${names
			.map(
				name =>
					`export const ${name}=p=>${name === "Dialog" ? "p.open === false ? null :" : ""} React.createElement("${name}",p,...[p.children,p.actions,p.footer].filter(x=>x!==undefined));`
			)
			.join("\n")} ${path.includes("QuestionSettings") ? "export const saveProblem=()=>null;" : ""}`
	);
}
registerHooks({
	resolve(specifier, context, next) {
		if (mocks.has(specifier)) return { url: `lost-test:${specifier}`, shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : url.replace(/^lost-test:/, "");
		if (mocks.has(relative)) return { format: "module", source: mocks.get(relative), shortCircuit: true };
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

const { DraftEditorScreen } = await load("features/forms/DraftEditorScreen.tsx");
const { blankDefinition } = await load("features/forms/starter.ts");
const { UnrecognizedActionError } = await import(
	new URL("../../node_modules/next/dist/client/components/unrecognized-action-error.js", import.meta.url).href
);

const find = (tree, type, predicate = () => true) => tree.root.findAllByType(type).find(node => predicate(node.props));
const textContent = node =>
	typeof node === "string"
		? node
		: Array.isArray(node)
			? node.map(textContent).join(" ")
			: (node?.children?.map(textContent).join(" ") ?? "");
const button = (tree, label) => find(tree, "Button", props => [props.children].flat().join("") === label);
const said = tree => textContent(tree.toJSON()).replace(/\s+/g, " ");

const COULD_NOT_CONFIRM =
	"DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected.";

async function openEditor() {
	const definition = blankDefinition("check", "Check");
	lost.server = { etag: "e1", state: "draft", definition: JSON.parse(JSON.stringify(definition)) };
	lost.toasts = [];
	lost.left = 0;
	lost.reads = 0;
	lost.rejectNext = null;
	lost.leavingTo = null;
	let editor;
	await act(async () => {
		editor = create(
			React.createElement(DraftEditorScreen, {
				org: "org",
				project: "project",
				version: { code: "check-v1", etag: "e1", state: "draft", formCode: "check", formName: "Check" },
				definition,
				base: null,
				baseProblem: null,
				canManage: true,
				collector: { plan: null, siteName: "", zoneId: null, zoneName: null, mapVersion: null }
			})
		);
	});
	return {
		editor,
		edit: label => act(async () => find(editor, "QuestionSettings").props.onChange({ label })),
		save: () => act(async () => button(editor, "Save draft").props.onClick()),
		label: () => find(editor, "QuestionSettings").props.question.label,
		unsaved: () => find(editor, "Island", props => props.title === "Questions").props.meta === "Unsaved changes",
		stored: () => lost.server.definition.questions[0].label
	};
}

test("a save whose reply is lost keeps the editor and the wording, and never says nothing was saved", async () => {
	const { editor, edit, save, label, stored, unsaved } = await openEditor();
	await edit("My wording");
	lost.rejectNext = new TypeError("Failed to fetch");
	await save();
	assert.equal(label(), "My wording", "the typed wording is still in the editor");
	assert.match(said(editor), new RegExp(COULD_NOT_CONFIRM));
	assert.doesNotMatch(said(editor), /Nothing was saved/);
	assert.ok(unsaved());
	assert.ok(!button(editor, "Save draft").props.disabled, "the edit can be saved again");
	assert.equal(stored(), "My wording", "the server did commit it");
	assert.equal(lost.reads, 0, "nothing is read back until a later refusal needs it");
	await act(async () => editor.unmount());
});

test("its second Save meets a conflict, reads the draft back, and reports the earlier save because the wording matches", async () => {
	const { editor, edit, save, label, unsaved } = await openEditor();
	await edit("My wording");
	lost.rejectNext = new TypeError("Failed to fetch");
	await save();
	await save();
	assert.equal(lost.reads, 1);
	assert.deepEqual(
		lost.toasts.map(toast => toast.title),
		["Your earlier save went through."]
	);
	assert.doesNotMatch(said(editor), /This draft changed|could not confirm/);
	assert.ok(!unsaved());
	assert.equal(label(), "My wording");
	assert.equal(button(editor, "Save draft").props.disabled, true);
	await act(async () => editor.unmount());
});

test("another manager's save in between ends in the conflict choice with this page's wording kept", async () => {
	const { editor, edit, save, label, stored, unsaved } = await openEditor();
	await edit("My wording");
	lost.rejectNext = new TypeError("Failed to fetch");
	await save();
	// The other manager saves on top of the lost one, with the etag they read.
	lost.server.definition = {
		...lost.server.definition,
		questions: [{ ...lost.server.definition.questions[0], label: "Theirs" }]
	};
	lost.server.etag = "e9";
	await save();
	assert.equal(lost.reads, 1);
	assert.deepEqual(lost.toasts, [], "no earlier save is reported");
	assert.match(said(editor), /This draft changed/);
	assert.ok(button(editor, "Open latest draft"));
	assert.equal(label(), "My wording", "this page's wording is kept");
	assert.equal(stored(), "Theirs", "nothing was written over theirs");
	assert.equal(button(editor, "Save draft").props.disabled, true, "Save waits for the reload");
	assert.ok(unsaved());
	await act(async () => editor.unmount());
});

test("a page older than the server's build says nothing was saved, copy and reload, and reads nothing back later", async () => {
	const { editor, edit, save, label, unsaved } = await openEditor();
	await edit("My wording");
	lost.rejectNext = new UnrecognizedActionError('Server Action "40ab" was not found');
	// The fake server commits before it throws; a real unrecognised action never reaches it, so undo that.
	const before = JSON.parse(JSON.stringify(lost.server));
	await save();
	lost.server = before;
	assert.match(
		said(editor),
		/DECA Mark was updated while this page was open\. Nothing was saved\. Copy your wording, reload, then paste and save\./
	);
	assert.equal(label(), "My wording");
	// A later conflict is a plain conflict: the action did not run, so there is no earlier save to look for.
	lost.server.etag = "e9";
	await save();
	assert.equal(lost.reads, 0);
	assert.match(said(editor), /This draft changed/);
	await act(async () => editor.unmount());
});

test("the proxy's signed-out reply says so, and the wording stays", async () => {
	const { editor, edit, save, label, unsaved } = await openEditor();
	await edit("My wording");
	lost.server.etag = "e1";
	lost.rejectNext = new Error("Signed out");
	await save();
	assert.match(said(editor), /You were signed out\. Nothing was saved\. Your wording is still here\./);
	assert.equal(label(), "My wording");
	await act(async () => editor.unmount());
});

test("Save and leave after a lost reply leaves only when nothing was typed since that save", async () => {
	// Nothing typed since: the draft holds exactly what is on screen, so leaving is right.
	let page = await openEditor();
	lost.leavingTo = "/o/org/p/project/forms";
	await page.edit("My wording");
	lost.rejectNext = new TypeError("Failed to fetch");
	await page.save();
	await act(async () => button(page.editor, "Save and leave").props.onClick());
	assert.equal(lost.left, 1);
	assert.ok(!page.unsaved());
	await act(async () => page.editor.unmount());

	// Typed on top of the lost save: the draft holds the older wording, so the page stays with the newer.
	page = await openEditor();
	lost.leavingTo = "/o/org/p/project/forms";
	await page.edit("My wording");
	lost.rejectNext = new TypeError("Failed to fetch");
	await page.save();
	await page.edit("My wording, edited");
	await act(async () => button(page.editor, "Save and leave").props.onClick());
	assert.equal(lost.left, 0, "the later edit is not saved, so the page does not leave");
	assert.equal(page.label(), "My wording, edited");
	assert.ok(page.unsaved());
	await act(async () => page.editor.unmount());
});
