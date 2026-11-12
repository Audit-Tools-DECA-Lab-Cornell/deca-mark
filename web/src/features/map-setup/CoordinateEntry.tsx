"use client";
import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { TextInput } from "@/components/contour/TextInput";
import type { Position } from "@/lib/zones/geometry";

export function CoordinateEntry({
	onAdd,
	actionLabel = "Add point",
	secondaryAction,
	mapHint = true
}: {
	/** Whether the map beside this form also takes points by clicking. */
	readonly mapHint?: boolean;
	readonly onAdd: (point: Position) => void;
	readonly actionLabel?: string;
	readonly secondaryAction?: Readonly<{
		readonly label: string;
		readonly onAdd: (point: Position) => void;
	}>;
}) {
	const [lng, setLng] = useState("");
	const [lat, setLat] = useState("");
	const [error, setError] = useState("");
	const apply = (add: (point: Position) => void): void => {
		const longitude = Number(lng);
		const latitude = Number(lat);
		if (
			!lng.trim() ||
			!lat.trim() ||
			!Number.isFinite(longitude) ||
			!Number.isFinite(latitude) ||
			Math.abs(longitude) > 180 ||
			Math.abs(latitude) > 90
		) {
			setError("Enter a longitude from −180 to 180 and latitude from −90 to 90.");
			return;
		}
		add([longitude, latitude]);
		setError("");
	};
	return (
		<div className="flex flex-col gap-3">
			<p className="type-small text-ink-2">
				Enter longitude and latitude in decimal degrees.
				{mapHint && " You can still click the map for other points."}
			</p>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field label="Longitude" htmlFor="outline-lng">
					<TextInput
						id="outline-lng"
						value={lng}
						onChange={event => setLng(event.target.value)}
						inputMode="decimal"
					/>
				</Field>
				<Field label="Latitude" htmlFor="outline-lat">
					<TextInput
						id="outline-lat"
						value={lat}
						onChange={event => setLat(event.target.value)}
						inputMode="decimal"
					/>
				</Field>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onClick={() => apply(onAdd)}>
					{actionLabel}
				</Button>
				{secondaryAction && (
					<Button variant="outline" size="sm" onClick={() => apply(secondaryAction.onAdd)}>
						{secondaryAction.label}
					</Button>
				)}
			</div>
			{error && (
				<p role="alert" className="type-small">
					{error}
				</p>
			)}
		</div>
	);
}
