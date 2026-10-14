import Image from "next/image";
import Link from "next/link";

import { cx } from "@/lib/cx";

export type BrandMarkProps = {
	/** Name the mark only when it stands alone, without the wordmark beside it. */
	label?: string;
	/** Drawn size in CSS pixels. The header uses 36 (DESIGN.md, Navigation). */
	size?: number;
	className?: string;
};

/**
 * The DECA Mark brand mark: the purple app icon, the same artwork the installed app, the favicon and the store
 * listing use (D29; `web/public/icons/icon.svg`, drawn from `mobile/assets/icon-source/generate.py`). The
 * file clips itself to its rounded square, so no rounding is added here, and it is artwork, not tokens: it
 * looks the same in Day and Dusk.
 */
export function BrandMark({ label, size = 36, className }: BrandMarkProps) {
	return (
		<Image
			src="/icons/icon.svg"
			alt={label ?? ""}
			aria-hidden={label ? undefined : true}
			width={size}
			height={size}
			unoptimized
			draggable={false}
			className={cx("shrink-0", className)}
		/>
	);
}

export type BrandProps = {
	/** Where the brand leads. Without it the lockup is not a link. */
	href?: string;
	/** Hide the "DECA Mark" wordmark (narrow headers); the mark then names itself. */
	markOnly?: boolean;
	/** Show the wordmark from 640 px up only, for a header that needs the room on a phone. */
	wordmarkFromSm?: boolean;
	className?: string;
};

/** The mark and the "DECA Mark" wordmark, as the header's first item. */
export function Brand({ href, markOnly = false, wordmarkFromSm = false, className }: BrandProps) {
	const content = (
		<>
			<BrandMark label={markOnly ? "DECA Mark" : undefined} />
			{!markOnly && (
				<span className={cx("type-island text-ink", wordmarkFromSm && "sr-only sm:not-sr-only")}>
					DECA Mark
				</span>
			)}
		</>
	);
	const classes = cx("inline-flex min-h-touch shrink-0 items-center gap-3 rounded-input", className);

	if (!href) return <span className={classes}>{content}</span>;
	return (
		<Link prefetch={false} href={href} className={classes}>
			{content}
		</Link>
	);
}
