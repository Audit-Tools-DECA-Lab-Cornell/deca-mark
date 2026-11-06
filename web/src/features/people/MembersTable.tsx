"use client";

import { type ReactNode, useState, useTransition } from "react";

import { Avatar } from "@/components/contour/Avatar";
import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { useToast } from "@/components/contour/Toast";
import { rejectedWith } from "@/lib/action-rejection";
import { stateOf } from "@/lib/contour";
import { plural } from "@/lib/labels";
import { clock } from "@/lib/time";

import { memberInitials, memberName, NO_NAME } from "./names";
import type { MemberLike, PeopleActionResult, PeopleRole, RoleOption } from "./types";

export type MembersTableProps<R extends PeopleRole> = {
	/** The island's title: "Project team", "Organization members". */
	title: string;
	members: readonly MemberLike<R>[];
	/** The signed-in person, marked "(you)". */
	currentUserId: string | null;
	/** The roles the signed-in person can give here, in the order the select lists them. */
	roleOptions: readonly RoleOption<R>[];
	/** Whether this member's role can be changed or they can be removed by the signed-in person. */
	canManage?: (member: MemberLike<R>) => boolean;
	/** Changes a member's role. Without it, roles are shown as words. */
	onRoleChange?: (userId: string, role: R) => Promise<PeopleActionResult>;
	/** Removes a member. Without it, there is no Remove button. */
	onRemove?: (userId: string) => Promise<PeopleActionResult>;
	/** The project or organization, as the remove dialog names it: "Play Study". */
	placeName: string;
	/** Dates read in this timezone (the project's, or the organization's first project's). */
	timeZone: string;
	/** What an empty list says, with the action that fixes it. */
	empty?: ReactNode;
	/** Controls on the right of the island's header, such as the Invite button. */
	actions?: ReactNode;
	className?: string;
};

function roleWord(role: PeopleRole): string {
	return stateOf("role", role).label;
}

/**
 * The people in a project or organization (project-08, org-02): name (or "No name available"), initials, when
 * they were added and their role. Where the signed-in person may manage someone, the role is a select
 * and Remove asks first. A ruled list, so it reads at 390 px without sideways scrolling.
 */
export function MembersTable<R extends PeopleRole>({
	title,
	members,
	currentUserId,
	roleOptions,
	canManage = () => true,
	onRoleChange,
	onRemove,
	placeName,
	timeZone,
	empty,
	actions,
	className
}: MembersTableProps<R>) {
	const [removing, setRemoving] = useState<MemberLike<R> | null>(null);
	const days = clock(timeZone);

	return (
		<Island
			title={title}
			meta={plural(members.length, "person", "people")}
			actions={actions}
			flush
			className={className}>
			{members.length === 0 ? (
				<div className="px-island-pad py-6 type-body text-ink-2">{empty ?? "Nobody is here yet."}</div>
			) : (
				<ul>
					{members.map(member => (
						<MemberRow
							key={member.user_id}
							member={member}
							you={member.user_id === currentUserId}
							added={days.day(member.granted_at)}
							roleOptions={roleOptions}
							manageable={canManage(member)}
							onRoleChange={onRoleChange}
							onRemove={onRemove ? () => setRemoving(member) : undefined}
						/>
					))}
				</ul>
			)}
			{onRemove && (
				<RemoveDialog
					member={removing}
					placeName={placeName}
					you={removing?.user_id === currentUserId}
					onClose={() => setRemoving(null)}
					onRemove={onRemove}
				/>
			)}
		</Island>
	);
}

