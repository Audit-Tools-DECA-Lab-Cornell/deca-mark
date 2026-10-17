"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";

import type { FormActionFailure } from "./result";

/**
 * A change that did not happen, in the words the action gave: what was not done and why. When someone else
 * changed the form first, it offers the reload that shows the latest.
 */
export function ActionNote({
	failure,
	className,
	onReload,
	reloadLabel = "Reload"
}: {
	failure: FormActionFailure | null;
	className?: string;
	/** What Reload does. By default the page's data is read again; the editor reloads the whole page. */
	onReload?: () => void;
	reloadLabel?: string;
}) {
	const router = useRouter();
	const [reloading, startReload] = useTransition();
	if (!failure) return null;
	return (
		<Note tone="attention" live="assertive" className={className}>
			<span className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
				<span>{failure.message}</span>
				{failure.conflict && (
					<Button
						variant="outline"
						size="sm"
						icon="rotate-cw"
						busy={reloading}
						busyLabel="Reloading…"
						onClick={() => (onReload ? onReload() : startReload(() => router.refresh()))}>
						{reloadLabel}
					</Button>
				)}
			</span>
		</Note>
	);
}
