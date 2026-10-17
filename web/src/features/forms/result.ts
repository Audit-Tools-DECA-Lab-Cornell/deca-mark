import { ApiError, apiRequestError, failedWrite } from "@/lib/api/errors";

/**
 * What a form action answers. A failure says what did not happen and why, in DECA Mark's own words. A 422
 * also carries the API's field problems; lifecycle/revision conflicts and missing preconditions
 * require an explicit reload or comparison.
 */
export type FormActionFailure = {
	readonly status: "failed";
	readonly message: string;
	/** Field id → problem, from a refused definition. */
	readonly fields?: Readonly<Record<string, string>>;
	/** Someone else changed the form at the same time. */
	readonly conflict?: boolean;
};

export type FormActionResult<T extends object = Record<never, never>> =
	| ({ readonly status: "done" } & T)
	| FormActionFailure;

export const CONFLICT_COPY = "This draft changed. Reload and review the latest draft before trying again.";
export const GONE_COPY = "This version is no longer there. It may have been discarded.";

/**
 * A failed change: "Nothing was saved." then why. A conflict, a vanished version and a refused definition
 * get their own sentences; every other refusal uses `errorCopy`. When DECA Mark did not answer, or failed on
 * its side, the change may have landed and the message says so (`failedWrite`). Anything that is not a
 * DECA Mark or network failure is rethrown.
 */
export function failedChange(nothing: string, error: unknown): FormActionFailure {
	const failure: ApiError = apiRequestError(error);
	if (failure.status === 409 || failure.status === 412 || failure.status === 428)
		return { status: "failed", message: `${nothing} ${CONFLICT_COPY}`, conflict: true };
	if (failure.status === 404) return { status: "failed", message: `${nothing} ${GONE_COPY}` };
	if (failure.code === "validation_failed")
		return {
			status: "failed",
			message: `${nothing} The form has problems that need fixing first.`,
			fields: failure.fields
		};
	return { status: "failed", message: failedWrite(nothing, failure) };
}
