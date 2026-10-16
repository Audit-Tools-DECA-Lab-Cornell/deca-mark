import { ApiError } from "../data/api/errors";
import type { LocalDatabase } from "../storage/observation-store";
import { acknowledge, deferObservation, pendingObservations } from "../storage/sync-store";
import { type SyncScope, scopeKey, type Upload, type UploadResult } from "./contracts";
import { readOwnerScope, receiptMatches } from "./receipt";

type Options = {
  readonly database: LocalDatabase;
  readonly scope: SyncScope;
  readonly ownerKey?: string;
  readonly getToken: () => Promise<string | null>;
  readonly isCurrent: () => boolean;
  readonly upload: Upload;
  readonly now?: () => number;
  readonly outcome?: (result: UploadResult) => void;
};

function assertNever(value: never): never {
  throw new TypeError(`Unexpected synchronization outcome: ${String(value)}`);
}

export function createSyncCoordinator(options: Options) {
  let running = false;
  let signInRequired = false;
  const now = options.now ?? Date.now;
  const key = options.ownerKey ?? scopeKey(options.scope);
  const owner = readOwnerScope(key);
  const ownsScope =
    owner?.userId === options.scope.userId &&
    owner.issuer === options.scope.issuer &&
    owner.projectId === options.scope.projectId;
  return async (signal: AbortSignal): Promise<void> => {
    if (!ownsScope || running || signInRequired || signal.aborted || !options.isCurrent()) return;
    running = true;
    try {
      for (;;) {
        const pending = await pendingObservations(options.database, key, now());
        if (pending.length === 0) return;
        for (const item of pending) {
          if (signal.aborted || !options.isCurrent()) return;
          const token = await options.getToken();
          if (!token || signal.aborted || !options.isCurrent()) return;
          const attempted = await options.upload(item.record, token, signal, item.body);
          const result: UploadResult =
            attempted.kind === "accepted" &&
            !receiptMatches(attempted.receipt, item.record, options.scope)
              ? {
                  kind: "retry",
                  code: "unknown",
                  message: new ApiError("unknown", "retry").message,
                }
              : attempted;
          if (signal.aborted || !options.isCurrent()) return;
          switch (result.kind) {
            case "accepted":
              await acknowledge(
                options.database,
                key,
                result.receipt,
                item.record.id,
                () => !signal.aborted && options.isCurrent(),
              );
              options.outcome?.(result);
              break;
            case "rejected":
            case "retry":
            case "sign-in":
              await deferObservation(
                options.database,
                key,
                item.record.id,
                result.message,
                now() +
                  Math.max(
                    (result.retryAfter ?? 0) * 1000,
                    Math.min(300000, 5000 * 2 ** Math.min(item.attempts, 6)),
                  ),
                result.kind === "rejected",
                result.code,
                () => !signal.aborted && options.isCurrent(),
                result.issueCodes,
              );
              options.outcome?.(result);
              if (result.kind === "sign-in") {
                signInRequired = true;
                return;
              }
              break;
            default:
              assertNever(result);
          }
        }
        if (pending.length < 25) return;
      }
    } finally {
      running = false;
    }
  };
}
