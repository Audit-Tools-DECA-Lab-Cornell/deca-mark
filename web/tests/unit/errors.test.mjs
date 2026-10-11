import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const {
	ApiError,
	apiRequestError,
	errorCopy,
	fieldProblems,
	parseApiError,
	readApiError,
	retryAfterSeconds,
	waitCopy
} = await load("lib/api/errors.ts");
const { settle, toFailure } = await load("lib/workspace/result.ts");
const { failedChange: failedTeamChange } = await load("features/people/result.ts");
const { failedChange: failedFormChange } = await load("features/forms/result.ts");

const envelope = (code, message = "server text", details = {}) => ({ error: { code, message, details } });

test("zone refusals preserve safe copy and require attention", () => {
	for (const code of [
		"publication_conflict",
		"idempotency_conflict",
		"revision_conflict",
		"precondition_required",
		"payload_too_large"
	]) {
		const error = parseApiError(409, envelope(code, "private geometry"));
		assert.equal(error.kind, "rejected");
		assert.equal(error.code, code);
		assert.equal(error.message, errorCopy[code]);
		assert.equal(error.detail, undefined);
	}
});

test("410 is an expired invitation, with or without an envelope", () => {
	for (const body of [envelope("invitation_expired"), "<html>Gone</html>"]) {
		const error = parseApiError(410, body);
		assert.equal(error.code, "invitation_expired");
		assert.equal(error.kind, "rejected");
		assert.equal(error.message, "This invitation has expired. Ask your project manager for a new one.");
	}
});

test("429 says how long to wait, from Retry-After", async () => {
	const response = new Response(JSON.stringify(envelope("rate_limited")), {
		status: 429,
		headers: { "Retry-After": "42", "Content-Type": "application/json" }
	});
	const error = await readApiError(response);
	assert.equal(error.code, "rate_limited");
	assert.equal(error.kind, "retry");
	assert.equal(error.retryAfter, 42);
	assert.equal(error.message, "Too many tries. Wait 42 seconds and try again.");
	assert.equal(
		parseApiError(429, null, new Headers({ "Retry-After": "600" })).message,
		"Too many tries. Wait 10 minutes and try again."
	);
	assert.equal(parseApiError(429, envelope("rate_limited")).message, errorCopy.rate_limited);
});

test("Retry-After reads seconds or an HTTP date", () => {
	assert.equal(retryAfterSeconds("1"), 1);
	assert.equal(retryAfterSeconds("0"), 1);
	assert.equal(retryAfterSeconds("2.2"), 3);
	assert.equal(retryAfterSeconds("Thu, 08 Oct 2026 12:01:00 GMT", Date.parse("2026-10-08T12:00:00Z")), 60);
	assert.equal(retryAfterSeconds("soon"), undefined);
	assert.equal(retryAfterSeconds(null), undefined);
	assert.equal(waitCopy(1), "1 second");
	assert.equal(waitCopy(61), "2 minutes");
	assert.equal(waitCopy(3600), "1 hour");
});

test("422 maps each field to its problem and keeps the validation message apart", () => {
	const body = envelope("validation_failed", "Request validation failed", {
		fields: [
			{ id: "timezone", problem: "Use a valid IANA timezone" },
			{ id: "timezone", problem: "a second problem" },
			{ id: "name", problem: "String should have at least 1 character" },
			{ id: 3, problem: "ignored" }
		]
	});
	const error = parseApiError(422, body);
	assert.equal(error.code, "validation_failed");
	assert.equal(error.kind, "rejected");
	assert.deepEqual(error.fields, {
		timezone: "Use a valid IANA timezone",
		name: "String should have at least 1 character"
	});
	assert.equal(error.detail, "Request validation failed");
	assert.equal(error.message, errorCopy.validation_failed);
	assert.deepEqual(fieldProblems(undefined), {});
	assert.equal(parseApiError(409, envelope("conflict", "secret")).detail, undefined);
});

test("copy never says session, server or token", () => {
	for (const [code, message] of Object.entries(errorCopy))
		assert.doesNotMatch(message, /\b(session|server|token|API|endpoint)\b/i, code);
	assert.doesNotMatch(new ApiError("unknown", "retry").message, /\b(session|server|token)\b/i);
});

test("a failure is plain data a client screen can take, with fields and wait time", async () => {
	const failure = toFailure(
		parseApiError(422, envelope("validation_failed", "x", { fields: [{ id: "code", problem: "Taken" }] }))
	);
	assert.deepEqual(failure, {
		code: "validation_failed",
		kind: "rejected",
		message: errorCopy.validation_failed,
		fields: { code: "Taken" }
	});
	assert.deepEqual(toFailure(parseApiError(429, null, new Headers({ "Retry-After": "5" }))).retryAfter, 5);
	assert.equal(toFailure(new DOMException("timed out", "TimeoutError")).code, "storage_unavailable");
});

test("settle returns data or the failure, and rethrows anything that is not an API failure", async () => {
	assert.deepEqual(await settle(Promise.resolve([1])), { ok: true, data: [1] });
	const failed = await settle(Promise.reject(parseApiError(403, envelope("role_required"))));
	assert.equal(failed.ok, false);
	assert.equal(failed.failure.code, "role_required");
	const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
	await assert.rejects(settle(Promise.reject(redirect)), redirect);
	assert.throws(() => apiRequestError(new RangeError("bug")), RangeError);
});

test("team and form changes claim nothing happened only when DECA Mark refused them", () => {
	const refused = parseApiError(403, envelope("role_required"));
	assert.equal(
		failedTeamChange("Nothing was changed.", refused).message,
		`Nothing was changed. ${errorCopy.role_required}`
	);
	assert.equal(
		failedFormChange("Nothing was saved.", refused).message,
		`Nothing was saved. ${errorCopy.role_required}`
	);
	const conflict = failedFormChange("Nothing was saved.", parseApiError(409, envelope("conflict")));
	assert.equal(conflict.conflict, true);
	assert.match(conflict.message, /^Nothing was saved\./);
	const invalid = failedFormChange(
		"Nothing was saved.",
		parseApiError(422, envelope("validation_failed", "x", { fields: [{ id: "title", problem: "Required" }] }))
	);
	assert.deepEqual(invalid.fields, { title: "Required" });
	assert.match(invalid.message, /^Nothing was saved\./);

	for (const lost of [new TypeError("fetch failed"), parseApiError(503, envelope("storage_unavailable"))]) {
		const team = failedTeamChange("Nothing was changed.", lost).message;
		const form = failedFormChange("Nothing was saved.", lost).message;
		assert.equal(team, "DECA Mark could not confirm the change. Reload the page to check before you try again.");
		assert.equal(form, team);
	}
	assert.throws(() => failedTeamChange("Nothing was changed.", new RangeError("bug")), RangeError);
});
