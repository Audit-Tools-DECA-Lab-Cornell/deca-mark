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
import { activateHeldObservations, earliestRetry, retryAttention } from "../storage/sync-store";
import { createBoundUpload } from "./bound-upload";
import { connection } from "./config";
import { type SyncScope, scopeKey } from "./contracts";
import { createSyncCoordinator } from "./coordinator";
import { createForegroundDrain, FailedAfterChange } from "./foreground";

/** After a pass that threw (a locked database, say), try again once this many milliseconds have passed. */
const FAILED_PASS_RETRY = 5000;

/** The longest delay `setTimeout` takes; a longer one fires at once. A timer this long wakes early and sets the rest. */
const LONGEST_TIMER = 2 ** 31 - 1;

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
      outcome: (result) => {
        if (!current()) return;
        setFailure({ owner: key, message: result.kind === "accepted" ? "" : result.message });
        if (result.kind !== "accepted" && result.code === "account_deleted") deleted.current();
      },
    });
    // One timer, for the earliest moment a waiting record may be tried (or a failed pass tried again).
    // A record that is already due when a pass ends (its delay ran out during a slower upload) is
    // woken at once. If the same record is still the earliest after that wake, nothing could send
    // it: it is left alone (a save, reconnect, resume or new token wakes it again) and only a record
    // with a later moment is waited for. After a 401 nothing is sent until the token changes, so
    // no timer is set at all.
    let lastDue: number | null = null;
    let timer: { readonly handle: ReturnType<typeof setTimeout>; readonly at: number } | undefined;
    const wakeAt = (at: number) => {
      if (!current() || drain.signInRequired() || (timer !== undefined && timer.at <= at)) return;
      if (timer) clearTimeout(timer.handle);
      const handle = setTimeout(
        () => {
          timer = undefined;
          void queue.wake();
        },
        Math.min(LONGEST_TIMER, Math.max(0, at - Date.now())),
      );
      timer = { handle, at };
    };
    const waitForNext = async (afterFailure: boolean) => {
      if (drain.signInRequired()) return;
      const next = await earliestRetry(database, key);
      if (next === null) return;
      const at = Date.now();
      // A pass that threw is tried again by `failed`, not at once.
      if (next <= at && afterFailure) return;
      if (next > at) {
        lastDue = null;
        wakeAt(next);
      } else if (lastDue === next) {
        const later = await earliestRetry(database, key, at);
        if (later !== null) wakeAt(later);
      } else {
        lastDue = next;
        wakeAt(at);
      }
    };
    const queue = createForegroundDrain({
      current,
      changed,
      failed: (error) => {
        setFailure({ owner: key, message: error.message });
        wakeAt(Date.now() + FAILED_PASS_RETRY);
      },
      drain: async () => {
        const activated = await activateHeldObservations(database, key, currentScope, current);
        if (!canSend()) return activated;
        request = new AbortController();
        let updated = activated;
        let failure: unknown;
        try {
          updated = (await drain(request.signal)) || activated;
        } catch (error) {
          failure = error;
        }
        try {
          await waitForNext(failure !== undefined);
        } catch (error) {
          failure ??= error;
        }
        if (failure === undefined) return updated;
        // The screens still read a change this pass stored before it failed.
        throw updated && failure instanceof Error && !(failure instanceof FailedAfterChange)
          ? new FailedAfterChange(failure)
          : failure;
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
