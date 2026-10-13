"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { holdNavigation } from "./navigationGuard";

/** The held navigation when it is the browser's Back button rather than a link. */
const BACK = "back";
/** Marks the copy of this page's history entry that sits on top while there are unsaved changes. */
const GUARD = "__decamarkLeaveGuard";

type HistoryState = Record<string, unknown> | null;

function guarded(state: unknown): boolean {
	return typeof state === "object" && state !== null && GUARD in state;
}

function pushGuard() {
	const state = window.history.state as HistoryState;
	// A copy of the router's own entry, so returning to it renders this page as it was.
	window.history.pushState({ ...state, [GUARD]: true }, "", window.location.href);
}

/**
 * Asks before leaving a page with unsaved changes (DESIGN §8, Settings). Closing or reloading the tab gets
 * the browser's own question. Following a link inside the workspace (a tab, a breadcrumb, a card), a `g`
 * chord or the command palette, and the browser's Back button are held and reported as `leavingTo`, so the page can ask in its own words; then
 * `leave()` goes where the person was going and `stay()` keeps them here.
 *
 * Back is held by keeping a copy of this page's history entry on top while there are changes: Back lands
 * on the same page, which is caught before the router renders anything, and the copy is put back.
 */
export function useLeaveGuard(dirty: boolean): {
	leavingTo: string | null;
	stay: () => void;
	leave: () => void;
} {
	const router = useRouter();
	const [leavingTo, setLeavingTo] = useState<string | null>(null);
	const released = useRef(false);

	useEffect(() => {
		if (!dirty) return;
		released.current = false;
		if (!guarded(window.history.state)) pushGuard();

		function onBeforeUnload(event: BeforeUnloadEvent) {
			event.preventDefault();
			// Older browsers need a value here to show their question.
			event.returnValue = "";
		}

		function onClick(event: MouseEvent) {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			const anchor = (event.target as Element | null)?.closest?.("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) return;
			if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
			const url = new URL(anchor.href, window.location.href);
			// Another site is a full page load, which the browser's own question covers.
			if (url.origin !== window.location.origin) return;
			// A link to a place on this page (#coverage) does not leave it.
			if (url.pathname === window.location.pathname && url.search === window.location.search) return;
			event.preventDefault();
			event.stopPropagation();
			setLeavingTo(`${url.pathname}${url.search}${url.hash}`);
		}

		function onPopState(event: PopStateEvent) {
			if (released.current || guarded(event.state)) return;
			// Back left the copy for this same page. Hold it before the router sees it, put the copy back
			// so the next Back is held too, and ask.
			event.stopImmediatePropagation();
			pushGuard();
			setLeavingTo(BACK);
		}

		// A `g` chord or the command palette asks too.
		const release = holdNavigation(href => setLeavingTo(href));

		window.addEventListener("beforeunload", onBeforeUnload);
		// Capture runs before the router's own link and history handlers, so the navigation can be held.
		document.addEventListener("click", onClick, true);
		window.addEventListener("popstate", onPopState, true);
		return () => {
			release();
			window.removeEventListener("beforeunload", onBeforeUnload);
			document.removeEventListener("click", onClick, true);
			window.removeEventListener("popstate", onPopState, true);
			// Changes saved in place: take the copy off again, so one Back still leaves the page.
			if (!released.current && guarded(window.history.state)) window.history.back();
		};
	}, [dirty]);

	const stay = useCallback(() => setLeavingTo(null), []);

	const leave = useCallback(() => {
		const to = leavingTo;
		setLeavingTo(null);
		released.current = true;
		if (to === BACK) {
			// Past the copy and this page's own entry, to where Back was going.
			window.history.go(-2);
			return;
		}
		// The copy is replaced, so Back from the next page returns here in one step.
		if (to) router.replace(to);
	}, [leavingTo, router]);

	return { leavingTo, stay, leave };
}
