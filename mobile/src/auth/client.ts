import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import { authStorage } from "../platform/auth-storage";
import { connection } from "../sync/config";
import { cachedAccount } from "./cached-account";
import { deletedAccountStore } from "./deleted-account";
import { restoreAccount } from "./deleted-session";

export async function createAuthClient() {
  if (!connection) return null;
  const storageKey = `fieldmaps-auth-${new URL(connection.supabaseUrl).hostname}`;
  const { account, deletedUserId } = restoreAccount(
    cachedAccount(connection.supabaseUrl),
    deletedAccountStore(connection.supabaseUrl).read(),
  );
  const client = createClient(connection.supabaseUrl, connection.publishableKey, {
    auth: {
      storageKey,
      storage: authStorage,
      autoRefreshToken: account?.id !== deletedUserId,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });
  return { client, account, deletedUserId };
}
