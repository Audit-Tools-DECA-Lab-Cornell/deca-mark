import { act } from "react-test-renderer";
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
  syncError: "",
  /** What the device says about the network: null until it has said. */
  online: null as boolean | null,
  /** What uploading does to the counts, when a test wants them to move. */
  afterRetry: null as (() => void) | null,
  work: {
    unsent: 0,
    held: 0,
    practice: 0,
    attention: 0,
    drafts: 0,
    onDevice: 0,
    uploaded: 0,
    loading: false,
    error: null as string | null,
    retry: () => {},
  },
  summaries: [] as unknown[],
}));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    account: { id: A, email: "observer@fieldmaps.test" },
    session: state.sessionUser ? { user: { id: state.sessionUser } } : null,
    client: { auth: { getSession: async () => ({ data: { session: null } }) } },
    recovery: null,
    markAccountDeleted: (expectedUserId?: string) => {
      state.calls.push(`markAccountDeleted ${expectedUserId}`);
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
vi.mock("../../sync/provider", () => ({
  useSync: () => ({
    error: state.syncError,
    wake: () => {
      state.calls.push("wake");
    },
    retry: async () => {
      state.calls.push("retry");
      state.afterRetry?.();
    },
  }),
}));
vi.mock("../../ui/OnlineIndicator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/OnlineIndicator")>()),
  useOnline: () => state.online,
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
  state.syncError = "";
  state.afterRetry = null;
  state.online = null;
  state.work = {
    unsent: 0,
    held: 0,
    practice: 0,
    attention: 0,
    drafts: 0,
    onDevice: 0,
    uploaded: 0,
    loading: false,
    error: null,
    retry: () => {
      state.calls.push("retry");
    },
  };
  state.summaries = [];
  takeAlerts();
  takeAnnouncements();
  takeNavigation();
});

describe("Account (MOB-07)", () => {
  it("shows the profile and what is on this device, and no longer says uploading is missing", () => {
    state.work = { ...state.work, unsent: 3, onDevice: 2, held: 1, uploaded: 4, drafts: 1 };
    const screen = render(<AccountScreen />);
    expect(screen.says("observer@fieldmaps.test")).toBe(true);
    expect(screen.says("MO")).toBe(true);
    expect(screen.says("upload yet")).toBe(false);
    expect(screen.says("until an update of DECA Mark connects uploading")).toBe(false);
    expect(screen.controls()).not.toContain("Upload now");
    expect(screen.controls()).toContain("Sign out");
    expect(screen.controls()).toContain("Review account deletion");
  });
});

describe("Account counts practice records apart from unsent ones (MOB-37)", () => {
  it("names the practice records as never uploaded, and only when there are some", () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1, practice: 2 };
    const screen = render(<AccountScreen />);
    expect(screen.says("Practice records")).toBe(true);
    expect(screen.says("Stay on this device and are never uploaded.")).toBe(true);
    state.work = { ...state.work, practice: 0 };
    expect(render(<AccountScreen />).says("Practice records")).toBe(false);
  });
});

