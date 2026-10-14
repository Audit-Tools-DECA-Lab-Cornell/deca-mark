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

/** The sentence after "Your profile and memberships are removed." while the deletion is finishing. */
export function deletionFinishingLine(tries: number, gaveUp: boolean): string {
	const total = DELETION_RETRY_DELAYS_MS.length;
	if (nextDeletionRetry(tries, gaveUp) !== null)
		return `Removing your sign-in did not finish yet, so DECA Mark is trying again (${tries + 1} of ${total}).`;
	return "Removing your sign-in did not finish yet. It is recorded, and the person who runs DECA Mark will complete it.";
}
