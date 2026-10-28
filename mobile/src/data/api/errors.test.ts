import { expect, it } from "vitest";
import { ApiError, errorCopy, parseApiError, readApiError, retryAfterSeconds } from "./errors";

it.each(Object.entries(errorCopy))("maps %s to safe field copy", (code, message) => {
  const error = parseApiError(400, {
    error: { code, message: "private server text", details: {} },
  });
  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe(code);
  expect(error.message).toBe(message);
  expect(error.message).not.toContain("private");
});
it.each([
  ["conflict", "rejected"],
  ["publication_conflict", "rejected"],
  ["idempotency_conflict", "rejected"],
  ["revision_conflict", "rejected"],
  ["precondition_required", "rejected"],
  ["payload_too_large", "rejected"],
  ["validation_failed", "rejected"],
  ["rate_limited", "retry"],
  ["token_invalid", "sign-in"],
])("classifies %s by code", (code, kind) => {
  expect(parseApiError(400, { error: { code, message: "ignored", details: {} } }).kind).toBe(kind);
});
it.each([
  null,
  [],
  { detail: "unrecognized" },
  { error: { code: "future_code", message: "secret", details: {} } },
])("preserves records when the response is unrecognized", (body) => {
  const error = parseApiError(400, body);
  expect(error.code).toBe("unknown");
  expect(error.kind).toBe("retry");
  expect(error.message).toContain("saved");
});
it("handles non-JSON failures without exposing response text", async () => {
  const error = await readApiError(
    new Response("<html>secret proxy details</html>", { status: 400 }),
  );
  expect(error.kind).toBe("retry");
  expect(error.message).not.toContain("secret");
  expect((await readApiError(new Response("", { status: 401 }))).kind).toBe("sign-in");
  expect((await readApiError(new Response("", { status: 503 }))).kind).toBe("retry");
});
it("reads Retry-After as seconds or as an HTTP date", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  expect(retryAfterSeconds("120", now)).toBe(120);
  expect(retryAfterSeconds(" 0 ", now)).toBe(0);
  expect(retryAfterSeconds("Mon, 05 Oct 2026 12:05:00 GMT", now)).toBe(300);
  expect(retryAfterSeconds("Mon, 05 Oct 2026 11:00:00 GMT", now)).toBe(0);
  expect(retryAfterSeconds(null, now)).toBeNull();
  expect(retryAfterSeconds("", now)).toBeNull();
  expect(retryAfterSeconds("soon", now)).toBeNull();
});
it("keeps the server's wait on a rate-limited response", async () => {
  const body = JSON.stringify({ error: { code: "rate_limited", message: "x", details: {} } });
  const limited = await readApiError(
    new Response(body, { status: 429, headers: { "Retry-After": "90" } }),
  );
  expect(limited).toMatchObject({ code: "rate_limited", kind: "retry", retryAfter: 90 });
  expect((await readApiError(new Response(body, { status: 429 }))).retryAfter).toBeNull();
});
