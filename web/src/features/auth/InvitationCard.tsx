"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { FactsList } from "@/components/contour/FactsList";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { StateBadge } from "@/components/contour/StateBadge";
import { stateOf } from "@/lib/contour";
import { clock } from "@/lib/time";
import type { AccountSummary } from "@/lib/workspace/types";

import { AccountChip } from "./AccountChip";
import { redeemInvite } from "./actions";
import { leaveFlash } from "./flash";
import {
	forgetCode,
	forgetToken,
	type InvitationDetails,
	type InviteCredential,
	type InviteProblem,
	type JoinOutcome,
	problemText,
	rememberCode,
	rememberToken,
	UNKEPT_COPY,
	UNREACHABLE_COPY
} from "./invitation";
import { withQuery } from "./params";
import { formatCountdown, useCooldown } from "./useCooldown";

export type InvitationCardProps = {
	invitation: InvitationDetails;
	account: AccountSummary;
	/** What the person opened: joined with exactly this. */
	credential: InviteCredential;
	/** The page that brought the person here, which sign in returns to. */
	next: "/invite" | "/join";
	/** The quiet way out: another code, or back to the person's projects. */
	back: { label: string; onClick?: () => void; href?: string };
};

/** "Oct 15, 2026 · 14:05 EDT": the expiry in the viewer's own time zone, which an invitation has no other. */
function expiryText(iso: string): string {
	const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
	const text = clock(zone).dayTime(iso);
	if (!text) return "";
	const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
		.formatToParts(new Date(iso))
		.find(part => part.type === "timeZoneName")?.value;
	return name ? `${text} ${name}` : text;
}

/** What the person is invited to, in the words of their role. */
function roleLabel(role: InvitationDetails["role"]): string {
	return stateOf("role", role).label.toLowerCase();
}

/**
 * An invitation as someone decides on it (Org 11): the organization, project, role and expiry DECA Mark
 * reports, and one Join. Looking at it shared nothing; Join adds the account to the project, then moves on
 * to the project (an observer to the collect page, an organization invitation to the organization). A
 * failed join keeps this page and says why: expired, no longer valid, already a member, too many tries
 * (with the wait), or DECA Mark unreachable.
 */
export function InvitationCard({ invitation, account, credential, next, back }: InvitationCardProps) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<InviteProblem | null>(null);
	const noteRef = useRef<HTMLDivElement>(null);
	const cooldown = useCooldown();
	const expiry = useMemo(() => expiryText(invitation.expiresAt), [invitation.expiresAt]);
	const place = invitation.project ?? invitation.organization;
	const role = stateOf("role", invitation.role);
	const waiting = cooldown.remaining > 0;

	useEffect(() => {
		if (problem) noteRef.current?.focus();
	}, [problem]);

	async function join() {
		if (pending || waiting) return;
		setProblem(null);
		setPending(true);
		let outcome: JoinOutcome;
		try {
			outcome = await redeemInvite(credential, {
				organization: invitation.organization,
				project: invitation.project
			});
		} catch {
			outcome = { status: "failed", problem: { kind: "unavailable", message: UNREACHABLE_COPY } };
		}
		if (outcome.status === "joined") {
			forgetToken();
			forgetCode();
			leaveFlash({ title: `You joined ${place}.`, description: `Your role is ${roleLabel(outcome.role)}.` });
			// The button stays busy until the next page replaces this one.
			router.push(outcome.path);
			return;
		}
		const failure = outcome.problem;
		if (failure.kind === "expired" || failure.kind === "already-member") {
			forgetToken();
			forgetCode();
		}
		if (failure.kind === "wait") cooldown.start(failure.retryAfter ?? 60);
		setProblem(failure);
		setPending(false);
	}

	const over = problem?.kind === "expired" || problem?.kind === "invalid";
	let action: ReactNode;
	if (problem?.kind === "already-member") {
		action = (
			<ButtonLink variant="primary" size="lg" fullWidth icon="arrow-right" href={problem.path ?? "/o"}>
				{invitation.project ? "Open the project" : "Open the organization"}
			</ButtonLink>
		);
	} else if (problem?.kind === "signed-out") {
		action = (
			<ButtonLink variant="primary" size="lg" fullWidth href={withQuery("/sign-in", { next })}>
				Sign in
			</ButtonLink>
		);
	} else if (!over) {
		action = (
			<Button
				variant="primary"
				size="lg"
				fullWidth
				icon="check"
				onClick={join}
				busy={pending}
				busyLabel="Joining…"
				disabled={waiting}
				disabledReason={`Wait ${formatCountdown(cooldown.remaining)} before trying again.`}>
				{invitation.project ? "Join project" : "Join organization"}
			</Button>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<Island flush aria-label="Invitation details">
				<FactsList
					labelWidth="7.5rem"
					className="px-5 py-4"
					items={[
						{ label: "Organization", value: invitation.organization },
						...(invitation.project
							? [
									{
										label: "Project",
										value: <strong className="font-semibold">{invitation.project}</strong>
									}
								]
							: []),
						{ label: "Your role", value: <StateBadge kind="role" state={invitation.role} /> },
						...(role.allows ? [{ label: "What it allows", value: role.allows }] : []),
						...(expiry ? [{ label: "Expires", value: expiry }] : [])
					]}
				/>
			</Island>
			{problem && (
				<div ref={noteRef} tabIndex={-1} className="rounded-note">
					<Note tone={problem.kind === "wait" ? "waiting" : "attention"} live="assertive">
						{problemText(problem, invitation)}
					</Note>
				</div>
			)}
			<div className="flex flex-col gap-3">
				<AccountChip
					account={account}
					disabled={pending}
					next={next}
					onSwitch={() => {
						const kept =
							"token" in credential ? rememberToken(credential.token) : rememberCode(credential.code);
						if (!kept) setProblem({ kind: "refused", message: UNKEPT_COPY });
						return kept;
					}}
				/>
				<p className="type-small text-ink-2">Use the email address your manager invited.</p>
				{action}
				{back.href ? (
					<ButtonLink variant="outline" size="lg" fullWidth href={back.href}>
						{back.label}
					</ButtonLink>
				) : (
					<Button variant="outline" size="lg" fullWidth onClick={back.onClick} disabled={pending}>
						{back.label}
					</Button>
				)}
			</div>
		</div>
	);
}
