import "server-only";

import { UNKNOWN_ERROR_COPY } from "@/lib/api/errors";
import { getWorkspace } from "@/lib/api/workspace";
import type { AccountSummary, Failure } from "@/lib/workspace/types";

/**
 * Who is looking at the invitation and join pages, as the server found out: someone signed in, someone
 * who still has to sign in, or a visitor whose sign-in could not be checked (DECA Mark is unreachable or
 * sign-in is off). Plain data, so a page can hand it to a client screen.
 */
export type Viewer =
	| { status: "signed-in"; account: AccountSummary }
	| { status: "signed-out" }
	| { status: "unavailable"; failure: Failure };

const UNKNOWN: Failure = { code: "unknown", kind: "retry", message: UNKNOWN_ERROR_COPY };

/**
 * The viewer, and the account to name in the header. The account is there whenever the sign-in is valid,
 * even if DECA Mark cannot be reached, so "Not you?" stays available. Reads the same cached workspace as
 * everything else on the request.
 */
export async function readViewer(): Promise<{ viewer: Viewer; account: AccountSummary | null }> {
	const workspace = await getWorkspace();
	if (workspace.status === "ready")
		return { viewer: { status: "signed-in", account: workspace.account }, account: workspace.account };
	const failure = workspace.failure ?? UNKNOWN;
	if (failure.kind === "sign-in") return { viewer: { status: "signed-out" }, account: null };
	return {
		viewer: { status: "unavailable", failure },
		account: workspace.account.userId !== null ? workspace.account : null
	};
}