describe("when the records on this device could not be read (review)", () => {
  const unread = "The queue could not be read.";

  it("Account says so instead of showing zero counts, and can read again", async () => {
    state.work = { ...state.work, error: unread };
    const screen = render(<AccountScreen />);
    expect(screen.says("The records on this device could not be counted.")).toBe(true);
    expect(screen.says("On device")).toBe(false);
    await screen.press("Try again");
    expect(state.calls).toEqual(["retry"]);
  });

  it("Sign out never says nothing is waiting, and writes no note for welcome", async () => {
    state.work = { ...state.work, error: unread };
    const screen = render(<SignOutScreen />);
    expect(screen.says("Nothing is waiting")).toBe(false);
    expect(screen.says("We could not count what waits on this device.")).toBe(true);
    await screen.press("Sign out and keep local records");
    expect(state.calls).toEqual(["signOut"]);
    expect(state.summaries).toEqual([]);
  });

  it("Delete account stays off until the records are counted", async () => {
    state.work = { ...state.work, error: unread };
    const screen = render(<DeleteAccountScreen />);
    await screen.type("account-delete-typed", "DELETE");
    expect(isDisabled(screen.control("Delete account"))).toBe(true);
    expect(screen.says("The records on this device could not be counted.")).toBe(true);
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

  it("says signing out pauses the upload, and never that uploading is missing", () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1 };
    const screen = render(<SignOutScreen />);
    expect(
      screen.says(
        "Signing out pauses their upload until observer@fieldmaps.test signs in again on this device.",
      ),
    ).toBe(true);
    expect(screen.says("upload yet")).toBe(false);
  });

  it("counts 1 unsent and describes the practice records as never uploaded", () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1, practice: 2 };
    const screen = render(<SignOutScreen />);
    expect(screen.says("1 observation has not been uploaded.")).toBe(true);
    expect(screen.says("2 practice records stay on this device and are never uploaded.")).toBe(
      true,
    );
    expect(screen.says("held for the project")).toBe(false);
  });

  it("puts the practice line last, so 'them' and 'their upload' can only mean the unsent records", () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1, practice: 2 };
    const screen = render(<SignOutScreen />);
    const text = screen.texts().join(" ");
    const remain = text.indexOf("They remain on this device for observer@fieldmaps.test.");
    const pauses = text.indexOf("Signing out pauses their upload until observer@fieldmaps.test");
    const practice = text.indexOf("2 practice records stay on this device");
    expect(remain).toBeGreaterThan(-1);
    expect(pauses).toBeGreaterThan(remain);
    expect(practice).toBeGreaterThan(pauses);
  });

  it("says the practice line after the warning when only an unfinished observation waits", () => {
    state.work = { ...state.work, drafts: 1, practice: 1 };
    const screen = render(<SignOutScreen />);
    expect(screen.says("1 practice record stays on this device and is never uploaded.")).toBe(true);
    expect(screen.says("Signing out pauses their upload")).toBe(false);
  });

  it("does not warn about practice records alone: nothing waits to upload", async () => {
    state.work = { ...state.work, practice: 2 };
    const screen = render(<SignOutScreen />);
    expect(screen.says("Nothing is waiting on this device for observer@fieldmaps.test.")).toBe(
      true,
    );
    expect(screen.says("2 practice records stay on this device and are never uploaded.")).toBe(
      true,
    );
    await screen.press("Sign out of this device");
    expect(state.summaries).toEqual([]);
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
    expect(state.calls).toEqual(["DELETE /v1/me", `markAccountDeleted ${A}`]);
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
    expect(alert?.message).not.toMatch(/cannot upload them/);
    expect(alert?.message).toContain("Upload them first");
    expect(alert?.buttons?.map((button) => button.text)).toEqual([
      "Keep my account",
      "Delete anyway",
    ]);
  });

  it("'Delete anyway' deletes with the records still unsent", async () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1 };
    const screen = render(<DeleteAccountScreen />);
    await typeAndDelete(screen);
    expect(state.calls).toEqual([]);
    const [alert] = takeAlerts();
    const proceed = alert?.buttons?.find((button) => button.text === "Delete anyway");
    await act(async () => {
      proceed?.onPress?.();
    });
    expect(state.calls).toEqual(["DELETE /v1/me", `markAccountDeleted ${A}`]);
  });

  it("offers 'Upload 1 first', wired to retry (never wake), and stays on the screen", async () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1, practice: 2 };
    const screen = render(<DeleteAccountScreen />);
    expect(screen.says("1 record has not been uploaded.")).toBe(true);
    await screen.press("Upload 1 first");
    expect(state.calls).toEqual(["retry"]);
    expect(takeNavigation()).toEqual([]);
    expect(screen.says("Delete your account?")).toBe(true);
    expect(screen.says("2 practice records stay on this device and are never uploaded.")).toBe(
      true,
    );
  });

  it.each([
    [
      1,
      "1 record has not been uploaded.",
      "Uploading first keeps it with its project. Deleting without uploading leaves it on this device for good.",
    ],
    [
      2,
      "2 records have not been uploaded.",
      "Uploading first keeps them with their projects. Deleting without uploading leaves them on this device for good.",
    ],
  ])("the unsent note agrees with %i unsent record(s)", (unsent, title, body) => {
    state.work = { ...state.work, unsent, onDevice: unsent };
    const screen = render(<DeleteAccountScreen />);
    expect(screen.says(title)).toBe(true);
    expect(screen.says(body)).toBe(true);
  });

  it("says everything is uploaded once the counts drop to none, and takes the button away", async () => {
    state.work = { ...state.work, unsent: 2, onDevice: 2 };
    state.afterRetry = () => {
      state.work = { ...state.work, unsent: 0, onDevice: 0, uploaded: 2 };
    };
    const screen = render(<DeleteAccountScreen />);
    await screen.press("Upload 2 first");
    expect(screen.controls()).not.toContain("Upload 2 first");
    expect(screen.says("Everything on this device is uploaded.")).toBe(true);
    expect(screen.says("Delete your account?")).toBe(true);
  });

  it("never says everything is uploaded while practice records stay on the device", async () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1, practice: 2 };
    state.afterRetry = () => {
      state.work = { ...state.work, unsent: 0, onDevice: 0, uploaded: 1 };
    };
    const screen = render(<DeleteAccountScreen />);
    await screen.press("Upload 1 first");
    expect(screen.says("Everything on this device is uploaded.")).toBe(false);
    expect(screen.says("Every record that can upload is uploaded.")).toBe(true);
    expect(screen.says("2 practice records stay on this device and are never uploaded.")).toBe(
      true,
    );
  });

  it("never says everything is uploaded while an unfinished observation stays on the device", async () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1, drafts: 1 };
    state.afterRetry = () => {
      state.work = { ...state.work, unsent: 0, onDevice: 0, uploaded: 1 };
    };
    const screen = render(<DeleteAccountScreen />);
    await screen.press("Upload 1 first");
    expect(screen.says("Everything on this device is uploaded.")).toBe(false);
    expect(screen.says("Every record that can upload is uploaded.")).toBe(true);
    expect(screen.says("Your unfinished observation stays on this device")).toBe(true);
  });

  it("says plainly that nothing is sent while offline, and not an old upload error", async () => {
    state.online = false;
    state.work = { ...state.work, unsent: 1, onDevice: 1 };
    state.syncError = "We could not reach DECA Mark.";
    const screen = render(<DeleteAccountScreen />);
    expect(screen.says("No connection.")).toBe(true);
    await screen.press("Upload 1 first");
    expect(screen.says("No connection.")).toBe(true);
    expect(screen.says("Uploading did not finish.")).toBe(false);
  });

  it("does not claim a lost connection while online", async () => {
    state.online = true;
    state.work = { ...state.work, unsent: 1, onDevice: 1 };
    const screen = render(<DeleteAccountScreen />);
    expect(screen.says("No connection.")).toBe(false);
  });

  it("says why an upload did not finish", async () => {
    state.work = { ...state.work, unsent: 1, onDevice: 1 };
    state.syncError = "We could not reach DECA Mark.";
    const screen = render(<DeleteAccountScreen />);
    expect(screen.says("Uploading did not finish.")).toBe(false);
    await screen.press("Upload 1 first");
    expect(screen.says("Uploading did not finish.")).toBe(true);
    expect(screen.says("We could not reach DECA Mark.")).toBe(true);
  });

  it("offers no upload when only practice records and nothing unsent are on the device", () => {
    state.work = { ...state.work, practice: 3 };
    const screen = render(<DeleteAccountScreen />);
    expect(screen.controls().some((label) => label.startsWith("Upload "))).toBe(false);
    expect(screen.says("3 practice records stay on this device and are never uploaded.")).toBe(
      true,
    );
  });
});
