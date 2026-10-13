"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Note } from "@/components/contour/Note";
import { AccountChangedError } from "@/lib/api/browser";
import { ApiError, apiRequestError } from "@/lib/api/errors";
import { discardZoneDraft, type DraftAddress } from "@/lib/api/zones-browser";

import { zonesChangedAction } from "./actions";

export type DiscardDraftProps = {
	org: string;
	project: string;
	siteCode: string;
	address: DraftAddress;
	/** The draft's ETag now: a draft saved since is not discarded unseen. */
	etag: string;
	/** Where to go once it is discarded: the site's Zones page. */
	zonesHref: string;
	size?: "sm" | "md";
	disabled?: string | null;
	/** Leaves the page; the editor passes its leave guard's own way out. Without it the page is read again. */
	onDone?: (href: string) => void;
};

/** Why a discard did not happen, in words. */
function discardFailure(error: unknown): string {
	if (error instanceof AccountChangedError) return "You are signed in as someone else.";
	const failure = apiRequestError(error);
	if (failure instanceof ApiError && failure.status === 412)
		return "Someone saved this draft since this page read it. Reload the page to see it, then decide.";
	if (failure instanceof ApiError && failure.status === 409)
		return "This draft is no longer open: it was published or discarded already.";
	return failure.message;
}

/**
 * Discard draft (UI plan 5.7): asks first, then sends DELETE with the draft's ETag. Published versions and
 * observations are not affected; the Zones page opens afterwards.
 */
export function DiscardDraft({
	org,
	project,
	siteCode,
	address,
	etag,
	zonesHref,
	size,
	disabled = null,
	onDone
}: DiscardDraftProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	async function discard() {
		setBusy(true);
		setProblem(null);
		try {
			await discardZoneDraft(address, etag);
			await zonesChangedAction({ org, project }, siteCode);
			setOpen(false);
			if (onDone) onDone(zonesHref);
			else router.refresh();
		} catch (error) {
			setProblem(discardFailure(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<Button
				variant="outline"
				icon="trash-2"
				size={size}
				disabled={disabled !== null}
				disabledReason={disabled ?? undefined}
				onClick={() => {
					setProblem(null);
					setOpen(true);
				}}>
				Discard draft
			</Button>
			<Dialog
				open={open}
				onOpenChange={next => {
					if (!busy) setOpen(next);
				}}
				title="Discard this draft?"
				description="Its boundaries are not published and nothing else changes. Published versions and observations are not affected."
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Keep the draft</Button>
						</DialogClose>
						<Button
							variant="danger-solid"
							busy={busy}
							busyLabel="Discarding…"
							onClick={() => void discard()}>
							Discard draft
						</Button>
					</>
				}>
				{problem && (
					<Note tone="attention" live="assertive" title="Nothing was discarded.">
						{problem}
					</Note>
				)}
			</Dialog>
		</>
	);
}
