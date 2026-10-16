import type { SupabaseClient } from "@supabase/supabase-js";
import { type AuthFailure, authFailure } from "./rules";

/**
 * The Supabase Auth calls behind the auth screens (MOB-05), as the web makes them
 * (`web/src/lib/auth/actions.ts`): sign-up and the six-digit email code, a new code, and recovery by
 * code then a new password. Each returns a typed failure instead of throwing, so a screen only chooses
 * words. They take `client.auth`, so tests can pass a fake and the local acceptance test the real one.
 */

export type AuthCalls = Pick<
  SupabaseClient["auth"],
  "signUp" | "verifyOtp" | "resend" | "resetPasswordForEmail" | "updateUser"
>;

export type AuthOutcome = { ok: true } | { ok: false; failure: AuthFailure };

const OK: AuthOutcome = { ok: true };

/** A missing client (the auth module did not start) is a failure the screen can name, not a crash. */
async function attempt(
  auth: AuthCalls | null | undefined,
  call: (auth: AuthCalls) => Promise<{ error: unknown }>,
): Promise<AuthOutcome> {
  if (!auth) return { ok: false, failure: "server" };
  try {
    const { error } = await call(auth);
    return error ? { ok: false, failure: authFailure(error) } : OK;
  } catch (error) {
    return { ok: false, failure: authFailure(error) };
  }
}

/**
 * `signUp`. With confirmations on, Supabase answers the same way whether or not the address already has
 * an account, so the screen always goes on to the code; only an account Supabase reports outright is
 * `exists`.
 */
export function createAccount(
  auth: AuthCalls | null | undefined,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  return attempt(auth, (calls) => calls.signUp({ email: email.trim(), password }));
}

/** `verifyOtp({type: "email"})`: confirms the address and signs the new account in. */
export function verifyEmail(
  auth: AuthCalls | null | undefined,
  email: string,
  code: string,
): Promise<AuthOutcome> {
  return attempt(auth, (calls) =>
    calls.verifyOtp({ email: email.trim(), token: code, type: "email" }),
  );
}

/** `resend({type: "signup"})`: a new verification code, which replaces the old one. */
export function resendSignUpCode(
  auth: AuthCalls | null | undefined,
  email: string,
): Promise<AuthOutcome> {
  return attempt(auth, (calls) => calls.resend({ type: "signup", email: email.trim() }));
}

/**
 * `resetPasswordForEmail`: a recovery code. Supabase answers the same whether or not the address has an
 * account, so the screen cannot be used to look one up.
 */
export function sendRecoveryCode(
  auth: AuthCalls | null | undefined,
  email: string,
): Promise<AuthOutcome> {
  return attempt(auth, (calls) => calls.resetPasswordForEmail(email.trim()));
}

/** `verifyOtp({type: "recovery"})`: proves the code and signs the account in for the new password. */
export function verifyRecoveryCode(
  auth: AuthCalls | null | undefined,
  email: string,
  code: string,
): Promise<AuthOutcome> {
  return attempt(auth, (calls) =>
    calls.verifyOtp({ email: email.trim(), token: code, type: "recovery" }),
  );
}

/** `updateUser({password})`, on the session the recovery code opened. */
export function setNewPassword(
  auth: AuthCalls | null | undefined,
  password: string,
): Promise<AuthOutcome> {
  return attempt(auth, (calls) => calls.updateUser({ password }));
}
