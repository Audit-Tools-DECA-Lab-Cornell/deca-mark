"use client";

import { type Dispatch, type ReactNode, useId, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { TextInput } from "@/components/contour/TextInput";
import { codePoints, type DraftZone, LABEL_MAX, validCode } from "@/lib/zones/geometry";

import { type EditorAction, eventTime, shapeFacts, zoneName } from "./state";

/**
 * The selected zone (UI plan 5.3): its name and code, whether it is the same zone as in the base version, the
 * shape in words, and the actions on the whole zone. A code is typed only for a zone new in this draft; an
 * existing zone's code is shown read-only with the reason.
 */

export type ZonePropertiesProps = {
	zone: DraftZone | null;
	/** The zone is in the base version: its code is fixed. */
	existing: boolean;
	/** The base version's name, such as "v1". */
	baseVersion: string;
	dispatch: Dispatch<EditorAction>;
	/** Shape actions under the facts, such as removing a hole or a part. */
	shapeActions?: ReactNode;
	/** The Name field's id, so the editor can move focus to it after a zone is drawn. */
	labelInputId?: string;
};

export function ZoneProperties({
	zone,
	existing,
	baseVersion,
	dispatch,
	shapeActions,
	labelInputId
}: ZonePropertiesProps) {
	const id = useId();
	const labelId = labelInputId ?? `${id}-label`;
	// Each focus of a field is one undo step, however much is typed in it.
	const focusCount = useRef(0);
	const [focus, setFocus] = useState(0);
	const [touched, setTouched] = useState<string | null>(null);

	if (!zone) {
		return (
			<Island title="Selected zone">
				<p className="type-body text-ink-2">Select a zone on the plan or in the Zones list.</p>
			</Island>
		);
	}

	const labelError =
		touched === zone.zone_id && zone.zone_label.trim() === ""
			? "Give the zone a name."
			: codePoints(zone.zone_label.trim()) > LABEL_MAX
				? "Up to 200 characters."
				: undefined;
	const codeError =
		!existing && !validCode(zone.zone_code)
			? "Start with a letter or digit; use letters, digits, dots, dashes and underscores."
			: undefined;
	const nextFocus = () => {
		focusCount.current += 1;
		setFocus(focusCount.current);
	};

	return (
		<Island title="Selected zone" meta={zoneName(zone)}>
			<div className="flex flex-col gap-5">
				<Field label="Name" htmlFor={labelId} hint="Up to 200 characters. Observers see it." error={labelError}>
					<TextInput
						id={labelId}
						value={zone.zone_label}
						onFocus={nextFocus}
						onBlur={() => setTouched(zone.zone_id)}
						onChange={event =>
							dispatch({
								type: "set-label",
								zoneId: zone.zone_id,
								label: event.target.value,
								focus,
								at: eventTime()
							})
						}
					/>
				</Field>
				<Field
					label="Code"
					htmlFor={`${id}-code`}
					hint={
						existing
							? "Codes never change. A new code makes a new zone."
							: "Up to 100 characters. It cannot change once published."
					}
					error={codeError}>
					<TextInput
						id={`${id}-code`}
						value={zone.zone_code}
						readOnly={existing}
						className="type-mono-data"
						onFocus={nextFocus}
						onChange={event =>
							dispatch({
								type: "set-code",
								zoneId: zone.zone_id,
								code: event.target.value,
								focus,
								at: eventTime()
							})
						}
					/>
				</Field>
				<dl className="flex flex-col gap-1 type-body">
					<div className="flex flex-wrap gap-x-2">
						<dt className="sr-only">Identity</dt>
						<dd>{existing ? `Same zone as in ${baseVersion}` : "New zone in this draft"}</dd>
					</div>
					<div className="flex flex-wrap gap-x-2">
						<dt className="sr-only">Shape</dt>
						<dd className="text-ink-2">{shapeFacts(zone)}</dd>
					</div>
				</dl>
				{shapeActions}
				<div className="flex flex-col items-start gap-2 border-t border-rule pt-4">
					<p className="type-small text-ink-2">
						{existing
							? `Removes ${zoneName(zone)} from the next version. Earlier versions and their observations keep it.`
							: `Removes ${zoneName(zone)} from this draft.`}
					</p>
					<Button
						variant="outline"
						size="sm"
						icon="trash-2"
						onClick={() => dispatch({ type: "remove-zone", zoneId: zone.zone_id, at: eventTime() })}>
						Remove zone
					</Button>
				</div>
			</div>
		</Island>
	);
}
