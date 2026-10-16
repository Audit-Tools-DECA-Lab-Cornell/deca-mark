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
import { activateHeldObservations, retryAttention } from "../storage/sync-store";
import { createBoundUpload } from "./bound-upload";
import { connection } from "./config";
import { type SyncScope, scopeKey } from "./contracts";
import { createSyncCoordinator } from "./coordinator";
import { createForegroundDrain } from "./foreground";

const SyncContext = createContext({
  revision: 0,
  error: "",
  wake: () => {},
  retry: async () => {},
});

/** Foreground only: reconnect, save, explicit retry and resume wake the same fenced uploader. */
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
    const queue = createForegroundDrain({
      current,
      changed,
      failed: (error) => setFailure({ owner: key, message: error.message }),
      drain: async () => {
        await activateHeldObservations(database, key, currentScope, current);
        if (canSend()) {
          request = new AbortController();
          await drain(request.signal);
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
      foregroundActive = value === "active";
      if (!foregroundActive) request.abort();
      queue.foreground(foregroundActive);
    });
    const network = NetInfo.addEventListener((value) => {
      online = value.isConnected === true && value.isInternetReachable !== false;
      if (!online) request.abort();
      queue.connectivity(online);
    });
    const timer = setInterval(() => {
      void queue.wake();
    }, 5000);
    return () => {
      controller.abort();
      request.abort();
      clearInterval(timer);
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
