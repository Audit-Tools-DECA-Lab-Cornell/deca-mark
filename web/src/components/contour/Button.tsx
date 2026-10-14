import Link from "next/link";
import { type ComponentPropsWithRef, type MouseEvent, type ReactNode, useId } from "react";

import { cx } from "@/lib/cx";

import { CONTROL_TRANSITION } from "./classes";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "ink" | "outline" | "soft" | "danger" | "danger-solid" | "ghost";
export type ButtonSize = "md" | "sm" | "lg";

/** The look a Button and a ButtonLink share. */
export type ButtonLook = {
	/**
	 * Primary (magenta) appears once per screen. Ink is the strong second action, such as Approve beside
	 * Exclude; outline is for the rest. Danger starts a destructive flow; danger-solid confirms one.
	 */
	variant?: ButtonVariant;
	/** md is the 46 px web control, sm the 36 px compact one, lg the 56 px full-width action on auth screens. */
	size?: ButtonSize;
	/** Glyph before the label. */
	icon?: IconName;
	/** Glyph after the label, usually `arrow-right` for an action that moves on. */
	iconRight?: IconName;
	/** Stretch to the width of the container. */
	fullWidth?: boolean;
};

/* sm draws at 36 px but keeps a 44 px target: a 44 px ::before box centred on the button. It is sized
   rather than inset, because insets start inside the edge and a 2 px edge would cut it to 40 px. */
const SIZE: Record<ButtonSize, string> = {
	sm: "relative min-h-control-sm px-4 py-1.5 text-sm before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
	md: "min-h-control px-5 py-2 text-base",
	lg: "min-h-14 px-6 py-3 text-lg"
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

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
}: Pick<ButtonLook, "variant" | "size" | "fullWidth"> = {}): string {
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

/** While busy, the label swaps in place. Both labels share one grid cell, so the button keeps the wider width. */
function ButtonLabel({ busy, busyLabel, children }: { busy: boolean; busyLabel?: string; children: ReactNode }) {
	if (!busyLabel) return children;
	return (
		<span className="grid justify-items-center">
			<span className={cx("col-start-1 row-start-1", busy && "invisible")}>{children}</span>
			<span className={cx("col-start-1 row-start-1", !busy && "invisible")}>{busyLabel}</span>
		</span>
	);
}

function ButtonContent({
	icon,
	iconRight,
	size,
	busy = false,
	busyLabel,
	children
}: Pick<ButtonLook, "icon" | "iconRight"> & {
	size: ButtonSize;
	busy?: boolean;
	busyLabel?: string;
	children: ReactNode;
}) {
	return (
		<>
			{icon && <Icon name={icon} size={ICON_SIZE[size]} className="shrink-0" />}
			<ButtonLabel busy={busy} busyLabel={busyLabel}>
				{children}
			</ButtonLabel>
			{iconRight && <Icon name={iconRight} size={ICON_SIZE[size]} className="shrink-0" />}
		</>
	);
}

/** A busy button stays focusable and announced, but a second press does nothing. */
function ignoreWhileBusy(event: MouseEvent<HTMLButtonElement>) {
	event.preventDefault();
}

export type ButtonProps = ButtonLook & {
	/**
	 * The action is running. The button keeps its width and focus, reports aria-busy and ignores presses.
	 * No spinner: the label says what is happening.
	 */
	busy?: boolean;
	/** The label while busy, such as "Saving…". Without it the label stays as it is. */
	busyLabel?: string;
	/** Why the button is off. Shown under it while it is disabled and linked with aria-describedby. */
	disabledReason?: string;
} & ComponentPropsWithRef<"button">;

/**
 * The Contour button: a pill with a verb + object label ("Save on this device"). Defaults to
 * `type="button"`; pass `type="submit"` inside a form.
 */
export function Button({
	variant = "primary",
	size = "md",
	icon,
	iconRight,
	busy = false,
	busyLabel,
	disabledReason,
	fullWidth = false,
	disabled,
	type = "button",
	className,
	children,
	onClick,
	"aria-describedby": describedBy,
	...rest
}: ButtonProps) {
	const reasonId = useId();
	const showReason = Boolean(disabled && disabledReason);

	const button = (
		<button
			{...rest}
			type={type}
			data-variant={variant}
			disabled={disabled}
			aria-busy={busy || undefined}
			aria-disabled={busy || undefined}
			aria-describedby={cx(describedBy, showReason && reasonId) || undefined}
			onClick={busy ? ignoreWhileBusy : onClick}
			className={cx(buttonClasses({ variant, size, fullWidth }), busy && "cursor-progress", className)}>
			<ButtonContent icon={icon} iconRight={iconRight} size={size} busy={busy} busyLabel={busyLabel}>
				{children}
			</ButtonContent>
		</button>
	);

	if (!showReason) return button;
	return (
		<span className={cx("flex-col items-start gap-2", fullWidth ? "flex" : "inline-flex")}>
			{button}
			<span id={reasonId} className="type-small text-ink-2">
				{disabledReason}
			</span>
		</span>
	);
}

export type ButtonLinkProps = ButtonLook & Omit<ComponentPropsWithRef<typeof Link>, "href"> & { href: string };

/** A link that looks like a Button, for an action that navigates ("Review observations →"). */
export function ButtonLink({
	variant = "primary",
	size = "md",
	icon,
	iconRight,
	fullWidth = false,
	className,
	children,
	...rest
}: ButtonLinkProps) {
	return (
		<Link {...rest} data-variant={variant} className={cx(buttonClasses({ variant, size, fullWidth }), className)}>
			<ButtonContent icon={icon} iconRight={iconRight} size={size}>
				{children}
			</ButtonContent>
		</Link>
	);
}
