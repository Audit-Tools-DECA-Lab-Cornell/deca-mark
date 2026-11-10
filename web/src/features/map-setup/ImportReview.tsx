"use client";
import { useState } from "react";

import { Note } from "@/components/contour/Note";
import { MapFrame } from "@/components/map/MapFrame";

import { setupPlan } from "./plan";
import type { Content, Setup } from "./schema";
import { SourceReview } from "./SourceReview";

type Props = {
	readonly disabled: boolean;
	readonly setup: Setup;
	readonly content: Content;
	readonly siteName: string;
	readonly onChange: (content: Content) => void;
};
export function ImportReview({ setup, content, siteName, onChange, disabled }: Props) {
	const [focus, setFocus] = useState<{ source: string; feature: string } | null>(null);
	const layers = focus
		? setup.layers.map(layer => ({
				...layer,
				features:
					layer.source_id === focus.source
						? layer.features.filter(feature => feature.feature_key === focus.feature)
						: []
			}))
		: setup.layers;
	const plan = setupPlan(
		siteName,
		layers,
		focus ? { ...content, assignments: [], outline: null, zones: [] } : content
	);
	return (
		<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,1fr)]">
			<div className="lg:sticky lg:top-4">
				{focus && (
					<button className="min-h-touch type-small underline" onClick={() => setFocus(null)}>
						Show whole map
					</button>
				)}
				{plan ? (
					<MapFrame
						key={focus ? `${focus.source}:${focus.feature}` : "whole"}
						site={plan}
						title={focus ? "Selected map feature" : siteName}
						mapVersion="Draft"
					/>
				) : (
					<Note title="This project has no local vector map features.">
						Online background maps and other remote layers cannot provide editable boundaries. Include local
						vector files or export the needed layers as GeoJSON in QGIS before continuing.
					</Note>
				)}
			</div>
			<fieldset disabled={disabled} aria-label="Imported feature assignments">
				<SourceReview
					setup={setup}
					content={content}
					onChange={onChange}
					onInspect={(source, feature) => setFocus({ source, feature })}
				/>
			</fieldset>
		</div>
	);
}
