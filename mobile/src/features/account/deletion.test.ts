import { describe, expect, it } from "vitest";
import type { AccountDeletion } from "../../data/api/client";
import { ApiError } from "../../data/api/errors";
import { DELETION_RETRY_DELAYS_MS, finishingLine, runAccountDeletion } from "./deletion";

const A = "50000000-0000-4000-8000-00000000000a";
const B = "50000000-0000-4000-8000-00000000000b";

/** A run whose server answers in order and whose signed-in account can change between tries. */
function harness(answers: (AccountDeletion | Error)[], signedIn: (string | null)[] = [A]) {
  const log: string[] = [];
  let checks = 0;
  return {
    log,
    run: () =>
      runAccountDeletion({
        confirmedFor: A,
        signedInAs: () => signedIn[Math.min(checks++, signedIn.length - 1)] ?? null,
        send: async () => {
          const answer = answers.shift();
          log.push(`DELETE ${answer instanceof Error ? "error" : answer}`);
          if (answer instanceof Error) throw answer;
          if (answer === undefined) throw new Error("no more answers");
          return answer;
        },
        wait: async (ms) => {
          log.push(`wait ${ms}`);
        },
        onPending: (next) => {
          log.push(`pending ${next}`);
        },
      }),
  };
}

describe("delete account (MOB-07)", () => {
  it("is done at once on 204", async () => {
    const { run, log } = harness(["deleted"]);
    expect(await run()).toEqual({ kind: "deleted" });
    expect(log).toEqual(["DELETE deleted"]);
  });

  it("tries a 202 again after 5, 10 and 15 seconds, then counts it as recorded", async () => {
    const { run, log } = harness(["pending", "pending", "pending", "pending"]);
    expect(await run()).toEqual({ kind: "recorded", stopped: "exhausted" });
    expect(log).toEqual([
      "DELETE pending",
      "pending 1",
      "wait 5000",
      "DELETE pending",
      "pending 2",
      "wait 10000",
      "DELETE pending",
      "pending 3",
      "wait 15000",
      "DELETE pending",
      "pending null",
    ]);
    expect(DELETION_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0)).toBe(30_000);
  });

  it("stops at a 204 that follows a 202", async () => {
    const { run } = harness(["pending", "deleted"]);
    expect(await run()).toEqual({ kind: "deleted" });
  });

  it("sends nothing when another account is signed in on this phone", async () => {
    const { run, log } = harness(["deleted"], [B]);
    expect(await run()).toEqual({ kind: "otherAccount" });
    expect(log).toEqual([]);
  });

  it("stops retrying, recorded, once another account signs in between tries", async () => {
    const { run, log } = harness(["pending", "deleted"], [A, B]);
    expect(await run()).toEqual({ kind: "recorded", stopped: "otherAccount" });
    expect(log.filter((line) => line.startsWith("DELETE"))).toEqual(["DELETE pending"]);
  });

  it("stops retrying, recorded, once the session is gone", async () => {
    const { run } = harness(["pending", "deleted"], [A, null]);
    expect(await run()).toEqual({ kind: "recorded", stopped: "signedOut" });
  });

  it("asks to sign in again when there is no session to send the first request", async () => {
    const outcome = await harness(["deleted"], [null]).run();
    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.error.code).toBe("unauthenticated");
  });

  it("says deletion is not available when the server is not set up for it", async () => {
    expect(await harness(["unavailable"]).run()).toEqual({ kind: "unavailable" });
  });

  it("names the sole owner refusal, and any other first failure, as nothing deleted", async () => {
    expect(await harness([new ApiError("sole_owner", "rejected", null, 409)]).run()).toEqual({
      kind: "soleOwner",
    });
    const offline = await harness([new TypeError("Network request failed")]).run();
    expect(offline.kind === "failed" && offline.error.code).toBe("unknown");
  });

  it("counts a failure after a 202 as recorded, never as nothing deleted", async () => {
    const outcome = await harness([
      "pending",
      new ApiError("account_deleted", "sign-in", null, 403),
    ]).run();
    expect(outcome).toEqual({ kind: "recorded", stopped: "failed" });
  });

  it("says each retry in the web's words", () => {
    expect(finishingLine(2)).toBe(
      "Removing your sign-in did not finish yet, so DECA Mark is trying again (2 of 3).",
    );
    expect(finishingLine(null)).toContain("the person who runs DECA Mark will complete it");
  });
});
