"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { ZoneEditor } from "@/features/zones/editor/ZoneEditor";
import { MAP_PALETTES, useMapPalette } from "@/lib/map-palette";
import type { DraftZone } from "@/lib/zones/geometry";

import { type SpecimenLayers, specimenSets } from "./specimens";

/**
 * The zone editor on specimen shapes, in memory only (UI plan 6.6). It has no save, publish or network
 * code: the editor reports its zones here and they go nowhere. For browser tests and the spike's
 * measurements it exposes the current zones, and how long the last set took to draw, on
 * `window.__zoneSpecimen`.
 */

type SpecimenHook = {
	set: string;
	/** The zones now, as the editor holds them. */
	zones: () => readonly DraftZone[];
	/** The zones the set started with. */
	original: () => readonly DraftZone[];
	/** Milliseconds from choosing the set to its first painted frame. */
	lastRenderMs: number | null;
};

declare global {
	interface Window {
		__zoneSpecimen?: SpecimenHook;
	}
}

export function ZoneEditorSpecimen({ fallCreek, initial }: { fallCreek: SpecimenLayers | null; initial: string }) {
	const pickerId = useId();
	const sets = useMemo(() => specimenSets(fallCreek), [fallCreek]);
	const [setId, setSetId] = useState(() => (sets.some(entry => entry.id === initial) ? initial : sets[0]!.id));
	const chosen = sets.find(entry => entry.id === setId)!;
	const [palette] = useMapPalette();
	const zonesRef = useRef<readonly DraftZone[]>(chosen.zones);
	const startedRef = useRef<number | null>(null);
	const [renderMs, setRenderMs] = useState<number | null>(null);
	const [drag, setDrag] = useState<{ median: number; p95: number; frames: number } | null>(null);

	// Frame times while a pointer is down, so a drag can be measured on a tablet without other tools.
	useEffect(() => {
		let frames: number[] = [];
		let request: number | null = null;
		const tick = (time: number) => {
			frames.push(time);
			request = requestAnimationFrame(tick);
		};
		const down = () => {
			frames = [];
			if (request === null) request = requestAnimationFrame(tick);
		};
		const up = () => {
			if (request !== null) cancelAnimationFrame(request);
			request = null;
			const gaps = frames
				.slice(1)
				.map((time, index) => time - frames[index]!)
				.sort((a, b) => a - b);
			if (gaps.length >= 10)
				setDrag({
					median: gaps[Math.floor(gaps.length / 2)]!,
					p95: gaps[Math.floor(gaps.length * 0.95)]!,
					frames: gaps.length
				});
		};
		document.addEventListener("pointerdown", down);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", up);
		return () => {
			document.removeEventListener("pointerdown", down);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", up);
			if (request !== null) cancelAnimationFrame(request);
		};
	}, []);

	const onZonesChange = useCallback((zones: readonly DraftZone[]) => {
		zonesRef.current = zones;
	}, []);

	// Time from choosing a set to the frame after it is drawn.
	useEffect(() => {
		const started = startedRef.current;
		if (started === null) return;
		const frame = requestAnimationFrame(() => {
			setRenderMs(performance.now() - started);
			startedRef.current = null;
		});
		return () => cancelAnimationFrame(frame);
	}, [setId]);

	useEffect(() => {
		window.__zoneSpecimen = {
			set: setId,
			zones: () => zonesRef.current,
			original: () => chosen.zones,
			lastRenderMs: renderMs
		};
	}, [setId, chosen, renderMs]);

	return (
		<ZoneEditor
			key={setId}
			site={chosen.site}
			siteBoundary={chosen.siteBoundary}
			zones={chosen.zones}
			baseVersion="v1"
			mapTitle="Specimen shapes · nothing is saved"
			mapSubtitle={`${chosen.name} · ${MAP_PALETTES[palette].label} plan`}
			onZonesChange={onZonesChange}>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<Field label="Shapes" htmlFor={pickerId} hint={chosen.note} className="max-w-md">
					<Select
						id={pickerId}
						value={setId}
						onChange={event => {
							startedRef.current = performance.now();
							setSetId(event.target.value);
						}}>
						{sets.map(entry => (
							<option key={entry.id} value={entry.id}>
								{entry.name}
							</option>
						))}
					</Select>
				</Field>
				<div className="flex flex-col gap-2 lg:max-w-md">
					<Note tone="neutral">
						Specimen shapes, edited in this tab only. Nothing is saved or sent, and choosing other shapes
						starts again.
					</Note>
					<p className="type-small text-ink-2">
						{renderMs !== null && `Drawn in ${Math.round(renderMs)} ms after choosing the shapes. `}
						{drag &&
							`Last drag: ${Math.round(1000 / drag.median)} frames a second at the median, ${drag.p95.toFixed(1)} ms per frame at the 95th percentile, over ${drag.frames} frames.`}
					</p>
				</div>
			</div>
		</ZoneEditor>
	);
}
