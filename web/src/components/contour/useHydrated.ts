"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
	return () => undefined;
}

/**
 * False while the server renders and while React hydrates the page, true from the first render after
 * that. The Contour text fields are read-only and form submit buttons are disabled until then, because
 * React 19.3 overwrites a controlled <textarea> when it hydrates, and an <input> keeps text typed before
 * then on screen but not in state (audit C07): the text is reverted, merged with the old text or never
 * saved, and a Save press does a native GET. `defaultValue` does not help; the textarea is still overwritten.
 */
export function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false
	);
}
