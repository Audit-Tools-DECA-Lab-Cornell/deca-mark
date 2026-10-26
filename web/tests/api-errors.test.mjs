import assert from "node:assert/strict";
import test from "node:test";
import {
	ApiError,
	apiRequestError,
	errorCopy,
	failedWrite,
	parseApiError,
	readApiError,
	UNCONFIRMED_CHANGE_COPY,
	wasRefused
} from "../src/lib/api/errors.ts";

for (const [code, message] of Object.entries(errorCopy)) {
	test(`maps ${code} to safe copy`, () => {
		const error = parseApiError(400, { error: { code, message: "sensitive server text", details: {} } });
		assert.ok(error instanceof ApiError);
		assert.equal(error.code, code);
		assert.equal(error.message, message);
		assert.ok(!error.message.includes("sensitive"));
	});
}

for (const [code, kind] of [
	["role_required", "rejected"],
	["conflict", "rejected"],
	["rate_limited", "retry"],
	["unauthenticated", "sign-in"]
]) {
	test(`classifies ${code} from the envelope`, () => {
		assert.equal(parseApiError(400, { error: { code, message: "ignored", details: {} } }).kind, kind);
	});
}

for (const body of [
	null,
	[],
	{ detail: "legacy error" },
	{ error: { code: "future_code", message: "private", details: {} } },
	{ error: { code: "conflict", message: 3, details: {} } }
]) {
	test(`handles malformed envelope ${JSON.stringify(body)}`, () => {
		const error = parseApiError(400, body);
		assert.equal(error.code, "unknown");
		assert.equal(error.kind, "retry");
	});
}

test("keeps authentication and server failures actionable without JSON", async () => {
	assert.equal((await readApiError(new Response("<html>proxy</html>", { status: 401 }))).kind, "sign-in");
	assert.equal((await readApiError(new Response("<html>proxy</html>", { status: 503 }))).kind, "retry");
	assert.equal((await readApiError(new Response("not JSON", { status: 400 }))).code, "unknown");
});

test("retains recognized codes on auth and server responses", () => {
	assert.equal(
		parseApiError(401, { error: { code: "unauthenticated", message: "ignored", details: {} } }).code,
		"unauthenticated"
	);
	assert.equal(parseApiError(500, { error: { code: "internal", message: "ignored", details: {} } }).code, "internal");
});

test("maps an HTML 200 body to a retry error instead of leaking a JSON parse exception", async () => {
	const { apiRequestError } = await import("../src/lib/api/errors.ts");
	const response = new Response("<html>upstream unavailable</html>", {
		status: 200,
		headers: { "content-type": "text/html" }
	});
	const error = await response.json().catch(apiRequestError);
	assert.equal(error.code, "unknown");
	assert.equal(error.kind, "retry");
	assert.doesNotMatch(error.message, /upstream unavailable|Unexpected token/);
});

test("maps a form schema refusal through its stable code", async () => {
	const { UnknownSchemaVersionError } = await import("../src/lib/forms/definition.ts");
	const error = apiRequestError(new UnknownSchemaVersionError(3));
	assert.equal(error.code, "unknown_schema_version");
	assert.equal(error.kind, "rejected");
	assert.equal(error.message, "Update DECA Mark to use this form");
});

test("a refused change says nothing changed, then why", () => {
	for (const [status, code] of [
		[401, "token_invalid"],
		[403, "role_required"],
		[404, "not_found"],
		[409, "conflict"],
		[410, "invitation_expired"],
		[422, "validation_failed"],
		[429, "rate_limited"]
	]) {
		const error = parseApiError(status, { error: { code, message: "ignored", details: {} } });
		assert.equal(wasRefused(error), true, String(status));
		assert.equal(failedWrite("Nothing was saved.", error), `Nothing was saved. ${errorCopy[code]}`, String(status));
	}
	const throttled = parseApiError(429, null, new Headers({ "Retry-After": "42" }));
	assert.equal(
		failedWrite("Nothing was changed.", throttled),
		"Nothing was changed. Too many tries. Wait 42 seconds and try again."
	);
});

test("a change DECA Mark failed on, or did not answer, is not reported as not made", async () => {
	const unanswered = [
		apiRequestError(new TypeError("fetch failed")),
		apiRequestError(new DOMException("timed out", "TimeoutError")),
		apiRequestError(new SyntaxError("Unexpected token <")),
		await readApiError(new Response("<html>proxy</html>", { status: 502 })),
		await readApiError(new Response("", { status: 503 })),
		parseApiError(500, { error: { code: "internal", message: "ignored", details: {} } }),
		parseApiError(503, { error: { code: "storage_unavailable", message: "ignored", details: {} } }),
		new ApiError("storage_unavailable", "retry")
	];
	for (const error of unanswered) {
		assert.equal(wasRefused(error), false, error.code);
		assert.equal(failedWrite("Nothing was saved.", error), UNCONFIRMED_CHANGE_COPY, error.code);
	}
	assert.equal(failedWrite("Nothing was saved.", new Error("bug")), UNCONFIRMED_CHANGE_COPY);
	assert.doesNotMatch(UNCONFIRMED_CHANGE_COPY, /nothing|not saved|not made|\b(session|server|token|API|endpoint)\b/i);
});
