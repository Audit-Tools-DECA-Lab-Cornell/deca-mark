"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AuthPanel } from "@/components/shell/AuthSplit";
import { LoadFailure } from "@/components/shell/LoadFailure";

import { type InvitationDetails, recalledCode, rememberCode } from "./invitation";
import { InvitationCard } from "./InvitationCard";
import { InvitationSignIn } from "./InvitationSignIn";
import { JoinForm } from "./JoinForm";
import type { Viewer } from "./viewer";

const KICKER = "Join by code";
const subscribeToCode = () => () => {};
const noCodeOnServer = () => undefined;

/**
 * Join a project with the code a project manager gave you (Org 12). Step one is the code; step two is the
 * invitation it opens, with Join. Both happen on this page, so the code is never put in an address.
 * Someone who is not signed in is asked to sign in or create an account first and comes back here.
 */
export function JoinScreen({ viewer }: { viewer: Viewer }) {
	const [code, setCode] = useState<string | null>(null);
	const keptCode = useSyncExternalStore(subscribeToCode, recalledCode, noCodeOnServer);
	// The invitation is kept with the code it was found for, which is the code Join redeems.
	const [found, setFound] = useState<{ invitation: InvitationDetails; code: string } | null>(null);
	const moved = useRef(false);

	// Moving between the two steps puts focus on the new title, so a screen reader hears where it is.
	useEffect(() => {
		if (!moved.current) {
			moved.current = true;
			return;
		}
		if (found) document.getElementById("page-title")?.focus();
	}, [found]);

	if (viewer.status === "unavailable") {
		return (
			<AuthPanel kicker={KICKER} title="Join a project" lead="Joining needs DECA Mark.">
				<LoadFailure failure={viewer.failure} what="this page" />
			</AuthPanel>
		);
	}

	if (viewer.status === "signed-out") {
		return (
			<AuthPanel
				kicker={KICKER}
				title="Join a project"
				lead="Sign in, or create an account, first. Then enter the code your project manager gave you."
				footnoteRule={false}>
				<InvitationSignIn next="/join" />
			</AuthPanel>
		);
	}

	if (found) {
		const { invitation, code: foundCode } = found;
		const place = invitation.project ? "project" : "organization";
		return (
			<AuthPanel
				kicker={KICKER}
				title={`Join ${invitation.project ?? invitation.organization}?`}
				lead={`Check the ${place} and role before you join.`}
				footnote={`Nothing is shared with the ${place} until you join.`}
				footnoteRule={false}>
				<InvitationCard
					invitation={invitation}
					account={viewer.account}
					credential={{ code: foundCode }}
					next="/join"
					back={{ label: "Use a different code", onClick: () => setFound(null) }}
				/>
			</AuthPanel>
		);
	}

	return (
		<AuthPanel
			kicker={KICKER}
			title="Join a project"
			lead="Enter the eight-character code your project manager gave you. You will see the project before you join.">
			<JoinForm
				code={code ?? keptCode ?? ""}
				onCodeChange={setCode}
				onFound={(invitation, foundCode) => {
					rememberCode(foundCode);
					setFound({ invitation, code: foundCode });
				}}
			/>
		</AuthPanel>
	);
}
