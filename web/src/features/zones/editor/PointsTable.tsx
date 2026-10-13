"use client";

import { type Dispatch, type KeyboardEvent, useId, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Select } from "@/components/contour/Select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { TextInput } from "@/components/contour/TextInput";
import { useRovingRows } from "@/components/contour/useRovingRows";
import { formatCount } from "@/lib/labels";
import type { PlanFrame } from "@/lib/plan";
import {
	type DraftZone,
	openLength,
	type Position,
	type RingAddress,
	ringAddresses,
	ringAt
} from "@/lib/zones/geometry";

import { type EditorAction, eventTime, planMidpoint, ringName } from "./state";

/**
 * The points of the selected ring as a table: the map's text equivalent (DESIGN §9, UI plan 5.3). Longitude
 * and latitude show to 7 decimals; the selected point's are fields that open at full precision, and a typed
 * value is taken exactly as written. The table is one tab stop with roving rows, a hundred points a page.
 */

const PAGE = 100;
const DECIMAL = /^\s*-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*$/;

type Axis = "longitude" | "latitude";

function CoordinateField({
	axis,
	value,
	point,
	onCommit
}: {
	axis: Axis;
	value: number;
	point: number;
	onCommit: (value: number) => void;
}) {
	const id = useId();
	// Null while the field shows the rounded value; the full-precision text while it is being edited.
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const limit = axis === "longitude" ? 180 : 90;

	function commit() {
		if (text === null) return;
		if (!DECIMAL.test(text)) {
			setError(`Enter a ${axis} in decimal degrees, such as ${axis === "longitude" ? "-76.4987" : "42.4456"}.`);
			return;
		}
		const next = Number(text);
		if (!Number.isFinite(next) || Math.abs(next) > limit) {
			setError(`Enter a ${axis} between −${limit} and ${limit}.`);
			return;
		}
		setError(null);
		setText(null);
		// The same number typed back is no change: the point keeps its exact value.
		if (!Object.is(next, value)) onCommit(next);
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Enter") {
			event.preventDefault();
			commit();
		} else if (event.key === "Escape") {
			event.preventDefault();
			setText(String(value));
			setError(null);
		}
	}

	return (
		<Field
			label={<span className="sr-only">{`${axis[0]!.toUpperCase()}${axis.slice(1)} of point ${point}`}</span>}
			htmlFor={id}
			error={error ?? undefined}>
			<TextInput
				id={id}
				inputMode="decimal"
				spellCheck={false}
				autoComplete="off"
				value={text ?? value.toFixed(7)}
				onFocus={() => setText(String(value))}
				onChange={event => setText(event.target.value)}
				onBlur={commit}
				onKeyDown={onKeyDown}
				className="min-w-36 type-mono-data"
			/>
		</Field>
	);
}

export type PointsTableProps = {
	zone: DraftZone;
	ring: RingAddress;
	selected: number | null;
	frame: PlanFrame;
	dispatch: Dispatch<EditorAction>;
	/** Moves focus to the point's handle on the plan. */
	onShowOnMap: (index: number) => void;
};

