"use client";
import { Button, ButtonLink } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";

import type { useSetup } from "./useSetup";

type Props = { readonly state: ReturnType<typeof useSetup>; readonly siteHref: string; readonly recover: () => void };
export function SetupNotice({ state, siteHref, recover }: Props) {
	const setup = state.setup;
	if (!state.error) return null;
	return (
		<Note tone="attention" title="Map setup needs attention." live="assertive">
			<p>{state.error}</p>
			{state.conflict ? (
				<>
					<ButtonLink variant="outline" href={`${siteHref}/map-setup`} target="_blank">
						Open saved version
					</ButtonLink>
					<Button
						variant="outline"
						disabled={state.busy}
						onClick={() => {
							if (
								window.confirm(
									"Use the saved version and discard the unsaved changes on this page? Save a recovery file first if you need them."
								)
							)
								void state.resolveConflict("saved");
						}}>
						Use saved version
					</Button>
					<Button
						variant="outline"
						disabled={state.busy}
						onClick={() => {
							if (
								window.confirm(
									"Replace the saved setup with your changes? Compare the saved version first. A new change made meanwhile will still be refused."
								)
							)
								void state.resolveConflict("mine");
						}}>
						Keep my version
					</Button>
					<Button variant="outline" onClick={recover}>
						Save my changes as a file
					</Button>
				</>
			) : (
				<Button
					variant="outline"
					onClick={() => {
						state.setError(null);
						if (setup) void state.flush();
						else window.location.reload();
					}}>
					Try again
				</Button>
			)}
		</Note>
	);
}
