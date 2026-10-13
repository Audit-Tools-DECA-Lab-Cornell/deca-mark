"use client";

import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { TextLink } from "@/components/contour/TextLink";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { InvitationsTable } from "@/features/people/InvitationsTable";
import { InviteDialog } from "@/features/people/InviteDialog";
import { MembersTable } from "@/features/people/MembersTable";
import type { InvitationLike, InviteRequest, MemberLike, RoleOption } from "@/features/people/types";
import { stateOf } from "@/lib/contour";
import type { Result } from "@/lib/workspace/types";

import { changeMemberRole, createInvitation, removeMember, revokeInvitation } from "./actions";
import type { TeamContext, TeamRole } from "./rules";

/** The roles a project offers, least access first, with what each lets a person do. */
const ROLE_OPTIONS: readonly RoleOption<TeamRole>[] = [
	{
		value: "observer",
		label: stateOf("role", "observer").label,
		hint: "Collects observations in the DECA Mark app."
	},
	{
		value: "viewer",
		label: stateOf("role", "viewer").label,
		hint: "Reads observations and reports. Cannot change anything."
	},
	{
		value: "manager",
		label: stateOf("role", "manager").label,
		hint: "Manages the team, sites, map packages, forms and settings."
	}
];

export type TeamScreenProps = {
	/** The project: its organization's web address, its code and its id. */
	context: TeamContext;
	projectName: string;
	/** Dates read in the project's timezone. */
	timeZone: string;
	currentUserId: string | null;
	/** The moment the page was read, so the server and the browser agree on what has expired. */
	nowIso: string;
	members: Result<MemberLike<TeamRole>[]>;
	invitations: Result<InvitationLike<TeamRole>[]>;
	/** Whether the person may open Organization members (owners and admins). */
	canOpenOrgMembers: boolean;
};

/**
 * Project team (project-04, project-08): who is on the project and what each person can do, the
 * invitations still waiting, and Invite, which makes a link and a join code and requests delivery
 * when an email address is given. Every list is a real read; a read that failed says so instead of
 * showing nobody.
 */
export function TeamScreen({
	context,
	projectName,
	timeZone,
	currentUserId,
	nowIso,
	members,
	invitations,
	canOpenOrgMembers
}: TeamScreenProps) {
	const [inviting, setInviting] = useState(false);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Project team"
				lead="Who can open this project, and the invitations still waiting to be used."
				actions={
					<Button variant="primary" icon="plus" onClick={() => setInviting(true)}>
						Invite
					</Button>
				}
			/>
			<InviteDialog
				open={inviting}
				onOpenChange={setInviting}
				title={`Invite someone to ${projectName}`}
				roleOptions={ROLE_OPTIONS}
				defaultRole="observer"
				timeZone={timeZone}
				onCreate={(request: InviteRequest<TeamRole>) => createInvitation(context, request)}
			/>

			{members.ok ? (
				<MembersTable
					title="Members"
					members={members.data}
					currentUserId={currentUserId}
					roleOptions={ROLE_OPTIONS}
					placeName={projectName}
					timeZone={timeZone}
					onRoleChange={(userId, role) => changeMemberRole(context, userId, role)}
					onRemove={userId => removeMember(context, userId, userId === currentUserId)}
					empty="Nobody is on the team yet. Choose Invite to add the people who collect or read this project’s observations."
				/>
			) : (
				<LoadFailure failure={members.failure} what="the project members" />
			)}

			{invitations.ok ? (
				<InvitationsTable
					invitations={invitations.data}
					nowIso={nowIso}
					timeZone={timeZone}
					onRevoke={invitationId => revokeInvitation(context, invitationId)}
					empty="No invitations are waiting. Choose Invite to make a link or a join code."
				/>
			) : (
				<LoadFailure failure={invitations.failure} what="the waiting invitations" />
			)}

			<Note tone="neutral" icon="users">
				Organization owners and admins manage every project.{" "}
				{canOpenOrgMembers ? (
					<>
						Manage them in{" "}
						<TextLink href={`/o/${context.org}/members`} tone="ink">
							Organization members
						</TextLink>
						.
					</>
				) : (
					"They are managed in Organization members, which only owners and admins can open."
				)}
			</Note>
			<NotAvailable
				title="Resending an invitation"
				reason="A link and a join code are shown only once, when the invitation is created."
				instead="Revoke the invitation and create a new one."
			/>
		</div>
	);
}
