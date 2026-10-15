import { beforeEach, describe, expect, it, vi } from "vitest";
import { takeNavigation } from "../../ui/native.fixture";
import { render } from "../../ui/screen.fixture";
import { ResumeUploadsNote } from "./ResumeUploadsNote";

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

const account = vi.hoisted(() => ({ recovery: null as { email: string } | null }));
vi.mock("../../auth/provider", () => ({ useAccount: () => account }));

describe("Sign in to resume uploads (MOB-08, MOB-03)", () => {
  beforeEach(() => {
    takeNavigation();
  });

  it("says nothing while the session is live or nobody is kept on this device", () => {
    account.recovery = null;
    expect(render(<ResumeUploadsNote />).texts()).toEqual([]);
  });

  it("names the account whose records wait, and opens sign-in with its email", async () => {
    account.recovery = { email: "observer@fieldmaps.test" };
    const screen = render(<ResumeUploadsNote />);
    expect(screen.says("Sign in to resume uploads")).toBe(true);
    expect(
      screen.says(
        "Your records stay on this device for observer@fieldmaps.test. They upload once you sign in again.",
      ),
    ).toBe(true);
    await screen.press("Sign in");
    expect(takeNavigation()).toEqual([
      { pathname: "/sign-in", params: { email: "observer@fieldmaps.test" } },
    ]);
  });
});
