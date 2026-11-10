"use client";
import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Select } from "@/components/contour/Select";
import { openLength, ringAddresses, ringAt, type ZoneGeometry } from "@/lib/zones/geometry";

import { CoordinateEntry } from "./CoordinateEntry";
import { createOutlineEditHistory, editOutline, type OutlineEditAction } from "./outline-editing";

type Props = { readonly geometry: ZoneGeometry; readonly onChange: (geometry: ZoneGeometry) => void };
/** Edit actual outline coordinates while preserving every untouched part and hole. */
export function OutlineVertices({ geometry, onChange }: Props) {
	const [selected, setSelected] = useState("0:0:0");
	const [history, setHistory] = useState(createOutlineEditHistory);
	const [part = 0, ring = 0, index = 0] = selected.split(":").map(Number);
	const point = ringAt(geometry, { part, ring })?.[index];
	const apply = (action: OutlineEditAction, preferredIndex = index): void => {
		const result = editOutline(geometry, history, action);
		setHistory(result.history);
		const editedRing = ringAt(result.geometry, { part, ring });
		if (editedRing && openLength(editedRing) > 0) {
			const nextIndex = Math.min(preferredIndex, openLength(editedRing) - 1);
			setSelected(`${part}:${ring}:${nextIndex}`);
		}
		if (result.geometry !== geometry) onChange(result.geometry);
	};
	return (
		<details className="flex flex-col gap-3">
			<summary className="min-h-touch cursor-pointer type-small">Edit site outline points</summary>
			<p className="type-small">
				Choose an outline point, then move it, add a point after it or remove it. Other edges and holes stay in
				place.
			</p>
			<Select
				aria-label="Site outline point"
				value={selected}
				onChange={event => setSelected(event.target.value)}>
				{ringAddresses(geometry).flatMap(address =>
					(ringAt(geometry, address) ?? []).slice(0, -1).map((_, i) => (
						<option
							key={`${address.part}:${address.ring}:${i}`}
							value={`${address.part}:${address.ring}:${i}`}>
							Part {address.part + 1}, edge {address.ring + 1}, point {i + 1}
						</option>
					))
				)}
			</Select>
			{point && (
				<p className="type-small">
					Current position: {point[0]}, {point[1]}
				</p>
			)}
			<CoordinateEntry
				actionLabel="Move outline point"
				onAdd={position => {
					apply({ type: "move", address: { part, ring, index }, position });
				}}
				secondaryAction={{
					label: "Add point after selected",
					onAdd: position => {
						apply({ type: "insert", address: { part, ring, index }, position }, index + 1);
					}
				}}
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					disabled={!point}
					onClick={() => apply({ type: "remove", address: { part, ring, index } })}>
					Remove selected outline point
				</Button>
				<Button variant="outline" disabled={!history.past.length} onClick={() => apply({ type: "undo" })}>
					Undo outline edit
				</Button>
				<Button variant="outline" disabled={!history.future.length} onClick={() => apply({ type: "redo" })}>
					Redo outline edit
				</Button>
			</div>
			{history.message && (
				<p role="alert" className="type-small">
					{history.message}
				</p>
			)}
		</details>
	);
}
