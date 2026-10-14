/**
 * After DELETE /v1/me answers 202, the profile and memberships are gone but removing the sign-in did not
 * finish. The request is safe to repeat, so the page sends it again a few times, about 30 seconds in all,
 * while the session is still valid (BE-08, WEB-06). A 204 then ends the session; otherwise the deletion
 * stays recorded and the person who runs DECA Mark completes it.
 */
export const DELETION_RETRY_DELAYS_MS = [5_000, 10_000, 15_000] as const;

/** How long to wait before the next try, or null when there is none left. */
export function nextDeletionRetry(tries: number, gaveUp: boolean): number | null {
	if (gaveUp) return null;
	return DELETION_RETRY_DELAYS_MS[tries] ?? null;
}

/**
 * DELETE /v1/me deletes whichever account the request is signed in as, and a browser's tabs share one
 * sign-in. So every try carries the id of the account the dialog was opened for, and goes ahead only while
 * that account is the one signed in: a sign-in from another tab is never deleted without its own confirmation.
 */
export function confirmedBySignedIn(confirmedFor: unknown, signedIn: string): boolean {
	return typeof confirmedFor === "string" && confirmedFor === signedIn;
}

export const OTHER_ACCOUNT_SIGNED_IN =
	"Nothing was deleted. A different account is signed in on this browser now. Reload the page to see which.";

/** The sentence after "Your profile and memberships are removed." while the deletion is finishing. */
export function deletionFinishingLine(tries: number, gaveUp: boolean, otherAccount = false): string {
	const total = DELETION_RETRY_DELAYS_MS.length;
	if (otherAccount)
		return "A different account is signed in on this browser now, so DECA Mark stopped trying. Removing your sign-in is recorded, and the person who runs DECA Mark will complete it.";
	if (nextDeletionRetry(tries, gaveUp) !== null)
		return `Removing your sign-in did not finish yet, so DECA Mark is trying again (${tries + 1} of ${total}).`;
	return "Removing your sign-in did not finish yet. It is recorded, and the person who runs DECA Mark will complete it.";
}
