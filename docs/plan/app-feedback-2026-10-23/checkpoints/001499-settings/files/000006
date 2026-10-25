"use client";

import { useId } from "react";

import { Button } from "@/components/contour/Button";
import { IconButton } from "@/components/contour/IconButton";
import { TextInput } from "@/components/contour/TextInput";

import { type RawOption, slugify, unique } from "./raw";

export function optionListProblem(options: readonly RawOption[], minimum = 1): string | null {
	if (options.length < minimum)
		return `Add at least ${minimum} ${minimum === 1 ? "option" : "options"} so observers can answer it.`;
	if (options.some(option => option.label.trim() === "")) return "Every option needs a label.";
	if (options.some(option => option.code.trim() === "")) return "Every option needs a code.";
	if (new Set(options.map(option => option.code)).size !== options.length)
		return "Every option code must be unique within its list.";
	return null;
}

export function OptionsEditor({
	options,
	readOnly,
	label = "Options",
	minimum = 2,
	problem,
	onChange
}: {
	options: readonly RawOption[];
	readOnly: boolean;
	label?: string;
	minimum?: number;
	problem?: string;
	onChange: (options: RawOption[]) => void;
}) {
	const id = useId();
	const error = !readOnly ? (optionListProblem(options, minimum) ?? problem) : undefined;
	return (
		<fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={error ? `${id}-problem` : undefined}>
			<legend className="mb-3 type-small font-semibold text-ink">{label}</legend>
			<ol className="flex flex-col gap-3">
				{options.map((option, index) => (
					<li key={option.code} className="flex min-w-0 items-center gap-2">
						<span aria-hidden="true" className="w-6 shrink-0 text-right type-mono-data text-ink-2">
							{index + 1}
						</span>
						<TextInput
							aria-label={`${label}: option ${index + 1}`}
							value={option.label}
							readOnly={readOnly}
							className="min-w-0 grow"
							onChange={event =>
								onChange(
									options.map((current, at) =>
										at === index ? { ...current, label: event.target.value } : current
									)
								)
							}
						/>
						{!readOnly && (
							<IconButton
								icon="x"
								label={`Remove ${label.toLowerCase()} option ${index + 1}`}
								disabled={options.length <= minimum}
								onClick={() => onChange(options.filter((_, at) => at !== index))}
							/>
						)}
					</li>
				))}
			</ol>
			{!readOnly && (
				<div>
					<Button
						variant="outline"
						icon="plus"
						onClick={() => {
							const nextLabel = `Option ${options.length + 1}`;
							onChange([
								...options,
								{
									code: unique(slugify(nextLabel), new Set(options.map(option => option.code))),
									label: nextLabel
								}
							]);
						}}>
						Add an option
					</Button>
				</div>
			)}
			{error && (
				<p id={`${id}-problem`} role="status" className="type-small font-semibold text-attention">
					{error}
				</p>
			)}
		</fieldset>
	);
}
