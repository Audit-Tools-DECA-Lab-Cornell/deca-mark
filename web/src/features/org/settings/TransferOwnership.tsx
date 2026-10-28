"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { TextInput } from "@/components/contour/TextInput";
import { TextLink } from "@/components/contour/TextLink";
import { useToast } from "@/components/contour/Toast";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { rejectedWith } from "@/lib/action-rejection";
import { stateOf } from "@/lib/contour";
import { clock } from "@/lib/time";
import type { Failure, OrgRole } from "@/lib/workspace/types";

import { transferOwnershipAction } from "../actions";

/** Someone ownership can pass to: a current admin or member. */
export type TransferCandidate = { userId: string; name: string; role: OrgRole; addedAt: string };

export type TransferOwnershipProps = {
	org: { id: string; slug: string; name: string };
	/** Null when the members could not be read; `failure` says why. */
	candidates: TransferCandidate[] | null;
	failure: Failure | null;
	timeZone: string;
};

/**
 * Transfer ownership (owners only): pick an existing admin or member, then confirm by typing the
 * organization's name. The new owner takes over and the previous owner becomes an admin.
 */
export function TransferOwnership({ org, candidates, failure, timeZone }: TransferOwnershipProps) {
	const ids = useId();
	const toast = useToast();
	const days = clock(timeZone);
	const [chosen, setChosen] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [typed, setTyped] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [pending, startTransfer] = useTransition();
	const person = candidates?.find(candidate => candidate.userId === chosen) ?? null;
	const matches = typed.trim().toLowerCase() === org.name.trim().toLowerCase();

	function closeDialog(open: boolean) {
		if (open || pending) return;
		setConfirming(false);
		setTyped("");
		setProblem(null);
	}

	function transfer() {
		if (!person) return;
		setProblem(null);
		startTransfer(async () => {
			let result: Awaited<ReturnType<typeof transferOwnershipAction>>;
			try {
				result = await transferOwnershipAction(org.id, person.userId);
			} catch (error) {
				setProblem(rejectedWith(error, "reload", "Ownership was not transferred."));
				return;
			}
			if (result.status === "failed") {
				setProblem(result.message);
				return;
			}
			toast({ title: `${person.name} is now the owner. You are an admin.`, tone: "saved" });
			setConfirming(false);
			setTyped("");
			setChosen("");
		});
	}

	let body;
	if (failure) {
		body = <LoadFailure bare failure={failure} what="the members" />;
	} else if (!candidates || candidates.length === 0) {
		body = (
			<p className="type-body text-ink-2">
				Nobody else is in this organization yet. Invite someone first, then transfer ownership to them.{" "}
				<TextLink href={`/o/${org.slug}/members`} tone="accent" arrow="right">
					Open Members
				</TextLink>
			</p>
		);
	} else {
		body = (
			<div className="flex flex-col gap-5">
				<Field label="New owner" htmlFor={`${ids}-person`}>
					<Select id={`${ids}-person`} value={chosen} onChange={event => setChosen(event.target.value)}>
						<option value="">Choose a person</option>
						{candidates.map(candidate => (
							<option key={candidate.userId} value={candidate.userId}>
								{candidate.name} · {stateOf("role", candidate.role).label} · added{" "}
								{days.day(candidate.addedAt)}
							</option>
						))}
					</Select>
				</Field>
				<div>
					<Button
						variant="danger"
						icon="key-round"
						disabled={!person}
						disabledReason="Choose who becomes the owner."
						onClick={() => setConfirming(true)}>
						Transfer ownership
					</Button>
				</div>
			</div>
		);
	}

	return (
		<Island title="Transfer ownership">
			<div className="flex flex-col gap-5">
				<p className="type-body text-ink-2">
					The owner can change roles and pass ownership on. You become an admin when you transfer it.
				</p>
				{body}
			</div>
			<Dialog
				open={confirming}
				onOpenChange={closeDialog}
				size="sm"
				title={person ? `Make ${person.name} the owner?` : "Transfer ownership?"}
				description={`${person?.name ?? "They"} will own ${org.name}. You become an admin: you will no longer be able to change roles or transfer ownership. Only the new owner can give it back.`}
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline" disabled={pending}>
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="danger-solid"
							disabled={!matches}
							busy={pending}
							busyLabel="Transferring…"
							onClick={transfer}>
							Transfer ownership
						</Button>
					</>
				}>
				<div className="flex flex-col gap-5">
					<Field label={`Type ${org.name} to confirm`} htmlFor={`${ids}-confirm`}>
						<TextInput
							id={`${ids}-confirm`}
							autoComplete="off"
							spellCheck={false}
							value={typed}
							onChange={event => setTyped(event.target.value)}
						/>
					</Field>
					{problem && (
						<Note tone="attention" live="assertive">
							{problem}
						</Note>
					)}
				</div>
			</Dialog>
		</Island>
	);
}
