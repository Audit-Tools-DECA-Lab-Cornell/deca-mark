import type { CachedAccount } from "./cached-account";

export function restoreAccount(cached: CachedAccount | null, deleted: CachedAccount | null) {
  return { account: cached ?? deleted, deletedUserId: deleted?.id ?? null };
}

/**
 * The account on this device is the one the server reported deleted (markAccountDeleted, or the marker
 * restored on restart): its records stay here, and it can neither upload nor start new work.
 */
export function isAccountDeleted(
  deletedUserId: string | null,
  account: { readonly id: string } | null,
): boolean {
  return deletedUserId !== null && account?.id === deletedUserId;
}

/**
 * Whether marking an account deleted still applies: the account it was meant for is the one the callback
 * captured and is still the one on this device. A deletion that finishes after the phone signed out or
 * moved to another account must not sign that account out or give it the deleted account's marker.
 */
export function deletionStillApplies(
  expectedUserId: string,
  capturedUserId: string,
  currentUserId: string | null,
): boolean {
  return expectedUserId === capturedUserId && currentUserId === expectedUserId;
}

export function allowedSession<T extends { readonly user: { readonly id: string } }>(
  session: T | null,
  deletedUserId: string | null,
): T | null {
  return session?.user.id === deletedUserId ? null : session;
}

export async function persistDeletedSignOut(
  account: CachedAccount,
  pause: () => void,
  retain: (account: CachedAccount) => void,
  signOut: () => Promise<{ readonly error: Error | null }>,
): Promise<string | null> {
  pause();
  let message: string | null = null;
  try {
    retain(account);
  } catch (error) {
    message =
      error instanceof Error
        ? "The deleted account could not be retained for offline recovery. Keep the app open and retry."
        : "Unexpected device storage failure. Keep the app open and retry account cleanup.";
  }
  try {
    const result = await signOut();
    if (result.error)
      message = "Local sign-out could not finish. Uploads remain paused; retry when connected.";
  } catch (error) {
    message =
      error instanceof Error
        ? "Local sign-out could not finish. Uploads remain paused; retry when connected."
        : "Unexpected sign-out failure. Uploads remain paused; retry account cleanup.";
  }
  return message;
}

export async function persistDeliberateSignOut(
  account: CachedAccount,
  remove: () => void,
  restore: (account: CachedAccount) => void,
  isCurrent: () => boolean,
  completed: () => boolean,
  signOut: () => Promise<{ readonly error: Error | null }>,
): Promise<{ readonly error: Error | null }> {
  remove();
  try {
    const result = await signOut();
    if (result.error && !completed() && isCurrent()) restore(account);
    return result;
  } catch (error) {
    if (!completed() && isCurrent()) restore(account);
    throw error;
  }
}
