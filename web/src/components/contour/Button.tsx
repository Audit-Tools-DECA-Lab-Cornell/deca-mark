"use client";

import Link from "next/link";
import { type ComponentPropsWithRef, type MouseEvent, type ReactNode, useId } from "react";

import { cx } from "@/lib/cx";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonClasses";
import { Icon, type IconName } from "./Icon";
import { useHydrated } from "./useHydrated";

export type { ButtonSize, ButtonVariant };

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

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

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
 * `type="button"`; pass `type="submit"` inside a form. A submit button is disabled until the page has
 * hydrated (see useHydrated), with no reason shown for it.
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
	// A submit press before the page is interactive would post the form natively (a GET with the server's
	// values), so a submit button is off until then. The caller's own `disabled` still decides the reason.
	const hydrated = useHydrated();
	const awaitingHydration = type === "submit" && !hydrated;

	const button = (
		<button
			{...rest}
			type={type}
			data-variant={variant}
			disabled={disabled || awaitingHydration}
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
	prefetch = false,
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
		<Link
			{...rest}
			prefetch={prefetch}
			data-variant={variant}
			className={cx(buttonClasses({ variant, size, fullWidth }), className)}>
			<ButtonContent icon={icon} iconRight={iconRight} size={size}>
				{children}
			</ButtonContent>
		</Link>
	);
}
