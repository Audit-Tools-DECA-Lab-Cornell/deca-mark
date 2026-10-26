"use client";

import { useId, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { TextInput } from "@/components/contour/TextInput";

export function QuestionIdEditor({
	value,
	readOnly,
	onRename
}: {
	value: string;
	readOnly: boolean;
	onRename: (nextId: string) => string | null;
}) {
	const id = useId();
	const [editing, setEditing] = useState(false);
	const [buffer, setBuffer] = useState(value);
	const [error, setError] = useState<string | undefined>();
	function cancel() {
		setBuffer(value);
		setError(undefined);
		setEditing(false);
	}
	function apply() {
		const problem = onRename(buffer.trim());
		if (problem) setError(problem);
		else setEditing(false);
	}
	return (
		<div className="flex flex-col gap-3">
			<Field
				label="Question ID"
				htmlFor={id}
				hint="Question ID will be the Column title for this variable in datasets."
				error={error}>
				<TextInput
					value={editing ? buffer : value}
					readOnly={readOnly || !editing}
					className="font-mono"
					onChange={event => {
						setBuffer(event.target.value);
						setError(undefined);
					}}
					onKeyDown={event => {
						if (!editing) return;
						if (event.key === "Escape") {
							event.preventDefault();
							cancel();
						}
						if (event.key === "Enter") {
							event.preventDefault();
							apply();
						}
					}}
				/>
			</Field>
			<p className="type-small text-ink-2">
				Dataset exports protect reserved names and spreadsheet formulas. For example, site_id becomes
				answer_site_id.
			</p>
			{!readOnly && (
				<div className="flex flex-wrap gap-3">
					{editing ? (
						<>
							<Button variant="ink" onClick={apply}>
								Apply ID
							</Button>
							<Button variant="outline" onClick={cancel}>
								Cancel
							</Button>
						</>
					) : (
						<Button
							variant="outline"
							onClick={() => {
								setBuffer(value);
								setEditing(true);
							}}>
							Edit ID
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