function MemberRow<R extends PeopleRole>({
	member,
	you,
	added,
	roleOptions,
	manageable,
	onRoleChange,
	onRemove
}: {
	member: MemberLike<R>;
	you: boolean;
	added: string;
	roleOptions: readonly RoleOption<R>[];
	manageable: boolean;
	onRoleChange?: (userId: string, role: R) => Promise<PeopleActionResult>;
	onRemove?: () => void;
}) {
	const toast = useToast();
	const [pending, startChange] = useTransition();
	const [failure, setFailure] = useState<string | null>(null);
	const name = memberName(member);
	const selectId = `role-${member.user_id}`;
	const canChange = Boolean(onRoleChange) && manageable && roleOptions.some(option => option.value === member.role);

	function changeRole(role: R) {
		if (!onRoleChange || role === member.role) return;
		setFailure(null);
		startChange(async () => {
			let result: PeopleActionResult;
			try {
				result = await onRoleChange(member.user_id, role);
			} catch (error) {
				setFailure(rejectedWith(error, "reload", "The role was not changed."));
				return;
			}
			if (result.status === "failed") setFailure(result.message);
			else
				toast({
					title: `${name === NO_NAME ? "Their" : `${name}’s`} role is now ${roleWord(role)}.`,
					tone: "saved"
				});
		});
	}

	return (
		<li className="border-t border-rule px-island-pad py-3 first:border-t-0">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-3 md:grid md:grid-cols-[minmax(0,1fr)_13rem_auto]">
				{/* Below md, the person takes the first line and the role and Remove share the second. */}
				<div className="flex min-w-0 basis-full items-center gap-3 md:basis-auto">
					<Avatar initials={memberInitials(member)} size="sm" />
					<div className="min-w-0">
						<p className={name === NO_NAME ? "type-body text-ink-2" : "type-body font-semibold text-ink"}>
							<span className="wrap-anywhere">{name}</span>
							{you && <span className="font-normal text-ink-2"> (you)</span>}
						</p>
						<p className="type-small text-ink-2">Added {added}</p>
					</div>
				</div>
				<div className="min-w-0 flex-1 sm:max-w-52">
					{canChange ? (
						<Select
							id={selectId}
							aria-label={`Role of ${name === NO_NAME ? "this person" : name}`}
							value={member.role}
							disabled={pending}
							onChange={event => changeRole(event.target.value as R)}>
							{roleOptions.map(option => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
					) : (
						<span className="type-mono-label text-ink-2">{roleWord(member.role)}</span>
					)}
				</div>
				<div className="ml-auto flex justify-end md:ml-0">
					{onRemove && manageable && (
						<Button variant="outline" size="sm" icon="trash-2" onClick={onRemove}>
							{you ? "Leave" : "Remove"}
						</Button>
					)}
				</div>
			</div>
			{failure && (
				<p role="alert" className="mt-2 type-small text-attention">
					{failure}
				</p>
			)}
		</li>
	);
}

function RemoveDialog<R extends PeopleRole>({
	member,
	placeName,
	you,
	onClose,
	onRemove
}: {
	member: MemberLike<R> | null;
	placeName: string;
	you: boolean;
	onClose: () => void;
	onRemove: (userId: string) => Promise<PeopleActionResult>;
}) {
	const toast = useToast();
	const [pending, startRemove] = useTransition();
	const [failure, setFailure] = useState<string | null>(null);
	const name = member ? memberName(member) : "";
	const who = name === NO_NAME ? "this person" : name;

	function close(open: boolean) {
		if (open || pending) return;
		setFailure(null);
		onClose();
	}

	function remove() {
		if (!member) return;
		setFailure(null);
		startRemove(async () => {
			let result: PeopleActionResult;
			try {
				result = await onRemove(member.user_id);
			} catch (error) {
				// Leaving an organization redirects, which `rejectedWith` rethrows so the page still leaves.
				setFailure(rejectedWith(error, "reload", "Nobody was removed."));
				return;
			}
			if (result.status === "failed") {
				setFailure(result.message);
				return;
			}
			toast({
				title: you
					? `You left ${placeName}.`
					: `${name === NO_NAME ? "They were" : `${name} was`} removed from ${placeName}.`,
				tone: "saved"
			});
			onClose();
		});
	}

	return (
		<Dialog
			open={member !== null}
			onOpenChange={close}
			size="sm"
			title={you ? `Leave ${placeName}?` : `Remove ${who} from ${placeName}?`}
			description={
				you
					? `You lose access to ${placeName} straight away. Records you already uploaded stay.`
					: `They lose access to ${placeName} straight away. Records they already uploaded stay.`
			}
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline" disabled={pending}>
							Cancel
						</Button>
					</DialogClose>
					<Button variant="danger-solid" busy={pending} busyLabel="Removing…" onClick={remove}>
						{you ? "Leave" : "Remove"}
					</Button>
				</>
			}>
			{failure ? (
				<Note tone="attention" live="assertive">
					{failure}
				</Note>
			) : null}
		</Dialog>
	);
}
