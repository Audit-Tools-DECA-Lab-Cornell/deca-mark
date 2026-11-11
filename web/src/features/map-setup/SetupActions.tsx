"use client";
import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/contour/Menu";

import { type Address, request } from "./api";
import { setupEtag } from "./schema";
import type { useSetup } from "./useSetup";

type Props = {
	readonly state: ReturnType<typeof useSetup>;
	readonly address: Address;
	readonly siteHref: string;
	readonly siteName: string;
	readonly hasPublishedMap: boolean;
	readonly pendingWork: boolean;
	readonly publishing: boolean;
	readonly recover: () => void;
	readonly go: (href: string) => void;
};

/**
 * The ways out of map setup, in the page header on every step: save and leave, and, one level down, the
 * recovery file and discarding the draft. Discarding says what it removes and what it leaves before it asks.
 */
export function SetupActions({
	state,
	address,
	siteHref,
	siteName,
	hasPublishedMap,
	pendingWork,
	publishing,
	recover,
	go
}: Props) {
	const setup = state.setup;
	const [confirming, setConfirming] = useState(false);
	const [discarding, setDiscarding] = useState(false);
	if (!setup) return null;
	return (
		<>
			<Button
				variant="outline"
				disabled={state.busy || publishing}
				onClick={async () => {
					if (pendingWork) {
						state.setError("Finish or cancel the drawing or file review you have open before leaving.");
						return;
					}
					if (await state.flush()) go(siteHref);
				}}>
				Save and leave
			</Button>
			<Menu>
				<MenuTrigger asChild>
					<Button id="map-setup-more" variant="outline" iconRight="chevron-down">
						More
					</Button>
				</MenuTrigger>
				<MenuContent align="end">
					<MenuItem icon="file-down" onSelect={recover}>
						Save a recovery file
					</MenuItem>
					<MenuItem
						icon="trash-2"
						tone="danger"
						disabled={state.busy || publishing}
						// After the menu has closed and handed focus back, so the dialog can take it.
						onSelect={() => setTimeout(() => setConfirming(true), 0)}>
						Discard map setup
					</MenuItem>
				</MenuContent>
			</Menu>
			<Dialog
				open={confirming}
				onOpenChange={setConfirming}
				// The menu that opened the dialog has closed, so focus goes back to the button that opened the menu.
				onCloseAutoFocus={event => {
					event.preventDefault();
					document.getElementById("map-setup-more")?.focus();
				}}
				size="sm"
				title="Discard this map setup?"
				description={`The draft for ${siteName} is removed, with its imported layers, outline and zones. ${
					hasPublishedMap
						? "The published map stays as it is, and observers keep using it."
						: "The site stays, without a map."
				}`}
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Keep draft</Button>
						</DialogClose>
						<Button
							variant="danger-solid"
							busy={discarding}
							busyLabel="Discarding…"
							onClick={async () => {
								setDiscarding(true);
								try {
									await request(address, `/${setup.setup_id}/discard`, {
										method: "POST",
										headers: { "If-Match": setupEtag(setup) }
									});
									setConfirming(false);
									go(siteHref);
								} catch {
									setConfirming(false);
									state.setError(
										"The setup could not be discarded. Keep this page open and check the saved version before trying again."
									);
								} finally {
									setDiscarding(false);
								}
							}}>
							Discard map setup
						</Button>
					</>
				}
			/>
		</>
	);
}
