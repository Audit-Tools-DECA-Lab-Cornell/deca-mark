/**
 * The rules and words the auth screens share (Mobile 23–28). Pure, so the tests can hold them to the
 * designs without rendering a screen.
 */

/** Passwords are 8 to 128 characters everywhere, as the server and Supabase Auth hold them (D25). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
/** Verification and recovery codes are six digits. */
export const CODE_LENGTH = 6;
/** A new code can be asked for this often, as on the web (MOB-05). */
export const RESEND_SECONDS = 60;

/** Enough to catch a typo before anything is sent; the server decides what an address is. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** "0:24": minutes and two-digit seconds, read in mono. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function characters(count: number): string {
  return count === 1 ? "1 character" : `${count} characters`;
}

/** A password the server accepts: 8 to 128 characters. */
export function passwordLengthOk(length: number): boolean {
  return length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH;
}

/** What a new password still needs, in the field's words, or undefined when its length is fine. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH)
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return undefined;
}

/**
 * The live length check under a new password: "✓ 16 characters  Use at least 8." once it is long
 * enough, the count and the rule in secondary ink while it is short, and the rule alone when empty.
 */
export function lengthCheck(
  length: number,
  rule: string,
): { success: string | undefined; hint: string } {
  if (passwordLengthOk(length)) return { success: characters(length), hint: rule };
  if (length === 0) return { success: undefined, hint: rule };
  if (length > MAX_PASSWORD_LENGTH)
    return {
      success: undefined,
      hint: `${characters(length)}  Use at most ${MAX_PASSWORD_LENGTH}.`,
    };
  return { success: undefined, hint: `${characters(length)}  ${rule}` };
}

export const PASSWORDS_MATCH = "Passwords match";
export const DOES_NOT_MATCH = "Does not match yet";

/**
 * The check under a confirmation. "Passwords match" as soon as they do; "Does not match yet" only once
 * the field has lost focus or is as long as the password, so nobody is told off mid-word.
 */
export function confirmCheck(
  password: string,
  confirm: string,
  left: boolean,
): { success: string | undefined; error: string | undefined } {
  const matches = confirm.length > 0 && confirm === password;
  if (matches) return { success: PASSWORDS_MATCH, error: undefined };
  const shown = confirm.length > 0 && (left || confirm.length >= password.length);
  return { success: undefined, error: shown ? DOES_NOT_MATCH : undefined };
}

/** Why "Save new password" is off, naming the first thing still missing, top to bottom. */
export function resetDisabledReason(
  code: string,
  password: string,
  confirm: string,
): string | undefined {
  if (code.length < CODE_LENGTH)
    return "The button turns on when all six digits of the code are in.";
  if (password.length < MIN_PASSWORD_LENGTH)
    return `The button turns on when the new password has at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH)
    return `The button turns on when the new password has at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (confirm !== password) return "The button turns on when both passwords match.";
  return undefined;
}

/** "5 records are waiting on this device." */
export function waitingTitle(count: number): string {
  return count === 1
    ? "1 record is waiting on this device."
    : `${count} records are waiting on this device.`;
}

/**
 * What welcome names for an account that signed out with work still here (MOB-05): "5 records waiting
 * on this device for name@example.org", or its unfinished observation when no record waits.
 */
export function waitingForTitle(unsent: number, drafts: number, email: string): string {
  if (unsent === 0)
    return drafts === 1
      ? `An unfinished observation is waiting on this device for ${email}`
      : `${drafts} unfinished observations are waiting on this device for ${email}`;
  return unsent === 1
    ? `1 record waiting on this device for ${email}`
    : `${unsent} records waiting on this device for ${email}`;
}

/** "5 records stay on this device", which the recovery note runs on into its sentence. */
export function stayingTitle(count: number): string {
  return count === 1 ? "1 record stays on this device" : `${count} records stay on this device`;
}

/** The note welcome and sign-in show for an account the server reported deleted. */
export const DELETED_ACCOUNT_TITLE = "This account was deleted.";

/**
 * What became of the deleted account's records: "5 records stay on this device; they cannot upload."
 * Null while the queue is still being read.
 */
export function deletedAccountBody(count: number | null): string {
  if (count === null) return "Its records stay on this device; they cannot upload.";
  if (count === 0) return "None of its records are waiting on this device.";
  return count === 1
    ? "1 record stays on this device; it cannot upload."
    : `${count} records stay on this device; they cannot upload.`;
}

/* ── Failures ─────────────────────────────────────────────────────────────── */

/** Every way a Supabase Auth call can fail that the auth screens tell apart (MOB-05). */
export type AuthFailure =
  | "credentials"
  | "unconfirmed"
  | "rateLimited"
  | "network"
  | "server"
  | "deleted"
  | "code"
  | "samePassword"
  | "weakPassword"
  | "emailInvalid"
  | "exists"
  | "signUpClosed"
  | "sessionMissing";

