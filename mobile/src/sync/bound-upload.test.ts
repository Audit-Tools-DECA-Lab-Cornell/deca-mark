import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentObservationSchema } from "../domain/observation";
import { binding, boundRecord, owner } from "../storage/package-store.fixture";
import { createBoundUpload } from "./bound-upload";
import { receipt, scope } from "./bound-upload.fixture";
import { serializeBoundObservation } from "./wire-body";

afterEach(() => vi.unstubAllGlobals());

describe("Pinned bound upload", () => {
  it("serializes unknown retained forms with nested answers and original point context", () => {
    const body = JSON.parse(serializeBoundObservation(boundRecord));
    expect(body).toEqual({
      site_id: binding.siteId,
      package_id: binding.packageId,
      zone_id: binding.zoneId,
      form_version: boundRecord.formVersion,
      observer: "QA",
      observed_at: boundRecord.createdAt,
      answers: boundRecord.answers,
      round_type: "standard",
      first_round: false,
      placement: "hand",
      coordinates: boundRecord.coordinates,
    });
  });
  it("omits point-only fields for whole-zone inventory", () => {
    const record = instrumentObservationSchema.parse({
      ...boundRecord,
      context: { ...boundRecord.context, roundType: "inventory" },
      placement: { source: "zone", gpsAccuracyMetres: null },
    });
    const body = JSON.parse(serializeBoundObservation(record));
    expect(body.round_type).toBe("inventory");
    expect(body).not.toHaveProperty("coordinates");
    expect(body).not.toHaveProperty("first_round");
  });
  it("PUTs the retained body to its own project and accepts the complete receipt", async () => {
    let sentBody = "";
    const fetcher = vi.fn(async (request: Request) => {
      sentBody = await request.clone().text();
      return new Response(JSON.stringify(receipt));
    });
    vi.stubGlobal("fetch", fetcher);
    const body = serializeBoundObservation(boundRecord);
    const result = await createBoundUpload(scope.apiUrl, scope)(
      boundRecord,
      "token",
      new AbortController().signal,
      body,
    );
    expect(result).toEqual({ kind: "accepted", receipt });
    const request = fetcher.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error("Missing request");
    expect(request.url).toBe(
      `${scope.apiUrl}/v1/projects/${binding.projectId}/observations/${boundRecord.id}`,
    );
    expect(sentBody).toBe(body);
    expect(request.headers.get("Authorization")).toBe("Bearer token");
  });
  it.each([
    "observation_id",
    "project_id",
    "user_id",
    "package_id",
    "zone_id",
    "accepted_revision",
    "received_at",
  ])("refuses a mismatched %s receipt", async (field) => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            ...receipt,
            [field]: field === "accepted_revision" ? 2 : "70000000-0000-4000-8000-000000000099",
          }),
        ),
    );
    expect(
      (
        await createBoundUpload(scope.apiUrl, scope)(
          boundRecord,
          "token",
          new AbortController().signal,
          serializeBoundObservation(boundRecord),
        )
      ).kind,
    ).toBe("retry");
  });
  it.each([
    401, 429, 503, 422, 409,
  ])("classifies HTTP %s and keeps structured error codes", async (status) => {
    const code =
      status === 401
        ? "token_invalid"
        : status === 429
          ? "rate_limited"
          : status === 503
            ? "storage_unavailable"
            : status === 422
              ? "validation_failed"
              : "conflict";
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code, message: "server", details: {} } }), {
          status,
          headers: { "Retry-After": "30" },
        }),
    );
    const result = await createBoundUpload(scope.apiUrl, scope)(
      boundRecord,
      "token",
      new AbortController().signal,
      serializeBoundObservation(boundRecord),
    );
    expect(result).toMatchObject({
      kind: status === 401 ? "sign-in" : status >= 500 || status === 429 ? "retry" : "rejected",
      code,
    });
  });
  it("keeps throttled responses retryable even when an intermediary supplies a permanent code", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: { code: "conflict", message: "ignored", details: {} } }),
          { status: 429 },
        ),
    );
    expect(
      (
        await createBoundUpload(scope.apiUrl, scope)(
          boundRecord,
          "token",
          new AbortController().signal,
          serializeBoundObservation(boundRecord),
        )
      ).kind,
    ).toBe("retry");
  });
  it("preserves binding issue codes and explains the retained historical map", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "validation_failed",
              message: "private text",
              details: {
                issues: [
                  {
                    code: "point_outside_zone",
                    zone_ids: [binding.zoneId],
                    message: "private detail",
                  },
                ],
              },
            },
          }),
          { status: 422 },
        ),
    );
    const result = await createBoundUpload(scope.apiUrl, scope)(
      boundRecord,
      "token",
      new AbortController().signal,
      serializeBoundObservation(boundRecord),
    );
    expect(result).toMatchObject({
      kind: "rejected",
      code: "validation_failed",
      issueCodes: ["point_outside_zone"],
    });
    if (result.kind === "accepted") throw new Error("Expected rejection");
    expect(result.message).toContain("Old label");
    expect(result.message).toContain("map v7");
    expect(result.message).not.toContain("private");
  });
  it.each(["html", "network"])("retains an unreadable %s response as retryable", async (kind) => {
    vi.stubGlobal("fetch", async () => {
      if (kind === "network") throw new TypeError("Offline");
      return new Response("<html>Oops</html>", { status: 503 });
    });
    expect(
      (
        await createBoundUpload(scope.apiUrl, scope)(
          boundRecord,
          "token",
          new AbortController().signal,
          serializeBoundObservation(boundRecord),
        )
      ).kind,
    ).toBe("retry");
  });
  it.each([
    "package_id",
    "zone_id",
    "answers",
  ])("refuses a retained body with changed %s before sending", async (field) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const body = JSON.parse(serializeBoundObservation(boundRecord));
    body[field] =
      field === "answers" ? { changed: "tampered" } : "70000000-0000-4000-8000-000000000099";
    expect(
      (
        await createBoundUpload(scope.apiUrl, scope)(
          boundRecord,
          "token",
          new AbortController().signal,
          JSON.stringify(body),
        )
      ).kind,
    ).toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not send an issuer's record through another issuer", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const changed = { ...scope, issuer: "https://different.invalid" };
    expect(
      (
        await createBoundUpload(scope.apiUrl, changed)(
          boundRecord,
          "token",
          new AbortController().signal,
          serializeBoundObservation(boundRecord),
        )
      ).kind,
    ).toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
    expect(owner).toContain(scope.userId);
  });
});
