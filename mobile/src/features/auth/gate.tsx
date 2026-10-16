import Storage from "expo-sqlite/kv-store";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "../../auth/provider";
import { useMe } from "../../data/api/me-provider";
import { isValidInitials } from "../onboarding/identity";
import { PREVIEW_ALLOWED } from "../preview/data-source";
import { useProfile } from "./profile-store";

/**
 * Which part of the collector opens: sign-in, onboarding or the app. The root layout guards its route
 * groups with this (Stack.Protected), so a screen never has to check by itself.
 *
 * The rule:
 * - A live session or an account cached on this device counts as signed in, so an observer whose token
 *   expired in the field keeps collecting offline. Only a deliberate sign-out clears the cache.
 * - Sign-in stays open whenever there is no live session (MOB-03), so that observer can sign in again
 *   from "Sign in to resume uploads" without leaving the app's records behind.
 * - An account the server reported deleted (403 account_deleted, remembered across restarts) is not
 *   signed in: welcome opens and names its records, which stay on this device and cannot upload. Nothing
 *   new is collected for it.
 * - A signed-in account goes through onboarding when neither its server profile (`/v1/me`) has observer
 *   initials nor this device has a profile for it. A profile started here but not finished (the join
 *   step is still ahead) keeps onboarding open whatever the server says; one finished here opens the app
 *   offline even before the server has it.
 * - Until `/v1/me` is known for an account with no profile here, the gate holds the splash, so
 *   onboarding never flashes for an observer the server already knows.
 *
 * Review builds can force a route with a dev override (the (dev)/states screen).
 */

export const GATE_OVERRIDES = ["real", "signed-out", "deleted", "onboarding", "signed-in"] as const;
export type GateOverride = (typeof GATE_OVERRIDES)[number];

/** `hold`: not decided yet; the splash stays up. */
export type GateRoute = "auth" | "onboarding" | "app" | "hold";

/** The observer profile on this device: none, saved but onboarding not finished, or finished. */
export type LocalProfile = "none" | "started" | "complete";

export type GateInput = {
  /** A live session. */
  session: boolean;
  /** An account remembered on this device, even with an expired token. */
  cachedAccount: boolean;
  /** The account on this device was reported deleted by the server. */
  accountDeleted: boolean;
  /** `/v1/me` has settled for the account: read, cached, or not readable right now. */
  meReady: boolean;
  /** The server profile carries observer initials. */
  serverInitials: boolean;
  localProfile: LocalProfile;
  override?: GateOverride | undefined;
  /** Overrides apply only in development and review builds. */
  overrideAllowed?: boolean | undefined;
};

export type GateDecision = {
  signedIn: boolean;
  needsOnboarding: boolean;
  /** Welcome names the deleted account's records, and nothing new is collected for it. */
  accountDeleted: boolean;
  /**
   * The auth screens can be opened: there is no live session. An account kept on this device after its
   * session was lost still lands in the app (it is declared first), and "Sign in to resume uploads"
   * opens sign-in over it.
   */
  authOpen: boolean;
  route: GateRoute;
  /** The dev override decided, not the account. */
  overridden: boolean;
};

const FORCED: Record<Exclude<GateOverride, "real">, Omit<GateDecision, "overridden">> = {
  "signed-out": {
    signedIn: false,
    needsOnboarding: false,
    accountDeleted: false,
    authOpen: true,
    route: "auth",
  },
  deleted: {
    signedIn: false,
    needsOnboarding: false,
    accountDeleted: true,
    authOpen: true,
    route: "auth",
  },
  onboarding: {
    signedIn: true,
    needsOnboarding: true,
    accountDeleted: false,
    authOpen: false,
    route: "onboarding",
  },
  "signed-in": {
    signedIn: true,
    needsOnboarding: false,
    accountDeleted: false,
    authOpen: false,
    route: "app",
  },
};

/** The gate as a pure function of what the device knows. */
export function decideGate(input: GateInput): GateDecision {
  const override = input.override ?? "real";
  if (input.overrideAllowed === true && override !== "real")
    return { ...FORCED[override], overridden: true };
  const accountDeleted = input.accountDeleted;
  const signedIn = !accountDeleted && (input.session || input.cachedAccount);
  const holding = signedIn && input.localProfile === "none" && !input.meReady;
  const needsOnboarding =
    signedIn &&
    !holding &&
    (input.localProfile === "started" || (input.localProfile === "none" && !input.serverInitials));
  const route: GateRoute = !signedIn
    ? "auth"
    : holding
      ? "hold"
      : needsOnboarding
        ? "onboarding"
        : "app";
  const authOpen = !signedIn || !input.session;
  return { signedIn, needsOnboarding, accountDeleted, authOpen, route, overridden: false };
}

const OVERRIDE_KEY = "fm.dev.gate";
const overrideListeners = new Set<() => void>();
let overrideCache: GateOverride | undefined;

function isOverride(value: unknown): value is GateOverride {
  return typeof value === "string" && (GATE_OVERRIDES as readonly string[]).includes(value);
}

function readOverride(): GateOverride {
  if (!PREVIEW_ALLOWED) return "real";
  if (overrideCache === undefined) {
    try {
      const stored = Storage.getItemSync(OVERRIDE_KEY);
      overrideCache = isOverride(stored) ? stored : "real";
    } catch {
      overrideCache = "real";
    }
  }
  return overrideCache;
}

function writeOverride(next: GateOverride): void {
  if (!PREVIEW_ALLOWED) return;
  overrideCache = next;
  try {
    Storage.setItemSync(OVERRIDE_KEY, next);
  } catch {
    // The override still applies until the app closes.
  }
  for (const listener of overrideListeners) listener();
}

function subscribeOverride(listener: () => void): () => void {
  overrideListeners.add(listener);
  return () => {
    overrideListeners.delete(listener);
  };
}

export type Gate = GateDecision & {
  /** What the account and profile alone decide, whatever the override says. */
  real: GateDecision;
  devOverride: GateOverride;
  setDevOverride: (next: GateOverride) => void;
  /** Development and review builds only. */
  overrideAllowed: boolean;
};

export function useGate(): Gate {
  const { session, account, accountDeleted } = useAccount();
  const me = useMe();
  const profile = useProfile();
  const devOverride = useSyncExternalStore(subscribeOverride, readOverride, readOverride);
  const setDevOverride = useCallback((next: GateOverride) => writeOverride(next), []);
  const serverInitials = isValidInitials(me.profile?.observer_initials ?? "");
  const localProfile: LocalProfile = profile.complete
    ? "complete"
    : profile.saved
      ? "started"
      : "none";

  return useMemo(() => {
    const input: GateInput = {
      session: session !== null,
      cachedAccount: account !== null,
      accountDeleted,
      meReady: me.ready,
      serverInitials,
      localProfile,
    };
    const real = decideGate(input);
    const shown = decideGate({ ...input, override: devOverride, overrideAllowed: PREVIEW_ALLOWED });
    return { ...shown, real, devOverride, setDevOverride, overrideAllowed: PREVIEW_ALLOWED };
  }, [
    session,
    account,
    accountDeleted,
    me.ready,
    serverInitials,
    localProfile,
    devOverride,
    setDevOverride,
  ]);
}
