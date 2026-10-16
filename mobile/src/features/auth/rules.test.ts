import { describe, expect, it } from "vitest";
import { pointInPolygon, RIVERSIDE_PLAN, WELCOME_MARKERS, WELCOME_VIEW } from "./plan";
import {
  AUTH_MESSAGES,
  authFailure,
  CODE_REFUSED,
  confirmCheck,
  deletedAccountBody,
  formatCountdown,
  isEmail,
  lengthCheck,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordLengthOk,
  passwordProblem,
  RESEND_SECONDS,
  resetDisabledReason,
  SIGN_IN_MESSAGES,
  signInFailure,
  stayingTitle,
  waitingForTitle,
  waitingTitle,
} from "./rules";

describe("password checks", () => {
  it("holds passwords to 8 to 128 characters, as the server does (D25)", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(MAX_PASSWORD_LENGTH).toBe(128);
    expect(passwordLengthOk(7)).toBe(false);
    expect(passwordLengthOk(8)).toBe(true);
    expect(passwordLengthOk(128)).toBe(true);
    expect(passwordLengthOk(129)).toBe(false);
    expect(passwordProblem("seven!!")).toBe("Use at least 8 characters.");
    expect(passwordProblem("eight!!!")).toBeUndefined();
    expect(passwordProblem("x".repeat(129))).toBe("Use at most 128 characters.");
  });

  it("counts characters live and passes at eight, as Mobile 25 and 28 draw it", () => {
    expect(lengthCheck(0, "Use at least 8.")).toEqual({
      success: undefined,
      hint: "Use at least 8.",
    });
    expect(lengthCheck(1, "Use at least 8.").hint).toBe("1 character  Use at least 8.");
    expect(lengthCheck(7, "At least 8.").hint).toBe("7 characters  At least 8.");
    expect(lengthCheck(8, "At least 8.").success).toBe("8 characters");
    expect(lengthCheck(16, "Use at least 8.")).toEqual({
      success: "16 characters",
      hint: "Use at least 8.",
    });
    expect(lengthCheck(129, "Use at least 8.")).toEqual({
      success: undefined,
      hint: "129 characters  Use at most 128.",
    });
  });

  it("confirms a match at once and holds a mismatch until blur or equal length", () => {
    expect(confirmCheck("riverside-meadow", "riverside-meadow", false)).toEqual({
      success: "Passwords match",
      error: undefined,
    });
    expect(confirmCheck("riverside-meadow", "river", false).error).toBeUndefined();
    expect(confirmCheck("riverside-meadow", "river", true).error).toBe("Does not match yet");
    expect(confirmCheck("riverside-meadow", "riverside-meadox", false).error).toBe(
      "Does not match yet",
    );
    expect(confirmCheck("riverside-meadow", "", true)).toEqual({
      success: undefined,
      error: undefined,
    });
  });

  it("names the first thing that keeps Save new password off", () => {
    const long = "seventeen-chars!!";
    expect(resetDisabledReason("7305", long, long)).toBe(
      "The button turns on when all six digits of the code are in.",
    );
    expect(resetDisabledReason("730518", "short", "short")).toBe(
      "The button turns on when the new password has at least 8 characters.",
    );
    expect(resetDisabledReason("730518", "eight!!!", "eight!!!")).toBeUndefined();
    expect(resetDisabledReason("730518", long, "seventeen-chars")).toBe(
      "The button turns on when both passwords match.",
    );
    expect(resetDisabledReason("730518", long, long)).toBeUndefined();
  });
});

