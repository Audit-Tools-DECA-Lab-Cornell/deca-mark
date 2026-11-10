"use client";
import { Button } from "@/components/contour/Button";

import { type Address, request } from "./api";
import { setupEtag } from "./schema";
import type { useSetup } from "./useSetup";

type Props = {
	readonly state: ReturnType<typeof useSetup>;
	readonly address: Address;
	readonly siteHref: string;
	readonly pendingWork: boolean;
	readonly publishing: boolean;
	readonly recover: () => void;
	readonly go: (href: string) => void;
};
export function SetupActions({ state, address, siteHref, pendingWork, publishing, recover, go }: Props) {
	const setup = state.setup;
	if (!setup) return null;
	return (
		<div className="flex flex-wrap gap-3">
			<Button
				variant="outline"
				disabled={state.busy || publishing}
				onClick={async () => {
					if (pendingWork) {
						state.setError("Finish or cancel the current drawing or source review before leaving.");
						return;
					}
					if (await state.flush()) go(siteHref);
				}}>
				Save and leave
			</Button>
			<Button
				variant="outline"
				disabled={state.busy || publishing}
				onClick={async () => {
					if (
						!window.confirm(
							"Discard this saved map setup and its unfinished changes? The current published map will stay available."
						)
					)
						return;
					try {
						await request(address, `/${setup.setup_id}/discard`, {
							method: "POST",
							headers: { "If-Match": setupEtag(setup) }
						});
						go(siteHref);
					} catch {
						state.setError(
							"The setup could not be discarded. Keep this page open and check the saved version before trying again."
						);
					}
				}}>
				Discard map setup
			</Button>
			<Button variant="outline" onClick={recover}>
				Save a recovery file
			</Button>
		</div>
	);
}
