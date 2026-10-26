import { projectPath } from "@/lib/workspace/home";
import type { WorkspaceIndex } from "@/lib/workspace/types";

/**
 * What the invitation and join screens agree on, without touching the network: the shape of what a
 * preview shows, how a failed attempt is worded, where a successful join leads, and how an invitation
 * link's secret is kept for the length of one sign-in.
 *
 * An invitation link is `/invite#t=<secret>`. The browser never sends a fragment to DECA Mark, so the page
 * reads it, keeps it in this tab's sessionStorage under `fm-invite` (so signing in or creating an account
 * on the way does not lose it), and takes it out of the address bar. A join code is typed into a field and
 * is never put in an address.
 */

/** The sessionStorage key that holds an invitation link's secret while the person signs in. */
export const INVITE_STORAGE_KEY = "fm-invite";

/** Exactly one of the two, as the API takes it. */
export type InviteCredential = { token: string } | { code: string };

export type InviteRole = "member" | "admin" | "manager" | "observer" | "viewer";

/** What DECA Mark tells someone about an invitation before they join. */
export type InvitationDetails = {
	organization: string;
	/** Null for an invitation to the organization itself. */
	project: string | null;
	role: InviteRole;
	/** ISO time. */
	expiresAt: string;
};

export type InviteProblemKind =
	/** The sign-in ended. */
	| "signed-out"
	| "expired"
	/** No such invitation, or it was revoked or used up. */
	| "invalid"
	| "already-member"
	/** Too many tries: `retryAfter` seconds. */
	| "wait"
	/** DECA Mark could not be reached, or failed. */
	| "unavailable"
	| "refused";

export type InviteProblem = {
	kind: InviteProblemKind;
	message: string;
	/** Seconds to wait (kind "wait"). */
	retryAfter?: number;
	/** Where the person already is (kind "already-member"). */
	path?: string;
};

/** What the preview action answers: the invitation, or why it cannot be shown. */
export type PreviewOutcome =
	| { status: "ready"; invitation: InvitationDetails }
	| { status: "failed"; problem: InviteProblem };

/** What the join action answers: where to go, or why the person did not join. */
export type JoinOutcome =
	| { status: "joined"; path: string; role: InviteRole }
	| { status: "failed"; problem: InviteProblem };

export const EXPIRED_COPY = "This invitation has expired. Ask your project manager for a new one.";
export const ALREADY_PROJECT_COPY = "You are already on this project.";
export const ALREADY_ORGANIZATION_COPY = "You are already in this organization.";
export const SIGNED_OUT_COPY = "You were signed out. Sign in again to continue.";
export const UNREACHABLE_COPY = "DECA Mark could not be reached. Check your connection and try again.";

/** The wording of a problem, which depends on whether the invitation is to a project or an organization. */
export function problemText(problem: InviteProblem, invitation: { project: string | null } | null): string {
	if (problem.kind === "already-member" && invitation && invitation.project === null)
		return ALREADY_ORGANIZATION_COPY;
	return problem.message;
}

/* ── The link's secret ────────────────────────────────────────────────────── */

/** What the URL-safe secret of an invitation link looks like (the API issues 43 characters). */
const SECRET = /^[A-Za-z0-9_-]{1,256}$/;

