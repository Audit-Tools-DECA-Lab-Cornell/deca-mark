import { ApiError } from "@/lib/api/errors";

import type { Failure } from "./save-queue";

/**
 * A failed request in the save queue's words: an answer with its status, or no answer at all. A session
 * that ended before anything was sent counts as signed out (401), never as a lost answer.
 */
export function queueFailure(error: unknown): Failure {
	if (error instanceof ApiError && error.status === undefined && error.kind === "sign-in")
		return { kind: "http", status: 401, code: error.code };
	if (error instanceof ApiError && error.status !== undefined)
		return {
			kind: "http",
			status: error.status,
			code: error.code,
			issues: error.issues.map(issue => ({ code: issue.code, zoneIds: issue.zoneIds, path: issue.path })),
			...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
			...(error.requestId !== undefined ? { requestId: error.requestId } : {})
		};
	return { kind: "network" };
}
