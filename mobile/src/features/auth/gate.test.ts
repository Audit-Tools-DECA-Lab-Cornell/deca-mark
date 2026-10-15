import { describe, expect, it, vi } from "vitest";

// The gate module also holds its hook; keep the native modules it reaches out of a Node test run.
vi.mock("expo-sqlite/kv-store", () => ({
  default: { getItemSync: () => null, setItemSync: () => undefined },
}));
vi.mock("../../auth/provider", () => ({ useAccount: () => ({}) }));
vi.mock("../../data/api/me-provider", () => ({ useMe: () => ({}) }));
vi.mock("../preview/data-source", () => ({ PREVIEW_ALLOWED: true }));

const { decideGate } = await import("./gate");

const signedOutDevice = {
  session: false,
  cachedAccount: false,
  accountDeleted: false,
  meReady: true,
  serverInitials: false,
  localProfile: "none",
} as const;

/** An account signed in on this device, before anything is known about its profile. */
const signedIn = { ...signedOutDevice, session: true, cachedAccount: true } as const;

describe("decideGate", () => {
  it("sends a device with no session and no cached account to sign-in", () => {
    expect(decideGate(signedOutDevice)).toEqual({
      signedIn: false,
      needsOnboarding: false,
      accountDeleted: false,
      authOpen: true,
      route: "auth",
      overridden: false,
    });
  });

  // MOB-03 Done when: records queued by an account that signed out (deliberately) do not open the app.
  // The gate reads the account only; welcome names those records and they wait for their own account.
  it("sends a device with another account's queued records, but no session or cached account, to sign-in", () => {
    const queuedForA = { ...signedOutDevice, localProfile: "complete" as const };
    expect(decideGate(queuedForA)).toMatchObject({
      signedIn: false,
      route: "auth",
      authOpen: true,
    });
  });

  it("keeps a cached account signed in offline, after its token expired", () => {
    expect(
      decideGate({ ...signedOutDevice, cachedAccount: true, localProfile: "complete" }),
    ).toMatchObject({ signedIn: true, route: "app" });
  });

  it("opens the app for a cached account without a session, with sign-in open over it", () => {
    expect(
      decideGate({ ...signedOutDevice, cachedAccount: true, serverInitials: true }),
    ).toMatchObject({ signedIn: true, route: "app", authOpen: true });
  });

  it("closes sign-in while a session is live", () => {
    expect(decideGate({ ...signedIn, serverInitials: true }).authOpen).toBe(false);
    expect(decideGate(signedIn).authOpen).toBe(false);
  });

  it("sends a session with no profile on the server or this device to onboarding", () => {
    expect(decideGate(signedIn)).toMatchObject({
      signedIn: true,
      needsOnboarding: true,
      route: "onboarding",
    });
  });

  it("opens the app when the server profile has initials, with nothing saved on this device", () => {
    expect(decideGate({ ...signedIn, serverInitials: true })).toMatchObject({
      signedIn: true,
      needsOnboarding: false,
      route: "app",
    });
  });

  it("opens the app for a profile finished on this device, even before the server has it", () => {
    expect(decideGate({ ...signedIn, localProfile: "complete" })).toMatchObject({
      needsOnboarding: false,
      route: "app",
    });
  });

  it("keeps onboarding open for a profile started here once the server has its initials", () => {
    // The identity step saved and sent the initials; the join step is still ahead.
    expect(
      decideGate({ ...signedIn, serverInitials: true, localProfile: "started" }),
    ).toMatchObject({ needsOnboarding: true, route: "onboarding" });
  });

  it("holds the splash while /v1/me is unknown and nothing is saved here", () => {
    expect(decideGate({ ...signedIn, meReady: false })).toMatchObject({
      signedIn: true,
      needsOnboarding: false,
      route: "hold",
    });
  });

  it("does not hold for a profile this device already has", () => {
    expect(decideGate({ ...signedIn, meReady: false, localProfile: "complete" }).route).toBe("app");
    expect(decideGate({ ...signedIn, meReady: false, localProfile: "started" }).route).toBe(
      "onboarding",
    );
  });

  it.each([
    ["with a lingering session", { ...signedIn, localProfile: "complete" as const }],
    ["after a restart, from the cached account", { ...signedOutDevice, cachedAccount: true }],
    ["while /v1/me is unknown", { ...signedIn, meReady: false }],
  ])("sends a deleted account to welcome %s", (_case, input) => {
    expect(decideGate({ ...input, accountDeleted: true })).toEqual({
      signedIn: false,
      needsOnboarding: false,
      accountDeleted: true,
      authOpen: true,
      route: "auth",
      overridden: false,
    });
  });

  it.each([
    ["signed-out", "auth", false, true],
    ["deleted", "auth", true, true],
    ["onboarding", "onboarding", false, false],
    ["signed-in", "app", false, false],
  ] as const)("lets the %s override win when overrides are allowed", (override, route, deleted, authOpen) => {
    const real = { ...signedIn, localProfile: "complete" as const };
    expect(decideGate({ ...real, override, overrideAllowed: true })).toMatchObject({
      route,
      accountDeleted: deleted,
      authOpen,
      overridden: true,
    });
  });

  it("ignores an override in a release build", () => {
    expect(
      decideGate({ ...signedOutDevice, override: "signed-in", overrideAllowed: false }),
    ).toMatchObject({ route: "auth", overridden: false });
  });

  it("follows the account when the override is real", () => {
    expect(decideGate({ ...signedIn, override: "real", overrideAllowed: true })).toMatchObject({
      route: "onboarding",
      overridden: false,
    });
  });
});
