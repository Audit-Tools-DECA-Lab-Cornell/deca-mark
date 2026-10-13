"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, type ButtonVariant } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import type { IconName } from "@/components/contour/Icon";
import { Note } from "@/components/contour/Note";

import { startDraftAction } from "./actions";

export type StartDraftProps = {
	org: string;
	project: string;
	siteCode: string;
	/** "Start a draft from v2", "Restore v1 boundaries in a new draft". */
	label: string;
	variant: ButtonVariant;
	icon?: IconName;
	size?: "sm" | "md";
	title: string;
	description: string;
	/** Who else has a draft on this version, when someone does. */
	note?: string | null;
	/** An earlier version whose zones the new draft gets. */
	restoreFrom?: string | null;
	/** The drafts' address: the editor opens at `<draftsHref>/<draft>`. */
	draftsHref: string;
	/** What opens on the new draft: the editor, or its review (a restored version is reviewed first). */
	opens?: "editor" | "review";
};

/**
 * Starts a zone draft (UI plan 5.2). The request ID is chosen when the dialog opens, so pressing Start twice,
 * or again after a lost answer, makes one draft; DECA Mark returns the same one. The editor opens on it.
 */
export function StartDraft({
	org,
	project,
	siteCode,
	label,
	variant,
	icon = "plus",
	size,
	title,
	description,
	note = null,
	restoreFrom = null,
	draftsHref,
	opens = "editor"
}: StartDraftProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [requestId, setRequestId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	async function start() {
		if (!requestId) return;
		setBusy(true);
		setProblem(null);
		try {
			const result = await startDraftAction({ org, project }, { siteCode, requestId, restoreFrom });
			if (result.status === "failed") {
				setProblem(result.message);
				return;
			}
			router.push(`${draftsHref}/${result.draftId}${opens === "review" ? "/publish" : ""}`);
		} catch {
			setProblem(
				"DECA Mark could not confirm whether the draft was started. Try again: it starts one draft at most."
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<Button
				variant={variant}
				icon={icon}
				size={size}
				onClick={() => {
					setRequestId(crypto.randomUUID());
					setProblem(null);
					setOpen(true);
				}}>
				{label}
			</Button>
			<Dialog
				open={open}
				onOpenChange={next => {
					if (!busy) setOpen(next);
				}}
				title={title}
				description={description}
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Cancel</Button>
						</DialogClose>
						<Button variant="ink" busy={busy} busyLabel="Starting…" onClick={() => void start()}>
							Start the draft
						</Button>
					</>
				}>
				<div className="flex flex-col gap-4">
					{note && <Note tone="neutral">{note}</Note>}
					{problem && (
						<Note tone="attention" live="assertive" title="Not started.">
							{problem}
						</Note>
					)}
				</div>
			</Dialog>
		</>
	);
}