describe("words", () => {
  it("counts waiting records in the notes' sentences", () => {
    expect(waitingTitle(5)).toBe("5 records are waiting on this device.");
    expect(waitingTitle(1)).toBe("1 record is waiting on this device.");
    expect(stayingTitle(5)).toBe("5 records stay on this device");
    expect(stayingTitle(1)).toBe("1 record stays on this device");
  });

  it("says a deleted account's records stay here and cannot upload", () => {
    expect(deletedAccountBody(5)).toBe("5 records stay on this device; they cannot upload.");
    expect(deletedAccountBody(1)).toBe("1 record stays on this device; it cannot upload.");
    expect(deletedAccountBody(0)).toBe("None of its records are waiting on this device.");
    expect(deletedAccountBody(null)).toBe("Its records stay on this device; they cannot upload.");
  });

  it("reads a countdown in minutes and seconds", () => {
    expect(formatCountdown(24)).toBe("0:24");
    expect(formatCountdown(30)).toBe("0:30");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("accepts addresses with a domain and refuses the rest", () => {
    expect(isEmail(" ps2245@cornell.edu ")).toBe(true);
    expect(isEmail("p.sudhakar@example")).toBe(false);
    expect(isEmail("p sudhakar@example.org")).toBe(false);
    expect(isEmail("")).toBe(false);
  });

  it("uses no exclamation marks and never says successfully", () => {
    for (const { title, body } of [
      ...Object.values(SIGN_IN_MESSAGES),
      ...Object.values(AUTH_MESSAGES),
    ]) {
      expect(`${title} ${body}`).not.toMatch(/!|successfully/i);
    }
    expect(CODE_REFUSED).not.toMatch(/!|successfully/i);
  });

  it("names the account whose records wait, for welcome (MOB-05)", () => {
    expect(waitingForTitle(5, 0, "a@fieldmaps.test")).toBe(
      "5 records waiting on this device for a@fieldmaps.test",
    );
    expect(waitingForTitle(1, 1, "a@fieldmaps.test")).toBe(
      "1 record waiting on this device for a@fieldmaps.test",
    );
    expect(waitingForTitle(0, 1, "a@fieldmaps.test")).toBe(
      "An unfinished observation is waiting on this device for a@fieldmaps.test",
    );
  });

  it("waits a minute between codes, as the web does", () => {
    expect(RESEND_SECONDS).toBe(60);
  });
});

describe("sign-in failures", () => {
  it.each([
    [{ name: "AuthApiError", status: 400, code: "invalid_credentials" }, "credentials"],
    [{ status: 400, message: "Invalid login credentials" }, "credentials"],
    [{ status: 400, code: "email_not_confirmed" }, "unconfirmed"],
    [{ status: 429, code: "over_request_rate_limit" }, "rateLimited"],
    [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "network"],
    [new TypeError("Network request failed"), "network"],
    [{ name: "AuthApiError", status: 500, message: "Database error" }, "server"],
    ["something else", "server"],
  ] as const)("reads %o as %s", (error, failure) => {
    expect(signInFailure(error)).toBe(failure);
  });

  it("keeps the designed words for the three cases the design names", () => {
    expect(SIGN_IN_MESSAGES.credentials).toEqual({
      title: "That email and password do not match.",
      body: "Check both and try again.",
    });
    expect(SIGN_IN_MESSAGES.network).toEqual({
      title: "We could not reach the server.",
      body: "Your records are safe on this device. Try again when you have signal.",
    });
    expect(SIGN_IN_MESSAGES.deleted.title).toBe("This account was deleted.");
  });

  it("says the records are safe in every failure that is not about the account itself", () => {
    for (const [failure, { body }] of Object.entries(SIGN_IN_MESSAGES)) {
      if (failure === "credentials" || failure === "deleted") continue;
      expect(body).toContain("Your records are safe on this device.");
    }
    expect(SIGN_IN_MESSAGES.deleted.body).toContain("stay on this device; they cannot upload.");
  });
});

describe("auth failures (MOB-05)", () => {
  it.each([
    [{ name: "AuthApiError", status: 400, code: "invalid_credentials" }, "credentials"],
    [{ status: 400, code: "email_not_confirmed" }, "unconfirmed"],
    [{ status: 429, code: "over_email_send_rate_limit" }, "rateLimited"],
    [
      {
        status: 429,
        message: "For security purposes, you can only request this after 52 seconds.",
      },
      "rateLimited",
    ],
    [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "network"],
    [{ name: "AuthApiError", status: 403, code: "otp_expired" }, "code"],
    [{ status: 403, message: "Token has expired or is invalid" }, "code"],
    [{ status: 422, code: "same_password" }, "samePassword"],
    [{ status: 422, code: "weak_password" }, "weakPassword"],
    [{ status: 400, code: "email_address_invalid" }, "emailInvalid"],
    [{ status: 422, code: "user_already_exists" }, "exists"],
    [{ status: 422, code: "signup_disabled" }, "signUpClosed"],
    [{ name: "AuthSessionMissingError", status: 400 }, "sessionMissing"],
    [{ status: 500, message: "Database error saving new user" }, "server"],
    [
      { name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" },
      "server",
    ],
    [{ name: "AuthRetryableFetchError", status: 503, message: "Service unavailable" }, "server"],
    [undefined, "server"],
  ] as const)("reads %o as %s", (error, failure) => {
    expect(authFailure(error)).toBe(failure);
  });

  it("narrows failures sign-in does not tell apart to the server case", () => {
    expect(signInFailure({ status: 403, code: "otp_expired" })).toBe("server");
    expect(signInFailure({ status: 422, code: "same_password" })).toBe("server");
  });

  it("gives every failure a title and a next step", () => {
    for (const { title, body } of Object.values(AUTH_MESSAGES)) {
      expect(title.endsWith(".")).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    }
    expect(AUTH_MESSAGES.code.body).toContain("send a new code");
    expect(AUTH_MESSAGES.unconfirmed.body).toContain("Send a new code");
  });
});

describe("the welcome plan", () => {
  it("projects Riverside's three zones and its features onto the plan", () => {
    expect(RIVERSIDE_PLAN.name).toBe("Riverside");
    expect(RIVERSIDE_PLAN.zones).toHaveLength(3);
    expect(RIVERSIDE_PLAN.trees).toHaveLength(23);
    expect(RIVERSIDE_PLAN.paths).toHaveLength(3);
    // North meadow's first vertex, as the zone editor lists it: (153, 90).
    const [x, y] = RIVERSIDE_PLAN.zones[0]?.points[0] ?? [0, 0];
    expect(x).toBeCloseTo(153, 0);
    expect(y).toBeCloseTo(90, 0);
  });

  it("draws fourteen markers, each inside a zone and inside the view", () => {
    expect(WELCOME_MARKERS).toHaveLength(14);
    for (const marker of WELCOME_MARKERS) {
      expect(RIVERSIDE_PLAN.zones.some((zone) => pointInPolygon(marker, zone.points))).toBe(true);
      expect(marker[0]).toBeGreaterThan(WELCOME_VIEW.x);
      expect(marker[0]).toBeLessThan(WELCOME_VIEW.x + WELCOME_VIEW.width);
      expect(marker[1]).toBeGreaterThan(WELCOME_VIEW.y);
      expect(marker[1]).toBeLessThan(WELCOME_VIEW.y + WELCOME_VIEW.height);
    }
  });
});
