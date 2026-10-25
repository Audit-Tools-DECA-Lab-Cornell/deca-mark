import { cx } from "@/lib/cx";

import { CONTROL_TRANSITION } from "./classes";

/*
 * The look of a Contour button, as a plain module and not a "use client" one, so a server component that
 * imports buttonClasses gets the function itself rather than a client reference. Button holds the
 * hydration gate for submit buttons and is a client component; this file holds nothing else.
 */

export type ButtonVariant = "primary" | "ink" | "outline" | "soft" | "danger" | "danger-solid" | "ghost";
export type ButtonSize = "md" | "sm" | "lg";

/* sm draws at 36 px but keeps a 44 px target: a 44 px ::before box centred on the button. It is sized
   rather than inset, because insets start inside the edge and a 2 px edge would cut it to 40 px. */
const SIZE: Record<ButtonSize, string> = {
	sm: "relative min-h-control-sm px-4 py-1.5 text-sm before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
	md: "min-h-control px-5 py-2 text-base",
	lg: "min-h-14 px-6 py-3 text-lg"
};

/* Hover changes the fill only. A disabled button takes the designed disabled look (well fill, secondary
   ink, no edge) whatever its variant, so it never reads as a lighter copy of the live action. */
const VARIANT: Record<ButtonVariant, string> = {
	primary: "bg-accent text-on-accent not-disabled:hover:bg-accent/90",
	ink: "bg-ink text-on-ink not-disabled:hover:bg-ink/85",
	outline: "border-2 border-ink bg-island text-ink not-disabled:hover:bg-well",
	soft: "bg-well text-ink not-disabled:hover:bg-ledge",
	danger: "border-2 border-attention bg-island text-attention not-disabled:hover:bg-attention-soft",
	"danger-solid": "bg-attention text-on-attention not-disabled:hover:bg-attention/90",
	ghost: "text-ink not-disabled:hover:bg-well"
};

const DISABLED: Record<ButtonVariant, string> = {
	primary: "disabled:bg-well disabled:text-ink-2",
	ink: "disabled:bg-well disabled:text-ink-2",
	outline: "disabled:border-transparent disabled:bg-well disabled:text-ink-2",
	soft: "disabled:text-ink-2",
	danger: "disabled:border-transparent disabled:bg-well disabled:text-ink-2",
	"danger-solid": "disabled:bg-well disabled:text-ink-2",
	ghost: "disabled:text-ink-2"
};

/**
 * The classes of a Contour button, for an element that must carry the look itself (a Radix trigger
 * rendered `asChild`, a file input's label). Prefer Button and ButtonLink.
 */
export function buttonClasses({
	variant = "primary",
	size = "md",
	fullWidth = false
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
	return cx(
		"inline-flex items-center justify-center gap-2 rounded-pill text-center font-semibold",
		"not-disabled:active:opacity-90 disabled:cursor-not-allowed",
		CONTROL_TRANSITION,
		SIZE[size],
		VARIANT[variant],
		DISABLED[variant],
		fullWidth && "w-full"
	);
}
