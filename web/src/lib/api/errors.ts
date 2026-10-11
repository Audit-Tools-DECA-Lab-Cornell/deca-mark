import { z } from "zod";

import type { components } from "./schema";

type ApiErrorCode = components["schemas"]["ErrorCode"];
export type ErrorKind = "sign-in" | "retry" | "rejected";

/**
 * DECA Mark's own words for every error code the API sends. A screen shows these, never the server's
 * message, so nothing internal reaches a researcher. Written for people running a study: what did not
 * happen, why, and what to do next.
 */
export const errorCopy = {
	bad_request: "DECA Mark could not read what was sent. Check the values and try again.",
	unauthenticated: "Sign in to continue.",
	token_invalid: "You were signed out. Sign in again.",
	account_deleted: "This account has been deleted. Sign in with an active account.",
	membership_required: "You are no longer a member of this project. Ask its manager to add you again.",
	role_required: "Your role does not allow this. Ask a project manager.",
	limit_reached: "The account limit has been reached. Contact your organization owner.",
	not_found: "This is no longer available. It may have been removed, or your access may have changed.",
	method_not_allowed: "This action is not available here. Reload the page and try again.",
	invitation_invalid:
		"This invitation cannot be used. It may have been revoked or used up, or you may already be a member. Ask for a new one.",
	conflict: "Someone else changed this at the same time. Reload the page to see the latest, then try again.",
	publication_conflict:
		"The current map package changed. Your draft is preserved. Reload the site before publishing.",
	idempotency_conflict: "This request differs from an earlier change. Reload the page to check what was saved.",
	revision_conflict: "Someone else changed this draft. Reload it before saving again.",
	precondition_required: "Nothing was saved. Reload the site to get the current map package and draft.",
	payload_too_large: "Nothing was saved. The file is too large. Reduce its size and try again.",
	sole_owner: "Give another person this role first. An organization needs an owner and a project needs a manager.",
	invitation_expired: "This invitation has expired. Ask your project manager for a new one.",
	archive_unavailable: "This map package is unavailable. Ask the project manager to prepare it again.",
	validation_failed: "Check the values and try again.",
	unsupported_operation: "This action is not available yet.",
	rate_limited: "Too many tries. Wait a minute and try again.",
	internal: "DECA Mark could not finish this. Try again in a few minutes.",
	storage_unavailable: "DECA Mark cannot be reached right now. Try again in a few minutes."
} as const satisfies Readonly<Record<ApiErrorCode, string>>;

/** The copy for an answer that could not be read at all (an HTML proxy page, a malformed envelope). */
export const UNKNOWN_ERROR_COPY = "DECA Mark sent an answer this page could not read. Try again in a few minutes.";

const envelopeSchema = z.object({
	error: z.object({
		code: z.custom<ApiErrorCode>(value => typeof value === "string" && Object.hasOwn(errorCopy, value)),
		message: z.string(),
		details: z.record(z.string(), z.unknown()).optional()
	})
});

const fieldProblemSchema = z.object({ id: z.string(), problem: z.string() });

/**
 * A 422's `details.fields` as a map from field id to its problem, for showing each problem next to its
 * field. Ids are the request body's paths ("timezone", "definition.questions.0.label"); the first problem
 * for an id wins. Anything unreadable is left out.
 */
export function fieldProblems(details: unknown): Readonly<Record<string, string>> {
	if (typeof details !== "object" || details === null) return {};
	const list = (details as { fields?: unknown }).fields;
	if (!Array.isArray(list)) return {};
	const problems: Record<string, string> = {};
	for (const entry of list) {
		const parsed = fieldProblemSchema.safeParse(entry);
		if (parsed.success && !Object.hasOwn(problems, parsed.data.id)) problems[parsed.data.id] = parsed.data.problem;
	}
	return problems;
}

/** `Retry-After` as whole seconds to wait: a delay in seconds or an HTTP date. Undefined when unreadable. */
export function retryAfterSeconds(value: string | null | undefined, now = Date.now()): number | undefined {
	if (value === null || value === undefined || value.trim() === "") return undefined;
	const seconds = Number(value.trim());
	if (Number.isFinite(seconds)) return seconds >= 0 ? Math.max(1, Math.ceil(seconds)) : undefined;
	const date = Date.parse(value);
	if (Number.isNaN(date)) return undefined;
	return Math.max(1, Math.ceil((date - now) / 1000));
}

