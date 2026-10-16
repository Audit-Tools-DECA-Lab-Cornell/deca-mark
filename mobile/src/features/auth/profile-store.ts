import Storage from "expo-sqlite/kv-store";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { useAccount } from "../../auth/provider";
import { cleanName, isValidInitials, NAME_MAX } from "../onboarding/identity";

/**
 * The observer profile on this device: a full name, the initials that become the observer code, and
 * whether onboarding finished. Kept in the synchronous key-value store under `fm.profile`, so the sign-in
 * gate knows where to go on the first frame.
 *
 * The account's profile lives on the server (`/v1/me`). This copy is the offline fallback and the queue
 * for an edit the server has not confirmed yet (`pending`): onboarding saves here first, then sends
 * `PATCH /v1/me`, and a failed send is retried on the next resume or `/v1/me` refresh (profile-sync).
 *
 * Profiles are kept per account. Field teams share devices, and a second observer who signs in must not
 * inherit the first one's initials, which would be stamped on their observations.
 */

const KEY = "fm.profile";

/**
 * Whose profile applies when no account is on this device. Only a review override reaches onboarding or
 * the app without one (the (dev)/states screen); its profile stays here and is never sent.
 */
export const LOCAL_OWNER = "local";

const profileSchema = z.object({
  name: z.string(),
  initials: z.string(),
  /** Onboarding finished: the observer joined a project or chose to skip for now. */
  onboarded: z.boolean(),
  /**
   * The name and initials have not reached the account yet. Profiles saved before the profile was sent
   * to the server carry no flag and are not sent, so they never overwrite a profile edited elsewhere.
   */
  pending: z.boolean().default(false),
});
const savedSchema = z.record(z.string(), profileSchema);

export type Profile = z.infer<typeof profileSchema>;
export type SavedProfiles = Readonly<Record<string, Profile>>;
/** A name and initials as they were sent, to confirm against what is saved now. */
export type ProfileEdit = { readonly name: string; readonly initials: string };

const EMPTY: SavedProfiles = {};
let cache: SavedProfiles | undefined;
const listeners = new Set<() => void>();

