"use client";

import { useLinkStatus } from "next/link";

import { cx } from "@/lib/cx";

/**
 * Inside a Link: a still bar under the link's words while the page it opens is on its way, and the words
 * ", loading…" for a screen reader.
 *
 * The page on screen stays put until the next one is ready: the loading Suspense sits in the project and
 * organization layouts and stays mounted across a navigation (WEB-50), so a slow response (the hosted API)
 * would otherwise show nothing at all. The bar appears only after the skeleton delay, so a fast load shows
 * nothing, and it never moves (DESIGN §7): it fades in and stays. With reduced motion the fade is
 * instant, the delay is unchanged.
 *
 * The bar is positioned over the link, so it takes no room and nothing shifts. The Link must be
 * `relative` (or otherwise positioned); `className` places the bar (`inset-x-5 bottom-1.5` inside a pill,
 * the default under a line of words).
 */
export function LinkPending({ className = "inset-x-0 -bottom-1" }: { className?: string }) {
	const { pending } = useLinkStatus();
	if (!pending) return null;
	return (
		<>
			<span
				aria-hidden="true"
				className={cx(
					"pointer-events-none absolute h-0.5 animate-fade-in rounded-pill bg-current [animation-delay:var(--ct-duration-skeleton-delay)]",
					className
				)}
			/>
			<span className="sr-only">, loading…</span>
		</>
	);
}
