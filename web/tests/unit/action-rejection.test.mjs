import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { load } from "./support.mjs";

/**
 * WEB-44 (audit C03, decision D34): what a Server Action call that rejects tells the page, and how the form
 * editor tells a save that landed from one that did not. Next's own `UnrecognizedActionError` is used as
 * it is; only the `next/navigation` entry (which Node cannot resolve without a bundler) is pointed at the
 * file that defines it.
 */
const unrecognized = new URL(
	"../../node_modules/next/dist/client/components/unrecognized-action-error.js",
	import.meta.url
).href;
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === "next/navigation") return { url: "test:next-navigation", shortCircuit: true };
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url === "test:next-navigation")
			return {
				format: "module",
				shortCircuit: true,
				source: `export { unstable_isUnrecognizedActionError } from ${JSON.stringify(unrecognized)};`
			};
		return next(url, context);
	}
});

const { causeOf, rejectionCopy, rejectedWith, rejected, authRejectionCopy, isRedirect } =
	await load("lib/action-rejection.ts");
const { SIGNED_OUT_REPLY } = await load("lib/auth/signed-out-reply.ts");
const { UnrecognizedActionError } = await import(unrecognized);
const { UNCONFIRMED_CHANGE_COPY } = await load("lib/api/errors.ts");
const { landedSave } = await load("features/forms/lost-reply.ts");

const redirectError = () => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/o;307;" });

test("a server that does not know the action is 'updated'; the proxy's fixed reply is 'signed-out'; the rest is unknown", () => {
	assert.equal(causeOf(new UnrecognizedActionError('Server Action "40ab" was not found')), "updated");
	assert.equal(causeOf(new Error(SIGNED_OUT_REPLY)), "signed-out");
	assert.equal(causeOf(new TypeError("Failed to fetch")), "unknown");
	assert.equal(causeOf(new Error("An unexpected response was received from the server.")), "unknown");
	assert.equal(causeOf(new Error("Signed out, and then some")), "unknown");
	assert.equal(causeOf("Signed out"), "unknown");
	assert.equal(causeOf(undefined), "unknown");
});

test("a redirect is not a failure: it is rethrown so the router still follows it", () => {
	const error = redirectError();
	assert.equal(isRedirect(error), true);
	assert.throws(() => causeOf(error), error);
	assert.throws(() => rejectedWith(error, "kept", "Nothing was saved."), error);
	assert.throws(() => rejected(error, "reload", "Nothing was created."), error);
	assert.throws(() => authRejectionCopy(error), error);
	assert.equal(isRedirect(new Error("boom")), false);
	assert.equal(isRedirect({ digest: 42 }), false);
});

test("the copy for a page older than the server's build is the sentence D34 sets, word for word", () => {
	assert.equal(
		rejectionCopy("updated", "kept", "Nothing was saved."),
		"DECA Mark was updated while this page was open. Nothing was saved. Copy your wording, reload, then paste and save."
	);
});

test("an unknown outcome never claims that nothing was saved, whatever the screen holds", () => {
	for (const stake of ["kept", "reload"]) {
		const copy = rejectionCopy("unknown", stake, "Nothing was saved.");
		assert.doesNotMatch(copy, /Nothing was/);
		assert.match(copy, /could not confirm/);
	}
	assert.equal(
		rejectionCopy("unknown", "kept", "Nothing was saved."),
		"DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected."
	);
	assert.equal(rejectionCopy("unknown", "reload", "Nothing was created."), UNCONFIRMED_CHANGE_COPY);
});

test("a read can say nothing changed, because it only reads", () => {
	assert.equal(
		rejectionCopy("unknown", "read", "Nothing more was loaded."),
		"Nothing more was loaded. Check the connection and try again."
	);
	assert.match(
		rejectionCopy("updated", "read", "Nothing more was loaded."),
		/^Nothing more was loaded\. DECA Mark was updated/
	);
	assert.match(rejectionCopy("signed-out", "read", "Nothing more was loaded."), /^You were signed out\./);
});

test("signed out says so, says nothing was saved (the proxy stopped it), and keeps the wording where it is", () => {
	const copy = rejectionCopy("signed-out", "kept", "Nothing was saved.");
	assert.match(copy, /^You were signed out\. Nothing was saved\. Your wording is still here\./);
	assert.match(copy, /sign in/);
	assert.match(
		rejectionCopy("signed-out", "reload", "Nothing was published."),
		/^You were signed out\. Nothing was published\./
	);
});

test("no copy uses a word the product avoids, or an exclamation mark", () => {
	const words = /\b(error|server|session|token|payload|API|endpoint|null|undefined|JSON|oops)\b|!/i;
	for (const cause of ["updated", "signed-out", "unknown"])
		for (const stake of ["kept", "reload", "read"])
			assert.doesNotMatch(rejectionCopy(cause, stake, "Nothing was saved."), words, `${cause}/${stake}`);
	assert.doesNotMatch(authRejectionCopy(new TypeError("x")), words);
});

test("rejected() is the failure result a screen already shows", () => {
	assert.deepEqual(rejected(new TypeError("Failed to fetch"), "reload", "Nothing was retired."), {
		status: "failed",
		message: UNCONFIRMED_CHANGE_COPY
	});
});

test("a sign-in form that rejects is not told its first send was or was not heard", () => {
	assert.equal(
		authRejectionCopy(new TypeError("Failed to fetch")),
		"DECA Mark could not confirm that. Check your connection and try again."
	);
	assert.match(
		authRejectionCopy(new UnrecognizedActionError("x")),
		/^DECA Mark was updated while this page was open\./
	);
});

/* ── The form editor's read-back after a lost reply ───────────────────────── */

const definition = label => ({
	version: "x-v1",
	title: "X",
	questions: [{ id: "notes", code: "notes", label, kind: "text", act: "Record" }]
});

test("the draft read back equals what this page sent: that earlier save went through", () => {
	const sent = definition("Mine");
	assert.equal(landedSave({ state: "draft", definition: JSON.parse(JSON.stringify(sent)) }, [sent]), sent);
});

test("key order does not matter, wording does", () => {
	const sent = definition("Mine");
	const reordered = {
		questions: [{ label: "Mine", kind: "text", id: "notes", act: "Record", code: "notes" }],
		title: "X",
		version: "x-v1"
	};
	assert.equal(landedSave({ state: "draft", definition: reordered }, [sent]), sent);
	assert.equal(landedSave({ state: "draft", definition: definition("Theirs") }, [sent]), null);
});

test("another manager's save in between is a conflict, not an earlier save of this page", () => {
	assert.equal(landedSave({ state: "draft", definition: definition("Theirs") }, [definition("Mine")]), null);
});

test("with several saves unconfirmed, the one that landed is the one the draft equals", () => {
	const first = definition("First");
	const second = definition("Second");
	assert.equal(landedSave({ state: "draft", definition: definition("First") }, [first, second]), first);
	assert.equal(landedSave({ state: "draft", definition: definition("Second") }, [first, second]), second);
	assert.equal(landedSave({ state: "draft", definition: definition("Third") }, [first, second]), null);
});

test("nothing unconfirmed means nothing can have landed", () => {
	assert.equal(landedSave({ state: "draft", definition: definition("Mine") }, []), null);
});

test("a draft that was published or retired meanwhile is never reported as this page's save", () => {
	const sent = definition("Mine");
	assert.equal(landedSave({ state: "published", definition: sent }, [sent]), null);
	assert.equal(landedSave({ state: "retired", definition: sent }, [sent]), null);
});