/** The `t=` of an address fragment. `present` is true when the fragment carries one, readable or not. */
export function inviteFragment(hash: string): { present: boolean; token: string | undefined } {
	const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
	if (fragment === "") return { present: false, token: undefined };
	const params = new URLSearchParams(fragment);
	const value = params.get("t");
	return { present: params.has("t"), token: value !== null && SECRET.test(value) ? value : undefined };
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** This tab's sessionStorage, or null where the browser refuses it (a private window, blocked data). */
function tabStore(): Store | null {
	try {
		return globalThis.sessionStorage ?? null;
	} catch {
		return null;
	}
}

/** Keeps the secret for this tab. False when the browser would not keep it. */
export function rememberToken(token: string, store: Store | null = tabStore()): boolean {
	try {
		store?.setItem(INVITE_STORAGE_KEY, token);
		return store !== null;
	} catch {
		return false;
	}
}

/** Said beside Sign in when the browser would not keep the invitation's secret for the length of a sign-in. */
export const UNKEPT_COPY =
	"Your browser will not hold on to this invitation while you sign in. After you sign in, open the invitation link again.";

/**
 * What opening the invitation page finds. `token` is the secret from the address, or else the one kept
 * earlier in this tab. `removeFragment` says whether the secret may be taken out of the address bar: only
 * once it is kept for this tab (or when the fragment holds no usable secret), because the address is the
 * only copy otherwise. `unkept` is true when the browser refused to keep a secret from the address.
 */
export function readInvitationLink(
	hash: string,
	store: Store | null = tabStore()
): { token: string | undefined; removeFragment: boolean; unkept: boolean } {
	const fragment = inviteFragment(hash);
	const kept = fragment.token === undefined ? false : rememberToken(fragment.token, store);
	return {
		token: fragment.token ?? recalledToken(store),
		removeFragment: fragment.present && (fragment.token === undefined || kept),
		unkept: fragment.token !== undefined && !kept
	};
}

/** The secret kept earlier in this tab, if it is still readable. */
export function recalledToken(store: Store | null = tabStore()): string | undefined {
	try {
		const value = store?.getItem(INVITE_STORAGE_KEY);
		return value && SECRET.test(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

export function forgetToken(store: Store | null = tabStore()): void {
	try {
		store?.removeItem(INVITE_STORAGE_KEY);
	} catch {
		// Nothing was kept, or the browser refused to say: there is nothing else to clear.
	}
}

/* ── Failed attempts ──────────────────────────────────────────────────────── */

/** The parts of an `ApiError` the wording depends on. */
export type ProblemSource = {
	code: string;
	kind: "sign-in" | "retry" | "rejected";
	status?: number;
	retryAfter?: number;
	/** DECA Mark's own wording for the error (`errorCopy`). */
	message: string;
};

export type ProblemContext = {
	step: "preview" | "redeem";
	credential: "token" | "code";
};

/**
 * A failed preview or join in the words a person reads. An expired invitation (410), too many tries (429,
 * with how long to wait) and an invitation that is gone each get their own sentence; a join that DECA Mark
 * refuses as a duplicate (409) means the person is already a member.
 */
export function inviteProblem(error: ProblemSource, { step, credential }: ProblemContext): InviteProblem {
	if (error.kind === "sign-in") return { kind: "signed-out", message: SIGNED_OUT_COPY };
	if (error.code === "invitation_expired" || error.status === 410) return { kind: "expired", message: EXPIRED_COPY };
	if (error.code === "rate_limited" || error.status === 429)
		return { kind: "wait", message: error.message, retryAfter: error.retryAfter ?? 60 };
	if (error.status === 409 || error.code === "conflict")
		return { kind: "already-member", message: ALREADY_PROJECT_COPY };
	if (error.code === "invitation_invalid") {
		if (step === "redeem")
			return {
				kind: "invalid",
				message:
					"This invitation could not be used. Check the signed-in email address and switch accounts if needed. It may also have been revoked or used up, or you may already be a member."
			};
		return {
			kind: "invalid",
			message:
				credential === "code"
					? "We could not find a project for that code. Check it with your project manager."
					: "This invitation link no longer works. It may have been revoked or used up. Ask your project manager for a new one."
		};
	}
	if (error.kind === "retry") return { kind: "unavailable", message: error.message };
	return { kind: "refused", message: error.message };
}

/* ── Where a person already is, and where joining leads ───────────────────── */

/**
 * The place of the project (or organization) an invitation names, when the person already belongs to it.
 * The invitation shows names only, so this matches on them: a project the person is on with that name in
 * an organization with that name. Null when there is no single match.
 */
export function placeOf(
	index: WorkspaceIndex,
	invitation: Pick<InvitationDetails, "organization" | "project">
): string | null {
	if (index.status !== "ready") return null;
	const orgs = index.orgs.filter(org => org.name === invitation.organization);
	if (invitation.project !== null) {
		const projects = index.projects.filter(
			project => project.name === invitation.project && orgs.some(org => org.id === project.orgId)
		);
		return projects.length === 1 ? projectPath(projects[0]!) : null;
	}
	return orgs.length === 1 ? `/o/${orgs[0]!.slug}` : null;
}

/**
 * Where a person goes after joining: an observer to the collect page of the project's organization (that
 * is what `projectPath` gives observers), anyone else to the project, an organization invitation to the
 * organization. `/o` picks a place when the new membership is not in the workspace yet.
 */
export function destinationFor(
	redeemed: { organization_id: string; project_id: string | null },
	index: WorkspaceIndex
): string {
	if (index.status !== "ready") return "/o";
	if (redeemed.project_id !== null) {
		const project = index.projects.find(entry => entry.id === redeemed.project_id);
		return project ? projectPath(project) : "/o";
	}
	const org = index.orgs.find(entry => entry.id === redeemed.organization_id);
	return org ? `/o/${org.slug}` : "/o";
}

/** The sign-in or sign-up pages bring the person back to one of these. */
export function isInvitationPath(path: string): boolean {
	return path === "/invite" || path === "/join";
}

const JOIN_STORAGE_KEY = "fm-join-code";
const JOIN_CODE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/** A code stays in this tab while its owner switches accounts, never in an address. */
export function rememberCode(code: string, store: Store | null = tabStore()): boolean {
	try {
		if (!JOIN_CODE.test(code)) return false;
		store?.setItem(JOIN_STORAGE_KEY, code);
		return store !== null;
	} catch {
		return false;
	}
}

export function recalledCode(store: Store | null = tabStore()): string | undefined {
	try {
		const value = store?.getItem(JOIN_STORAGE_KEY);
		return value && JOIN_CODE.test(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

export function forgetCode(store: Store | null = tabStore()): void {
	try {
		store?.removeItem(JOIN_STORAGE_KEY);
	} catch {
		// Storage may be unavailable; no code can be removed there.
	}
}
