"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cx } from "@/lib/cx";

import { LinkPending } from "./LinkPending";

export type InkTab = {
	href: string;
	label: string;
	/** A count beside the label, such as records that need attention. Hidden at zero. */
	badge?: number;
	/** What the count means, read after the label. Defaults to "1 needs attention" / "3 need attention". */
	badgeLabel?: string;
};

export type InkTabsProps = {
	items: InkTab[];
	/** Names the navigation landmark: "Project", "Organization". */
	label: string;
	/**
	 * The href of the tab on screen, for a tab set whose page the URL path cannot name (the gallery, a
	 * preview). Without it the current tab follows the path.
	 */
	current?: string;
	className?: string;
};

/** Matches the 20 px edge fade of `scroll-fade-x`, so a tab scrolled into view is never left under a fade. */
const EDGE_FADE = 20;

function pathOf(href: string): string {
	const path = href.split(/[?#]/, 1)[0] || "/";
	return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * The tab for the page on screen: the tab whose URL is the page, or else the deepest tab whose section
 * holds it. The project root (Overview) only matches itself, because Data, Sites and the rest are deeper.
 */
function currentTab(items: InkTab[], pathname: string): number {
	const page = pathOf(pathname);
	let found = -1;
	let depth = -1;
	items.forEach((item, index) => {
		const path = pathOf(item.href);
		const inSection = page === path || page.startsWith(path === "/" ? path : `${path}/`);
		if (inSection && path.length > depth) {
			found = index;
			depth = path.length;
		}
	});
	return found;
}

function attentionPhrase(count: number): string {
	return `${count} ${count === 1 ? "needs" : "need"} attention`;
}

/**
 * Writes the current tab's offset and width to the track as CSS variables, where the white pill reads
 * them, and marks the track placed so the current link hands its own fill over to the pill.
 */
function placePill(track: HTMLElement) {
	const current = track.querySelector<HTMLElement>("a[aria-current]");
	if (!current) {
		track.removeAttribute("data-placed");
		return;
	}
	track.style.setProperty("--tab-x", `${current.offsetLeft}px`);
	track.style.setProperty("--tab-width", `${current.offsetWidth}px`);
	track.setAttribute("data-placed", "");
}

/** Fades the bar's edges only while the tabs overflow it. */
function markOverflow(scroller: HTMLElement) {
	scroller.toggleAttribute("data-overflow", scroller.scrollWidth > scroller.clientWidth + 1);
}

/** Scrolls the bar sideways, never the page, until the current tab clears the edge fades. */
function revealCurrent(scroller: HTMLElement, track: HTMLElement) {
	const current = track.querySelector<HTMLElement>("a[aria-current]");
	if (!current || !scroller.hasAttribute("data-overflow")) return;
	const start = track.offsetLeft + current.offsetLeft - EDGE_FADE;
	const end = track.offsetLeft + current.offsetLeft + current.offsetWidth + EDGE_FADE;
	if (start < scroller.scrollLeft) scroller.scrollLeft = start;
	else if (end > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = end - scroller.clientWidth;
}

/**
 * The web tab bar: one ink pill of links, with the current tab a white pill (system-10). The white pill
 * slides between tabs on navigation; its place is written to CSS variables after layout, and it does not
 * slide on first paint. When the tabs do not fit they scroll sideways with edge fades and snap, and the
 * current tab is kept in view. Labels never wrap or truncate.
 */
export function InkTabs({ items, label, current, className }: InkTabsProps) {
	const pathname = usePathname();
	const scrollerRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const active = current === undefined ? currentTab(items, pathname) : items.findIndex(item => item.href === current);
	// Changes whenever a tab's width can: a renamed tab, an added tab, a badge appearing.
	const layout = items.map(item => `${item.href} ${item.label} ${item.badge ?? 0}`).join("\n");

	// Place the pill after layout and before paint, so it is never drawn in the old place.
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		const track = trackRef.current;
		if (!scroller || !track) return;
		placePill(track);
		markOverflow(scroller);
	}, [active, layout]);

	// A change of page, or of the bar's size below, scrolls the bar; a reader's own sideways scroll is left
	// alone otherwise.
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		const track = trackRef.current;
		if (scroller && track) revealCurrent(scroller, track);
	}, [active]);

	// Sliding starts after the first paint. A change of size (fonts loading, a narrower window) moves the
	// pill without a slide and brings the current tab back into view if the narrower bar hid it.
	useEffect(() => {
		const scroller = scrollerRef.current;
		const track = trackRef.current;
		if (!scroller || !track) return;
		track.setAttribute("data-animate", "");
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			track.removeAttribute("data-animate");
			placePill(track);
			markOverflow(scroller);
			revealCurrent(scroller, track);
			track.getBoundingClientRect(); // apply the new place before sliding is allowed again
			track.setAttribute("data-animate", "");
		});
		observer.observe(scroller);
		observer.observe(track);
		return () => observer.disconnect();
	}, []);

	return (
		<nav aria-label={label} className={cx("min-w-0 max-w-full", className)}>
			{/* Inside the ink bar the focus ring takes the on-nav colour, so it shows against the ink. */}
			<div
				ref={scrollerRef}
				className={cx(
					"relative w-fit max-w-full overflow-x-auto rounded-pill bg-nav p-1.5",
					"snap-x scroll-px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					"[--ct-focus:var(--ct-on-nav)] data-[overflow]:scroll-fade-x"
				)}>
				<div ref={trackRef} className="group/tabs relative w-max">
					<span
						aria-hidden="true"
						className={cx(
							"pointer-events-none absolute inset-y-0 left-0 hidden w-(--tab-width) translate-x-(--tab-x) rounded-pill bg-nav-current",
							"group-data-[placed]/tabs:block",
							"group-data-[animate]/tabs:transition-[translate,width] group-data-[animate]/tabs:duration-(--ct-duration-slide) group-data-[animate]/tabs:ease-standard"
						)}
					/>
					<ul className="flex">
						{items.map((item, index) => {
							const isCurrent = index === active;
							const badge = item.badge && item.badge > 0 ? item.badge : 0;
							return (
								<li key={item.href} className="shrink-0 snap-start">
									<Link
										href={item.href}
										prefetch={false}
										aria-current={isCurrent ? "page" : undefined}
										className={cx(
											"relative flex min-h-touch items-center gap-2 whitespace-nowrap rounded-pill px-5 type-body font-semibold",
											"transition-[color,background-color] duration-(--ct-duration-slide) ease-standard",
											isCurrent
												? "bg-nav-current text-on-nav-current group-data-[placed]/tabs:bg-transparent"
												: "text-on-nav hover:bg-on-nav/12 active:bg-on-nav/20"
										)}>
										{item.label}
										<LinkPending className="inset-x-5 bottom-1.5" />
										{badge > 0 && (
											<>
												<span
													aria-hidden="true"
													className="inline-grid h-5 min-w-5 place-items-center rounded-pill bg-attention px-1.5 font-mono text-xs leading-none font-semibold text-on-attention tnum">
													{badge}
												</span>
												<span className="sr-only">
													, {item.badgeLabel ?? attentionPhrase(badge)}
												</span>
											</>
										)}
									</Link>
								</li>
							);
						})}
					</ul>
				</div>
			</div>
		</nav>
	);
}
