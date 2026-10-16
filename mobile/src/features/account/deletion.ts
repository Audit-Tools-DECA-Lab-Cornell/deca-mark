import type { AccountDeletion } from "../../data/api/client";
import { ApiError } from "../../data/api/errors";

/**
 * Delete account (MOB-07), as the web does it (`web/src/features/account/deletion.ts`, BE-08):
 * `DELETE /v1/me`; a 204 is done; a 202 means the profile and memberships are gone but removing the
 * sign-in did not finish, so the request is sent again a few times, about 30 seconds in all, while the
 * session is still valid, and then the deletion counts as recorded: the server keeps the durable record
 * and finishes it.
 *
 * `DELETE /v1/me` deletes whichever account the request is signed in as. So every try names the account
 * that confirmed, and goes out only while that account is the one signed in on this phone: an account
 * that signed in meanwhile is never deleted without its own confirmation.
 */

export const DELETION_RETRY_DELAYS_MS = [5_000, 10_000, 15_000] as const;

export type DeletionOutcome =
  /** 204: the account is gone. */
  | { readonly kind: "deleted" }
  /** 202, then the retries ran out or stopped: recorded, and the server completes it. */
  | {
      readonly kind: "recorded";
      readonly stopped: "exhausted" | "otherAccount" | "signedOut" | "failed";
    }
  /** 503 storage_unavailable: deletion is not configured on this server. Nothing was deleted. */
  | { readonly kind: "unavailable" }
  /** 409 sole_owner: an organization would be left without an owner. Nothing was deleted. */
  | { readonly kind: "soleOwner" }
  /** Another account is signed in on this phone now. Nothing was sent. */
  | { readonly kind: "otherAccount" }
  /** The first request failed. Nothing was deleted. */
  | { readonly kind: "failed"; readonly error: ApiError };

export type DeletionRun = {
  /** The account the confirmation was given for. */
  readonly confirmedFor: string;
  /** The account whose live session would send the next request, or null without one. */
  readonly signedInAs: () => string | null;
  /** `DELETE /v1/me`, signed in as `confirmedFor` only. */
  readonly send: () => Promise<AccountDeletion>;
  readonly wait: (ms: number) => Promise<void>;
  /** A 202 arrived and this try is next (1 of 3, …), or the retries ran out (null). */
  readonly onPending?: ((next: number | null) => void) | undefined;
};

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError("unknown", "retry");
  throw error;
}

export async function runAccountDeletion(run: DeletionRun): Promise<DeletionOutcome> {
  let tries = 0;
  for (;;) {
    const current = run.signedInAs();
    if (current !== run.confirmedFor) {
      if (tries > 0)
        return { kind: "recorded", stopped: current === null ? "signedOut" : "otherAccount" };
      // Without a live session the first request cannot go out: the screen asks to sign in again.
      if (current === null)
        return { kind: "failed", error: new ApiError("unauthenticated", "sign-in") };
      return { kind: "otherAccount" };
    }
    let answer: AccountDeletion;
    try {
      answer = await run.send();
    } catch (error) {
      const failure = asApiError(error);
      if (tries > 0) return { kind: "recorded", stopped: "failed" };
      if (failure.code === "sole_owner") return { kind: "soleOwner" };
      return { kind: "failed", error: failure };
    }
    if (answer === "deleted") return { kind: "deleted" };
    if (answer === "unavailable")
      return tries === 0 ? { kind: "unavailable" } : { kind: "recorded", stopped: "failed" };
    const delay = DELETION_RETRY_DELAYS_MS[tries];
    if (delay === undefined) {
      run.onPending?.(null);
      return { kind: "recorded", stopped: "exhausted" };
    }
    run.onPending?.(tries + 1);
    await run.wait(delay);
    tries += 1;
  }
}

/** The sentence under "Deletion is finishing." while a 202 is retried, as the web says it. */
export function finishingLine(next: number | null): string {
  const total = DELETION_RETRY_DELAYS_MS.length;
  if (next === null)
    return "Removing your sign-in did not finish yet. It is recorded, and the person who runs DECA Mark will complete it.";
  return `Removing your sign-in did not finish yet, so DECA Mark is trying again (${next} of ${total}).`;
}
