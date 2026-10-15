import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSearchParams, takeAnnouncements, takeNavigation } from "../../ui/native.fixture";
import { render } from "../../ui/screen.fixture";
import { isGateHeld } from "./gate-hold";
import { ResetPasswordScreen } from "./ResetPasswordScreen";

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

/** Supabase's answers, in order, for each call the screen makes; the calls are recorded. */
const auth = vi.hoisted(() => ({
  calls: [] as string[],
  verify: [] as { error: unknown }[],
  update: [] as { error: unknown }[],
  resend: [] as { error: unknown }[],
}));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    client: {
      auth: {
        verifyOtp: async (args: { type: string; token: string }) => {
          auth.calls.push(`verifyOtp ${args.type} ${args.token}`);
          return { data: {}, ...(auth.verify.shift() ?? { error: null }) };
        },
        updateUser: async () => {
          auth.calls.push("updateUser");
          return { data: {}, ...(auth.update.shift() ?? { error: null }) };
        },
        resetPasswordForEmail: async () => {
          auth.calls.push("resetPasswordForEmail");
          return { data: {}, ...(auth.resend.shift() ?? { error: null }) };
        },
      },
    },
  }),
}));

(globalThis as { requestAnimationFrame?: (callback: () => void) => number }).requestAnimationFrame =
  (callback) => {
    callback();
    return 0;
  };

async function fill(screen: ReturnType<typeof render>, code: string, password: string) {
  await screen.type("auth-reset-code", code);
  await screen.type("auth-reset-password", password);
  await screen.type("auth-reset-confirm", password);
}

describe("Choose a new password (MOB-05)", () => {
  beforeEach(() => {
    auth.calls = [];
    auth.verify = [];
    auth.update = [];
    auth.resend = [];
    setSearchParams({ email: "observer@fieldmaps.test" });
    takeNavigation();
    takeAnnouncements();
  });

  it("checks the code, saves the password, and holds the routes until Continue", async () => {
    const screen = render(<ResetPasswordScreen />);
    await fill(screen, "123456", "NewPassword-1015");
    await screen.press("Save new password");
    expect(auth.calls).toEqual(["verifyOtp recovery 123456", "updateUser"]);
    expect(screen.says("Password changed")).toBe(true);
    expect(screen.says("observer@fieldmaps.test")).toBe(true);
    expect(isGateHeld()).toBe(true);
    expect(takeAnnouncements()).toContain(
      "Password changed. You are signed in as observer@fieldmaps.test.",
    );
    await screen.press("Continue");
    expect(isGateHeld()).toBe(false);
  });

  it("takes another password after the same one is refused, without a new code", async () => {
    auth.update = [{ error: { status: 422, code: "same_password" } }];
    const screen = render(<ResetPasswordScreen />);
    await fill(screen, "123456", "OldPassword-1015");
    await screen.press("Save new password");
    expect(screen.says("Choose a password different from your current one.")).toBe(true);
    expect(isGateHeld()).toBe(true);
    await screen.type("auth-reset-password", "NewPassword-1015");
    await screen.type("auth-reset-confirm", "NewPassword-1015");
    await screen.press("Save new password");
    expect(auth.calls).toEqual(["verifyOtp recovery 123456", "updateUser", "updateUser"]);
    expect(screen.says("Password changed")).toBe(true);
    await screen.press("Continue");
    expect(isGateHeld()).toBe(false);
  });

  it("refuses a wrong code on the code field and lets the routes go", async () => {
    auth.verify = [{ error: { status: 403, code: "otp_expired" } }];
    const screen = render(<ResetPasswordScreen />);
    await fill(screen, "000000", "NewPassword-1015");
    await screen.press("Save new password");
    expect(auth.calls).toEqual(["verifyOtp recovery 000000"]);
    expect(screen.says("That code did not match or has expired. Check the latest email.")).toBe(
      true,
    );
    expect(isGateHeld()).toBe(false);
  });

  it("never leaves the routes held when the screen goes away mid-step", async () => {
    auth.update = [{ error: { status: 422, code: "same_password" } }];
    const screen = render(<ResetPasswordScreen />);
    await fill(screen, "123456", "OldPassword-1015");
    await screen.press("Save new password");
    expect(isGateHeld()).toBe(true);
    act(() => screen.renderer.unmount());
    expect(isGateHeld()).toBe(false);
  });

  it("says a lost email address changed nothing, and sends the person back for a code", async () => {
    setSearchParams({});
    const screen = render(<ResetPasswordScreen />);
    expect(screen.says("No password was changed.")).toBe(true);
    await screen.press("Send recovery code");
    expect(takeNavigation()).toEqual(["/forgot-password"]);
    expect(auth.calls).toEqual([]);
  });
});
