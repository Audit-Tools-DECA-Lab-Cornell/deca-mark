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
const state = { error: null, workspaceReads: 0, pushes: [], outcome: null };
globalThis.__invitationRecovery = state;
const src = new URL("../../src/", import.meta.url);
const mocks = new Map([
	[
		"next/navigation",
		"export const useRouter=()=>({push:path=>globalThis.__invitationRecovery.pushes.push(path)}); export const redirect=()=>{};"
	],
	["next/cache", "export const revalidatePath=()=>{};"],
	["next/headers", "export const cookies=()=>{};"],
	["lib/supabase/server.ts", "export const createClient=()=>{};"],
	[
		"lib/api/mutations.ts",
		"export const previewInvitation=()=>{}; export const redeemInvitation=async()=>{throw globalThis.__invitationRecovery.error;};"
	],
	[
		"lib/api/workspace.ts",
		"export const getWorkspace=async()=>{globalThis.__invitationRecovery.workspaceReads++;return globalThis.__invitationRecovery.workspace;};"
	],
	["card-actions", "export const redeemInvite=async()=>globalThis.__invitationRecovery.outcome;"],
	["features/auth/flash.ts", "export const leaveFlash=()=>{};"]
]);
const visuals = {
	"components/contour/Button.tsx": ["Button", "ButtonLink"],
	"components/contour/FactsList.tsx": ["FactsList"],
	"components/contour/Island.tsx": ["Island"],
	"components/contour/Note.tsx": ["Note"],
	"components/contour/StateBadge.tsx": ["StateBadge"],
	"features/auth/AccountChip.tsx": ["AccountChip"]
};
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === "./actions" && context.parentURL?.endsWith("InvitationCard.tsx"))
			return { url: "invitation-test:card-actions", shortCircuit: true };
		if (mocks.has(specifier)) return { url: `invitation-test:${specifier}`, shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : url.replace(/^invitation-test:/, "");
		if (mocks.has(relative)) return { format: "module", source: mocks.get(relative), shortCircuit: true };
		if (visuals[relative])
			return {
				format: "module",
				shortCircuit: true,
				source: `import React from "react"; ${visuals[relative].map(name => `export const ${name}=p=>React.createElement("${name}",p,p.children);`).join("")}`
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
		if (url.endsWith(".json"))
			return {
				format: "module",
				shortCircuit: true,
				source: `export default ${readFileSync(fileURLToPath(url), "utf8")}`
			};
		return next(url, context);
	}
});
const { ApiError } = await load("lib/api/errors.ts");
const { redeemInvite } = await load("features/auth/actions.ts");
const { InvitationCard } = await load("features/auth/InvitationCard.tsx");
const { rememberToken, recalledToken } = await load("features/auth/invitation.ts");
const names = { organization: "Research lab", project: "Study" };
state.workspace = {
	status: "ready",
	orgs: [{ id: "org", name: names.organization, slug: "lab" }],
	projects: [{ id: "project", name: names.project, orgId: "org", orgSlug: "lab", code: "study", role: "viewer" }]
};

test("generic invalid redemption is not converted to membership even when the same project name exists", async () => {
	// Given a current membership whose names match an invitation sent to another address.
	state.error = new ApiError("invitation_invalid", "rejected", { status: 404 });
	state.workspaceReads = 0;
	// When the backend refuses without giving a reason.
	const result = await redeemInvite({ token: "valid-secret" }, names);
	// Then preserve the generic refusal; a matching name proves no recipient identity.
	assert.equal(result.problem.kind, "invalid");
	assert.equal(result.problem.path, undefined);
	assert.equal(state.workspaceReads, 0);
});

test("explicit duplicate refusal retains the existing-project recovery path", async () => {
	state.error = new ApiError("conflict", "rejected", { status: 409 });
	const result = await redeemInvite({ token: "valid-secret" }, names);
	assert.equal(result.problem.kind, "already-member");
	assert.equal(result.problem.path, "/o/lab/p/study");
});

test("wrong-account refusal keeps the invitation and displays the actual account beside Join", async () => {
	const data = new Map();
	globalThis.sessionStorage = {
		getItem: key => data.get(key) ?? null,
		setItem: (key, value) => data.set(key, value),
		removeItem: key => data.delete(key)
	};
	rememberToken("valid-secret");
	state.outcome = { status: "failed", problem: { kind: "invalid", message: "Check your account." } };
	const account = { userId: "actual-user", name: "Actual user", email: "actual@example.test", initials: "AU" };
	let tree;
	await act(async () => {
		tree = create(
			React.createElement(InvitationCard, {
				invitation: { ...names, role: "viewer", expiresAt: "2026-11-07T12:00:00Z" },
				account,
				credential: { token: "valid-secret" },
				next: "/invite",
				back: { label: "Not now", href: "/o" }
			})
		);
	});
	assert.deepEqual(tree.root.findByType("AccountChip").props.account, account);
	await act(async () => tree.root.findByType("Button").props.onClick());
	assert.equal(recalledToken(), "valid-secret");
	assert.equal(tree.root.findByType("AccountChip").props.onSwitch(), true);
	await act(async () => tree.unmount());
	delete globalThis.sessionStorage;
});
