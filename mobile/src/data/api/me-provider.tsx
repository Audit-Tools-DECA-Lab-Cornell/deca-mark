import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useAccount } from "../../auth/provider";
import { connection } from "../../platform/config";
import { createApiClient } from "./client";
import { ApiError } from "./errors";
import type { Identity, ProfilePatch } from "./identity";
import { type MeSnapshot, refreshMeCache, selectProject } from "./me-cache";
import { meFileStore } from "./me-file";

/** What a write to the API came to: done, or the typed reason it was not. */
export type ApiResult = { readonly ok: true } | { readonly ok: false; readonly error: ApiError };

type MeState = {
  /** The account this state belongs to. A different account reads as not ready until it settles. */
  readonly owner: string | null;
  readonly snapshot: MeSnapshot | null;
  readonly error: string | null;
  /**
   * The profile and projects are known as well as they can be right now: read from this device's
   * cache, fetched, or the first fetch failed or cannot run (no session). The gate holds its splash
   * until then, so onboarding never flashes for an account whose server profile is already complete.
   */
  readonly ready: boolean;
};
const initial: MeState = { owner: null, snapshot: null, error: null, ready: false };
const notSignedIn: ApiResult = { ok: false, error: new ApiError("unauthenticated", "sign-in") };
const emptyOrganizations: Identity["organization_memberships"] = [];
const emptyProjects: Identity["project_memberships"] = [];

const MeContext = createContext({
  ...initial,
  selectProject: (_id: string) => {},
  refresh: async (): Promise<boolean> => false,
  updateProfile: async (_patch: ProfilePatch): Promise<ApiResult> => notSignedIn,
});

/** Any thrown value as a typed API error; an unexpected Error counts as retryable. */
function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError("unknown", "retry");
  throw error;
}

export function MeProvider({ children }: PropsWithChildren) {
  const { account, client, session, restored, markAccountDeleted } = useAccount();
  const userId = account?.id;
  // The effect below is keyed on whether there is a session, not on the session object (replaced by
  // every token refresh) or on `markAccountDeleted` (rebuilt with it): neither may re-read /v1/me.
  const signedIn = session !== null;
  const deleted = useRef(markAccountDeleted);
  deleted.current = markAccountDeleted;
  const [state, setState] = useState(initial);
  const current = useRef<string | undefined>(userId);
  current.current = userId;
  const select = useRef((_id: string) => {});
  const refreshNow = useRef(async (): Promise<boolean> => false);
  const update = useRef(async (_patch: ProfilePatch): Promise<ApiResult> => notSignedIn);
  useEffect(() => {
    if (!userId) {
      setState({ owner: null, snapshot: null, error: null, ready: true });
      return;
    }
    const id = userId;
    const controller = new AbortController();
    const store = meFileStore(connection.supabaseUrl, id);
    let snapshot = store.read();
    const isCurrent = () => !controller.signal.aborted && current.current === id;
    // A session change for the same account keeps what is already known; a new account starts over.
    setState((previous) => ({
      owner: id,
      snapshot,
      error: null,
      ready: snapshot !== null || (previous.owner === id && previous.ready),
    }));
    const settle = () =>
      setState((previous) =>
        previous.owner === id && !previous.ready ? { ...previous, ready: true } : previous,
      );
    const publish = (next: MeSnapshot) => {
      snapshot = next;
      store.write(next);
      setState({ owner: id, snapshot: next, error: null, ready: true });
    };
    const api =
      client && signedIn
        ? createApiClient(connection.apiUrl, async () => {
            const { data } = await client.auth.getSession();
            return data.session?.user.id === id ? data.session.access_token : null;
          })
        : null;
    // Nothing can be fetched without a session: once sign-in is restored, what is cached is all
    // there is (an offline start with an expired token).
    if (!api && restored) settle();

    select.current = (projectId) => {
      if (!snapshot || !isCurrent() || selectProject(snapshot.identity, projectId) !== projectId)
        return;
      publish({ ...snapshot, activeProjectId: projectId });
    };

    const fetchOnce = async (): Promise<boolean> => {
      if (!api || !isCurrent()) return false;
      try {
        const identity = await api.me(controller.signal);
        if (!isCurrent()) return false;
        if (identity.profile.user_id !== id) throw new ApiError("unknown", "retry");
        publish(refreshMeCache(identity, snapshot));
        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        if (!(error instanceof ApiError)) {
          if (!(error instanceof Error)) throw error;
          setState({
            owner: id,
            snapshot,
            error: "Could not refresh your profile. Cached projects remain available.",
            ready: true,
          });
          return false;
        }
        if (error.code === "account_deleted") deleted.current();
        setState({ owner: id, snapshot, error: error.message, ready: true });
        return false;
      } finally {
        if (isCurrent()) settle();
      }
    };
    let running: Promise<boolean> | null = null;
    // Automatic reads (sign-in, resume) join one already under way.
    const refresh = (): Promise<boolean> => {
      running ??= fetchOnce().finally(() => {
        running = null;
      });
      return running;
    };
    // A requested read starts after any read under way, so it sees every change made before it was
    // asked for (a project just joined).
    refreshNow.current = async () => {
      if (running) await running.catch(() => false);
      return refresh();
    };

    update.current = async (patch) => {
      if (!api || !isCurrent()) return notSignedIn;
      try {
        const profile = await api.updateProfile(patch, controller.signal);
        if (profile.user_id !== id) throw new ApiError("unknown", "retry");
        if (isCurrent()) {
          if (snapshot) publish({ ...snapshot, identity: { ...snapshot.identity, profile } });
          else void refresh();
        }
        return { ok: true };
      } catch (error) {
        const failure = asApiError(error);
        if (failure.code === "account_deleted" && isCurrent()) deleted.current();
        return { ok: false, error: failure };
      }
    };

    void refresh();
    const listener = AppState.addEventListener("change", (value) => {
      if (value === "active") void refresh();
    });
    return () => {
      controller.abort();
      listener.remove();
      select.current = () => {};
      refreshNow.current = async () => false;
      update.current = async () => notSignedIn;
    };
  }, [userId, client, signedIn, restored]);
  const own = state.owner === (userId ?? null);
  return (
    <MeContext
      value={{
        owner: state.owner,
        snapshot:
          own && state.snapshot?.identity.profile.user_id === userId ? state.snapshot : null,
        error: own ? state.error : null,
        ready: own && state.ready,
        selectProject: (id) => select.current(id),
        refresh: () => refreshNow.current(),
        updateProfile: (patch) => update.current(patch),
      }}
    >
      {children}
    </MeContext>
  );
}

/**
 * The signed-in account's `/v1/me`: profile, organizations, projects and the active project, with
 * `refresh()` for a read that must see a change just made (joining a project) and `updateProfile()`
 * for `PATCH /v1/me`.
 */
export function useMe() {
  const { snapshot, owner: _owner, ...state } = useContext(MeContext);
  return {
    ...state,
    profile: snapshot?.identity.profile ?? null,
    organizations: snapshot?.identity.organization_memberships ?? emptyOrganizations,
    projects: snapshot?.identity.project_memberships ?? emptyProjects,
    activeProjectId: snapshot?.activeProjectId ?? null,
  };
}
