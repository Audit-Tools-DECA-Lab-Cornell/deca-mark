import { beforeEach, describe, expect, it, vi } from "vitest";
import DeleteAccountScreen from "../../../app/(app)/(tabs)/account/delete-account";
import AccountScreen from "../../../app/(app)/(tabs)/account/index";
import SignOutScreen from "../../../app/(app)/(tabs)/account/sign-out";
import { takeAlerts, takeAnnouncements, takeNavigation } from "../../ui/native.fixture";
import { isDisabled, render } from "../../ui/screen.fixture";

vi.mock("react-native", async () => (await import("../../ui/native.fixture")).reactNative);
vi.mock(
  "react-native-reanimated",
  async () => (await import("../../ui/native.fixture")).reanimated,
);
vi.mock("expo-sqlite/kv-store", async () => (await import("../../ui/native.fixture")).kvStore);
vi.mock("expo-haptics", async () => (await import("../../ui/native.fixture")).haptics);
vi.mock("../../ui/Icon", async () => (await import("../../ui/native.fixture")).icon);
vi.mock("../../ui/fonts", async () => (await import("../../ui/native.fixture")).fonts);
vi.mock("react-native-svg", async () => (await import("../../ui/native.fixture")).svg);
vi.mock(
  "react-native-safe-area-context",
  async () => (await import("../../ui/native.fixture")).safeArea,
);
vi.mock("expo-status-bar", async () => (await import("../../ui/native.fixture")).statusBar);
vi.mock("expo-router", async () => (await import("../../ui/native.fixture")).router);

const A = "50000000-0000-4000-8000-00000000000a";
const B = "50000000-0000-4000-8000-00000000000b";

/** The account on this phone, its live session, and what the server answers to DELETE /v1/me. */
const state = vi.hoisted(() => ({
  sessionUser: "" as string | null,
  calls: [] as string[],
  answer: "deleted" as "deleted" | "pending" | "unavailable",
  signOutError: null as Error | null,
  work: { unsent: 0, held: 0, attention: 0, drafts: 0, onDevice: 0, uploaded: 0, loading: false },
  summaries: [] as unknown[],
}));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    account: { id: A, email: "observer@fieldmaps.test" },
    session: state.sessionUser ? { user: { id: state.sessionUser } } : null,
    client: { auth: { getSession: async () => ({ data: { session: null } }) } },
    recovery: null,
    markAccountDeleted: () => {
      state.calls.push("markAccountDeleted");
    },
    signOut: async () => {
      state.calls.push("signOut");
      return { error: state.signOutError };
    },
  }),
}));
vi.mock("../../data/api/client", () => ({
  createApiClient: () => ({
    deleteMe: async () => {
      state.calls.push("DELETE /v1/me");
      return state.answer;
    },
  }),
}));
vi.mock("../../platform/config", () => ({
  connection: { apiUrl: "http://127.0.0.1:8001", supabaseUrl: "http://127.0.0.1:54321" },
}));
vi.mock("../../sync/config", () => ({
  connection: { apiUrl: "http://127.0.0.1:8001", supabaseUrl: "http://127.0.0.1:54321" },
}));
vi.mock("../../auth/account-summaries", () => ({
  writeAccountSummary: (summary: unknown) => {
    state.summaries.push(summary);
    return true;
  },
  removeAccountSummary: () => {
    state.summaries.pop();
  },
}));
vi.mock("../../data/api/me-provider", () => ({
  useMe: () => ({
    projects: [{ project_id: "p1" }, { project_id: "p2" }],
    profile: { display_name: "Mobile Observer", observer_initials: "MO" },
  }),
}));
vi.mock("../auth/profile-store", () => ({
  useProfile: () => ({ saved: true, name: "Mobile Observer", initials: "MO", pending: false }),
}));
vi.mock("./use-local-work", () => ({ useLocalWork: () => state.work }));
vi.mock("../auth/ResumeUploadsNote", () => ({ ResumeUploadsNote: () => null }));
vi.mock("../onboarding/components", () => ({ ProfileQueuedLine: () => null }));
vi.mock("../../layout/orientation", () => ({ useOrientationChoice: () => ["device", () => null] }));
// The heading block only; the real module reads the preview data source.
vi.mock("../projects/parts", async () => {
  const { createElement, Fragment } = await import("react");
  const { Text } = await import("../../ui/Text");
  return {
    AccountMark: () => null,
    PageIntro: ({ title, lead }: { title: string; lead?: unknown }) =>
      createElement(
        Fragment,
        null,
        createElement(Text, null, title),
        typeof lead === "string" ? createElement(Text, null, lead) : null,
      ),
  };
});

