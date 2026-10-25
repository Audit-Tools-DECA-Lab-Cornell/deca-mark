import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

import { load } from "./support.mjs";

/**
 * WEB-45 (audit C06, J-7): signing out on the web ends this browser's session and nothing else.
 *
 * auth-js defaults `signOut()` to the `global` scope, which revokes every session of the account, so the
 * phone collector's uploads stopped at its next token refresh while the Account page promised "Signing out
 * here does not affect the app". These tests run the real Server Actions behind Sign out, "Not you?" and
 * account deletion, with only Next's request context and the Auth client replaced, and read the scope each
 * one passes and the cookies each one clears.
 */

const state = { scopes: [], deleted: [], deletion: "deleted" };
globalThis.__signOutTest = state;

const mocks = new Map([
	["next/headers", "export const cookies = async () => globalThis.__signOutTest.store;"],
	[
		"next/navigation",
		`export const redirect = to => { throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: to }); };
		export const notFound = () => { throw new Error("not found"); };`
	],
	["next/cache", "export const revalidatePath = () => {};"],
	["server-only", ""],
	[
		"lib/supabase/server.ts",
		`const client = { auth: { signOut: async options => { globalThis.__signOutTest.scopes.push(options?.scope ?? "global"); return { error: null }; } } };
		export const createClient = async () => client;
		export const requireUser = async () => ({ supabase: client, claims: { sub: "user-a" } });`
	],
	[
		"lib/api/mutations.ts",
		"export const previewInvitation = async () => ({}); export const redeemInvitation = async () => ({});"
	],
	["lib/api/workspace.ts", "export const getWorkspace = async () => ({ status: 'ready' });"],
	[
		"lib/api/client.ts",
		`export const session = async () => ({ status: "signed-in", userId: "user-a" });
		export const deleteAccount = async () => globalThis.__signOutTest.deletion;
		export const updateProfile = async () => ({});`
	]
]);

const src = new URL("../../src/", import.meta.url);
registerHooks({
	resolve(specifier, context, next) {
		if (mocks.has(specifier)) return { url: `sign-out-test:${specifier}`, shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		const relative = url.startsWith(src.href) ? url.slice(src.href.length) : url.replace(/^sign-out-test:/, "");
		if (mocks.has(relative)) return { format: "module", source: mocks.get(relative), shortCircuit: true };
		return next(url, context);
	}
});

const { signOut } = await load("lib/auth/actions.ts");
const { switchAccount } = await load("features/auth/actions.ts");
const { requestAccountDeletion } = await load("features/account/actions.ts");
const { PLACE_COOKIE } = await load("features/shell/navigation.ts");

function reset(deletion = "deleted") {
	state.scopes.length = 0;
	state.deleted.length = 0;
	state.deletion = deletion;
	state.store = {
		delete: name => state.deleted.push(name),
		set() {},
		get: () => undefined,
		getAll: () => []
	};
}

/** Runs a Server Action that ends in `redirect()` and returns where it redirected. */
async function redirectedTo(run) {
	try {
		await run();
	} catch (error) {
		if (error?.message === "NEXT_REDIRECT") return error.redirectTo;
		throw error;
	}
	assert.fail("the action did not redirect");
}

test("the place cookie is the one the workspace home reads", () => {
	assert.equal(PLACE_COOKIE, "fm-place");
});

test("Sign out ends this browser's session only and forgets the last place", async () => {
	reset();
	assert.equal(await redirectedTo(() => signOut()), "/sign-in");
	assert.deepEqual(state.scopes, ["local"]);
	assert.ok(state.deleted.includes(PLACE_COOKIE), "the last place is cleared at sign out");
});

test('"Not you?" ends this browser\'s session only, forgets the last place and returns to the same page', async () => {
	reset();
	const form = new FormData();
	form.set("next", "/join");
	assert.equal(await redirectedTo(() => switchAccount(form)), "/sign-in?next=%2Fjoin");
	assert.deepEqual(state.scopes, ["local"]);
	assert.ok(state.deleted.includes(PLACE_COOKIE), "the last place is cleared at sign out");
});

test("a finished account deletion ends this browser's session only and forgets the last place", async () => {
	reset("deleted");
	const form = new FormData();
	form.set("confirm", "DELETE");
	form.set("account", "user-a");
	assert.equal(await redirectedTo(() => requestAccountDeletion({ status: "idle" }, form)), "/sign-in");
	assert.deepEqual(state.scopes, ["local"]);
	assert.ok(state.deleted.includes(PLACE_COOKIE), "the last place is cleared at sign out");
});

test("no sign-out anywhere in the web app asks Auth to end every session", () => {
	// A guard for the next call site: `signOut()` without a scope is `global`.
	let calls = 0;
	for (const file of readdirSync(src, { recursive: true })) {
		if (!/\.tsx?$/.test(String(file))) continue;
		for (const call of readFileSync(new URL(String(file), src), "utf8").matchAll(/\.signOut\(([^)]*)\)/g)) {
			calls += 1;
			assert.match(call[1], /scope:\s*"local"/, `${file}: ${call[0]}`);
		}
	}
	assert.ok(calls >= 3, "the scan found the sign-out call sites");
});
