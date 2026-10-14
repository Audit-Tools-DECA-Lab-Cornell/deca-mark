import { describe, expect, it } from "vitest";
import type { Recovered } from "../../packages/zone-read-models";
import { recoveryCard, redownloadProblem, sizeLabel, startBlock } from "./recovery";

function draft(status: Recovered["status"], overrides: Partial<Recovered> = {}): Recovered {
  return {
    draftId: "d1",
    formVersion: "janet-test-v1",
    pinned: {
      packageId: "p1",
      version: 1,
      siteId: "s1",
      zone: { id: "z1", code: "NM", label: "North meadow" },
    },
    placed: true,
    answered: 3,
    asked: 8,
    status,
    parked: false,
    redownload: { possible: true, bytes: 12 * 1024 * 1024 },
    ...overrides,
  };
}

describe("recoveryCard", () => {
  it("offers a ready draft back on its exact map and zone", () => {
    const card = recoveryCard(draft("ready"), true);
    expect(card.title).toBe("North meadow · map v1");
    expect(card.lines).toEqual(["Point placed, 3 of 8 answered. Kept on this device."]);
    expect(card.actions).toEqual(["resume", "discard"]);
  });

  it("offers to download a missing map again, and says to connect while offline", () => {
    const online = recoveryCard(draft("package_missing"), true);
    expect(online.lines).toEqual([
      "Map v1 is not on this device. Your point and answers are kept.",
    ]);
    expect(online.actions).toEqual(["redownload", "discard", "park"]);
    expect(online.redownloadLabel).toBe("Download map v1 again · 12.0 MB");
    const offline = recoveryCard(draft("package_missing"), false);
    expect(offline.lines).toEqual([
      "Map v1 is not on this device. Your point and answers are kept.",
      "Connect to download map v1 again.",
    ]);
    expect(offline.actions).toEqual(["discard", "park"]);
    expect(offline.redownloadLabel).toBeNull();
    expect(offline.parkLabel).toBe("Keep for later");
  });

  it("tells an observer whose access changed to ask their coordinator", () => {
    const card = recoveryCard(
      draft("package_unavailable", { redownload: { possible: false, bytes: null } }),
      true,
    );
    expect(card.lines[0]).toBe(
      "Map v1 cannot be downloaded with your current access. Your point and answers stay on this device. Ask your coordinator.",
    );
    expect(card.actions).toEqual(["discard", "park"]);
    expect(card.parkLabel).toBe("Keep for your coordinator");
  });

  it("names a missing zone by its code, and keeps it for the coordinator when a download cannot help", () => {
    const verified = draft("zone_missing", { redownload: { possible: false, bytes: null } });
    const card = recoveryCard(verified, true);
    expect(card.lines).toEqual([
      "This observation's zone (NM) is not in map v1 on this device. Your point and answers are kept.",
      "Keep it for your coordinator.",
    ]);
    expect(card.actions).toEqual(["discard", "park"]);
    expect(card.parkLabel).toBe("Keep for your coordinator");
    expect(recoveryCard(draft("zone_missing"), true).actions).toEqual([
      "redownload",
      "discard",
      "park",
    ]);
  });

  it("says when the form is missing, without guessing its name", () => {
    const card = recoveryCard(
      draft("form_missing", { redownload: { possible: false, bytes: null } }),
      true,
    );
    expect(card.lines[0]).toBe(
      "The form for this observation is not in map v1 on this device. Your point and answers are kept.",
    );
  });

  it("never offers to keep for later what is already kept", () => {
    const parked = draft("package_missing", { parked: true });
    expect(recoveryCard(parked, true).actions).toEqual(["redownload", "discard"]);
    expect(recoveryCard(draft("ready", { parked: true }), true).actions).toEqual([
      "resume",
      "discard",
    ]);
  });

  it("sizes downloads in kilobytes and megabytes", () => {
    expect(sizeLabel(10)).toBe("1 KB");
    expect(sizeLabel(640 * 1024)).toBe("640 KB");
    expect(sizeLabel(12.4 * 1024 * 1024)).toBe("12.4 MB");
  });
});

describe("startBlock", () => {
  it("blocks a new visit while a resumable observation holds the active slot, naming where", () => {
    expect(startBlock(draft("ready"), "Riverside", false)).toBe(
      "Resume or discard the unfinished observation at Riverside (map v1).",
    );
  });

  it("allows returning to the observation open here, and never blocks on an unresumable or parked one", () => {
    expect(startBlock(draft("ready"), "Riverside", true)).toBeNull();
    expect(startBlock(draft("package_missing"), "Riverside", false)).toBeNull();
    expect(startBlock(draft("ready", { parked: true }), "Riverside", false)).toBeNull();
    expect(startBlock(null, "Riverside", false)).toBeNull();
  });
});

describe("redownloadProblem", () => {
  const model = draft("package_missing");
  const failure = (state: "failed" | "verify_failed", unavailable = false) => ({
    state,
    packageId: model.pinned.packageId,
    part: 1 as const,
    message: "",
    unavailable,
  });

  it("says why the observation's own map did not come back, and what to do", () => {
    expect(redownloadProblem(model, failure("failed"))).toBe(
      "Map v1 did not finish downloading. Your point and answers are kept. Try again with a connection.",
    );
    expect(redownloadProblem(model, failure("failed", true))).toBe(
      "Map v1 cannot be downloaded with your current access. Your point and answers are kept. Ask your coordinator.",
    );
    expect(redownloadProblem(model, failure("verify_failed"))).toBe(
      "Map v1 could not be checked. Your point and answers are kept. Tell your coordinator.",
    );
  });

  it("says nothing while it downloads, or about another version's download", () => {
    expect(redownloadProblem(model, undefined)).toBeNull();
    expect(
      redownloadProblem(model, {
        state: "downloading",
        packageId: model.pinned.packageId,
        part: 1,
      }),
    ).toBeNull();
    expect(redownloadProblem(model, { ...failure("failed"), packageId: "p2" })).toBeNull();
  });
});