beforeEach(() => {
  state.sessionUser = A;
  state.calls = [];
  state.answer = "deleted";
  state.signOutError = null;
  state.work = {
    unsent: 0,
    held: 0,
    attention: 0,
    drafts: 0,
    onDevice: 0,
    uploaded: 0,
    loading: false,
  };
  state.summaries = [];
  takeAlerts();
  takeAnnouncements();
  takeNavigation();
});

describe("Account (MOB-07)", () => {
  it("shows the profile and what is on this device, and claims no upload", () => {
    state.work = { ...state.work, unsent: 3, onDevice: 2, held: 1, uploaded: 4, drafts: 1 };
    const screen = render(<AccountScreen />);
    expect(screen.says("observer@fieldmaps.test")).toBe(true);
    expect(screen.says("MO")).toBe(true);
    expect(screen.says("This version does not upload yet.")).toBe(true);
    expect(screen.controls()).not.toContain("Upload now");
    expect(screen.controls()).toContain("Sign out");
    expect(screen.controls()).toContain("Review account deletion");
  });
});

describe("Sign out? (MOB-07)", () => {
  it("names the work that waits, keeps it for this account, and writes welcome's note first", async () => {
    state.work = { ...state.work, unsent: 5, onDevice: 5 };
    const screen = render(<SignOutScreen />);
    expect(screen.says("Your unsent work needs a clear owner.")).toBe(true);
    expect(screen.says("5 observations have not been uploaded.")).toBe(true);
    expect(
      screen.says(
        "They remain on this device for observer@fieldmaps.test. Another account cannot upload them.",
      ),
    ).toBe(true);
    await screen.press("Sign out and keep local records");
    expect(state.calls).toEqual(["signOut"]);
    expect(state.summaries).toMatchObject([
      { userId: A, email: "observer@fieldmaps.test", unsent: 5, drafts: 0 },
    ]);
  });

  it("writes no note when nothing waits, and says so", async () => {
    const screen = render(<SignOutScreen />);
    expect(screen.says("Nothing is waiting on this device for observer@fieldmaps.test.")).toBe(
      true,
    );
    await screen.press("Sign out of this device");
    expect(state.summaries).toEqual([]);
  });

  it("says the person is still signed in when signing out did not finish, and drops the note", async () => {
    state.work = { ...state.work, unsent: 1 };
    state.signOutError = new Error("storage");
    const screen = render(<SignOutScreen />);
    await screen.press("Sign out and keep local records");
    expect(screen.says("You are still signed in.")).toBe(true);
    expect(state.summaries).toEqual([]);
  });
});

describe("Delete account (MOB-07)", () => {
  async function typeAndDelete(screen: ReturnType<typeof render>) {
    await screen.type("account-delete-typed", "DELETE");
    await screen.press("Delete account");
  }

  it("lists the consequences, and stays off until DELETE is typed", async () => {
    const screen = render(<DeleteAccountScreen />);
    expect(screen.says("Your profile and your memberships in 2 projects are removed.")).toBe(true);
    expect(screen.says("under observer code MO")).toBe(true);
    expect(isDisabled(screen.control("Delete account"))).toBe(true);
    await screen.type("account-delete-typed", "DELETE");
    expect(isDisabled(screen.control("Delete account"))).toBe(false);
  });

  it("deletes the account that confirmed, then treats it as deleted on this device", async () => {
    const screen = render(<DeleteAccountScreen />);
    await typeAndDelete(screen);
    expect(state.calls).toEqual(["DELETE /v1/me", "markAccountDeleted"]);
    expect(takeAnnouncements()).toContain(
      "Account deleted. Its records stay on this device and cannot upload.",
    );
  });

  it("sends nothing while another account is signed in on this phone", async () => {
    state.sessionUser = B;
    const screen = render(<DeleteAccountScreen />);
    await typeAndDelete(screen);
    expect(state.calls).toEqual([]);
    expect(screen.says("A different account is signed in on this phone now.")).toBe(true);
  });

  it("says deletion is not available when the server is not set up for it", async () => {
    state.answer = "unavailable";
    const screen = render(<DeleteAccountScreen />);
    await typeAndDelete(screen);
    expect(state.calls).toEqual(["DELETE /v1/me"]);
    expect(screen.says("Deleting accounts is not available yet. Nothing was deleted.")).toBe(true);
  });

  it("asks first when records have not been uploaded, naming them", async () => {
    state.work = { ...state.work, unsent: 3, onDevice: 3 };
    const screen = render(<DeleteAccountScreen />);
    expect(
      screen.says(
        "3 observations have not been uploaded. They stay on this device and can never upload.",
      ),
    ).toBe(true);
    await typeAndDelete(screen);
    expect(state.calls).toEqual([]);
    const [alert] = takeAlerts();
    expect(alert?.title).toBe("Delete with 3 records not uploaded?");
    expect(alert?.buttons?.map((button) => button.text)).toEqual([
      "Keep my account",
      "Delete account",
    ]);
  });
});
