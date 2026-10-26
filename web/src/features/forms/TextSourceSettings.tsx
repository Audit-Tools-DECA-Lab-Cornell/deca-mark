"use client";

import { useId } from "react";

import { Field } from "@/components/contour/Field";
import { Select } from "@/components/contour/Select";

import type { QuestionPatch } from "./QuestionSettings";
import type { RawQuestion } from "./raw";

export function TextSourceSettings({
	question,
	readOnly,
	onChange
}: {
	question: RawQuestion;
	readOnly: boolean;
	onChange: (patch: QuestionPatch) => void;
}) {
	const id = useId();
	return (
		<>
			<Field label="Value source" htmlFor={id}>
				<Select
					value={question.valueSource ?? "manual"}
					disabled={readOnly}
					onChange={event => {
						const value = event.target.value;
						if (value === "manual" || value === "accountId" || value === "observerCode")
							onChange({
								valueSource: value === "manual" ? undefined : value,
								maxLength:
									value === "accountId" ? Math.max(36, question.maxLength ?? 200) : question.maxLength
							});
					}}>
					<option value="manual">Observer enters the answer</option>
					<option value="accountId">Record Observer ID automatically</option>
					<option value="observerCode">Record observer initials/code automatically</option>
				</Select>
			</Field>
			{question.valueSource === "accountId" && (
				<p className="type-small text-ink-2">
					Uses the signed-in observer&apos;s stable account ID. It stays with the observation when it uploads.
				</p>
			)}
			{question.valueSource === "observerCode" && (
				<p className="type-small text-ink-2">
					Uses the observer&apos;s initials/code when the observation is first placed.
				</p>
			)}
		</>
	);
}
