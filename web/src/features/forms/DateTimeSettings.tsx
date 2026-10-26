"use client";

import { useId } from "react";

import { Field } from "@/components/contour/Field";
import { Select } from "@/components/contour/Select";
import { TextInput } from "@/components/contour/TextInput";
import { isTimeZone } from "@/lib/forms/temporal";

import type { QuestionPatch } from "./QuestionSettings";
import type { RawQuestion } from "./raw";

export function DateTimeSettings({
	question,
	readOnly,
	onChange
}: {
	question: RawQuestion;
	readOnly: boolean;
	onChange: (patch: QuestionPatch) => void;
}) {
	const id = useId();
	const config = question.dateTime;
	if (!config) return null;
	const modes = { date: "Date only", time: "Time only", dateTime: "Date and time" } as const;
	const dates = {
		iso: "Year-month-day (2026-10-24)",
		monthFirst: "Month/day/year (10/24/2026)",
		dayFirst: "Day/month/year (24/10/2026)"
	} as const;
	return (
		<fieldset className="flex min-w-0 flex-col gap-4">
			<legend className="mb-4 type-small font-semibold text-ink">Date and time settings</legend>
			<Field label="Ask for" htmlFor={`${id}-mode`}>
				<Select
					value={config.mode}
					disabled={readOnly}
					onChange={event => {
						const mode = event.target.value;
						if (mode === "date" || mode === "time" || mode === "dateTime")
							onChange({ dateTime: { ...config, mode } });
					}}>
					{Object.entries(modes).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</Select>
			</Field>
			{config.mode !== "time" && (
				<Field label="Date display" htmlFor={`${id}-date`}>
					<Select
						value={config.dateFormat ?? "iso"}
						disabled={readOnly}
						onChange={event => {
							const dateFormat = event.target.value;
							if (dateFormat === "iso" || dateFormat === "monthFirst" || dateFormat === "dayFirst")
								onChange({ dateTime: { ...config, dateFormat } });
						}}>
						{Object.entries(dates).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</Select>
				</Field>
			)}
			{config.mode !== "date" && (
				<Field label="Time display" htmlFor={`${id}-time`}>
					<Select
						value={config.timeFormat ?? "24h"}
						disabled={readOnly}
						onChange={event =>
							onChange({
								dateTime: { ...config, timeFormat: event.target.value === "12h" ? "12h" : "24h" }
							})
						}>
						<option value="24h">24-hour (14:30)</option>
						<option value="12h">12-hour (2:30 PM)</option>
					</Select>
				</Field>
			)}
			<Field
				error={
					!readOnly && !isTimeZone(config.timeZone)
						? "Enter a valid time zone, such as America/New_York."
						: undefined
				}
				label="Time zone"
				htmlFor={`${id}-zone`}
				hint="Dates and times use this zone, including when the device travels.">
				<TextInput
					value={config.timeZone}
					readOnly={readOnly}
					onChange={event => onChange({ dateTime: { ...config, timeZone: event.target.value } })}
				/>
			</Field>
			<Field label="Value source" htmlFor={`${id}-source`}>
				<Select
					value={question.valueSource ?? "manual"}
					disabled={readOnly}
					onChange={event =>
						onChange({ valueSource: event.target.value === "captureTime" ? "captureTime" : undefined })
					}>
					<option value="manual">Observer enters the answer</option>
					<option value="captureTime">Record observation capture time automatically</option>
				</Select>
			</Field>
			{question.valueSource === "captureTime" && (
				<p className="type-small text-ink-2">
					Recorded when the observer first places the observation. It stays fixed after saving or reopening.
				</p>
			)}
		</fieldset>
	);
}
