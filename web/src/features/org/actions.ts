"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { DONE, failedChange } from "@/features/people/result";
import type { InviteRequest, InviteResult, PeopleActionResult } from "@/features/people/types";
import { apiRequestError, failedWrite } from "@/lib/api/errors";
import {
	createOrgInvitation,
	createProject,
	patchOrganization,
	removeOrgMember,
	revokeOrgInvitation,
	setOrgRole,
	transferOwnership
} from "@/lib/api/mutations";

import {
	createProjectInput,
	fieldsOf,
	inviteInput,
	memberInput,
	revokeInput,
	roleInput,
	saveOrganizationInput
} from "./schemas";
import type { OrgFailure, SavedOrganization } from "./types";

/**
 * Organization writes. Each checks its arguments, calls the API as the signed-in person (the API decides
 * who may), and either says what did not happen and why, or refreshes the pages that show the change.
 * Names, members and ownership all show in the header and its switchers, so the whole `/o` layout is
 * refreshed.
 */

const UNREADABLE = "The values could not be read. Reload the page and try again.";

function refreshWorkspace() {
	revalidatePath("/o", "layout");
}

/** A refused change as a form shows it: the reason, and the fields the API named. */
function refused(nothing: string, error: unknown, taken?: { field: string; message: string }): OrgFailure {
	const failure = apiRequestError(error);
	if (taken && failure.code === "conflict")
		return { status: "failed", message: `${nothing} ${taken.message}`, fields: { [taken.field]: taken.message } };
	const fields = { ...failure.fields };
	return {
		status: "failed",
		message: failedWrite(nothing, failure),
		...(Object.keys(fields).length > 0 ? { fields } : {})
	};
}

/** Create project: the new project opens straight away, so this returns only when nothing was created. */
export async function createProjectAction(input: {
	orgId: string;
	orgSlug: string;
	name: string;
	code: string;
	timezone: string;
}): Promise<OrgFailure> {
	const nothing = "Nothing was created.";
	const parsed = createProjectInput.safeParse(input);
	if (!parsed.success)
		return { status: "failed", message: `${nothing} ${UNREADABLE}`, fields: fieldsOf(parsed.error) };
	const { orgId, orgSlug, name, code, timezone } = parsed.data;
	try {
		await createProject(orgId, { name, code, timezone });
	} catch (error) {
		return refused(nothing, error, {
			field: "code",
			message: "A project in this organization already uses this code. Choose another."
		});
	}
	refreshWorkspace();
	redirect(`/o/${orgSlug}/p/${code}`);
}

/** Save name and web address. A new web address moves the person to it, since the old one stops working. */
export async function saveOrganizationAction(input: {
	orgId: string;
	currentSlug: string;
	name?: string;
	slug?: string;
}): Promise<OrgFailure | SavedOrganization> {
	const nothing = "Nothing was saved.";
	const parsed = saveOrganizationInput.safeParse(input);
	if (!parsed.success)
		return { status: "failed", message: `${nothing} ${UNREADABLE}`, fields: fieldsOf(parsed.error) };
	const { orgId, currentSlug, name, slug } = parsed.data;
	let saved;
	try {
		saved = await patchOrganization(orgId, {
			...(name !== undefined ? { name } : {}),
			...(slug !== undefined ? { slug } : {})
		});
	} catch (error) {
		return refused(nothing, error, {
			field: "slug",
			message: "Another organization already uses this web address. Choose another."
		});
	}
	refreshWorkspace();
	// The old address stops working, so this page is replaced rather than left in the history.
	if (saved.slug !== currentSlug) redirect(`/o/${saved.slug}/settings`, RedirectType.replace);
	return { status: "done", name: saved.name, slug: saved.slug };
}

/** Pass ownership to an existing admin or member. The previous owner becomes an admin. */
export async function transferOwnershipAction(orgId: string, userId: string): Promise<PeopleActionResult> {
	const nothing = "Ownership was not transferred.";
	const parsed = memberInput.safeParse({ orgId, userId });
	if (!parsed.success) return { status: "failed", message: `${nothing} ${UNREADABLE}` };
	try {
		await transferOwnership(parsed.data.orgId, parsed.data.userId);
	} catch (error) {
		return failedChange(nothing, error);
	}
	refreshWorkspace();
	return DONE;
}

/** Change a member between admin and member. Owners are made only by transferring ownership. */
export async function setOrgRoleAction(orgId: string, userId: string, role: string): Promise<PeopleActionResult> {
	const nothing = "Nothing was changed.";
	const parsed = roleInput.safeParse({ orgId, userId, role });
	if (!parsed.success)
		return {
			status: "failed",
			message: `${nothing} Ownership moves with Transfer ownership in Settings, not with a role.`
		};
	try {
		await setOrgRole(parsed.data.orgId, parsed.data.userId, parsed.data.role);
	} catch (error) {
		return failedChange(nothing, error);
	}
	refreshWorkspace();
	return DONE;
}

/** Remove a member from the organization, and so from every project they were added to in it. */
export async function removeOrgMemberAction(orgId: string, userId: string): Promise<PeopleActionResult> {
	const nothing = "Nothing was removed.";
	const parsed = memberInput.safeParse({ orgId, userId });
	if (!parsed.success) return { status: "failed", message: `${nothing} ${UNREADABLE}` };
	try {
		await removeOrgMember(parsed.data.orgId, parsed.data.userId);
	} catch (error) {
		return failedChange(nothing, error);
	}
	refreshWorkspace();
	return DONE;
}

/** Invite by email address or with a join code. The link and code come back once. */
export async function createOrgInvitationAction(
	orgId: string,
	request: InviteRequest<"admin" | "member">
): Promise<InviteResult> {
	const nothing = "No invitation was created.";
	const parsed = inviteInput.safeParse({ orgId, ...request });
	if (!parsed.success)
		return { status: "failed", message: `${nothing} ${UNREADABLE}`, fields: fieldsOf(parsed.error) };
	const { email, maxUses, expiresInDays, role } = parsed.data;
	try {
		const created = await createOrgInvitation(parsed.data.orgId, {
			role,
			...(email ? { email } : {}),
			max_uses: maxUses,
			expires_in_days: expiresInDays
		});
		refreshWorkspace();
		return {
			status: "done",
			invitation: {
				code: created.code,
				email_delivery: created.email_delivery,
				token: created.token,
				role: created.role,
				email: created.email,
				max_uses: created.max_uses,
				expires_at: created.expires_at
			}
		};
	} catch (error) {
		const failure = failedChange(nothing, error);
		const fields = apiRequestError(error).fields;
		return Object.keys(fields).length > 0 ? { ...failure, fields: { ...fields } } : failure;
	}
}

/** Revoke an invitation: nobody can use its link or code after this. */
export async function revokeOrgInvitationAction(orgId: string, invitationId: string): Promise<PeopleActionResult> {
	const nothing = "Nothing was revoked.";
	const parsed = revokeInput.safeParse({ orgId, invitationId });
	if (!parsed.success) return { status: "failed", message: `${nothing} ${UNREADABLE}` };
	try {
		await revokeOrgInvitation(parsed.data.orgId, parsed.data.invitationId);
	} catch (error) {
		return failedChange(nothing, error);
	}
	refreshWorkspace();
	return DONE;
}
