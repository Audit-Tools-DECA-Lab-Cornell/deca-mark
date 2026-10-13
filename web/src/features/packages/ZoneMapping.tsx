"use client";

import { useId } from "react";

import { Field } from "@/components/contour/Field";
import { IslandSection } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { TextInput } from "@/components/contour/TextInput";
import { plural } from "@/lib/labels";

import { type CurrentZone, type MappingRow, removedZones, ZONE_CODE_RULE } from "./identity";

const NEW = "~new";
const UNDECIDED = "";

/**
 * The identity step of an upload (UI plan 5.11): for each zone in the file, the manager says which zone it
 * is, the same zone as one of the current version's (its records stay together across versions) or a new
 * one with a code of its own. A zone the file names with a current zone's identity is chosen already; a
 * matching code or name is only suggested. Current zones the file leaves out are listed.
 */
export function ZoneMapping({
	rows,
	current,
	problems,
	disabled,
	onChoose
}: {
	rows: readonly MappingRow[];
	current: readonly CurrentZone[];
	/** Per source id, why its row cannot be sent yet. */
	problems: ReadonlyMap<string, string>;
	disabled: boolean;
	onChoose: (
		sourceId: string,
		choice: { readonly kind: "same"; readonly zoneId: string } | { readonly kind: "new"; readonly code: string }
	) => void;
}) {
	const id = useId();
	const removed = removedZones(rows, current);
	const first = current.length === 0;

	return (
		<IslandSection className="flex flex-col gap-4 pt-5">
			<div className="flex flex-col gap-1">
				<p className="type-body font-semibold text-ink">Which zone is each zone in the file?</p>
				<p className="type-small text-ink-2">
					{first
						? "This is the site's first map, so every zone is new. Each one needs a code that never changes."
						: "Choose the same zone to keep its records together across map versions, or a new zone. A matching code or name does not make it the same zone."}{" "}
					Names come from each zone&apos;s name field, or its label field when it has none.
				</p>
			</div>
			<ul className="flex flex-col divide-y divide-rule border-y border-rule">
				{rows.map(row => {
					const sourceId = row.source.sourceId;
					const selectId = `${id}-zone-${sourceId}`;
					const codeId = `${id}-code-${sourceId}`;
					const value =
						row.choice.kind === "same" ? row.choice.zoneId : row.choice.kind === "new" ? NEW : UNDECIDED;
					const problem = problems.get(sourceId) ?? null;
					return (
						<li key={sourceId} className="flex flex-col gap-3 py-4" data-source-zone={sourceId}>
							<p className="type-body text-ink">
								<span className="type-mono-data font-semibold break-all">{sourceId}</span>{" "}
								<span>{row.source.name ?? "No name"}</span>
							</p>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field
									label={`Zone ${sourceId} is`}
									htmlFor={selectId}
									error={row.choice.kind === "new" ? null : problem}>
									<Select
										id={selectId}
										value={value}
										disabled={disabled}
										onChange={event => {
											const next = event.target.value;
											if (next === NEW)
												onChoose(sourceId, {
													kind: "new",
													code: row.choice.kind === "new" ? row.choice.code : ""
												});
											else if (next !== UNDECIDED)
												onChoose(sourceId, { kind: "same", zoneId: next });
										}}>
										{row.choice.kind === "undecided" && (
											<option value={UNDECIDED} disabled>
												Choose
											</option>
										)}
										{current.map(zone => (
											<option key={zone.zoneId} value={zone.zoneId}>
												{`Same zone as ${zone.label} (${zone.code})`}
											</option>
										))}
										<option value={NEW}>New zone</option>
									</Select>
								</Field>
								{row.choice.kind === "new" && (
									<Field
										label="Code of the new zone"
										htmlFor={codeId}
										hint={problem ? undefined : ZONE_CODE_RULE}
										error={problem}>
										<TextInput
											id={codeId}
											value={row.choice.code}
											disabled={disabled}
											maxLength={100}
											autoComplete="off"
											spellCheck={false}
											onChange={event =>
												onChoose(sourceId, { kind: "new", code: event.target.value.trim() })
											}
										/>
									</Field>
								)}
							</div>
							{row.suggestion && row.choice.kind === "undecided" && (
								<p className="type-small text-ink-2">
									{`Its ${row.suggestion.code === sourceId ? "code" : "name"} matches ${row.suggestion.label} (${row.suggestion.code}).`}
								</p>
							)}
						</li>
					);
				})}
			</ul>
			{removed.length > 0 && (
				<Note
					tone="neutral"
					title={`Removed from the next version: ${removed.map(zone => zone.label).join(", ")}.`}>
					{`${plural(removed.length, "zone")} of the current version ${removed.length === 1 ? "is" : "are"} not in the file. Earlier versions and their observations keep ${removed.length === 1 ? "it" : "them"}.`}
				</Note>
			)}
		</IslandSection>
	);
}
