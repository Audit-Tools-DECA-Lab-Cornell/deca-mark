"use client";

import { type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { useToast } from "@/components/contour/Toast";
import { rejectedWith } from "@/lib/action-rejection";
import { stateOf } from "@/lib/contour";
import { plural } from "@/lib/labels";
import { clock } from "@/lib/time";
import { activeInvitations, usesLabel } from "@/lib/workspace/invitations";

import type { InvitationLike, PeopleActionResult, PeopleRole } from "./types";

export type InvitationsTableProps<R extends PeopleRole> = {
	invitations: readonly InvitationLike<R>[];
	/** The moment the page was read, so the server and the browser agree on what has expired. */
	nowIso: string;
	/** Revokes an invitation. Without it, there is no Revoke button. */
	onRevoke?: (invitationId: string) => Promise<PeopleActionResult>;
	/** Dates read in this timezone. */
	timeZone: string;
	/** What an empty list says, with the action that fixes it. */
	empty?: ReactNode;
	className?: string;
};

/**
 * Invitations still waiting to be used (project-08, org-02): who it is for (an email address, or a join
 * code anyone with it can use), the role, how many uses are left and when it expires. Revoked, expired
 * and used-up invitations are left out. The link and code are not shown again; to send them again,
 * revoke the invitation and create a new one.
 */
export function InvitationsTable<R extends PeopleRole>({
	invitations,
	nowIso,
	onRevoke,
	timeZone,
	empty,
	className
}: InvitationsTableProps<R>) {
	const [revoking, setRevoking] = useState<InvitationLike<R> | null>(null);
	const pending = activeInvitations(invitations, nowIso);
	const days = clock(timeZone);

	return (
		<Island
			title="Invitations waiting"
			meta={plural(pending.length, "invitation")}
			flush
			className={className}
			footnote="Links and join codes are shown only once. To send one again, revoke it and create a new invitation.">
			{pending.length === 0 ? (
				<div className="px-island-pad py-6 type-body text-ink-2">{empty ?? "No invitations are waiting."}</div>
			) : (
				<ul>
					{pending.map(invitation => (
						<li key={invitation.id} className="border-t border-rule px-island-pad py-3 first:border-t-0">
							<div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:grid md:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
								{/* Below md, the invitation takes the first line and the rest share the second. */}
								<div className="min-w-0 basis-full md:basis-auto">
									<p className="type-body font-semibold wrap-anywhere text-ink">
										{invitation.email ?? "Join code"}
									</p>
									<p className="type-small text-ink-2">Expires {days.day(invitation.expires_at)}</p>
								</div>
								<span className="type-mono-label text-ink-2">
									{stateOf("role", invitation.role).label}
								</span>
								<span className="type-small text-ink-2">Used {usesLabel(invitation)}</span>
								<div className="ml-auto flex justify-end md:ml-0">
									{onRevoke && (
										<Button variant="outline" size="sm" onClick={() => setRevoking(invitation)}>
											Revoke
										</Button>
									)}
								</div>
							</div>
						</li>
					))}
				</ul>
			)}
			{onRevoke && <RevokeDialog invitation={revoking} onClose={() => setRevoking(null)} onRevoke={onRevoke} />}
		</Island>
	);
}

function RevokeDialog<R extends PeopleRole>({
	invitation,
	onClose,
	onRevoke
}: {
	invitation: InvitationLike<R> | null;
	onClose: () => void;
	onRevoke: (invitationId: string) => Promise<PeopleActionResult>;
}) {
	const toast = useToast();
	const [pending, startRevoke] = useTransition();
	const [failure, setFailure] = useState<string | null>(null);

	function close(open: boolean) {
		if (open || pending) return;
		setFailure(null);
		onClose();
	}

	function revoke() {
		if (!invitation) return;
		setFailure(null);
		startRevoke(async () => {
			let result: PeopleActionResult;
			try {
				result = await onRevoke(invitation.id);
			} catch (error) {
				setFailure(rejectedWith(error, "reload", "The invitation was not revoked."));
				return;
			}
			if (result.status === "failed") {
				setFailure(result.message);
				return;
			}
			toast({ title: "Invitation revoked.", tone: "saved" });
			onClose();
		});
	}

	return (
		<Dialog
			open={invitation !== null}
			onOpenChange={close}
			size="sm"
			title={invitation?.email ? `Revoke the invitation for ${invitation.email}?` : "Revoke this join code?"}
			description="Nobody can use its link or code after this. People who already joined stay."
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline" disabled={pending}>
							Cancel
						</Button>
					</DialogClose>
					<Button variant="danger-solid" busy={pending} busyLabel="Revoking…" onClick={revoke}>
						Revoke
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