function load(): SavedProfiles {
  try {
    const raw = Storage.getItemSync(KEY);
    if (!raw) return EMPTY;
    const parsed = savedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readSaved(): SavedProfiles {
  cache ??= load();
  return cache;
}

function commit(next: SavedProfiles): void {
  if (next === cache) return;
  cache = next;
  try {
    Storage.setItemSync(KEY, JSON.stringify(next));
  } catch {
    // A full disk: the profile still applies until the app closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ── Pure steps, shared by the hook and the tests ────────────────────────── */

/**
 * Saves a name and initials for an owner. A change is pending until the server confirms it; saving the
 * same values again keeps whatever the server already confirmed. The `local` profile has no account to
 * reach, so it is never pending. `onboarded` saves it as finished at once: an edit made in the app (the
 * Account tab) by an account whose profile came from the server, so the gate never reopens onboarding.
 * Null when either is not valid.
 */
export function withEdit(
  saved: SavedProfiles,
  owner: string,
  name: string,
  initials: string,
  onboarded = false,
): SavedProfiles | null {
  const cleaned = cleanName(name).slice(0, NAME_MAX);
  if (cleaned === "" || !isValidInitials(initials)) return null;
  const existing = saved[owner];
  const unchanged = existing?.name === cleaned && existing.initials === initials;
  return {
    ...saved,
    [owner]: {
      name: cleaned,
      initials,
      onboarded: onboarded || (existing?.onboarded ?? false),
      pending: owner !== LOCAL_OWNER && (unchanged ? existing.pending : true),
    },
  };
}

/**
 * Marks an edit as having reached the account. Only the edit that was sent is confirmed: a newer one
 * saved while it was on its way stays pending and is sent next.
 */
export function withSent(saved: SavedProfiles, owner: string, sent: ProfileEdit): SavedProfiles {
  const existing = saved[owner];
  if (!existing?.pending || existing.name !== sent.name || existing.initials !== sent.initials)
    return saved;
  return { ...saved, [owner]: { ...existing, pending: false } };
}

/** Marks onboarding finished. Null when no valid profile is saved for the owner. */
export function withFinished(saved: SavedProfiles, owner: string): SavedProfiles | null {
  const existing = saved[owner];
  if (!existing || !isValidInitials(existing.initials) || cleanName(existing.name) === "")
    return null;
  return existing.onboarded ? saved : { ...saved, [owner]: { ...existing, onboarded: true } };
}

/** The edit still waiting to reach an owner's account, if any. */
export function pendingEditOf(saved: SavedProfiles, owner: string): ProfileEdit | null {
  const existing = saved[owner];
  return existing?.pending ? { name: existing.name, initials: existing.initials } : null;
}

/** The pending edit as saved right now, read outside React (the sender reads it after a save). */
export function pendingEdit(owner: string): ProfileEdit | null {
  return pendingEditOf(readSaved(), owner);
}

/** Confirms an edit outside React, once `PATCH /v1/me` has saved it. */
export function markProfileSent(owner: string, sent: ProfileEdit): void {
  commit(withSent(readSaved(), owner, sent));
}

/** Whose profile applies: the signed-in or cached account, or `local` with no account (review only). */
export function profileOwner(accountId: string | null | undefined): string {
  return accountId ?? LOCAL_OWNER;
}

/** A profile the app can collect with: a name, valid initials, and onboarding finished. */
export function isProfileComplete(profile: Profile | undefined): boolean {
  return (
    profile?.onboarded === true &&
    cleanName(profile.name) !== "" &&
    isValidInitials(profile.initials)
  );
}

export type ProfileValue = {
  /** The account the profile belongs to. */
  owner: string;
  name: string;
  /** The observer code: one to ten uppercase letters or digits. */
  initials: string;
  /** A name and initials are saved for this account (onboarding step 1 is done). */
  saved: boolean;
  /** Saved, valid and onboarding finished: the gate opens the app. */
  complete: boolean;
  /** The saved name and initials have not reached the account yet. */
  pending: boolean;
  /**
   * Saves the name and initials on this device. Returns false, saving nothing, when either is not valid.
   * `{onboarded: true}` for an edit made inside the app, which keeps onboarding finished.
   */
  set: (name: string, initials: string, options?: { onboarded?: boolean }) => boolean;
  /** Marks onboarding finished. Returns false when no valid profile is saved yet. */
  finish: () => boolean;
  /** Forgets this account's profile on this device. Observations keep the code they were saved with. */
  clear: () => void;
};

/** The current account's observer profile on this device. */
export function useProfile(): ProfileValue {
  const { account } = useAccount();
  const owner = profileOwner(account?.id);
  const saved = useSyncExternalStore(subscribe, readSaved, readSaved);
  const profile = saved[owner];

  const set = useCallback(
    (name: string, initials: string, options?: { onboarded?: boolean }) => {
      const next = withEdit(readSaved(), owner, name, initials, options?.onboarded === true);
      if (!next) return false;
      commit(next);
      return true;
    },
    [owner],
  );

  const finish = useCallback(() => {
    const next = withFinished(readSaved(), owner);
    if (!next) return false;
    commit(next);
    return true;
  }, [owner]);

  const clear = useCallback(() => {
    const current = readSaved();
    if (!(owner in current)) return;
    const { [owner]: _removed, ...rest } = current;
    commit(rest);
  }, [owner]);

  return useMemo(
    () => ({
      owner,
      name: profile?.name ?? "",
      initials: profile?.initials ?? "",
      saved: profile !== undefined,
      complete: isProfileComplete(profile),
      pending: profile?.pending === true,
      set,
      finish,
      clear,
    }),
    [owner, profile, set, finish, clear],
  );
}
