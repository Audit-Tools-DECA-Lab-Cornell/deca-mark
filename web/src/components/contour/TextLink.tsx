import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { Icon, type IconName } from "./Icon";

export type TextLinkProps = {
	href: string;
	/** Direction glyph. Accent links point right by default ("Open North meadow →"); ink links carry none. */
	arrow?: "right" | "left" | false;
	/** Glyph before the words, such as `pencil` for "Edit description". */
	icon?: IconName;
	/**
	 * accent: a semibold magenta action link. ink: an underlined link in running text, a table cell
	 * (zone names) or a breadcrumb parent.
	 */
	tone?: "accent" | "ink";
	children: ReactNode;
} & Omit<ComponentPropsWithRef<typeof Link>, "href" | "children">;

const TONE = {
	accent: "font-semibold text-accent underline-offset-4 hover:underline",
	ink: "text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
} as const;

/*
 * A link with a glyph stands on its own as an action ("Open North meadow →", "Edit zones"). On a touch
 * screen its ::before box, 44 px tall and centred on the words, makes it a 44 px target without moving them.
 */
const TOUCH_TARGET =
	"pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:top-1/2 pointer-coarse:before:h-11 pointer-coarse:before:-translate-y-1/2";

/**
 * A link that reads as words. It takes the size of the text around it, so a link without a glyph, in
 * running text or a table cell, is not held to the 44 px target that standalone controls meet. A link
 * with a glyph meets it on touch screens.
 */
export function TextLink({
	href,
	arrow,
	icon,
	tone = "accent",
	className,
	children,
	prefetch = false,
	...rest
}: TextLinkProps) {
	const direction = arrow ?? (tone === "accent" ? "right" : false);
	const hasGlyph = Boolean(icon || direction);

	if (!hasGlyph)
		return (
			<Link {...rest} prefetch={prefetch} href={href} className={cx(TONE[tone], className)}>
				{children}
			</Link>
		);

	// Glyphs sit centred on the line and stay out of baseline alignment, so the link lines up with the
	// text beside it by its words, not by the bottom of an icon.
	return (
		<Link
			{...rest}
			prefetch={prefetch}
			href={href}
			className={cx("inline-flex items-baseline gap-1.5", TOUCH_TARGET, TONE[tone], className)}>
			{direction === "left" && <Icon name="arrow-left" size={16} className="shrink-0 self-center" />}
			{icon && <Icon name={icon} size={16} className="shrink-0 self-center" />}
			<span>{children}</span>
			{direction === "right" && <Icon name="arrow-right" size={16} className="shrink-0 self-center" />}
		</Link>
	);
}
