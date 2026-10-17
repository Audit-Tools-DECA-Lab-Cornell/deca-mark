"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, type ButtonProps } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { useToast } from "@/components/contour/Toast";
import { plural } from "@/lib/labels";

import { ActionNote } from "./ActionNote";
import { discardDraftAction } from "./actions";
import type { VersionRow } from "./model";
import type { FormActionFailure } from "./result";

/**
 * Discard draft: deletes a draft after listing what goes with it. Published and retired versions are never
 * touched. If the draft was published in the meantime the API refuses, and the dialog says so.
 */
export function DiscardDialog({
	org,
	project,
	version,
	size = "sm",
	onDiscarded
}: {
	org: string;
	project: string;
	version: Pick<VersionRow, "code" | "questionCount" | "etag">;
	size?: ButtonProps["size"];
	/** Called after the draft is gone, when the page showing it should move on. */
	onDiscarded?: () => void;
}) {
	const router = useRouter();
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [failure, setFailure] = useState<FormActionFailure | null>(null);
	const [pending, start] = useTransition();

	function discard() {
		start(async () => {
			const result = await discardDraftAction({ org, project, version: version.code, etag: version.etag });
			if (result.status === "failed") return setFailure(result);
			setOpen(false);
			toast({ title: `${version.code} is discarded`, description: "The draft is deleted.", tone: "saved" });
			if (onDiscarded) onDiscarded();
			else router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next);
				if (!next) setFailure(null);
			}}
			title={`Discard ${version.code}?`}
			description="The draft is deleted and cannot be brought back. Published versions are not affected."
			trigger={
				<Button variant="danger" size={size} icon="trash-2" aria-label={`Discard ${version.code}`}>
					Discard
				</Button>
			}
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline">Keep the draft</Button>
					</DialogClose>
					<Button
						variant="danger-solid"
						icon="trash-2"
						busy={pending}
						busyLabel="Discarding…"
						onClick={discard}>
						Discard draft
					</Button>
				</>
			}>
			<p className="type-body text-ink">
				Goes with it: {version.code}, with its {plural(version.questionCount, "question")}.
			</p>
			<ActionNote failure={failure} className="mt-4" />
		</Dialog>
	);
}
