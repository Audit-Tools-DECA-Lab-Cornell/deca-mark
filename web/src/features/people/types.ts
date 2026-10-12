import type { StateKey } from "@/lib/contour";

/** A role as the Contour vocabulary names it: owner, admin, member, manager, observer, viewer. */
export type PeopleRole = StateKey<"role">;

/** A role someone can be given here, with one line on what it allows. */
export type RoleOption<R extends PeopleRole> = { value: R; label: string; hint?: string };

/** What a change to the team came to. A failure says what did not happen and why, in plain words. */
export type PeopleActionResult = { status: "done" } | { status: "failed"; message: string };

/** A project or organization member, as the API lists them (no email: DECA Mark does not show it). */
export type MemberLike<R extends PeopleRole> = {
	user_id: string;
	role: R;
	display_name?: string | null;
	observer_initials?: string | null;
	granted_at: string;
};

/** A pending invitation, as the API lists it (no code or link: those are shown once, at creation). */
export type InvitationLike<R extends PeopleRole> = {
	id: string;
	role: R;
	email: string | null;
	max_uses: number;
	use_count: number;
	expires_at: string;
	revoked_at: string | null;
	created_at: string;
};

/** What the invite dialog asks the API for. */
export type InviteRequest<R extends PeopleRole> = {
	role: R;
	/** Only someone signed in with this address can use the invitation. */
	email: string | null;
	maxUses: number;
	expiresInDays: number;
};

/** A new invitation's link token and join code, shown once. */
export type CreatedInvitation = {
	email_delivery?: "queued" | "not_requested" | "unavailable";
	code: string;
	token: string;
	role: PeopleRole;
	email: string | null;
	max_uses: number;
	expires_at: string;
};

export type InviteResult =
	| { status: "done"; invitation: CreatedInvitation }
	| { status: "failed"; message: string; fields?: Record<string, string> };
