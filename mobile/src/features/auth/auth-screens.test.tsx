import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSearchParams, takeAnnouncements, takeNavigation } from "../../ui/native.fixture";
import { render } from "../../ui/screen.fixture";
import { CreateAccountScreen } from "./CreateAccountScreen";
import { SignInScreen } from "./SignInScreen";
import { VerifyScreen } from "./VerifyScreen";

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
vi.mock("expo-linking", () => ({ openURL: async () => {} }));
vi.mock("../onboarding/pending-invitation-note", () => ({ PendingInvitationNote: () => null }));
vi.mock("./use-waiting-records", () => ({
  useWaitingRecords: () => null,
  useDeletedAccount: () => null,
}));
vi.mock("./gate", () => ({ useGate: () => ({ overridden: false, route: "auth" }) }));

/** Supabase's next answer for each call; the calls are recorded. */
const auth = vi.hoisted(() => ({
  calls: [] as string[],
  answers: {} as Partial<Record<Call, { error: unknown }[]>>,
}));
type Call = "signUp" | "signInWithPassword" | "verifyOtp" | "resend";
function answer(name: Call) {
  return {
    data: { user: null, session: null },
    ...(auth.answers[name]?.shift() ?? { error: null }),
  };
}
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    deletedUserId: null,
    client: {
      auth: {
        signUp: async (args: { email: string }) => {
          auth.calls.push(`signUp ${args.email}`);
          return answer("signUp");
        },
        signInWithPassword: async (args: { email: string }) => {
          auth.calls.push(`signInWithPassword ${args.email}`);
          return answer("signInWithPassword");
        },
        verifyOtp: async (args: { type: string; token: string }) => {
          auth.calls.push(`verifyOtp ${args.type} ${args.token}`);
          return answer("verifyOtp");
        },
        resend: async (args: { type: string; email: string }) => {
          auth.calls.push(`resend ${args.type} ${args.email}`);
          return answer("resend");
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

beforeEach(() => {
  auth.calls = [];
  auth.answers = {};
  setSearchParams({});
  takeNavigation();
  takeAnnouncements();
});

describe("Create your account (MOB-05)", () => {
  it("signs up, then opens the code screen with the address and a code just sent", async () => {
    const screen = render(<CreateAccountScreen />);
    await screen.type("auth-create-email", "new@fieldmaps.test");
    await screen.type("auth-create-password", "LongEnough-1015");
    await screen.type("auth-create-confirm", "LongEnough-1015");
    await screen.press("I have read the privacy information for this research platform.");
    await screen.press("Send verification code");
    expect(auth.calls).toEqual(["signUp new@fieldmaps.test"]);
    expect(takeNavigation()).toEqual([
      { pathname: "/verify", params: { email: "new@fieldmaps.test", sent: "1" } },
    ]);
  });

  it("says what happened when sign-up fails, and stays", async () => {
    auth.answers.signUp = [{ error: { status: 429, code: "over_email_send_rate_limit" } }];
    const screen = render(<CreateAccountScreen />);
    await screen.type("auth-create-email", "new@fieldmaps.test");
    await screen.type("auth-create-password", "LongEnough-1015");
    await screen.type("auth-create-confirm", "LongEnough-1015");
    await screen.press("I have read the privacy information for this research platform.");
    await screen.press("Send verification code");
    expect(screen.says("Too many attempts.")).toBe(true);
    expect(takeNavigation()).toEqual([]);
  });

  it("sends nothing until every field is right", async () => {
    const screen = render(<CreateAccountScreen />);
    await screen.type("auth-create-email", "new@fieldmaps.test");
    await screen.press("Send verification code");
    expect(auth.calls).toEqual([]);
  });
});

describe("Check your email (MOB-05)", () => {
  it("checks the code with verifyOtp at the sixth digit", async () => {
    setSearchParams({ email: "new@fieldmaps.test", sent: "1" });
    const screen = render(<VerifyScreen />);
    await screen.type("auth-verify-code", "123456");
    expect(auth.calls).toEqual(["verifyOtp email 123456"]);
    expect(takeAnnouncements()).toContain("Email verified.");
  });

  it("refuses a wrong code on the field, and waits a minute before the first resend", async () => {
    setSearchParams({ email: "new@fieldmaps.test", sent: "1" });
    auth.answers.verifyOtp = [{ error: { status: 403, code: "otp_expired" } }];
    const screen = render(<VerifyScreen />);
    await screen.type("auth-verify-code", "000000");
    expect(screen.says("That code did not match or has expired. Check the latest email.")).toBe(
      true,
    );
    expect(screen.says("Resend in")).toBe(true);
    expect(screen.says("1:00")).toBe(true);
  });

  it("sends a new code with resend when none was just sent", async () => {
    setSearchParams({ email: "new@fieldmaps.test" });
    const screen = render(<VerifyScreen />);
    await screen.press("Resend code");
    expect(auth.calls).toEqual(["resend signup new@fieldmaps.test"]);
    expect(screen.says("A new code is on its way.")).toBe(true);
  });
});

describe("Sign in with an address never verified (MOB-05)", () => {
  it("offers a new code, sends it, and opens the code screen", async () => {
    auth.answers.signInWithPassword = [{ error: { status: 400, code: "email_not_confirmed" } }];
    const screen = render(<SignInScreen />);
    await screen.type("auth-sign-in-email", "new@fieldmaps.test");
    await screen.type("auth-sign-in-password", "LongEnough-1015");
    await screen.press("Sign in");
    expect(screen.says("This email address is not verified yet.")).toBe(true);
    await screen.press("Send a new code");
    expect(auth.calls).toEqual([
      "signInWithPassword new@fieldmaps.test",
      "resend signup new@fieldmaps.test",
    ]);
    expect(takeNavigation()).toEqual([
      { pathname: "/verify", params: { email: "new@fieldmaps.test", sent: "1" } },
    ]);
  });
});
