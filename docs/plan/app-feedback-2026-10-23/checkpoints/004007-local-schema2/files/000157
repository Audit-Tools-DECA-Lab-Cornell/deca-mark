"use client";

import { useId } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { TextInput } from "@/components/contour/TextInput";

import { availableOptions } from "./available-options";
import { optionListProblem, OptionsEditor } from "./OptionsEditor";
import type { QuestionPatch } from "./QuestionSettings";
import type { RawQuestion } from "./raw";

export function DynamicOptionsEditor({
	question,
	earlier,
	readOnly,
	problem,
	onChange
}: {
	question: RawQuestion;
	earlier: readonly RawQuestion[];
	readOnly: boolean;
	problem?: string;
	onChange: (patch: QuestionPatch) => void;
}) {
	const id = useId();
	const dynamic = question.dynamicFrom;
	const parents = earlier.filter(candidate => candidate.kind === "one" && availableOptions(candidate).length > 0);
	const parent = earlier.find(candidate => candidate.id === dynamic?.question);
	const parentOptions = availableOptions(parent);
	function chooseParent(parentId: string) {
		const selected = parents.find(candidate => candidate.id === parentId);
		if (!selected) return;
		const sets = { ...dynamic?.sets };
		for (const option of availableOptions(selected)) {
			sets[option.code] ??= {
				code: `${question.code}_${option.code}`,
				exportColumn: "",
				label: option.label,
				options: []
			};
		}
		onChange({ dynamicFrom: { question: selected.id, sets } });
	}
	return (
		<div className="flex min-w-0 flex-col gap-5">
			<Field label="Options come from" htmlFor={`${id}-source`}>
				{readOnly ? (
					<TextInput value={dynamic ? "An earlier answer" : "A fixed list"} readOnly />
				) : (
					<Select
						value={dynamic ? "dynamic" : "static"}
						onChange={event => {
							if (event.target.value === "static")
								onChange({
									dynamicFrom: undefined,
									options: question.options ?? []
								});
							else if (parents[0]) chooseParent(parents[0].id);
						}}>
						<option value="static">A fixed list</option>
						<option value="dynamic" disabled={parents.length === 0}>
							An earlier answer
						</option>
					</Select>
				)}
			</Field>
			{question.optionsPending && (
				<Note tone="waiting" icon="flag">
					{question.optionsPending}
				</Note>
			)}
			{dynamic ? (
				<>
					<Field label="Controlling question" htmlFor={`${id}-parent`}>
						{readOnly ? (
							<TextInput value={parent ? `${parent.label} (${parent.id})` : dynamic.question} readOnly />
						) : (
							<Select value={dynamic.question} onChange={event => chooseParent(event.target.value)}>
								{!parents.some(candidate => candidate.id === dynamic.question) && (
									<option value={dynamic.question}>
										{parent?.label ?? dynamic.question} — choose an earlier single-choice question
									</option>
								)}
								{parents.map(candidate => (
									<option key={candidate.id} value={candidate.id}>
										{candidate.label} ({candidate.id})
									</option>
								))}
							</Select>
						)}
					</Field>
					{Object.entries(dynamic.sets).map(([code, set]) => {
						const answer = parentOptions.find(option => option.code === code);
						return (
							<div key={code} className="flex min-w-0 flex-col gap-3 border-t border-rule pt-4">
								<OptionsEditor
									label={answer ? `When the answer is ${answer.label}` : `Unmatched answer: ${code}`}
									options={set.options}
									minimum={1}
									readOnly={readOnly}
									problem={problem}
									onChange={options =>
										onChange({
											dynamicFrom: {
												...dynamic,
												sets: { ...dynamic.sets, [code]: { ...set, options } }
											},
											optionsPending: Object.values({
												...dynamic.sets,
												[code]: { ...set, options }
											}).every(candidate => optionListProblem(candidate.options) === null)
												? undefined
												: question.optionsPending
										})
									}
								/>
								{!answer && !readOnly && (
									<Button
										variant="outline"
										onClick={() => {
											const sets = Object.fromEntries(
												Object.entries(dynamic.sets).filter(([key]) => key !== code)
											);
											onChange({ dynamicFrom: { ...dynamic, sets } });
										}}>
										Remove unmatched option set
									</Button>
								)}
							</div>
						);
					})}
					{parentOptions
						.filter(option => !dynamic.sets[option.code])
						.map(option => (
							<div key={option.code}>
								<p className="mb-2 type-small text-ink-2">No option list for {option.label}.</p>
								{!readOnly && (
									<Button
										variant="outline"
										onClick={() =>
											onChange({
												dynamicFrom: {
													...dynamic,
													sets: {
														...dynamic.sets,
														[option.code]: {
															code: `${question.code}_${option.code}`,
															label: option.label,
															exportColumn: "",
															options: []
														}
													}
												}
											})
										}>
										Add options for {option.label}
									</Button>
								)}
							</div>
						))}
				</>
			) : (
				<OptionsEditor
					options={question.options ?? []}
					readOnly={readOnly}
					problem={problem}
					onChange={options =>
						onChange({
							options,
							optionsPending: optionListProblem(options, 2) === null ? undefined : question.optionsPending
						})
					}
				/>
			)}
		</div>
	);
}
