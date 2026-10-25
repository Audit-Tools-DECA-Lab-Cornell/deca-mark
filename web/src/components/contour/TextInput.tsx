"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { controlFrame } from "./classes";
import { useFieldControl } from "./Field";
import { Icon, type IconName } from "./Icon";
import { useHydrated } from "./useHydrated";

export type TextInputProps = ComponentPropsWithRef<"input"> & {
	/** Draws the attention edge and sets aria-invalid. Inside a Field, an error does this already. */
	invalid?: boolean;
	/** A glyph inside the start of the field, such as `search`. */
	leadingIcon?: IconName;
	/** Content inside the end of the field, such as PasswordInput's Show button. The text stops short of it. */
	trailing?: ReactNode;
};

/**
 * Keeps the input's text clear of the trailing content. The content's width is written to the wrapper as
 * a CSS variable, so it can be any width and nothing re-renders when it changes.
 */
function reserveTrailingSpace(node: HTMLDivElement | null) {
	const wrapper = node?.parentElement;
	if (!node || !wrapper) return;
	const write = () => wrapper.style.setProperty("--trailing-width", `${node.offsetWidth}px`);
	write();
	if (typeof ResizeObserver === "undefined") return;
	const observer = new ResizeObserver(write);
	observer.observe(node);
	return () => observer.disconnect();
}

/**
 * The 46 px Contour text field. `className` sizes and places the field (it lands on the wrapper, and the
 * input inherits its font family); every other prop reaches the <input>. Read-only fields sit in the
 * well with secondary ink; the caller says why beside it, usually as the Field hint. Until the page has
 * hydrated the input is read-only without the read-only look, so text typed early is refused, not lost (useHydrated).
 */
export function TextInput({
	ref,
	invalid,
	leadingIcon,
	trailing,
	className,
	id,
	type = "text",
	readOnly,
	"aria-describedby": describedBy,
	...props
}: TextInputProps) {
	const field = useFieldControl({ id, invalid, describedBy });
	const hydrated = useHydrated();

	return (
		<div className={cx("relative", className)}>
			<input
				ref={ref}
				id={field.id}
				type={type}
				readOnly={readOnly || !hydrated}
				aria-invalid={field.invalid || undefined}
				aria-describedby={field.describedBy}
				className={cx(
					"peer",
					controlFrame({ invalid: field.invalid, readOnly }),
					"h-control text-base",
					leadingIcon ? "pl-11" : "pl-4",
					trailing ? "pr-[var(--trailing-width,--spacing(16))]" : "pr-4"
				)}
				{...props}
			/>
			{leadingIcon && (
				<Icon
					name={leadingIcon}
					className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink peer-disabled:opacity-50"
				/>
			)}
			{trailing && (
				<div ref={reserveTrailingSpace} className="absolute inset-y-0 right-0 flex items-center pr-0.5">
					{trailing}
				</div>
			)}
		</div>
	);
}
