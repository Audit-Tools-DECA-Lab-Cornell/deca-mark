import type { AuthChangeEvent } from "@supabase/supabase-js";
import { scopeKey, syncScopeSchema } from "../sync/contracts";
import { type CachedAccount, sessionIdentity } from "./cached-account";

export function sessionChange<T extends { readonly user: CachedAccount }>(
  account: CachedAccount | null,
  event: AuthChangeEvent,
  session: T | null,
  issuer: string,
  deliberateUserId: string | null,
  previousError: string | null = null,
) {
  if (session) {
    if (session.user.id === deliberateUserId)
      return { session, account: session.user, error: previousError };
    return sessionIdentity(session, issuer);
  }
  const deliberate = event === "SIGNED_OUT" && account?.id === deliberateUserId;
  return {
    session: null,
    account: deliberate ? null : account,
    error: deliberate ? null : previousError,
  };
}

/**
 * `SyncScope` still carries a project in its key, but nothing reads it as a destination: the
 * package binding names the project an observation uploads to. One fixed value keeps a single
 * owner key per account and backend.
 */
const workspaceProjectId = "00000000-0000-4000-8000-000000000000";

/**
 * The storage namespace of one account on the backend this build is configured for: records,
 * drafts and installed packages are keyed by it, and a build pointed at another backend sees none
 * of them. `connection` is the public build configuration.
 */
export function accountWorkspace(
  account: CachedAccount | null,
  connection: { readonly apiUrl: string; readonly supabaseUrl: string },
) {
  const parsed = account
    ? syncScopeSchema.safeParse({
        apiUrl: connection.apiUrl,
        issuer: connection.supabaseUrl,
        userId: account.id,
        projectId: workspaceProjectId,
      })
    : null;
  const scope = parsed?.success ? parsed.data : null;
  return { scope, key: scope ? scopeKey(scope) : "local" };
}

export function signInRecovery(
  account: CachedAccount | null,
  session: { readonly user: CachedAccount } | null,
  deletedUserId: string | null,
) {
  return account && !session && account.id !== deletedUserId
    ? { email: account.email ?? "" }
    : null;
}
