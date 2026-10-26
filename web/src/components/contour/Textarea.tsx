"use client";

import { type ChangeEvent, type ComponentPropsWithRef, useState } from "react";

import { cx } from "@/lib/cx";

import { controlFrame } from "./classes";
import { useFieldControl, useFieldCounter } from "./Field";
import { useHydrated } from "./useHydrated";

export type TextareaProps = ComponentPropsWithRef<"textarea"> & {
	/** Draws the attention edge and sets aria-invalid. Inside a Field, an error does this already. */
	invalid?: boolean;
	/** Shows the length, "69 / 1000" with maxLength. Inside a Field it takes the counter slot of the field's row. */
	showCount?: boolean;
};

function lengthOf(value: TextareaProps["value"]): number {
	return value === undefined || value === null ? 0 : String(value).length;
}

/**
 * A multi-line text field with the Contour frame, at least 112 px tall and resizable in height.
 * `className` sizes and places it (it lands on the wrapper); every other prop reaches the <textarea>.
 * Until the page has hydrated it is read-only without the read-only look: React overwrites a controlled
 * textarea at hydration, so text typed before then would be lost or merged with the old text (useHydrated).
 */
export function Textarea({
	ref,
	invalid,
	showCount = false,
	maxLength,
	className,
	id,
	readOnly,
	value,
	defaultValue,
	onChange,
	"aria-describedby": describedBy,
	...props
}: TextareaProps) {
	const controlled = value !== undefined;
	const [uncontrolledLength, setUncontrolledLength] = useState(() => lengthOf(defaultValue));
	const length = controlled ? lengthOf(value) : uncontrolledLength;
	const count = showCount ? (maxLength === undefined ? `${length}` : `${length} / ${maxLength}`) : null;

	const countedByField = useFieldCounter(count);
	const field = useFieldControl({ id, invalid, describedBy });
	const hydrated = useHydrated();
	const ownCounterId = count !== null && !countedByField && field.id ? `${field.id}-counter` : undefined;

	function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
		if (!controlled) setUncontrolledLength(event.currentTarget.value.length);
		onChange?.(event);
	}

	return (
		<div className={cx("flex flex-col", className)}>
			<textarea
				ref={ref}
				id={field.id}
				readOnly={readOnly || !hydrated}
				maxLength={maxLength}
				value={value}
				defaultValue={defaultValue}
				onChange={handleChange}
				aria-invalid={field.invalid || undefined}
				aria-describedby={[field.describedBy, ownCounterId].filter(Boolean).join(" ") || undefined}
				className={cx(
					controlFrame({ invalid: field.invalid, readOnly }),
					"min-h-28 resize-y px-4 py-3 text-base"
				)}
				{...props}
			/>
			{count !== null && !countedByField && (
				<span id={ownCounterId} className="mt-2 self-end type-mono-data text-ink-2 tnum">
					{count}
				</span>
			)}
		</div>
	);
}
