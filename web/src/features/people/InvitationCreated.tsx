"use client";

import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { stateOf } from "@/lib/contour";
import { plural } from "@/lib/labels";
import { clock } from "@/lib/time";
import { inviteLink } from "@/lib/workspace/invitations";

import type { CreatedInvitation } from "./types";

/** The join code as people read it aloud: "K7QD 2MXA". */
function spacedCode(code: string): string {
	return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

function CopyRow({ label, value, shown, mono }: { label: string; value: string; shown?: string; mono?: boolean }) {
	const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied("yes");
		} catch {
			setCopied("failed");
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<p className="type-small font-semibold text-ink">{label}</p>
			<div className="flex flex-wrap items-center gap-3">
				<output
					className={
						mono
							? "min-w-0 flex-1 rounded-input bg-well px-4 py-3 type-mono-data text-lg tracking-wider text-ink"
							: "min-w-0 flex-1 rounded-input bg-well px-4 py-3 type-small break-all text-ink"
					}>
					{shown ?? value}
				</output>
				<Button variant="outline" size="sm" icon="copy" onClick={copy}>
					{copied === "yes" ? "Copied" : `Copy ${label.toLowerCase()}`}
				</Button>
			</div>
			<p aria-live="polite" className="type-small text-ink-2">
				{copied === "failed" ? "This browser did not allow copying. Select the text and copy it yourself." : ""}
			</p>
		</div>
	);
}

export type InvitationCreatedProps = {
	invitation: CreatedInvitation;
	/** Dates read in this timezone. */
	timeZone: string;
};

/**
 * A new invitation, shown once: the link (its token travels after `#`, so it never reaches a server log)
 * and the join code, each with Copy. Email delivery is reported from the API response.
 */
export function InvitationCreated({ invitation, timeZone }: InvitationCreatedProps) {
	// Shown only after an invitation is created in the browser, so this site's address is at hand.
	const origin = typeof window === "undefined" ? null : window.location.origin;
	const role = stateOf("role", invitation.role).label;
	const expires = clock(timeZone).day(invitation.expires_at);
	const scope = invitation.email
		? `Only ${invitation.email} can use it.`
		: `${plural(invitation.max_uses, "person", "people")} can use it.`;

	return (
		<div className="flex flex-col gap-5">
			<Note
				tone="waiting"
				title={invitation.email_delivery === "queued" ? "Invitation email queued." : "Share this invitation."}>
				{invitation.email_delivery === "queued"
					? `An invitation email is queued for ${invitation.email}. You can also share the link or code below.`
					: invitation.email_delivery === "unavailable"
						? "Email delivery is unavailable. Send the link or code yourself. It is shown only once."
						: "Send the link or code yourself. It is shown only once."}
			</Note>
			<p className="type-body text-ink">
				Joins as {role}. {scope} It expires on {expires}.
			</p>
			{origin && <CopyRow label="Link" value={inviteLink(origin, invitation.token)} />}
			<CopyRow label="Join code" value={invitation.code} shown={spacedCode(invitation.code)} mono />
		</div>
	);
}
