/**
 * Navigation the shell starts itself (a `g` chord, the command palette) asks a page with unsaved changes
 * first, as links and Back already do through `useLeaveGuard` (WUI-11). One page holds navigation at a time:
 * the one on screen.
 */

type Hold = (href: string) => void;

let hold: Hold | null = null;

/** While a page has unsaved changes: navigation the shell starts is handed to `ask` instead. */
export function holdNavigation(ask: Hold): () => void {
	hold = ask;
	return () => {
		if (hold === ask) hold = null;
	};
}

/** Goes to `href`, unless a page holds navigation: then that page asks first. */
export function guardedPush(router: { push(href: string): void }, href: string): void {
	if (hold) hold(href);
	else router.push(href);
}
