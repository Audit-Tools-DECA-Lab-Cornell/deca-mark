import { unstable_isUnrecognizedActionError } from "next/navigation";

import { UNCONFIRMED_CHANGE_COPY } from "@/lib/api/errors";

/**
 * What a rejected Server Action call tells the page (WEB-44, audit C03, decision D34).
 *
 * Every Server Action in the app catches its own API failures and answers with a result, so a call that
 * rejects instead never reached that code or never came back: the network dropped, the session ended, or
 * the page is older than the server's build. React sends a rejection to the nearest error boundary, which
 * unmounts the screen and throws the typed work away, so each client call site catches it here and keeps
 * the screen mounted. Import this from client components only: `unstable_isUnrecognizedActionError` throws
 * on the server.
 */

/** The fixed answer the proxy gives a Server Action POST from a signed-out browser (see `proxy.ts`). */
export const SIGNED_OUT_REPLY = "Signed out";

/**
 * Why the call rejected. "updated" and "signed-out" are known not to have run the action: the server did
 * not recognise it, or the proxy stopped it before it ran. "unknown" is every other rejection (a dropped
 * connection, a failed fetch, a reply that was cut off), where the action may have run and committed.
 */
export type Cause = "updated" | "signed-out" | "unknown";

export function causeOf(error: unknown): Cause {
	if (unstable_isUnrecognizedActionError(error)) return "updated";
	if (error instanceof Error && error.message === SIGNED_OUT_REPLY) return "signed-out";
	return "unknown";
}

/**
 * What the person has at stake on the screen.
 * - `kept`: wording they typed stays on the screen and can be sent again.
 * - `reload`: nothing typed is at stake (a button, or a small create form), so a reload is the way to check.
 * - `read`: the call only reads, so nothing can have changed.
 */
export type Stake = "kept" | "reload" | "read";

/**
 * The sentence for a rejected call. `nothing` is the screen's own "Nothing was saved." (or "Nothing more was
 * loaded."), said only when the call is known not to have changed anything: an update that never ran, or a
 * read. An unknown outcome never claims it (`failedWrite` and `wasRefused` hold the same rule).
 */
export function rejectionCopy(cause: Cause, stake: Stake, nothing: string): string {
	switch (cause) {
		case "updated":
			return stake === "read"
				? `${nothing} DECA Mark was updated while this page was open. Reload the page and try again.`
				: stake === "kept"
					? `DECA Mark was updated while this page was open. ${nothing} Copy your wording, reload, then paste and save.`
					: `DECA Mark was updated while this page was open. ${nothing} Reload the page and try again.`;
		case "signed-out":
			return stake === "read"
				? `You were signed out. ${nothing} Open DECA Mark in another tab, sign in, then try again here.`
				: stake === "kept"
					? `You were signed out. ${nothing} Your wording is still here. Open DECA Mark in another tab, sign in, then save here.`
					: `You were signed out. ${nothing} Open DECA Mark in another tab, sign in, then try again here.`;
		case "unknown":
			return stake === "read"
				? `${nothing} Check the connection and try again.`
				: stake === "kept"
					? "DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected."
					: UNCONFIRMED_CHANGE_COPY;
	}
}

/** `rejectionCopy` for the error a `catch` received. */
export function rejectedWith(error: unknown, stake: Stake, nothing: string): string {
	return rejectionCopy(causeOf(error), stake, nothing);
}
