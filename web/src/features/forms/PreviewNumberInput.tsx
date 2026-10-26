"use client";

import { useState } from "react";

import { TextInput } from "@/components/contour/TextInput";

import { numericInput } from "./numeric-input";

export function PreviewNumberInput({
	value,
	decimal,
	label,
	onChange
}: {
	value: number | string | undefined;
	decimal: boolean;
	label: string;
	onChange: (value: number | string | undefined) => void;
}) {
	const [buffer, setBuffer] = useState({ text: value?.toString() ?? "", value });
	if (!Object.is(value, buffer.value)) setBuffer({ text: value?.toString() ?? "", value });
	const invalid = typeof value === "string" || Number.isNaN(value);
	return (
		<div className="mt-4 flex flex-col gap-2">
			<TextInput
				aria-label={label}
				inputMode={decimal ? "decimal" : "numeric"}
				value={buffer.text}
				invalid={invalid}
				onChange={event => {
					const parsed = numericInput(event.target.value, decimal);
					const next = Number.isNaN(parsed) ? event.target.value : parsed;
					setBuffer({ text: event.target.value, value: next });
					onChange(next);
				}}
			/>
			{invalid && (
				<p role="status" className="type-small text-attention">
					{decimal ? "Enter a finite number." : "Enter a whole number."}
				</p>
			)}
		</div>
	);
}
