"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { StateBadge } from "@/components/contour/StateBadge";
import { useToast } from "@/components/contour/Toast";
import { rejectedWith } from "@/lib/action-rejection";

import { setProjectStatus } from "./actions";
import type { ProjectStatus, SettingsContext } from "./rules";

/** The one sentence that says what archiving does. It marks the project; it does not lock anything. */
export const ARCHIVE_COPY = "Marks the project as finished. Observers can still upload records they already collected.";

const ARCHIVED_COPY =
	"This project is marked as finished. Observers can still upload records they already collected. Unarchive it to mark the project as active again.";

export type ArchiveIslandProps = {
	context: SettingsContext;
	projectName: string;
	status: ProjectStatus;
};

/**
 * Archive or unarchive the project (project-19). Archiving only records that the project is finished: it
 * blocks nothing, so the copy never promises that collection stops.
 */
export function ArchiveIsland({ context, projectName, status: initial }: ArchiveIslandProps) {
	const toast = useToast();
	const [status, setStatus] = useState(initial);
	const [seen, setSeen] = useState(initial);
	const [confirming, setConfirming] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, startChange] = useTransition();

	// The page was read again (this change, or another manager's): follow what it says.
	if (seen !== initial) {
		setSeen(initial);
		setStatus(initial);
	}

	const archived = status === "archived";

	function change(next: ProjectStatus) {
		setFailure(null);
		startChange(async () => {
			let result: Awaited<ReturnType<typeof setProjectStatus>>;
			try {
				result = await setProjectStatus(context, next);
			} catch (error) {
				setFailure(
					rejectedWith(
						error,
						"reload",
						next === "archived" ? "The project was not archived." : "The project was not unarchived."
					)
				);
				return;
			}
			if (result.status === "failed") {
				setFailure(result.message);
				return;
			}
			setStatus(result.projectStatus);
			setConfirming(false);
			toast({
				title:
					result.projectStatus === "archived"
						? `${projectName} is archived.`
						: `${projectName} is active again.`,
				tone: "saved"
			});
		});
	}

	function closeConfirm(open: boolean) {
		if (open || pending) return;
		setFailure(null);
		setConfirming(false);
	}

	return (
		<Island title="Archive project" meta={<StateBadge kind="project" state={status} size="sm" />}>
			<div className="flex flex-col items-start gap-4">
				<p className="type-body text-ink">{archived ? ARCHIVED_COPY : ARCHIVE_COPY}</p>
				{archived ? (
					<Button
						variant="outline"
						icon="undo-2"
						busy={pending}
						busyLabel="Unarchiving…"
						onClick={() => change("active")}>
						Unarchive project
					</Button>
				) : (
					<Button variant="outline" icon="archive" onClick={() => setConfirming(true)}>
						Archive project
					</Button>
				)}
				{failure && !confirming && (
					<Note tone="attention" live="assertive">
						{failure}
					</Note>
				)}
			</div>
			<Dialog
				open={confirming}
				onOpenChange={closeConfirm}
				size="sm"
				title={`Archive ${projectName}?`}
				description={`${ARCHIVE_COPY} You can unarchive it at any time.`}
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline" disabled={pending}>
								Cancel
							</Button>
						</DialogClose>
						<Button variant="ink" busy={pending} busyLabel="Archiving…" onClick={() => change("archived")}>
							Archive project
						</Button>
					</>
				}>
				{failure ? (
					<Note tone="attention" live="assertive">
						{failure}
					</Note>
				) : null}
			</Dialog>
		</Island>
	);
}
