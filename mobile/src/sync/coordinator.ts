import { ApiError } from "../data/api/errors";
import type { LocalDatabase } from "../storage/observation-store";
import {
  acknowledge,
  deferObservation,
  pendingObservations,
  releaseBackoff,
} from "../storage/sync-store";
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
  /**
   * Where a server's `Retry-After` is kept (a time in ms). Give the same one to the next coordinator
   * of the same account, so a token refresh that rebuilds this one does not forget what the server asked.
   */
  readonly hold?: { readonly get: () => number; readonly set: (until: number) => void };
};

function assertNever(value: never): never {
  throw new TypeError(`Unexpected synchronization outcome: ${String(value)}`);
}

/** The first retry delay: a reconnect never brings a record's next try closer than this to the last one. */
const RELEASE_SPACING = 5000;

/**
 * One fenced drain of this account's pending records. The drain resolves to whether any stored record
 * changed in a way a screen shows, and `regain()` asks the next drain to retry waiting records at once
 * (connectivity or the foreground came back) instead of after the delay they were given while offline.
 * A new coordinator, made at every sign-in, starts by doing that.
 */
export type SyncCoordinator = ((signal: AbortSignal) => Promise<boolean>) & {
  readonly regain: () => void;
};

export function createSyncCoordinator(options: Options): SyncCoordinator {
  let running = false;
  let signInRequired = false;
  let regainRequested = true;
  // When records were last made due: with the server's `Retry-After` below, it keeps a flapping
  // connection from retrying more often than the delays did. It belongs to this sign-in and dies
  // with the coordinator, so the first drain after the next sign-in is never held back by it.
  let releasedAt = Number.NEGATIVE_INFINITY;
  let local = 0;
  const hold = options.hold ?? {
    get: () => local,
    set: (until: number) => {
      local = until;
    },
  };
  const now = options.now ?? Date.now;
  const key = options.ownerKey ?? scopeKey(options.scope);
  const owner = readOwnerScope(key);
  const ownsScope =
    owner?.userId === options.scope.userId &&
    owner.issuer === options.scope.issuer &&
    owner.projectId === options.scope.projectId;
  const drain = async (signal: AbortSignal): Promise<boolean> => {
    if (!ownsScope || running || signInRequired || signal.aborted || !options.isCurrent())
      return false;
    running = true;
    let changed = false;
    try {
      if (regainRequested) {
        regainRequested = false;
        const at = now();
        // A release already ahead is reused, so a run of reconnects cannot push it further away.
        const due = Math.max(
          releasedAt > at ? releasedAt : Math.max(at, releasedAt + RELEASE_SPACING),
          hold.get(),
        );
        releasedAt = due;
        await releaseBackoff(options.database, key, at, due, options.isCurrent);
      }
      for (;;) {
        const pending = await pendingObservations(options.database, key, now());
        if (pending.length === 0) return changed;
        for (const item of pending) {
          if (signal.aborted || !options.isCurrent()) return changed;
          const token = await options.getToken();
          if (!token || signal.aborted || !options.isCurrent()) return changed;
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
          if (signal.aborted || !options.isCurrent()) return changed;
          switch (result.kind) {
            case "accepted":
              changed =
                (await acknowledge(
                  options.database,
                  key,
                  result.receipt,
                  item.record.id,
                  () => !signal.aborted && options.isCurrent(),
                )) || changed;
              options.outcome?.(result);
              break;
            case "rejected":
            case "retry":
            case "sign-in": {
              const failedAt = now();
              const asked = (result.retryAfter ?? 0) * 1000;
              if (result.kind === "retry" && asked > 0)
                hold.set(Math.max(hold.get(), failedAt + asked));
              changed =
                (await deferObservation(
                  options.database,
                  key,
                  item.record.id,
                  result.message,
                  failedAt +
                    Math.max(asked, Math.min(300000, 5000 * 2 ** Math.min(item.attempts, 6))),
                  result.kind === "rejected",
                  result.code,
                  () => !signal.aborted && options.isCurrent(),
                  result.issueCodes,
                )) || changed;
              options.outcome?.(result);
              if (result.kind === "sign-in") {
                signInRequired = true;
                return changed;
              }
              break;
            }
            default:
              assertNever(result);
          }
        }
        if (pending.length < 25) return changed;
      }
    } finally {
      running = false;
    }
  };
  return Object.assign(drain, {
    regain: () => {
      regainRequested = true;
    },
  });
}
