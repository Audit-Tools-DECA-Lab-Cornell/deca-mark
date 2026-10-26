import { z } from "zod";
import type { components } from "./schema";

type ApiErrorCode = components["schemas"]["ErrorCode"];
type ErrorKind = "sign-in" | "retry" | "rejected";

export const errorCopy = {
  bad_request: "The request could not be read. Check the data and try again.",
  unauthenticated: "Sign in to continue.",
  token_invalid: "Your session expired. Sign in again.",
  account_deleted: "This account has been deleted. Sign in with an active account.",
  membership_required: "You are no longer a member of this project. Contact its manager.",
  role_required: "Your role cannot perform this action. Contact the project manager.",
  limit_reached: "The account limit has been reached. Contact your organization owner.",
  not_found: "This item is no longer available. Refresh the project.",
  method_not_allowed: "This action is not supported by the server. Update the app.",
  invitation_invalid: "This invitation is not valid. Ask for a new invitation.",
  conflict: "A different upload already uses this record ID. Your local record is preserved.",
  publication_conflict:
    "The current map package changed. Refresh the project. Your local record is preserved.",
  idempotency_conflict:
    "This request differs from an earlier change. Your local record is preserved.",
  revision_conflict: "This draft changed. Refresh the project. Your local record is preserved.",
  precondition_required:
    "Refresh the project before trying this action again. Your local record is preserved.",
  payload_too_large:
    "This upload is too large. Contact the project manager. Your local record is preserved.",
  sole_owner: "Assign another owner before leaving or removing this owner.",
  invitation_expired: "This invitation has expired. Ask for a new invitation.",
  archive_unavailable: "This map package is unavailable. Ask the manager to prepare it again.",
  validation_failed: "Check the form values. Your local record is preserved.",
  unknown_schema_version:
    "Update DECA Mark to use this form. Installed maps and unfinished work are retained on this device.",
  unsupported_operation: "This action is not supported. Update the app before trying again.",
  rate_limited: "Sync is busy. Your record is saved and will retry.",
  internal: "Server unavailable. Your record is saved and will retry.",
  storage_unavailable: "Server unavailable. Your record is saved and will retry.",
} as const satisfies Readonly<Record<ApiErrorCode, string>>;

const envelopeSchema = z.object({
  error: z.object({
    code: z.custom<ApiErrorCode>(
      (value) => typeof value === "string" && Object.hasOwn(errorCopy, value),
    ),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

export class ApiError extends Error {
  readonly name = "ApiError";
  readonly code: ApiErrorCode | "unknown";
  readonly kind: ErrorKind;
  /** Seconds the server asked to wait (`Retry-After` on 429 rate_limited), when it said. */
  readonly retryAfter: number | null;
  readonly httpStatus: number | null;

  constructor(
    code: ApiErrorCode | "unknown",
    kind: ErrorKind,
    retryAfter: number | null = null,
    httpStatus: number | null = null,
  ) {
    super(
      code === "unknown"
        ? "The server response could not be verified. Your record is saved and will retry."
        : errorCopy[code],
    );
    this.code = code;
    this.kind = kind;
    this.retryAfter = retryAfter;
    this.httpStatus = httpStatus;
  }
}

/** `Retry-After` in seconds: a delay, or an HTTP date measured from `now`. Null when absent or unreadable. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (value === null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}

export function parseApiError(status: number, body: unknown): ApiError {
  const parsed = envelopeSchema.safeParse(body);
  if (status === 401)
    return new ApiError(parsed.success ? parsed.data.error.code : "token_invalid", "sign-in");
  if (status >= 500)
    return new ApiError(parsed.success ? parsed.data.error.code : "storage_unavailable", "retry");
  if (!parsed.success) return new ApiError("unknown", "retry");
  const code = parsed.data.error.code;
  switch (code) {
    case "unauthenticated":
    case "token_invalid":
      return new ApiError(code, "sign-in");
    case "rate_limited":
    case "internal":
    case "storage_unavailable":
      return new ApiError(code, "retry");
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
    case "unknown_schema_version":
    case "unsupported_operation":
      return new ApiError(code, "rejected");
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
  const error = parseApiError(response.status, body);
  const wait = retryAfterSeconds(response.headers.get("Retry-After"));
  return new ApiError(error.code, error.kind, wait, response.status);
}
