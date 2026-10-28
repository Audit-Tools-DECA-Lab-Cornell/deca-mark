import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

import { load } from "./support.mjs";

// Render the real screens, review page, actions, API client and mutations. Replace only
// Next's request/auth context and visual children; the HTTP boundary below enforces CAS.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const state = { pushes: [], refreshes: 0, reads: 0, writes: [], toast() {} };
globalThis.__formFlowTest = state;
const src = new URL("../../src/", import.meta.url);
const mocks = new Map([
	[
		"next/navigation",
		'export const useRouter=()=>({push:p=>globalThis.__formFlowTest.pushes.push(p),refresh:()=>globalThis.__formFlowTest.refreshes++}); export const notFound=()=>{throw Error("not found")}; export const unstable_isUnrecognizedActionError=error=>error?.name==="UnrecognizedActionError";'
	],
	["next/cache", "export const revalidatePath=()=>{};"],
	["server-only", ""],
	["lib/supabase/config.ts", "export const supabaseConfig=()=>({});"],
	[
		"lib/supabase/server.ts",
		'export const createClient=async()=>({auth:{getClaims:async()=>({data:{claims:{sub:"manager"}}}),getSession:async()=>({data:{session:{access_token:"synthetic"}}})}});'
	],
	[
		"lib/api/workspace.ts",
		`import {call} from ${JSON.stringify(new URL("lib/api/client.ts", src).href)};
        export const resolveProject=async()=>({id:"project",role:"manager"});
        export const getFormVersion=async()=>call(api=>api.GET("/v1/projects/{project_id}/form-versions/{version_code}",{params:{path:{project_id:"project",version_code:"check-v1"}}}));
        export const listForms=async()=>[{code:"check",name:"Check",versions:[globalThis.__formFlowTest.current]}];
        export const listSites=async()=>[];`
	],
	["features/shell/useLeaveGuard.ts", "export const useLeaveGuard=()=>({leavingTo:null,stay(){},leave(){}});"]
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
	"components/contour/Checkbox.tsx": ["Checkbox"],
	"components/contour/TextLink.tsx": ["TextLink"],
	"features/forms/AddQuestionDialog.tsx": ["AddQuestionDialog"],
	"features/forms/CollectorPreview.tsx": ["CollectorPreview"],
	"features/forms/QuestionList.tsx": ["QuestionList"],
	"features/forms/QuestionSettings.tsx": ["QuestionSettings"],
	"features/forms/ProtocolNotes.tsx": ["ProtocolNotes"],
	"components/shell/LoadFailure.tsx": ["LoadFailure"]
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
mocks.set("components/contour/Toast.tsx", "export const useToast=()=>globalThis.__formFlowTest.toast;");
registerHooks({
	resolve(specifier, context, next) {
		if (mocks.has(specifier)) return { url: `form-test:${specifier}`, shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : url.replace(/^form-test:/, "");
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
		if (url.endsWith(".json"))
			return {
				format: "module",
				source: `export default ${readFileSync(fileURLToPath(url), "utf8")}`,
				shortCircuit: true
			};
		return next(url, context);
	}
});

const { DraftEditorScreen } = await load("features/forms/DraftEditorScreen.tsx");
const { default: PublishPage } = await load("app/(app)/o/[org]/p/[project]/forms/versions/[version]/publish/page.tsx");
const { DiscardDialog } = await load("features/forms/DiscardDialog.tsx");
const { blankDefinition } = await load("features/forms/starter.ts");
const { failedChange } = await load("features/forms/result.ts");
const { ApiError } = await load("lib/api/errors.ts");

const version = current => ({
	code: current.code,
	etag: current.etag,
	state: current.state,
	formCode: "check",
	formName: "Check"
});
const reviewed = () =>
	PublishPage({ params: Promise.resolve({ org: "org", project: "project", version: "check-v1" }) });
const find = (tree, type, predicate = () => true) => tree.root.findAllByType(type).find(node => predicate(node.props));
const textContent = node =>
	typeof node === "string"
		? node
		: Array.isArray(node)
			? node.map(textContent).join(" ")
			: (node?.children?.map(textContent).join(" ") ?? "");
const button = (tree, label) => find(tree, "Button", props => [props.children].flat().join("") === label);

// No real providers: this in-memory HTTP server implements only the documented form CAS contract.
test("actual save → review → publish flow retains ETags, local edits and explicit review on conflict", async () => {
	const previousFetch = globalThis.fetch;
	const previousUrl = process.env.DECAMARK_API_URL;
	process.env.DECAMARK_API_URL = "http://forms.test";
	let revision = 1;
	state.current = {
		version_id: "00000000-0000-4000-8000-000000000001",
		schema_version: 2,
		code: "check-v1",
		version: 1,
		form_code: "check",
		form_name: "Check",
		state: "draft",
		definition: blankDefinition("check", "Check"),
		question_count: 1,
		revision,
		etag: '"form-draft:00000000-0000-4000-8000-000000000001:1"'
	};
	const advance = () => {
		state.current = {
			...state.current,
			revision: ++revision,
			etag: `"form-draft:${state.current.version_id}:${revision}"`
		};
	};
	globalThis.fetch = async request => {
		if (request.method === "GET") {
			state.reads++;
			return Response.json(state.current);
		}
		const etag = request.headers.get("If-Match");
		state.writes.push({ method: request.method, etag });
		if (etag !== state.current.etag)
			return Response.json(
				{ error: { code: "revision_conflict", message: "changed", details: {} } },
				{ status: 412 }
			);
		if (request.method === "PUT") {
			state.current = { ...state.current, definition: (await request.json()).definition };
			advance();
		} else if (request.method === "POST") state.current = { ...state.current, state: "published" };
		else return new Response(null, { status: 204 });
		return Response.json(state.current);
	};
	let editor, review, discard;
	try {
		await act(async () => {
			editor = create(
				React.createElement(DraftEditorScreen, {
					org: "org",
					project: "project",
					version: version(state.current),
					definition: state.current.definition,
					base: null,
					baseProblem: null,
					canManage: true,
					collector: { plan: null, siteName: "", zoneId: null, zoneName: null, mapVersion: null }
				})
			);
		});
		const edit = label => act(async () => find(editor, "QuestionSettings").props.onChange({ label }));
		await edit("First save");
		await act(async () => button(editor, "Save draft").props.onClick());
		await edit("Second save");
		await act(async () => button(editor, "Save draft").props.onClick());
		assert.deepEqual(
			state.writes.map(write => write.etag),
			[
				'"form-draft:00000000-0000-4000-8000-000000000001:1"',
				'"form-draft:00000000-0000-4000-8000-000000000001:2"'
			]
		);
		assert.equal(state.current.revision, 3);
		await act(async () => {
			review = create(await reviewed());
		});
		await act(async () => find(review, "Checkbox").props.onCheckedChange(true));
		advance(); // another manager saves after this review
		const readsBeforePublish = state.reads;
		await act(async () => button(review, `Publish ${state.current.code}`).props.onClick());
		assert.equal(state.reads, readsBeforePublish, "publication must not fetch and adopt a fresh revision");
		assert.match(state.writes.at(-1).etag, /:3"$/);
		assert.equal(state.current.state, "draft");
		assert.equal(find(review, "Checkbox").props.checked, false);
		assert.equal(button(review, `Publish ${state.current.code}`).props.disabled, true);
		assert.match(textContent(review.toJSON()), /Reload and review/);
		await act(async () => button(review, "Reload").props.onClick());
		assert.equal(state.refreshes, 1);
		await act(async () => review.update(await reviewed()));
		assert.equal(find(review, "Checkbox").props.checked, false, "new review requires a new confirmation");
		await act(async () => find(review, "Checkbox").props.onCheckedChange(true));
		await act(async () => button(review, `Publish ${state.current.code}`).props.onClick());
		assert.equal(state.current.state, "published");
		assert.match(state.writes.at(-1).etag, /:4"$/);

		// The stale editor keeps its local changes, with no automatic overwrite or retry.
		await edit("Unsaved local wording");
		const writesBeforeConflict = state.writes.length;
		await act(async () => button(editor, "Save draft").props.onClick());
		assert.equal(state.writes.length, writesBeforeConflict + 1);
		assert.equal(find(editor, "QuestionSettings").props.question.label, "Unsaved local wording");
		assert.equal(button(editor, "Save draft").props.disabled, true);
		assert.ok(button(editor, "Open latest draft"));
		assert.equal(state.current.definition.questions[0].label, "Second save");

		await act(async () => {
			discard = create(
				React.createElement(DiscardDialog, {
					org: "org",
					project: "project",
					version: { code: "check-v1", questionCount: 1, etag: "stale" }
				})
			);
		});
		// Open the real dialog, then invoke its actual discard action.
		const dialog = discard.root.findByType((await load("components/contour/Dialog.tsx")).Dialog);
		await act(async () => dialog.props.onOpenChange(true));
		await act(async () => button(discard, "Discard draft").props.onClick());
		assert.deepEqual(state.writes.at(-1), { method: "DELETE", etag: "stale" });
		assert.match(textContent(discard.toJSON()), /Reload and review/);
	} finally {
		await act(async () => {
			editor?.unmount();
			review?.unmount();
			discard?.unmount();
		});
		globalThis.fetch = previousFetch;
		if (previousUrl === undefined) delete process.env.DECAMARK_API_URL;
		else process.env.DECAMARK_API_URL = previousUrl;
	}
});

for (const status of [412, 428])
	test(`form precondition HTTP ${status} requires reconciliation`, () => {
		assert.equal(
			failedChange("Nothing was saved.", new ApiError("revision_conflict", "rejected", { status })).conflict,
			true
		);
	});
