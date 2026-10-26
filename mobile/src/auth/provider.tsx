import type { Session, SupabaseClient } from "@supabase/supabase-js";
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
import { ScreenMessage } from "../components/screen-message";
import { connection } from "../sync/config";
import { removeAccountSummary } from "./account-summaries";
import { type CachedAccount, forgetAccount, rememberAccount } from "./cached-account";
import { createAuthClient } from "./client";
import { deletedAccountStore } from "./deleted-account";
import {
  allowedSession,
  deletionStillApplies,
  isAccountDeleted,
  persistDeletedSignOut,
  persistDeliberateSignOut,
} from "./deleted-session";
import { accountWorkspace, sessionChange, signInRecovery } from "./session-retention";

type AuthState = {
  readonly client: SupabaseClient | null;
  readonly session: Session | null;
  readonly account: CachedAccount | null;
  readonly ready: boolean;
  /**
   * The stored session has been read back (or the first auth event arrived), so a null `session`
   * means there is none, not that it is still loading.
   */
  readonly restored: boolean;
  /**
   * The account the server reported deleted (403 account_deleted), set by markAccountDeleted and
   * restored from the deleted-account marker on restart. Cleared when another account signs in.
   */
  readonly deletedUserId: string | null;
  readonly error: string | null;
};
const initial: AuthState = {
  client: null,
  session: null,
  account: null,
  ready: !connection,
  restored: false,
  deletedUserId: null,
  error: null,
};
type AuthContextValue = AuthState & {
  readonly recovery: ReturnType<typeof signInRecovery>;
  /**
   * Treats the account on this device as deleted (403 account_deleted, or a deletion it confirmed). Pass
   * the account it is for: nothing happens once another account, or none, is on this device.
   */
  readonly markAccountDeleted: (expectedUserId?: string) => void;
  readonly signOut: () => Promise<{ readonly error: Error | null }>;
};
const AuthContext = createContext<AuthContextValue>({
  ...initial,
  recovery: null,
  markAccountDeleted: () => {},
  signOut: async (): Promise<{ error: Error | null }> => ({ error: null }),
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(initial);
  const deleted = useRef<string | null>(null);
  const retainedIdentity = useRef({ account: state.account, error: state.error });
  retainedIdentity.current = { account: state.account, error: state.error };
  const currentAccount = useRef<string | null>(state.account?.id ?? null);
  currentAccount.current = state.account?.id ?? null;
  const deliberate = useRef<{ readonly userId: string; completed: boolean } | null>(null);
  const signOut = useCallback(async () => {
    if (!state.client || !state.account) return { error: null };
    const client = state.client;
    const attempt = { userId: state.account.id, completed: false };
    deliberate.current = attempt;
    try {
      const result = await persistDeliberateSignOut(
        state.account,
        forgetAccount,
        (account) => rememberAccount(account, connection.supabaseUrl),
        () => currentAccount.current === attempt.userId,
        () => attempt.completed,
        () => client.auth.signOut({ scope: "local" }),
      );
      // Offline, Supabase still removes this device's session (SIGNED_OUT) and then reports that it
      // could not reach the server. For a sign-out on this device, that is done (MOB-07).
      const done = !result.error || attempt.completed;
      if (done && currentAccount.current === attempt.userId) {
        currentAccount.current = null;
        retainedIdentity.current = { account: null, error: null };
        setState((previous) => ({ ...previous, account: null, session: null, error: null }));
      }
      return done ? { error: null } : result;
    } finally {
      if (deliberate.current === attempt) deliberate.current = null;
    }
  }, [state.client, state.account]);
  const markAccountDeleted = useCallback(
    (expectedUserId?: string) => {
      const account = state.account;
      const client = state.client;
      if (!account || !client) return;
      // A caller can hold this callback across a sign-out or an account change (a deletion still retrying
      // after its screen closed): it never touches the account on this device now.
      if (!deletionStillApplies(expectedUserId ?? account.id, account.id, currentAccount.current))
        return;
      void persistDeletedSignOut(
        account,
        () => {
          deleted.current = account.id;
          client.auth.stopAutoRefresh();
          setState((previous) => ({
            ...previous,
            session: null,
            deletedUserId: account.id,
            error: "This account has been deleted. Local records remain available.",
          }));
        },
        (retained) => {
          deletedAccountStore(connection.supabaseUrl).write(retained);
          forgetAccount();
        },
        () => client.auth.signOut({ scope: "local" }),
      ).then((error) => {
        if (error && deleted.current === account.id)
          setState((previous) => ({ ...previous, error }));
      });
    },
    [state.account, state.client],
  );
  useEffect(() => {
    let active = true;
    let release = () => {};
    void createAuthClient()
      .then((result) => {
        if (!result) return;
        const { client, account, deletedUserId } = result;
        deleted.current = deletedUserId;
        retainedIdentity.current = { account, error: null };
        if (!active) {
          client.auth.stopAutoRefresh();
          return;
        }
        setState({
          client,
          account,
          session: null,
          ready: true,
          restored: false,
          deletedUserId,
          error: null,
        });
        let authChanged = false;
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (
            event === "SIGNED_OUT" &&
            deliberate.current?.userId === retainedIdentity.current.account?.id &&
            deliberate.current
          )
            deliberate.current.completed = true;
          if (event === "SIGNED_IN" && session && session.user.id !== deleted.current) {
            deleted.current = null;
            deletedAccountStore(connection.supabaseUrl).clear();
          }
          // An account that signs in again sees its own records: welcome stops naming them (MOB-05).
          if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session)
            removeAccountSummary(session.user.id);
          if (event === "SIGNED_OUT" && !deleted.current)
            deletedAccountStore(connection.supabaseUrl).clear();
          if (deleted.current && (!session || !allowedSession(session, deleted.current))) return;
          authChanged = true;
          const identity = sessionChange(
            retainedIdentity.current.account,
            event,
            session,
            connection.supabaseUrl,
            deliberate.current?.userId ?? null,
            retainedIdentity.current.error,
          );
          retainedIdentity.current = identity;
          currentAccount.current = identity.account?.id ?? null;
          if (active)
            setState({
              client,
              ready: true,
              restored: true,
              deletedUserId: deleted.current,
              ...identity,
            });
        });
        const appState = AppState.addEventListener("change", (value) => {
          if (value === "active" && !deleted.current) client.auth.startAutoRefresh();
          else client.auth.stopAutoRefresh();
        });
        if (AppState.currentState === "active" && !deleted.current) client.auth.startAutoRefresh();
        release = () => {
          data.subscription.unsubscribe();
          appState.remove();
          client.auth.stopAutoRefresh();
        };
        void client.auth
          .getSession()
          .then(({ data: sessionData, error }) => {
            if (active && !authChanged)
              setState((previous) => ({
                client,
                session: allowedSession(sessionData.session, deleted.current),
                account:
                  allowedSession(sessionData.session, deleted.current)?.user ?? previous.account,
                ready: true,
                restored: true,
                deletedUserId: deleted.current,
                error: error ? "Could not restore sign-in. Try signing in again." : null,
              }));
          })
          .catch(() => {
            if (active && !authChanged)
              setState((previous) => ({
                ...previous,
                client,
                session: null,
                ready: true,
                restored: true,
                error: "Could not restore sign-in. Saved account records remain available offline.",
              }));
          });
      })
      .catch(() => {
        if (active)
          setState({
            client: null,
            session: null,
            account: null,
            ready: true,
            restored: true,
            deletedUserId: null,
            error:
              "Sign-in could not start. Rebuild the development app after installing its native dependencies.",
          });
      });
    return () => {
      active = false;
      release();
    };
  }, []);
  return (
    <AuthContext
      value={{
        ...state,
        recovery: signInRecovery(state.account, state.session, deleted.current),
        markAccountDeleted,
        signOut,
      }}
    >
      {state.ready ? (
        children
      ) : (
        <ScreenMessage
          title="Opening your workspace"
          detail="Restoring the account saved on this device…"
        />
      )}
    </AuthContext>
  );
}

export function useAccount() {
  const auth = useContext(AuthContext);
  const { scope, key } = accountWorkspace(
    connection && auth.ready ? auth.account : null,
    connection,
  );
  const current = useRef(key);
  current.current = key;
  // The gate opens welcome for a deleted account, in place of onboarding or the app.
  const accountDeleted = isAccountDeleted(auth.deletedUserId, auth.account);
  return { ...auth, scope, key, current, accountDeleted, configured: connection !== null };
}
