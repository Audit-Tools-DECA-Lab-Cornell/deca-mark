import NetInfo from "@react-native-community/netinfo";
import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useAccount } from "../auth/provider";
import { earliestRetry, retryAttention } from "../storage/sync-store";
import { createBoundUpload } from "./bound-upload";
import { connection } from "./config";
import { type SyncScope, scopeKey } from "./contracts";
import { createSyncCoordinator } from "./coordinator";
import { createForegroundDrain } from "./foreground";

/** After a pass that threw (a locked database, say), try again once this many milliseconds have passed. */
const FAILED_PASS_RETRY = 5000;

const SyncContext = createContext({
  revision: 0,
  error: "",
  wake: () => {},
  retry: async () => {},
});

/**
 * Foreground only: reconnect, save, explicit retry and resume wake the same fenced uploader. A
 * reconnect or a resume also makes records waiting out a retry delay due again (the coordinator
 * keeps that from becoming a hot loop and keeps any `Retry-After`), and the only other wake-up is
 * one timer set for the earliest delay that is still running: an idle queue does nothing.
 */
export function SyncProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const { key, scope, session, client, accountDeleted, ready, markAccountDeleted } = useAccount();
  const [revision, setRevision] = useState(0);
  const [failure, setFailure] = useState({ owner: key, message: "" });
  const authenticated =
    ready &&
    session !== null &&
    client !== null &&
    !accountDeleted &&
    session.user.id === scope?.userId;
  const sessionToken = session?.access_token ?? null;
  const scopeIdentity = scope ? scopeKey(scope) : null;
  const latest = useRef({ key, scopeIdentity, authenticated, sessionToken });
  latest.current = { key, scopeIdentity, authenticated, sessionToken };
  const scopeNow = useRef(scope);
  scopeNow.current = scope;
  const deleted = useRef(markAccountDeleted);
  deleted.current = markAccountDeleted;
  // What a server asked to wait for, per account: it outlives the coordinator a token refresh rebuilds.
  const holds = useRef(new Map<string, number>());
  const run = useRef(async () => {});
  const retryNow = useRef(async () => {});
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const wake = useCallback(() => {
    changed();
    void run.current();
  }, [changed]);
  const retry = useCallback(async () => retryNow.current(), []);

  useEffect(() => {
    const currentScope: SyncScope | null = scopeNow.current;
    if (!authenticated || !client || !currentScope || !scopeIdentity) {
      run.current = async () => {};
      retryNow.current = async () => {};
      return;
    }
    const controller = new AbortController();
    let request = new AbortController();
    let foregroundActive = AppState.currentState === "active";
    let online = false;
    const current = () =>
      !controller.signal.aborted &&
      latest.current.key === key &&
      latest.current.scopeIdentity === scopeIdentity &&
      latest.current.authenticated &&
      latest.current.sessionToken === sessionToken;
    const canSend = () => current() && foregroundActive && online;
    setFailure({ owner: key, message: "" });
    const drain = createSyncCoordinator({
      database,
      ownerKey: key,
      scope: currentScope,
      isCurrent: canSend,
      getToken: async () => {
        if (!current()) return null;
        const { data } = await client.auth.getSession();
        return current() && data.session?.user.id === currentScope.userId
          ? data.session.access_token
          : null;
      },
      upload: createBoundUpload(connection.apiUrl, currentScope),
      hold: {
        get: () => holds.current.get(key) ?? 0,
        set: (until) => holds.current.set(key, until),
      },
      outcome: (result) => {
        if (!current()) return;
        setFailure({ owner: key, message: result.kind === "accepted" ? "" : result.message });
        if (result.kind !== "accepted" && result.code === "account_deleted") deleted.current();
      },
    });
    // One timer, for the earliest moment a waiting record may be tried (or a failed pass tried again).
    let timer: { readonly handle: ReturnType<typeof setTimeout>; readonly at: number } | undefined;
    const wakeAt = (at: number) => {
      if (!current() || (timer !== undefined && timer.at <= at)) return;
      if (timer) clearTimeout(timer.handle);
      const handle = setTimeout(
        () => {
          timer = undefined;
          void queue.wake();
        },
        Math.max(0, at - Date.now()),
      );
      timer = { handle, at };
    };
    const waitForNext = async () => {
      const next = await earliestRetry(database, key, Date.now());
      if (next !== null) wakeAt(next);
    };
    const queue = createForegroundDrain({
      current,
      changed,
      failed: (error) => {
        setFailure({ owner: key, message: error.message });
        wakeAt(Date.now() + FAILED_PASS_RETRY);
      },
      drain: async () => {
        if (!canSend()) return false;
        request = new AbortController();
        try {
          return await drain(request.signal);
        } finally {
          await waitForNext();
        }
      },
    });
    run.current = queue.wake;
    retryNow.current = async () => {
      if (!current()) return;
      await retryAttention(database, key, current);
      if (current()) {
        changed();
        await queue.wake();
      }
    };
    queue.foreground(foregroundActive);
    const foreground = AppState.addEventListener("change", (value) => {
      const resumed = value === "active" && !foregroundActive;
      foregroundActive = value === "active";
      if (!foregroundActive) request.abort();
      if (resumed) drain.regain();
      queue.foreground(foregroundActive);
    });
    const network = NetInfo.addEventListener((value) => {
      const reconnected = !online;
      online = value.isConnected === true && value.isInternetReachable !== false;
      if (!online) request.abort();
      if (online && reconnected) drain.regain();
      queue.connectivity(online);
    });
    return () => {
      controller.abort();
      request.abort();
      if (timer) clearTimeout(timer.handle);
      foreground.remove();
      network();
      run.current = async () => {};
      retryNow.current = async () => {};
    };
  }, [authenticated, client, database, key, scopeIdentity, sessionToken, changed]);

  return (
    <SyncContext
      value={{ revision, error: failure.owner === key ? failure.message : "", wake, retry }}
    >
      {children}
    </SyncContext>
  );
}
export function useSync() {
  return useContext(SyncContext);
}
