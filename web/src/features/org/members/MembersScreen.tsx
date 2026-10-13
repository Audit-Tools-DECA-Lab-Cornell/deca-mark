"use client";

import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { InvitationsTable } from "@/features/people/InvitationsTable";
import { InviteDialog } from "@/features/people/InviteDialog";
import { MembersTable } from "@/features/people/MembersTable";
import type { InviteRequest } from "@/features/people/types";
import type { Invitation, OrganizationMember } from "@/lib/api/types";
import type { Failure, OrgRole } from "@/lib/workspace/types";

import {
	createOrgInvitationAction,
	removeOrgMemberAction,
	revokeOrgInvitationAction,
	setOrgRoleAction
} from "../actions";
import { canManageMember, inviteChoices, roleChoices, sortMembers } from "./rules";

export type MembersScreenProps = {
	org: { id: string; name: string; role: OrgRole };
	/** The signed-in person, marked "(you)". */
	currentUserId: string | null;
	members: OrganizationMember[];
	/** Null when the invitations could not be read; `invitationsFailure` says why. */
	invitations: Invitation[] | null;
	invitationsFailure: Failure | null;
	/** When the page was read, so the server and the browser agree on what has expired. */
	nowIso: string;
	/** Dates read in this timezone: the organization's first project's. */
	timeZone: string;
};

/**
 * The organization's people (org-02) for owners and admins: who is in it with what role, and the
 * invitations still waiting. Owners change roles between Admin and Member; admins can remove members.
 * Invitations are links and join codes, shown once, with optional queued email delivery.
 */
export function MembersScreen({
	org,
	currentUserId,
	members,
	invitations,
	invitationsFailure,
	nowIso,
	timeZone
}: MembersScreenProps) {
	const [inviting, setInviting] = useState(false);
	const roleOptions = roleChoices(org.role);
	const sorted = sortMembers(members);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Members"
				lead={`People in ${org.name}. Owners and admins manage every project.`}
				actions={
					<Button variant="primary" icon="plus" onClick={() => setInviting(true)}>
						Invite someone
					</Button>
				}
			/>
			<MembersTable<OrgRole>
				title="Organization members"
				members={sorted}
				currentUserId={currentUserId}
				roleOptions={roleOptions}
				canManage={member => canManageMember(org.role, currentUserId, member)}
				onRoleChange={
					roleOptions.length > 0 ? (userId, role) => setOrgRoleAction(org.id, userId, role) : undefined
				}
				onRemove={userId => removeOrgMemberAction(org.id, userId)}
				placeName={org.name}
				timeZone={timeZone}
				empty="Nobody is in this organization yet."
			/>
			{invitations ? (
				<InvitationsTable
					invitations={invitations}
					nowIso={nowIso}
					timeZone={timeZone}
					onRevoke={invitationId => revokeOrgInvitationAction(org.id, invitationId)}
					empty="No invitations are waiting. Use Invite someone to create a link or a join code."
				/>
			) : (
				invitationsFailure && <LoadFailure failure={invitationsFailure} what="the invitations" />
			)}
			<Note>
				Members open only the projects they are added to. To add someone to a project, invite them from that
				project&rsquo;s Team page. Removing a member also removes them from every project in this organization.
			</Note>
			<InviteDialog<"admin" | "member">
				open={inviting}
				onOpenChange={setInviting}
				title={`Invite someone to ${org.name}`}
				roleOptions={inviteChoices(org.role)}
				defaultRole="member"
				onCreate={(request: InviteRequest<"admin" | "member">) => createOrgInvitationAction(org.id, request)}
				timeZone={timeZone}
			/>
		</div>
	);
}