function unit(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/** "30 seconds", "2 minutes", "1 hour": how long to wait, rounded up to a unit a person reads. */
export function waitCopy(seconds: number): string {
	if (seconds < 60) return unit(Math.max(1, Math.ceil(seconds)), "second");
	if (seconds < 3600) return unit(Math.ceil(seconds / 60), "minute");
	return unit(Math.ceil(seconds / 3600), "hour");
}

function messageFor(code: ApiErrorCode | "unknown", retryAfter: number | undefined): string {
	if (code === "unknown") return UNKNOWN_ERROR_COPY;
	if (code === "rate_limited" && retryAfter !== undefined)
		return `Too many tries. Wait ${waitCopy(retryAfter)} and try again.`;
	return errorCopy[code];
}

export type ApiErrorOptions = {
	readonly status?: number;
	readonly retryAfter?: number;
	readonly fields?: Readonly<Record<string, string>>;
	readonly detail?: string;
};

export class ApiError extends Error {
	readonly name = "ApiError";
	readonly code: ApiErrorCode | "unknown";
	readonly kind: ErrorKind;
	/** The HTTP status, when there was a response. */
	readonly status: number | undefined;
	/** Seconds to wait before trying again (429 with `Retry-After`). */
	readonly retryAfter: number | undefined;
	/** Field id → problem, from a 422's `details.fields`. Empty otherwise. */
	readonly fields: Readonly<Record<string, string>>;
	/**
	 * The server's own message, kept only for `validation_failed`: a draft editor may show why a definition
	 * was refused. Every other screen shows `message`.
	 */
	readonly detail: string | undefined;

	constructor(code: ApiErrorCode | "unknown", kind: ErrorKind, options: ApiErrorOptions = {}) {
		super(messageFor(code, options.retryAfter));
		this.code = code;
		this.kind = kind;
		this.status = options.status;
		this.retryAfter = options.retryAfter;
		this.fields = options.fields ?? {};
		this.detail = code === "validation_failed" ? options.detail : undefined;
	}
}

type HeaderSource = { get(name: string): string | null } | null | undefined;

/**
 * An error response as an ApiError. 401 is always a sign-in problem and 5xx always worth retrying; a 410
 * or 429 without a readable envelope still reads as an expired invitation or a throttle.
 */
export function parseApiError(status: number, body: unknown, headers?: HeaderSource): ApiError {
	const parsed = envelopeSchema.safeParse(body);
	const retryAfter = status === 429 ? retryAfterSeconds(headers?.get("Retry-After")) : undefined;
	const options: ApiErrorOptions = {
		status,
		retryAfter,
		fields: parsed.success ? fieldProblems(parsed.data.error.details) : {},
		detail: parsed.success ? parsed.data.error.message : undefined
	};
	if (status === 401)
		return new ApiError(parsed.success ? parsed.data.error.code : "token_invalid", "sign-in", options);
	if (status >= 500)
		return new ApiError(parsed.success ? parsed.data.error.code : "storage_unavailable", "retry", options);
	if (!parsed.success) {
		if (status === 410) return new ApiError("invitation_expired", "rejected", options);
		if (status === 429) return new ApiError("rate_limited", "retry", options);
		return new ApiError("unknown", "retry", options);
	}
	const code = parsed.data.error.code;
	switch (code) {
		case "unauthenticated":
		case "token_invalid":
			return new ApiError(code, "sign-in", options);
		case "rate_limited":
		case "internal":
		case "storage_unavailable":
			return new ApiError(code, "retry", options);
		case "bad_request":
		case "account_deleted":
		case "membership_required":
		case "role_required":
		case "limit_reached":
		case "not_found":
		case "method_not_allowed":
		case "invitation_invalid":
		case "conflict":
		case "publication_conflict":
		case "idempotency_conflict":
		case "revision_conflict":
		case "precondition_required":
		case "payload_too_large":
		case "sole_owner":
		case "invitation_expired":
		case "archive_unavailable":
		case "validation_failed":
		case "unsupported_operation":
			return new ApiError(code, "rejected", options);
		default: {
			const unreachable: never = code;
			throw new RangeError(`Unhandled API error code: ${unreachable}`);
		}
	}
}

export async function readApiError(response: Response): Promise<ApiError> {
	let body: unknown;
	try {
		body = await response.json();
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
	}
	return parseApiError(response.status, body, response.headers);
}

/**
 * A failed request as an ApiError: an ApiError passes through, an unreadable body is "unknown", and a
 * network failure or timeout means DECA Mark could not be reached. Anything else is a bug, or a Next.js
 * redirect or not-found signal, and is rethrown untouched.
 */
export function apiRequestError(error: unknown): ApiError {
	if (error instanceof ApiError) return error;
	if (error instanceof SyntaxError) return new ApiError("unknown", "retry");
	if (error instanceof TypeError || error instanceof DOMException)
		return new ApiError("storage_unavailable", "retry");
	throw error;
}

/** What a change says when DECA Mark did not answer it, or answered with a failure of its own. */
export const UNCONFIRMED_CHANGE_COPY =
	"DECA Mark could not confirm the change. Reload the page to check before you try again.";

/**
 * Whether DECA Mark answered a change with a refusal (any 4xx: signed out, no role, a conflict, an expired
 * invitation, a field problem, too many tries), so nothing changed. False for no answer at all (a timeout,
 * a lost connection, an unreadable reply) and for a failure on its side (5xx): the change may have landed.
 */
export function wasRefused(error: unknown): error is ApiError {
	return error instanceof ApiError && error.status !== undefined && error.status < 500;
}

/**
 * The message for a change that failed. A refusal says so ("Nothing was saved." then why); anything else
 * does not claim the change did not happen. Pass what `apiRequestError` returned.
 */
export function failedWrite(nothing: string, error: unknown): string {
	return wasRefused(error) ? `${nothing} ${error.message}` : UNCONFIRMED_CHANGE_COPY;
}
