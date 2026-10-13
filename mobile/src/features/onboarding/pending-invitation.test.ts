import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, string>();
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItemSync: (key: string) => stored.get(key) ?? null,
    setItemSync: (key: string, value: string) => void stored.set(key, value),
    removeItemSync: (key: string) => stored.delete(key),
  },
}));

const {
  afterProfileStep,
  joinCodeFromLink,
  PENDING_INVITATION_MS,
  pendingInvitationMessage,
  pendingInvitationPlace,
  readPendingInvitationValue,
  serializePendingInvitation,
  wholeJoinCode,
} = await import("./pending-invitation");
const {
  forgetInvitation,
  PENDING_INVITATION_KEY,
  readPendingInvitation,
  rememberInvitation,
  takeFreshInvitation,
} = await import("./pending-invitation-store");

// Keep the in-memory store tests within the real-time seven-day expiry window.
const NOW = Date.now();

describe("join codes from links", () => {
  it("reads the code from every form the app is opened with", () => {
    expect(joinCodeFromLink("decamark://join/DECA2026")).toBe("DECA2026");
    expect(joinCodeFromLink("/join/deca-2026")).toBe("DECA2026");
    expect(joinCodeFromLink("join/DECA%202026")).toBe("DECA2026");
    expect(joinCodeFromLink("decamark://join?code=deca2026")).toBe("DECA2026");
    expect(joinCodeFromLink("fieldmaps://join/DECA2026")).toBe("DECA2026");
    expect(joinCodeFromLink("/join?code=DECA2026#top")).toBe("DECA2026");
    expect(joinCodeFromLink("exp://192.168.0.2:8081/--/join/DECA2026")).toBe("DECA2026");
  });

  it("ignores other links and codes that are not whole", () => {
    expect(joinCodeFromLink("decamark://gallery")).toBeNull();
    expect(joinCodeFromLink("/play-study/riverside")).toBeNull();
    expect(joinCodeFromLink("/join/DECA")).toBeNull();
    expect(joinCodeFromLink("/join")).toBeNull();
    expect(joinCodeFromLink("")).toBeNull();
  });

  it("keeps only whole codes", () => {
    expect(wholeJoinCode(" deca 2026 ")).toBe("DECA2026");
    expect(wholeJoinCode("DECA20")).toBeNull();
    expect(wholeJoinCode(undefined)).toBeNull();
  });
});

describe("the stored value", () => {
  it("round-trips a code with the time it arrived", () => {
    const value = serializePendingInvitation("deca-2026", NOW);
    expect(readPendingInvitationValue(value, NOW)).toEqual({ code: "DECA2026", savedAt: NOW });
  });

  it("refuses a code that is not whole", () => {
    expect(serializePendingInvitation("DECA", NOW)).toBeNull();
  });

  it("expires after seven days, and ignores a time far in the future", () => {
    const value = serializePendingInvitation("DECA2026", NOW);
    expect(readPendingInvitationValue(value, NOW + PENDING_INVITATION_MS)).not.toBeNull();
    expect(readPendingInvitationValue(value, NOW + PENDING_INVITATION_MS + 1)).toBeNull();
    const ahead = serializePendingInvitation("DECA2026", NOW + 2 * 24 * 60 * 60 * 1000);
    expect(readPendingInvitationValue(ahead, NOW)).toBeNull();
  });

  it("reads nothing from missing, broken or foreign values", () => {
    expect(readPendingInvitationValue(null, NOW)).toBeNull();
    expect(readPendingInvitationValue("{", NOW)).toBeNull();
    expect(readPendingInvitationValue('"DECA2026"', NOW)).toBeNull();
    expect(readPendingInvitationValue(JSON.stringify({ code: 5, savedAt: NOW }), NOW)).toBeNull();
    expect(
      readPendingInvitationValue(JSON.stringify({ code: "DECA", savedAt: NOW }), NOW),
    ).toBeNull();
  });

  it("cleans a stored code the way the join field does", () => {
    const value = JSON.stringify({ code: "deca-2026", savedAt: NOW });
    expect(readPendingInvitationValue(value, NOW)?.code).toBe("DECA2026");
  });
});

describe("the device store", () => {
  beforeEach(() => {
    forgetInvitation();
    stored.clear();
  });

  it("keeps a link's code durably and forgets it on request", () => {
    expect(rememberInvitation("deca2026", NOW)).toBe(true);
    expect(stored.get(PENDING_INVITATION_KEY)).toContain("DECA2026");
    expect(readPendingInvitation(NOW)?.code).toBe("DECA2026");
    forgetInvitation();
    expect(readPendingInvitation(NOW)).toBeNull();
    expect(stored.has(PENDING_INVITATION_KEY)).toBe(false);
  });

  it("does not keep a partial code", () => {
    expect(rememberInvitation("DECA", NOW)).toBe(false);
    expect(readPendingInvitation(NOW)).toBeNull();
  });

  it("a newer link replaces an older one", () => {
    rememberInvitation("DECA2026", NOW);
    rememberInvitation("PLAY2027", NOW + 1);
    expect(readPendingInvitation(NOW + 1)?.code).toBe("PLAY2027");
  });

  it("forgets a named code only when it is the one waiting", () => {
    rememberInvitation("DECA2026", NOW);
    forgetInvitation("PLAY2027");
    expect(readPendingInvitation(NOW)?.code).toBe("DECA2026");
    forgetInvitation("DECA2026");
    expect(readPendingInvitation(NOW)).toBeNull();
  });

  it("hands a link that arrived while running to Projects once, while it still waits", () => {
    rememberInvitation("DECA2026");
    expect(takeFreshInvitation()).toBe("DECA2026");
    expect(takeFreshInvitation()).toBeNull();
    rememberInvitation("PLAY2027");
    forgetInvitation();
    expect(takeFreshInvitation()).toBeNull();
  });

  it("removes an expired code as it is read", () => {
    rememberInvitation("DECA2026", NOW);
    expect(readPendingInvitation(NOW + PENDING_INVITATION_MS + 1)).toBeNull();
    expect(stored.has(PENDING_INVITATION_KEY)).toBe(false);
  });
});

describe("where a waiting invitation is shown", () => {
  const pending = { code: "DECA2026", savedAt: NOW };

  it("follows the gate", () => {
    expect(pendingInvitationPlace("auth", pending)).toBe("auth");
    expect(pendingInvitationPlace("onboarding", pending)).toBe("onboarding");
    expect(pendingInvitationPlace("app", pending)).toBe("projects");
    expect(pendingInvitationPlace("hold", pending)).toBe("none");
    expect(pendingInvitationPlace("app", null)).toBe("none");
  });

  it("carries the profile step on to the invitation, the link's own code first", () => {
    expect(afterProfileStep("DECA2026", null)).toEqual({
      pathname: "/invitation/[code]",
      code: "DECA2026",
    });
    expect(afterProfileStep("", "PLAY2027")).toEqual({
      pathname: "/invitation/[code]",
      code: "PLAY2027",
    });
    expect(afterProfileStep("DECA2026", "PLAY2027")).toMatchObject({ code: "DECA2026" });
    expect(afterProfileStep("DEC", null)).toEqual({ pathname: "/join" });
    expect(afterProfileStep(undefined, undefined)).toEqual({ pathname: "/join" });
  });

  it("says what is waiting on the auth screens", () => {
    expect(pendingInvitationMessage("DECA2026")).toBe(
      "Invitation DECA2026 is waiting. Sign in or create an account to see it.",
    );
  });
});
