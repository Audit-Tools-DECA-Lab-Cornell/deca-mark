import { expect, it, vi } from "vitest";
import {
  allowedSession,
  deletionStillApplies,
  isAccountDeleted,
  persistDeletedSignOut,
  persistDeliberateSignOut,
  restoreAccount,
} from "./deleted-session";

const account = { id: "50000000-0000-4000-8000-000000000001" };
it("restores a deletion guard even when SecureStore still contains the deleted session", () => {
  const restored = restoreAccount(account, account);
  const lingering = { user: account, access_token: "stale-token" };
  expect(restored.account).toEqual(account);
  expect(allowedSession(lingering, restored.deletedUserId)).toBeNull();
  expect(allowedSession(null, restored.deletedUserId)).toBeNull();
  expect(restored.deletedUserId).toBe(account.id);
  expect(allowedSession({ user: { id: "other-account" } }, restored.deletedUserId)).not.toBeNull();
});
it("still attempts local sign-out when retaining the marker fails", async () => {
  const order: string[] = [];
  const pause = () => {
    order.push("paused");
  };
  const signOut = vi.fn(async () => {
    order.push("signed-out");
    return { error: null };
  });
  const error = await persistDeletedSignOut(
    account,
    pause,
    () => {
      order.push("write-failed");
      throw new Error("Disk full");
    },
    signOut,
  );
  expect(signOut).toHaveBeenCalledOnce();
  expect(order).toEqual(["paused", "write-failed", "signed-out"]);
  expect(error).toContain("offline recovery");
});
it.each(["returns", "throws"])("handles sign-out failure when it %s", async (mode) => {
  const retain = vi.fn();
  const error = await persistDeletedSignOut(
    account,
    () => {},
    retain,
    async () => {
      if (mode === "throws") throw new Error("Offline");
      return { error: new Error("Offline") };
    },
  );
  expect(retain).toHaveBeenCalledWith(account);
  expect(error).toContain("Uploads remain paused");
});
it("reads the account as deleted after a restart, from the retained marker alone", () => {
  // The deleted session was signed out, so only the marker remembers the account.
  const restored = restoreAccount(null, account);
  expect(restored.account).toEqual(account);
  expect(isAccountDeleted(restored.deletedUserId, restored.account)).toBe(true);
  // Another account signed in on this device is not the deleted one.
  expect(isAccountDeleted(restored.deletedUserId, { id: "other-account" })).toBe(false);
  expect(isAccountDeleted(null, account)).toBe(false);
  expect(isAccountDeleted(account.id, null)).toBe(false);
});

it("restores identity on a rejected deliberate sign-out before local sign-out", async () => {
  const restored = vi.fn();
  const remove = vi.fn();
  await expect(
    persistDeliberateSignOut(
      account,
      remove,
      restored,
      () => true,
      () => false,
      async () => {
        throw new Error("Network failure");
      },
    ),
  ).rejects.toThrow("Network failure");
  expect(remove).toHaveBeenCalledOnce();
  expect(restored).toHaveBeenCalledWith(account);
});
it.each([
  false,
  true,
])("does not resurrect an identity when local sign-out completed (rejection=%s)", async (reject) => {
  const restored = vi.fn();
  const promise = persistDeliberateSignOut(
    account,
    vi.fn(),
    restored,
    () => true,
    () => true,
    async () => {
      if (reject) throw new Error("Network failure");
      return { error: new Error("Network failure") };
    },
  );
  if (reject) await expect(promise).rejects.toThrow("Network failure");
  else expect((await promise).error).toBeInstanceOf(Error);
  expect(restored).not.toHaveBeenCalled();
});
it("restores returned-error failures only while the original account remains current", async () => {
  const restored = vi.fn();
  const signOut = async () => ({ error: new Error("Network failure") });
  await persistDeliberateSignOut(
    account,
    vi.fn(),
    restored,
    () => true,
    () => false,
    signOut,
  );
  expect(restored).toHaveBeenCalledWith(account);
  restored.mockClear();
  await persistDeliberateSignOut(
    account,
    vi.fn(),
    restored,
    () => false,
    () => false,
    signOut,
  );
  expect(restored).not.toHaveBeenCalled();
});
it("successful deliberate sign-out never restores the cached identity", async () => {
  const restored = vi.fn();
  await persistDeliberateSignOut(
    account,
    vi.fn(),
    restored,
    () => true,
    () => true,
    async () => ({ error: null }),
  );
  expect(restored).not.toHaveBeenCalled();
});

it("marks an account deleted only while it is still the account on this device", () => {
  const a = account.id;
  const b = "50000000-0000-4000-8000-000000000002";
  expect(deletionStillApplies(a, a, a)).toBe(true);
  // The phone moved to another account, or signed out, while the deletion finished.
  expect(deletionStillApplies(a, a, b)).toBe(false);
  expect(deletionStillApplies(a, a, null)).toBe(false);
  // A callback captured for one account is never used for another.
  expect(deletionStillApplies(a, b, b)).toBe(false);
});
