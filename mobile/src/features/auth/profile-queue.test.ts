import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../data/api/errors";
import type { ProfilePatch } from "../../data/api/identity";
import type { ApiResult } from "../../data/api/me-provider";
import type { ProfileEdit, SavedProfiles } from "./profile-store";

// The store and sender also hold their hooks; keep the native modules they reach out of a Node run.
vi.mock("expo-sqlite/kv-store", () => ({
  default: { getItemSync: () => null, setItemSync: () => undefined },
}));
vi.mock("../../auth/provider", () => ({ useAccount: () => ({}) }));
vi.mock("../../data/api/me-provider", () => ({ useMe: () => ({}) }));
vi.mock("../preview/data-source", () => ({ useDataSource: () => ({ mode: "device" }) }));

const { LOCAL_OWNER, pendingEditOf, withEdit, withFinished, withSent } = await import(
  "./profile-store"
);
const { PROFILE_QUEUED, createProfileSender, profilePatch, sendProfileEdit } = await import(
  "./profile-sync"
);

const owner = "50000000-0000-4000-8000-000000000001";

describe("the profile queue on this device", () => {
  it("saves a new name and initials as an edit waiting for the account", () => {
    const saved = withEdit({}, owner, "  Pratyush   Sudhakar ", "PS");
    expect(saved?.[owner]).toEqual({
      name: "Pratyush Sudhakar",
      initials: "PS",
      onboarded: false,
      pending: true,
    });
    expect(pendingEditOf(saved ?? {}, owner)).toEqual({
      name: "Pratyush Sudhakar",
      initials: "PS",
    });
  });

  it("keeps onboarding finished for an edit made in the app, so the gate never reopens it", () => {
    // An account whose profile came from the server has nothing saved here until its first edit.
    const fromAccount = withEdit({}, owner, "Pratyush Sudhakar", "PS", true);
    expect(fromAccount?.[owner]).toMatchObject({ onboarded: true, pending: true });
    // An onboarding edit never finishes onboarding by itself, and never undoes a finished one.
    expect(withEdit({}, owner, "Pratyush Sudhakar", "PS")?.[owner]?.onboarded).toBe(false);
    const finished =
      withFinished(withEdit({}, owner, "Pratyush Sudhakar", "PS") ?? {}, owner) ?? {};
    expect(withEdit(finished, owner, "Pratyush Sudhakar", "PRS")?.[owner]?.onboarded).toBe(true);
  });

  it("refuses an empty name or invalid initials, saving nothing", () => {
    expect(withEdit({}, owner, "  ", "PS")).toBeNull();
    expect(withEdit({}, owner, "Pratyush", "p.s")).toBeNull();
  });

  it("confirms only the edit that was sent", () => {
    const sent = { name: "Pratyush Sudhakar", initials: "PS" };
    const saved = withEdit({}, owner, sent.name, sent.initials) ?? {};
    expect(withSent(saved, owner, sent)[owner]?.pending).toBe(false);
    // A newer edit saved while the first was on its way stays queued and goes next.
    const newer = withEdit(saved, owner, "Pratyush Sudhakar", "PRS") ?? {};
    expect(withSent(newer, owner, sent)).toBe(newer);
    expect(pendingEditOf(newer, owner)).toEqual({ name: "Pratyush Sudhakar", initials: "PRS" });
  });

  it("does not queue the same values again once the account has them", () => {
    const sent = { name: "Pratyush Sudhakar", initials: "PS" };
    const confirmed = withSent(withEdit({}, owner, sent.name, sent.initials) ?? {}, owner, sent);
    expect(withEdit(confirmed, owner, sent.name, sent.initials)?.[owner]?.pending).toBe(false);
    expect(withEdit(confirmed, owner, "Pratyush Sudhakar", "PRS")?.[owner]?.pending).toBe(true);
  });

  it("keeps onboarding progress through edits and confirmations", () => {
    const saved = withEdit({}, owner, "Pratyush Sudhakar", "PS") ?? {};
    const finished = withFinished(saved, owner) ?? {};
    expect(finished[owner]).toMatchObject({ onboarded: true, pending: true });
    expect(withEdit(finished, owner, "Pratyush Sudhakar", "PRS")?.[owner]?.onboarded).toBe(true);
    expect(withFinished({}, owner)).toBeNull();
  });

  it("never queues the profile kept without an account, which has nowhere to go", () => {
    const saved = withEdit({}, LOCAL_OWNER, "Pratyush Sudhakar", "PS") ?? {};
    expect(saved[LOCAL_OWNER]?.pending).toBe(false);
    expect(pendingEditOf(saved, LOCAL_OWNER)).toBeNull();
  });

  it("keeps other accounts' profiles apart", () => {
    const other = "50000000-0000-4000-8000-000000000002";
    const saved = withEdit(withEdit({}, other, "Alex Rivera", "AR") ?? {}, owner, "Pratyush", "PS");
    expect(saved?.[other]?.initials).toBe("AR");
    expect(pendingEditOf(saved ?? {}, other)).toEqual({ name: "Alex Rivera", initials: "AR" });
  });
});

