"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { MENU_SURFACE, OVERLAY_MOTION } from "./classes";
import { Icon, type IconName } from "./Icon";

/* 44 px rows. The focus ring is drawn just inside the row, so it never overlaps its neighbours. */
const ITEM = cx(
	"relative flex min-h-touch cursor-default items-center gap-3 rounded-input px-3 py-2 type-body select-none",
	"[--ct-size-focus-gap:calc(var(--ct-size-focus-ring)*-1)]",
	"transition-[color,background-color] duration-(--ct-duration-quick) ease-standard",
	"data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
);

const TONE = {
	default: "text-ink data-[highlighted]:bg-well",
	danger: "text-attention data-[highlighted]:bg-attention-soft"
} as const;

/** The menu root. Typeahead, arrow keys, Esc and focus return come from Radix. */
export const Menu = DropdownMenu.Root;

/** Opens the menu. Render your button through it: `<MenuTrigger asChild><Button …/></MenuTrigger>`. */
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuContent({
	className,
	sideOffset = 8,
	collisionPadding = 16,
	...rest
}: ComponentPropsWithRef<typeof DropdownMenu.Content>) {
	return (
		<DropdownMenu.Portal>
			<DropdownMenu.Content
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				{...rest}
				className={cx(
					MENU_SURFACE,
					OVERLAY_MOTION,
					"z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-56 overflow-y-auto p-1.5",
					"origin-(--radix-dropdown-menu-content-transform-origin)",
					className
				)}
			/>
		</DropdownMenu.Portal>
	);
}

export type MenuItemProps = {
	icon?: IconName;
	/** Runs when the item is chosen by pointer or keyboard; the menu then closes. */
	onSelect?: (event: Event) => void;
	/** Makes the item a link. */
	href?: string;
	/** danger for a destructive choice, in attention colour. */
	tone?: "default" | "danger";
	/** A key that does the same thing from the page, shown on the right in mono: "a", "⌘K". */
	shortcut?: string;
	disabled?: boolean;
	children: ReactNode;
	className?: string;
};

export function MenuItem({
	icon,
	onSelect,
	href,
	tone = "default",
	shortcut,
	disabled,
	children,
	className
}: MenuItemProps) {
	const content = (
		<>
			{icon && <Icon name={icon} size={18} className="shrink-0" />}
			<span className="min-w-0 flex-1">{children}</span>
			{shortcut && <span className="shrink-0 pl-4 type-mono-data text-ink-2">{shortcut}</span>}
		</>
	);
	const classes = cx(ITEM, TONE[tone], className);

	if (href)
		return (
			<DropdownMenu.Item asChild disabled={disabled} onSelect={onSelect} className={classes}>
				<Link prefetch={false} href={href}>
					{content}
				</Link>
			</DropdownMenu.Item>
		);

	return (
		<DropdownMenu.Item disabled={disabled} onSelect={onSelect} className={classes}>
			{content}
		</DropdownMenu.Item>
	);
}

export type MenuRadioItemProps = {
	value: string;
	icon?: IconName;
	disabled?: boolean;
	children: ReactNode;
	className?: string;
};

/** One choice in a MenuRadioGroup. The current choice carries a check (Day · Dusk, the map palette). */
export function MenuRadioItem({ value, icon, disabled, children, className }: MenuRadioItemProps) {
	return (
		<DropdownMenu.RadioItem value={value} disabled={disabled} className={cx(ITEM, TONE.default, className)}>
			{icon && <Icon name={icon} size={18} className="shrink-0" />}
			<span className="min-w-0 flex-1">{children}</span>
			<DropdownMenu.ItemIndicator className="shrink-0">
				<Icon name="check" size={18} />
			</DropdownMenu.ItemIndicator>
		</DropdownMenu.RadioItem>
	);
}

export type MenuCheckboxItemProps = {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	icon?: IconName;
	disabled?: boolean;
	children: ReactNode;
	className?: string;
};

/** A setting that stays open to change, such as a map layer, with a check while it is on. */
export function MenuCheckboxItem({
	checked,
	onCheckedChange,
	icon,
	disabled,
	children,
	className
}: MenuCheckboxItemProps) {
	return (
		<DropdownMenu.CheckboxItem
			checked={checked}
			onCheckedChange={onCheckedChange}
			disabled={disabled}
			className={cx(ITEM, TONE.default, className)}>
			{icon && <Icon name={icon} size={18} className="shrink-0" />}
			<span className="min-w-0 flex-1">{children}</span>
			<DropdownMenu.ItemIndicator className="shrink-0">
				<Icon name="check" size={18} />
			</DropdownMenu.ItemIndicator>
		</DropdownMenu.CheckboxItem>
	);
}

/** A mono eyebrow over a group of items: "THEME", "MAP PALETTE". Type it in normal case. */
export function MenuLabel({ className, ...rest }: ComponentPropsWithRef<typeof DropdownMenu.Label>) {
	return <DropdownMenu.Label {...rest} className={cx("px-3 pt-2 pb-1 type-mono-label text-ink-2", className)} />;
}

export function MenuSeparator({ className, ...rest }: ComponentPropsWithRef<typeof DropdownMenu.Separator>) {
	return <DropdownMenu.Separator {...rest} className={cx("-mx-1.5 my-1.5 h-px bg-rule", className)} />;
}
