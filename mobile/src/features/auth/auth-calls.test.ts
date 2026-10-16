import { describe, expect, it } from "vitest";
import {
  type AuthCalls,
  createAccount,
  resendSignUpCode,
  sendRecoveryCode,
  setNewPassword,
  verifyEmail,
  verifyRecoveryCode,
} from "./auth-calls";

/** A fake `client.auth` that records each call and answers as told. */
function fakeAuth(answer: { error: unknown } | Error = { error: null }) {
  const calls: [string, unknown][] = [];
  const respond = async (name: string, args: unknown) => {
    calls.push([name, args]);
    if (answer instanceof Error) throw answer;
    return { data: {}, ...answer };
  };
  const auth = {
    signUp: (args: unknown) => respond("signUp", args),
    verifyOtp: (args: unknown) => respond("verifyOtp", args),
    resend: (args: unknown) => respond("resend", args),
    resetPasswordForEmail: (email: unknown) => respond("resetPasswordForEmail", email),
    updateUser: (args: unknown) => respond("updateUser", args),
  } as unknown as AuthCalls;
  return { auth, calls };
}

describe("the auth calls (MOB-05)", () => {
  it("makes each Supabase call as the web does, with the address trimmed", async () => {
    const { auth, calls } = fakeAuth();
    expect(await createAccount(auth, " a@fieldmaps.test ", "long-enough")).toEqual({ ok: true });
    await verifyEmail(auth, "a@fieldmaps.test", "123456");
    await resendSignUpCode(auth, "a@fieldmaps.test ");
    await sendRecoveryCode(auth, " a@fieldmaps.test");
    await verifyRecoveryCode(auth, "a@fieldmaps.test", "654321");
    await setNewPassword(auth, "new-long-password");
    expect(calls).toEqual([
      ["signUp", { email: "a@fieldmaps.test", password: "long-enough" }],
      ["verifyOtp", { email: "a@fieldmaps.test", token: "123456", type: "email" }],
      ["resend", { type: "signup", email: "a@fieldmaps.test" }],
      ["resetPasswordForEmail", "a@fieldmaps.test"],
      ["verifyOtp", { email: "a@fieldmaps.test", token: "654321", type: "recovery" }],
      ["updateUser", { password: "new-long-password" }],
    ]);
  });

  it("returns the failure an answer carries", async () => {
    const { auth } = fakeAuth({ error: { status: 403, code: "otp_expired" } });
    expect(await verifyEmail(auth, "a@fieldmaps.test", "000000")).toEqual({
      ok: false,
      failure: "code",
    });
  });

  it("turns a thrown network error into a failure, never a crash", async () => {
    const { auth } = fakeAuth(new TypeError("Network request failed"));
    expect(await sendRecoveryCode(auth, "a@fieldmaps.test")).toEqual({
      ok: false,
      failure: "network",
    });
  });

  it("says the server could not finish when the auth module did not start", async () => {
    expect(await createAccount(null, "a@fieldmaps.test", "long-enough")).toEqual({
      ok: false,
      failure: "server",
    });
  });
});
