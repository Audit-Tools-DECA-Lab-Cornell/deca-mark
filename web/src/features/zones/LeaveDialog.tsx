"use client";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";

export type LeaveDialogProps = {
	/** Where the person was going, while they are asked; null keeps the dialog closed. */
	leavingTo: string | null;
	onStay: () => void;
	onLeave: () => void;
	/** The draft was published or discarded elsewhere: the edits here can only be kept as a file. */
	closed: boolean;
	onSaveFile: () => void;
	/** "Save and leave", while the draft is open. */
	save?: { readonly busy: boolean; readonly unavailable: string | null; readonly onSave: () => void };
};

/**
 * Asked before leaving a zone draft with edits not saved (UI plan 5.7, WUI-11), from every screen of the
 * editor and its review, so a held link or Back always has its question.
 */
export function LeaveDialog({ leavingTo, onStay, onLeave, closed, onSaveFile, save }: LeaveDialogProps) {
	return (
		<Dialog
			open={leavingTo !== null}
			onOpenChange={open => {
				if (!open) onStay();
			}}
			title={closed ? "Leave without your edits?" : "Save your changes first?"}
			description={
				closed
					? "This draft is no longer open, so your edits in this tab cannot be saved to it. Keep them as a file first, or leave without them."
					: "Some changes to this draft are not saved yet. If you leave without saving, they are lost and the draft keeps its last saved revision."
			}
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline">{closed ? "Stay" : "Keep editing"}</Button>
					</DialogClose>
					{closed && (
						<Button variant="outline" icon="download" onClick={onSaveFile}>
							Save my edits as a file
						</Button>
					)}
					<Button variant="outline" icon="arrow-right" onClick={onLeave}>
						{closed ? "Leave without them" : "Leave without saving"}
					</Button>
					{!closed && save && (
						<Button
							variant="ink"
							busy={save.busy}
							busyLabel="Saving…"
							disabled={save.unavailable !== null}
							disabledReason={save.unavailable ?? undefined}
							onClick={save.onSave}>
							Save and leave
						</Button>
					)}
				</>
			}
		/>
	);
}
