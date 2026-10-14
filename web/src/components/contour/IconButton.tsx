import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";

import { CONTROL_TRANSITION } from "./classes";
import { Icon, type IconName } from "./Icon";

export type IconButtonVariant = "map" | "plain" | "ink" | "outline";

export type IconButtonProps = {
	icon: IconName;
	/** The action in words. It is the accessible name and the hover title, since the glyph has none. */
	label: string;
	/** map: the white circle over a site plan. plain: no fill until hover. ink: a filled ink circle. outline: a ruled circle. */
	variant?: IconButtonVariant;
	/** md is 44 px. sm draws at 36 px and keeps a 44 px target. */
	size?: "md" | "sm";
	/**
	 * The control's panel or mode is on (the layers button while its panel is open). Visual only: pass
	 * aria-pressed or aria-expanded to say which.
	 */
	active?: boolean;
} & Omit<ComponentPropsWithRef<"button">, "children">;

const SIZE = {
	md: "size-11",
	// A 44 px ::before box centred on the glyph; sized rather than inset, so the map and outline edges do not cut it.
	sm: "relative size-9 before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-1/2"
} as const;

const ICON_SIZE = { md: 20, sm: 18 } as const;

const VARIANT: Record<IconButtonVariant, { rest: string; active: string }> = {
	map: {
		rest: "border border-line bg-island text-ink not-disabled:hover:bg-well",
		active: "border-2 border-ink bg-island text-ink not-disabled:hover:bg-well"
	},
	plain: {
		rest: "text-ink not-disabled:hover:bg-well",
		active: "bg-well text-ink"
	},
	ink: {
		rest: "bg-ink text-on-ink not-disabled:hover:bg-ink/85",
		active: "bg-ink text-on-ink not-disabled:hover:bg-ink/85"
	},
	outline: {
		rest: "border border-line text-ink not-disabled:hover:bg-well",
		active: "border-2 border-ink text-ink not-disabled:hover:bg-well"
	}
};

/** A round button that is only a glyph: map zoom and layers, row removal, dismiss. */
export function IconButton({
	icon,
	label,
	variant = "plain",
	size = "md",
	active = false,
	type = "button",
	className,
	...rest
}: IconButtonProps) {
	const look = VARIANT[variant];
	return (
		<button
			{...rest}
			type={type}
			aria-label={label}
			title={label}
			className={cx(
				"inline-flex shrink-0 items-center justify-center rounded-pill",
				"not-disabled:active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
				CONTROL_TRANSITION,
				SIZE[size],
				active ? look.active : look.rest,
				className
			)}>
			<Icon name={icon} size={ICON_SIZE[size]} />
		</button>
	);
}
