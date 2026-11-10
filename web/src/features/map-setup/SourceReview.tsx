"use client";
import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Select } from "@/components/contour/Select";
import { readZoneGeometry } from "@/lib/zones/geometry";

import { adoptedZoneId, assignFeature, availableZoneIdentityChoices } from "./assignment";
import { allowedRoles } from "./model";
import { type Content, type Role, role as roleSchema, type Setup, type SourceLayer } from "./schema";
const LABELS = {
	outline: "Site outline",
	ground: "Ground features",
	zones: "Observation zone",
	paths: "Paths",
	trees: "Trees",
	leave_out: "Leave out"
};
export function SourceReview({
	setup,
	content,
	onChange,
	onInspect
}: {
	readonly setup: Setup;
	readonly content: Content;
	readonly onChange: (content: Content) => void;
	readonly onInspect: (source: string, feature: string) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [identityChoices, setIdentityChoices] = useState<Record<string, string>>({});
	async function choose(layer: SourceLayer, featureKey: string, role: Role) {
		const entry = layer.features.find(item => item.feature_key === featureKey);
		if (!entry) return;
		const prior = content.assignments.find(
			item => item.source_id === layer.source_id && item.feature_key === featureKey
		);
		if (prior?.role === role) return;
		setBusy(true);
		try {
			const id =
				prior?.zone_id ||
				(role === "zones" ? identityChoices[`${layer.source_id}:${featureKey}`] : null) ||
				(await adoptedZoneId(setup.setup_id, layer.source_id, featureKey));
			if (
				content.zones.some(zone => zone.zone_id === id) &&
				!window.confirm(
					"Remove the zone adopted from this feature? Any edits to that zone will be removed. Cancel keeps the current role and zone."
				)
			)
				return;
			if (
				((role === "outline" && content.outline) || prior?.role === "outline") &&
				!window.confirm(
					"Replace or remove the current site outline? Your zones will stay and must be checked against the new outline."
				)
			)
				return;
			if (
				role === "outline" &&
				content.assignments.some(item => item.role === "outline" && item.feature_key !== featureKey)
			) {
				window.alert("Change the previous outline feature’s role first, then choose the new outline.");
				return;
			}
			const shape = readZoneGeometry(entry.feature.geometry);
			const properties = entry.feature.properties;
			const label =
				typeof properties?.label === "string"
					? properties.label
					: typeof properties?.name === "string"
						? properties.name
						: "";
			onChange(
				assignFeature(
					content,
					{ source_id: layer.source_id, feature_key: featureKey, role },
					shape.ok ? shape.geometry : null,
					id,
					label
				)
			);
		} finally {
			setBusy(false);
		}
	}
	function bulk(layer: SourceLayer, role: Role) {
		if (
			layer.features.some(entry =>
				content.assignments.some(
					item =>
						item.source_id === layer.source_id &&
						item.feature_key === entry.feature_key &&
						(item.role === "outline" || item.role === "zones")
				)
			)
		) {
			window.alert("Review adopted outlines and zones individually before changing the entire layer.");
			return;
		}
		const keys = new Set(layer.features.map(item => item.feature_key));
		onChange({
			...content,
			assignments: [
				...content.assignments.filter(
					item => item.source_id !== layer.source_id || !keys.has(item.feature_key)
				),
				...layer.features.map(entry => ({
					source_id: layer.source_id,
					feature_key: entry.feature_key,
					role,
					zone_id: null
				}))
			]
		});
	}
	return (
		<section className="flex flex-col gap-4">
			<h2 className="type-heading">Review the map layers</h2>
			<p className="type-small text-ink-2">
				Choose what each feature is used for. The site outline is the outside edge; ground features are other
				areas shown on the map. Nothing is left out until you choose.
			</p>
			{setup.layers.map(layer => {
				const compatible = (["ground", "paths", "trees", "leave_out"] as const).filter(role =>
					layer.features.every(entry => allowedRoles(entry.feature.geometry?.type ?? "").includes(role))
				);
				return (
					<fieldset key={layer.source_id} className="flex flex-col gap-3 border-t border-rule pt-4">
						<legend className="type-body font-semibold">
							{layer.name} · {layer.features.length} features
						</legend>
						<div className="flex flex-wrap gap-2">
							{compatible.map(role => (
								<Button key={role} variant="outline" disabled={busy} onClick={() => bulk(layer, role)}>
									{role === "leave_out"
										? "Leave whole layer out"
										: `Use all as ${LABELS[role].toLowerCase()}`}
								</Button>
							))}
						</div>
						<details open={layer.features.length <= 5}>
							<summary className="min-h-touch cursor-pointer type-small">
								Review individual features
							</summary>
							{layer.features.map((entry, index) => {
								const assignment = content.assignments.find(
									item => item.source_id === layer.source_id && item.feature_key === entry.feature_key
								);
								return (
									<Field
										key={entry.feature_key}
										label={`${layer.name} · feature ${index + 1}`}
										htmlFor={`role-${layer.source_id}-${entry.feature_key}`}>
										<Button
											variant="outline"
											size="sm"
											onClick={() => onInspect(layer.source_id, entry.feature_key)}>
											Show feature {index + 1} on map
										</Button>
										{content.zones.length > 0 &&
											allowedRoles(entry.feature.geometry?.type ?? "").includes("zones") &&
											!assignment && (
												<Select
													aria-label={`Zone identity for ${layer.name} feature ${index + 1}`}
													value={
														identityChoices[`${layer.source_id}:${entry.feature_key}`] ?? ""
													}
													onChange={event =>
														setIdentityChoices(current => ({
															...current,
															[`${layer.source_id}:${entry.feature_key}`]:
																event.target.value
														}))
													}>
													<option value="">Create a new zone if adopted</option>
													{availableZoneIdentityChoices(
														content,
														layer.source_id,
														entry.feature_key
													).map(zone => (
														<option key={zone.zone_id} value={zone.zone_id}>
															Replace geometry of {zone.zone_code} · {zone.zone_label}
														</option>
													))}
												</Select>
											)}
										<Select
											disabled={busy}
											id={`role-${layer.source_id}-${entry.feature_key}`}
											value={assignment?.role ?? ""}
											onChange={event =>
												void choose(
													layer,
													entry.feature_key,
													roleSchema.parse(event.target.value)
												)
											}>
											<option value="" disabled>
												Choose how to use this feature
											</option>
											{allowedRoles(entry.feature.geometry?.type ?? "").map(role => (
												<option key={role} value={role}>
													{LABELS[role]}
												</option>
											))}
										</Select>
									</Field>
								);
							})}
						</details>
					</fieldset>
				);
			})}
			{setup.issues.map((issue, index) => (
				<div key={`${issue.source_id}-${index}`} className="border-t border-rule pt-3">
					<p className="type-body font-semibold">{issue.layer}</p>
					<p className="type-small">{issue.message}</p>
					<Button
						variant="outline"
						disabled={content.confirmed_omissions.includes(issue.source_id)}
						onClick={() =>
							onChange({
								...content,
								confirmed_omissions: [...content.confirmed_omissions, issue.source_id]
							})
						}>
						{content.confirmed_omissions.includes(issue.source_id)
							? "Left out of this map"
							: issue.kind === "online_basemap"
								? "Continue without this background map"
								: "Leave this source out"}
					</Button>
				</div>
			))}
		</section>
	);
}
