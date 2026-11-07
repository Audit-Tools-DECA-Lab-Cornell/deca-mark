"use client";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";

import { type OnlineMap, onlineMapName } from "./online-maps";

/**
 * Asks before a package is made without the project's online background maps (D35). Nothing is sent until
 * the manager agrees; Cancel keeps the chosen files.
 */
export function OnlineMapDialog({
	maps,
	busy,
	onConfirm,
	onCancel
}: {
	/** The maps to leave out, or null while the question is closed. */
	maps: readonly OnlineMap[] | null;
	busy: boolean;
	onConfirm: (maps: readonly OnlineMap[]) => void;
	onCancel: () => void;
}) {
	return (
		<Dialog
			open={maps !== null}
			onOpenChange={next => {
				if (!next) onCancel();
			}}
			title="Upload without the background map?"
			description="Observers see the vector layers only. A background map is not part of the map package."
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button
						variant="primary"
						busy={busy}
						busyLabel="Uploading…"
						onClick={() => maps && onConfirm(maps)}>
						Upload without it
					</Button>
				</>
			}>
			<p className="type-body text-ink">
				{maps && maps.length === 1 ? "This map will not be uploaded:" : "These maps will not be uploaded:"}
			</p>
			<ul className="mt-2 list-disc pl-5 type-body text-ink">
				{maps?.map(map => (
					<li key={map.name} className="wrap-break-word">
						{onlineMapName(map)}
					</li>
				))}
			</ul>
		</Dialog>
	);
}