export function PointsTable({ zone, ring, selected, frame, dispatch, onShowOnMap }: PointsTableProps) {
	const pickerId = useId();
	const positions = ringAt(zone.geometry, ring) ?? [];
	const count = openLength(positions);
	const [manualPage, setManualPage] = useState(0);
	const page =
		selected !== null
			? Math.floor(selected / PAGE)
			: Math.min(manualPage, Math.max(0, Math.ceil(count / PAGE) - 1));
	const start = page * PAGE;
	const end = Math.min(count, start + PAGE);
	const rings = ringAddresses(zone.geometry);
	const address = (index: number) => ({ ...ring, index });
	const select = (index: number) => dispatch({ type: "select-point", zoneId: zone.zone_id, address: address(index) });

	const { bodyProps, rowProps } = useRovingRows({
		count: end - start,
		selectedIndex: selected !== null ? selected - start : -1,
		onSelect: row => select(start + row),
		onOpen: row => onShowOnMap(start + row)
	});

	const setCoordinate = (index: number, axis: Axis, value: number) => {
		const current: Position = positions[index]!;
		// Only the typed axis changes; the other keeps its exact number.
		const position: Position = axis === "longitude" ? [value, current[1]] : [current[0], value];
		dispatch({ type: "set-point", zoneId: zone.zone_id, address: address(index), position, at: eventTime() });
	};

	const goToPage = (next: number) => {
		setManualPage(next);
		select(next * PAGE);
	};

	return (
		<Island title="Points" meta={`${formatCount(count)} points · decimal degrees`} flush>
			{rings.length > 1 && (
				<div className="px-island-pad pb-4">
					<Field label="Edge" htmlFor={pickerId}>
						<Select
							id={pickerId}
							value={`${ring.part}:${ring.ring}`}
							onChange={event => {
								const [part, index] = event.target.value.split(":").map(Number) as [number, number];
								dispatch({ type: "select-ring", zoneId: zone.zone_id, ring: { part, ring: index } });
							}}>
							{rings.map(entry => {
								const name = ringName(zone, entry);
								return (
									<option key={`${entry.part}:${entry.ring}`} value={`${entry.part}:${entry.ring}`}>
										{`${name[0]!.toUpperCase()}${name.slice(1)}`}
									</option>
								);
							})}
						</Select>
					</Field>
				</div>
			)}
			<Table caption={`Points of ${ringName(zone, ring)}, ${zone.zone_label.trim() || zone.zone_code}`}>
				<THead>
					<tr>
						<Th>Point</Th>
						<Th>Longitude</Th>
						<Th>Latitude</Th>
					</tr>
				</THead>
				<TBody {...bodyProps}>
					{Array.from({ length: end - start }, (_, row) => {
						const index = start + row;
						const [lng, lat] = positions[index]!;
						const isSelected = index === selected;
						return (
							<Tr key={index} {...rowProps(row)}>
								<Td className="whitespace-nowrap">Point {index + 1}</Td>
								{isSelected ? (
									<>
										<Td>
											<CoordinateField
												axis="longitude"
												value={lng}
												point={index + 1}
												onCommit={value => setCoordinate(index, "longitude", value)}
											/>
										</Td>
										<Td>
											<CoordinateField
												axis="latitude"
												value={lat}
												point={index + 1}
												onCommit={value => setCoordinate(index, "latitude", value)}
											/>
										</Td>
									</>
								) : (
									<>
										<Td className="type-mono-data">{lng.toFixed(7)}</Td>
										<Td className="type-mono-data">{lat.toFixed(7)}</Td>
									</>
								)}
							</Tr>
						);
					})}
				</TBody>
			</Table>
			{selected !== null && selected < count && (
				<div className="flex flex-wrap items-center gap-2 border-t border-rule px-island-pad py-4">
					<Button
						variant="outline"
						size="sm"
						icon="plus"
						onClick={() =>
							dispatch({
								type: "insert-point",
								zoneId: zone.zone_id,
								address: address(selected),
								position: planMidpoint(positions[selected]!, positions[(selected + 1) % count]!, frame),
								at: eventTime()
							})
						}>
						Insert after point {selected + 1}
					</Button>
					<Button
						variant="outline"
						size="sm"
						icon="minus"
						onClick={() =>
							dispatch({
								type: "remove-point",
								zoneId: zone.zone_id,
								address: address(selected),
								at: eventTime()
							})
						}>
						Remove point {selected + 1}
					</Button>
					<Button variant="outline" size="sm" icon="map-pin" onClick={() => onShowOnMap(selected)}>
						Show on the plan
					</Button>
				</div>
			)}
			{count > PAGE && (
				<nav
					aria-label="Pages of points"
					className="flex flex-wrap items-center gap-2 border-t border-rule px-island-pad py-4">
					<span className="type-small text-ink-2">
						Points {formatCount(start + 1)}–{formatCount(end)} of {formatCount(count)}
					</span>
					{page > 0 && (
						<Button variant="outline" size="sm" icon="arrow-left" onClick={() => goToPage(page - 1)}>
							Previous {PAGE}
						</Button>
					)}
					{end < count && (
						<Button variant="outline" size="sm" iconRight="arrow-right" onClick={() => goToPage(page + 1)}>
							Next {Math.min(PAGE, count - end)}
						</Button>
					)}
				</nav>
			)}
		</Island>
	);
}