describe("sending the profile to the account", () => {
  const edit = { name: "Pratyush Sudhakar", initials: "PS" };

  it("patches the display name and observer initials", () => {
    expect(profilePatch(edit)).toEqual({
      display_name: "Pratyush Sudhakar",
      observer_initials: "PS",
    });
  });

  it("confirms the edit when the server saves it", async () => {
    const update = vi.fn(async () => ({ ok: true }) as const);
    const confirm = vi.fn();
    await expect(sendProfileEdit(edit, update, confirm)).resolves.toBe("sent");
    expect(update).toHaveBeenCalledWith({
      display_name: "Pratyush Sudhakar",
      observer_initials: "PS",
    });
    expect(confirm).toHaveBeenCalledWith(edit);
  });

  it.each([
    ["offline", new ApiError("unknown", "retry")],
    ["without a session", new ApiError("unauthenticated", "sign-in")],
    ["when the server is down", new ApiError("storage_unavailable", "retry")],
  ])("keeps the edit queued %s", async (_case, error) => {
    const confirm = vi.fn();
    await expect(sendProfileEdit(edit, async () => ({ ok: false, error }), confirm)).resolves.toBe(
      "queued",
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("hands a deleted account to the gate", async () => {
    const error = new ApiError("account_deleted", "rejected");
    await expect(sendProfileEdit(edit, async () => ({ ok: false, error }), vi.fn())).resolves.toBe(
      "deleted",
    );
  });

  it("sends nothing when nothing is waiting", async () => {
    const update = vi.fn();
    await expect(sendProfileEdit(null, update, vi.fn())).resolves.toBe("nothing");
    expect(update).not.toHaveBeenCalled();
  });

  it("says plainly where a queued edit is", () => {
    expect(PROFILE_QUEUED).toBe(
      "Saved on this phone. It reaches your account when you are online.",
    );
  });
});

describe("sending one account's edits in order", () => {
  const first = { name: "Pratyush Sudhakar", initials: "PS" };
  const second = { name: "Pratyush Sudhakar", initials: "PRS" };
  const third = { name: "Pratyush R Sudhakar", initials: "PRS" };
  const saved = { ok: true } as const;
  const offline: ApiResult = { ok: false, error: new ApiError("unknown", "retry") };

  /** Lets every promise that can move on do so. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /**
   * A device store, a server that answers each request only when the test says so, and the sender
   * between them, wired the way the hook wires them.
   */
  function harness() {
    let device: SavedProfiles = {};
    const server: Record<string, ProfilePatch> = {};
    const requests: { owner: string; patch: ProfilePatch; answer: (result: ApiResult) => void }[] =
      [];
    const sender = createProfileSender((who) => pendingEditOf(device, who));
    const sendFor = (who: string) => (edit: ProfileEdit) =>
      sendProfileEdit(
        edit,
        (patch) =>
          new Promise<ApiResult>((resolve) => {
            requests.push({
              owner: who,
              patch,
              answer: (result) => {
                if (result.ok) server[who] = patch;
                resolve(result);
              },
            });
          }),
        (sent) => {
          device = withSent(device, who, sent);
        },
      );
    return {
      requests,
      server,
      save(edit: ProfileEdit, who = owner) {
        device = withEdit(device, who, edit.name, edit.initials) ?? device;
      },
      flush: (who = owner) => sender(who, sendFor(who)),
      profile: (who = owner) => device[who],
      pending: (who = owner) => pendingEditOf(device, who),
    };
  }

  it("sends a newer edit after the one on its way, so the account ends with the newer one", async () => {
    const queue = harness();
    queue.save(first);
    const sendingFirst = queue.flush();
    expect(queue.requests.map((r) => r.patch)).toEqual([profilePatch(first)]);

    queue.save(second);
    const sendingSecond = queue.flush();
    await settle();
    // The newer edit waits: only one request for this account is on its way.
    expect(queue.requests).toHaveLength(1);

    queue.requests[0]?.answer(saved);
    await expect(sendingFirst).resolves.toBe("sent");
    await settle();
    expect(queue.requests.map((r) => r.patch)).toEqual([profilePatch(first), profilePatch(second)]);
    expect(queue.pending()).toEqual(second);

    queue.requests[1]?.answer(saved);
    await expect(sendingSecond).resolves.toBe("sent");
    expect(queue.server[owner]).toEqual(profilePatch(second));
    expect(queue.pending()).toBeNull();
  });

  it("still sends the newer edit when the one on its way fails", async () => {
    const queue = harness();
    queue.save(first);
    const sendingFirst = queue.flush();
    queue.save(second);
    const sendingSecond = queue.flush();

    queue.requests[0]?.answer(offline);
    await expect(sendingFirst).resolves.toBe("queued");
    await settle();
    expect(queue.requests[1]?.patch).toEqual(profilePatch(second));

    queue.requests[1]?.answer(saved);
    await expect(sendingSecond).resolves.toBe("sent");
    expect(queue.requests).toHaveLength(2);
    expect(queue.server[owner]).toEqual(profilePatch(second));
    expect(queue.pending()).toBeNull();
  });

  it("still sends the newer edit when the one on its way throws", async () => {
    let pending: ProfileEdit | null = first;
    const sender = createProfileSender(() => pending);
    const sent: ProfileEdit[] = [];
    const failing = sender(owner, async () => {
      throw new Error("lost");
    });
    pending = second;
    const sendingSecond = sender(owner, async (edit) => {
      sent.push(edit);
      pending = null;
      return "sent";
    });
    await expect(failing).rejects.toThrow("lost");
    await expect(sendingSecond).resolves.toBe("sent");
    expect(sent).toEqual([second]);
  });

  it("sends the same edit once, however often it is flushed", async () => {
    const queue = harness();
    queue.save(first);
    const one = queue.flush();
    const two = queue.flush();
    expect(two).toBe(one);
    expect(queue.requests).toHaveLength(1);

    queue.requests[0]?.answer(saved);
    await expect(Promise.all([one, two])).resolves.toEqual(["sent", "sent"]);
    await expect(queue.flush()).resolves.toBe("nothing");
    expect(queue.requests).toHaveLength(1);
  });

  it("never lets confirming an older edit clear or change a newer one", async () => {
    const queue = harness();
    queue.save(first);
    const sendingFirst = queue.flush();
    queue.save(second);

    queue.requests[0]?.answer(saved);
    await expect(sendingFirst).resolves.toBe("sent");
    expect(queue.profile()).toMatchObject({ ...second, pending: true });
    expect(queue.pending()).toEqual(second);
  });

  it("sends only the latest of several edits saved while one is on its way", async () => {
    const queue = harness();
    queue.save(first);
    queue.flush();
    queue.save(second);
    const afterSecond = queue.flush();
    queue.save(third);
    const afterThird = queue.flush();
    expect(afterThird).toBe(afterSecond);

    queue.requests[0]?.answer(saved);
    await settle();
    expect(queue.requests.map((r) => r.patch)).toEqual([profilePatch(first), profilePatch(third)]);
    queue.requests[1]?.answer(saved);
    await expect(Promise.all([afterSecond, afterThird])).resolves.toEqual(["sent", "sent"]);
    expect(queue.server[owner]).toEqual(profilePatch(third));
    expect(queue.pending()).toBeNull();
  });

  it("sends nothing more when the edit on its way is saved again before it lands", async () => {
    const queue = harness();
    queue.save(first);
    const sendingFirst = queue.flush();
    queue.save(second);
    const afterSecond = queue.flush();
    // Back to what is already on its way: that send now carries the latest edit.
    queue.save(first);
    expect(queue.flush()).toBe(sendingFirst);

    queue.requests[0]?.answer(saved);
    await expect(afterSecond).resolves.toBe("nothing");
    expect(queue.requests).toHaveLength(1);
    expect(queue.server[owner]).toEqual(profilePatch(first));
    expect(queue.pending()).toBeNull();
  });

  it("sends nothing more to an account the server reported deleted", async () => {
    const queue = harness();
    queue.save(first);
    queue.flush();
    queue.save(second);
    const afterSecond = queue.flush();

    queue.requests[0]?.answer({ ok: false, error: new ApiError("account_deleted", "rejected") });
    await expect(afterSecond).resolves.toBe("deleted");
    expect(queue.requests).toHaveLength(1);
  });

  it("does not hold one account's edit behind another's", () => {
    const other = "50000000-0000-4000-8000-000000000002";
    const queue = harness();
    queue.save(first);
    queue.flush();
    queue.save(second, other);
    queue.flush(other);
    expect(queue.requests.map((r) => r.owner)).toEqual([owner, other]);
  });

  it("sends nothing when nothing is waiting", async () => {
    const queue = harness();
    await expect(queue.flush()).resolves.toBe("nothing");
    expect(queue.requests).toHaveLength(0);
  });
});
