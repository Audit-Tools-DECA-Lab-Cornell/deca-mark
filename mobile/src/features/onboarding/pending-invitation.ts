import type { GateRoute } from "../auth/gate";
import { JOIN_CODE_LENGTH, joinCodeOf } from "./invitation";

/**
 * An invitation link that arrived before it could be shown (Greptile P1, "Sign-in drops invitation
 * codes"). `decamark://join/DECA2026` opened while signed out lands on welcome, because the gate keeps
 * onboarding closed; the code would be lost. So the link's code is kept on this device for a week:
 * the auth screens say it is waiting, onboarding's profile step carries on to it after sign-in, and an
 * account that is already set up finds it on Projects. It is cleared once the invitation has been
 * shown and the person joins, leaves it or forgets it, and it never joins anything by itself.
 *
 * Pure: the store (`pending-invitation-store.ts`) reads and writes it with the kv-store.
 */

/** How long a link's code waits on the device: long enough for a weekend, shorter than most codes. */
export const PENDING_INVITATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PENDING_INVITATION_MS = PENDING_INVITATION_DAYS * DAY_MS;

export type PendingInvitation = {
  /** Eight letters and digits, upper case, as `joinCodeOf` keeps a code. */
  code: string;
  /** When the link arrived, in epoch milliseconds. */
  savedAt: number;
};

/** A whole join code from any way it may be written, or null when it is not eight characters. */
export function wholeJoinCode(raw: string | string[] | undefined): string | null {
  const code = joinCodeOf(raw);
  return code.length === JOIN_CODE_LENGTH ? code : null;
}

/** The stored value for a code that arrived at `now`, or null for a code that is not whole. */
export function serializePendingInvitation(raw: string, now: number): string | null {
  const code = wholeJoinCode(raw);
  return code ? JSON.stringify({ code, savedAt: now } satisfies PendingInvitation) : null;
}

/**
 * The invitation still waiting, from what the store holds: null when nothing is stored, the value is
 * unreadable, the code is not whole, or it arrived more than a week ago (or, by a clock change, in the
 * future by more than a day).
 */
export function readPendingInvitationValue(
  stored: string | null | undefined,
  now: number,
): PendingInvitation | null {
  if (!stored) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { code: rawCode, savedAt } = value as Record<string, unknown>;
  if (typeof rawCode !== "string" || typeof savedAt !== "number" || !Number.isFinite(savedAt))
    return null;
  const code = wholeJoinCode(rawCode);
  if (!code) return null;
  if (now - savedAt > PENDING_INVITATION_MS || savedAt - now > DAY_MS) return null;
  return { code, savedAt };
}

/**
 * The join code an incoming link carries, if it is an invitation link with a whole code. Accepts the
 * forms the app is opened with: `decamark://join/DECA2026`, `/join/DECA-2026`,
 * `join?code=deca2026` and Expo's development form `exp://host/--/join/DECA2026`.
 */
export function joinCodeFromLink(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  // Drop the scheme and host (`decamark://`, `exp://192.168.0.2:8081/--`), keeping the path.
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const [beforeQuery = "", query = ""] = withoutScheme.split("?", 2);
  const segments = beforeQuery.split("/").filter((part) => part !== "" && part !== "--");
  const joinAt = segments.indexOf("join");
  if (joinAt === -1) return null;
  const fromPath = segments[joinAt + 1];
  if (fromPath !== undefined) return wholeJoinCode(decodeSegment(fromPath));
  const fromQuery = new URLSearchParams(query.split("#")[0] ?? "").get("code");
  return fromQuery ? wholeJoinCode(fromQuery) : null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Where a waiting invitation is shown, by what the gate opens:
 * - `auth`: welcome, sign in and create account name it, with "Forget this invitation";
 * - `onboarding`: the profile step carries on to its confirm screen after the identity is saved;
 * - `projects`: an account that is already set up finds it on Projects, with "Join with a code";
 * - `none`: nothing is waiting, or the gate has not decided yet.
 */
export type PendingInvitationPlace = "auth" | "onboarding" | "projects" | "none";

export function pendingInvitationPlace(
  route: GateRoute,
  pending: PendingInvitation | null,
): PendingInvitationPlace {
  if (!pending) return "none";
  switch (route) {
    case "auth":
      return "auth";
    case "onboarding":
      return "onboarding";
    case "app":
      return "projects";
    case "hold":
      return "none";
  }
}

/**
 * Where the profile step goes after the identity is saved: the invitation a link carried (its own
 * `code` param first, then one that waited through sign-in), otherwise the join step.
 */
export function afterProfileStep(
  linkedCode: string | undefined,
  pendingCode: string | null | undefined,
): { pathname: "/invitation/[code]"; code: string } | { pathname: "/join" } {
  const code = wholeJoinCode(linkedCode) ?? wholeJoinCode(pendingCode ?? undefined);
  return code ? { pathname: "/invitation/[code]", code } : { pathname: "/join" };
}

/** The sentence the auth screens show while an invitation waits. */
export function pendingInvitationMessage(code: string): string {
  return `Invitation ${code} is waiting. Sign in or create an account to see it.`;
}
