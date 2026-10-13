"use client";

import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Note } from "@/components/contour/Note";

import { conflictLine } from "./editor/conflict";
import type { DraftSnapshot, Pause, SavedDraft } from "./editor/save-queue";

export type ConflictChoiceProps = {
	pause: Pause | null;
	/** The edits in this tab. */
	local: DraftSnapshot;
	time: (iso: string) => string;
	onKeepMine: () => void;
	onTakeSaved: () => void;
	onSaveFile: () => void;
};

/** The draft someone else saved, while saving is stopped for it; null otherwise. */
export function conflictOf(pause: Pause | null): SavedDraft | null {
	return (pause?.kind === "conflict" || pause?.kind === "precondition") && pause.server ? pause.server : null;
}

/**
 * Someone else saved this draft (UI plan 5.9, WUI-7), from the editor and its review alike: which edits to
 * keep, asked once per saved revision. "Decide later" leaves a note that asks again; nothing in this tab is
 * lost meanwhile, and the edits can be kept as a file first.
 */
export function ConflictChoice({ pause, local, time, onKeepMine, onTakeSaved, onSaveFile }: ConflictChoiceProps) {
	const [dismissed, setDismissed] = useState<string | null>(null);
	const [replacing, setReplacing] = useState(false);
	const conflict = conflictOf(pause);
	const key = conflict ? `${conflict.revision}:${pause?.kind}` : null;

	return (
		<>
			{conflict && dismissed === key && (
				<Note tone="attention" title="Not saved.">
					<span className="flex flex-col items-start gap-3">
						<span>Someone else saved this draft. Choose which edits to keep.</span>
						<Button variant="outline" size="sm" onClick={() => setDismissed(null)}>
							Choose what to keep
						</Button>
					</span>
				</Note>
			)}
			<Dialog
				open={conflict !== null && dismissed !== key}
				onOpenChange={open => {
					if (!open) {
						setDismissed(key);
						setReplacing(false);
					}
				}}
				title={replacing ? "Replace the saved draft?" : "Someone else saved this draft"}
				description={
					replacing
						? `The draft saved at ${conflict ? time(conflict.updatedAt) : ""} is replaced by the edits in this tab. Its own changes are lost.`
						: `${conflict?.updatedBy ?? "Another manager"} saved it at ${conflict ? time(conflict.updatedAt) : ""}. Your edits are still here and are not saved.`
				}
				footer={
					replacing ? (
						<>
							<Button variant="outline" onClick={() => setReplacing(false)}>
								Back
							</Button>
							<Button
								variant="danger-solid"
								onClick={() => {
									setReplacing(false);
									onKeepMine();
								}}>
								Replace the saved draft
							</Button>
						</>
					) : (
						<>
							<DialogClose asChild>
								<Button variant="outline">Decide later</Button>
							</DialogClose>
							<Button variant="outline" icon="download" onClick={onSaveFile}>
								Save my edits as a file
							</Button>
							<Button variant="outline" onClick={onTakeSaved}>
								Discard my edits and load the saved draft
							</Button>
							<Button variant="ink" onClick={() => setReplacing(true)}>
								Replace the saved draft with my edits
							</Button>
						</>
					)
				}>
				{!replacing && conflict && <p className="type-body text-ink-2">{conflictLine(local, conflict)}</p>}
			</Dialog>
		</>
	);
}