/**
 * What a failed Supabase Auth call means for the person holding the phone. Reads the fields supabase-js
 * errors carry (`code`, `status`, `name`, `message`) without depending on its classes.
 */
export function authFailure(error: unknown): AuthFailure {
  if (typeof error !== "object" || error === null) return "server";
  const { code, status, name, message } = error as Record<string, unknown>;
  const text = typeof message === "string" ? message : "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(text))
    return "credentials";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(text)) return "unconfirmed";
  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit"
  )
    return "rateLimited";
  // supabase-js also calls a 5xx answer "retryable": that is the server, not the connection.
  if (typeof status === "number" && status >= 500) return "server";
  if (
    name === "AuthRetryableFetchError" ||
    name === "TypeError" ||
    status === 0 ||
    /network|failed to fetch|timed? ?out|offline/i.test(text)
  )
    return "network";
  if (code === "otp_expired" || /token has expired or is invalid/i.test(text)) return "code";
  if (code === "same_password") return "samePassword";
  if (code === "weak_password") return "weakPassword";
  if (code === "email_address_invalid" || code === "validation_failed") return "emailInvalid";
  if (code === "user_already_exists" || code === "email_exists") return "exists";
  if (code === "signup_disabled" || code === "email_provider_disabled") return "signUpClosed";
  if (
    name === "AuthSessionMissingError" ||
    code === "session_not_found" ||
    code === "session_expired"
  )
    return "sessionMissing";
  return "server";
}

export type SignInFailure = Extract<
  AuthFailure,
  "credentials" | "unconfirmed" | "rateLimited" | "network" | "server" | "deleted"
>;

const SIGN_IN_FAILURES: readonly AuthFailure[] = [
  "credentials",
  "unconfirmed",
  "rateLimited",
  "network",
  "server",
  "deleted",
];

/** A failed `signInWithPassword`, narrowed to the cases sign-in tells apart. */
export function signInFailure(error: unknown): SignInFailure {
  const failure = authFailure(error);
  return SIGN_IN_FAILURES.includes(failure) ? (failure as SignInFailure) : "server";
}

/**
 * The words for each failure: what happened, then what is safe, then what to do. On the collector an
 * error never hides that the records waiting here are still here.
 */
export const AUTH_MESSAGES: Record<AuthFailure, { title: string; body: string }> = {
  credentials: {
    title: "That email and password do not match.",
    body: "Check both and try again.",
  },
  unconfirmed: {
    title: "This email address is not verified yet.",
    body: "Your records are safe on this device. Send a new code, then enter it to finish creating the account.",
  },
  rateLimited: {
    title: "Too many attempts.",
    body: "Your records are safe on this device. Wait a minute, then try again.",
  },
  network: {
    title: "We could not reach the server.",
    body: "Your records are safe on this device. Try again when you have signal.",
  },
  server: {
    title: "The server could not finish this.",
    body: "Your records are safe on this device. Try again in a few minutes. If it keeps happening, ask your project coordinator.",
  },
  deleted: {
    title: "This account was deleted.",
    body: "Its records stay on this device; they cannot upload. Sign in with an active account.",
  },
  code: {
    title: "That code did not match or has expired.",
    body: "Check the latest email, or send a new code. A new code replaces the old one.",
  },
  samePassword: {
    title: "That is the current password.",
    body: "Choose a password different from your current one.",
  },
  weakPassword: {
    title: "That password was not accepted.",
    body: "Use 8 to 128 characters.",
  },
  emailInvalid: {
    title: "That email address was not accepted.",
    body: "Check it, then try again.",
  },
  exists: {
    title: "An account already uses this email address.",
    body: "Sign in to it, or reset its password.",
  },
  signUpClosed: {
    title: "New accounts cannot be created right now.",
    body: "Ask your project coordinator.",
  },
  sessionMissing: {
    title: "That recovery code has expired.",
    body: "Send a new code, then try again.",
  },
};

/** Sign-in's words; the server case keeps its own title. */
export const SIGN_IN_MESSAGES: Record<SignInFailure, { title: string; body: string }> = {
  credentials: AUTH_MESSAGES.credentials,
  unconfirmed: AUTH_MESSAGES.unconfirmed,
  rateLimited: {
    title: "Too many sign-in attempts.",
    body: "Your records are safe on this device. Wait a few minutes, then try again.",
  },
  network: AUTH_MESSAGES.network,
  server: {
    title: "The server could not sign you in.",
    body: "Your records are safe on this device. Try again in a few minutes. If it keeps happening, ask your project coordinator.",
  },
  deleted: AUTH_MESSAGES.deleted,
};

/** What the code field says when a six-digit code is refused; other failures go in a note. */
export const CODE_REFUSED = "That code did not match or has expired. Check the latest email.";

/** What the reset screen says once the new password is saved. */
export const PASSWORD_CHANGED = "Password changed.";
