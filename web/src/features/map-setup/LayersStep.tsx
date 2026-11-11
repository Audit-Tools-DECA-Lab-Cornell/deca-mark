"use client";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Icon } from "@/components/contour/Icon";
import { Island, IslandSection } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { type MapController, MapFrame } from "@/components/map/MapFrame";
import { cx } from "@/lib/cx";
import { readZoneGeometry } from "@/lib/zones/geometry";

import { adoptedZoneId, assignFeature, availableZoneIdentityChoices } from "./assignment";
import {
	featureName,
	layerCount,
	ROLE_LABELS,
	ROLE_LABELS_PLURAL,
	shapeOf,
	sharedRole,
	undecidedIn
} from "./feature-names";
import { FeatureOverlay, type OverlayShape, overlayShape } from "./FeatureOverlay";
import { ADD_FILES_INPUT } from "./Intake";
import { allowedRoles, sourceDisposition } from "./model";
import { setupPlan } from "./plan";
import { type Content, type Role, role as roleSchema, type Setup, type SourceLayer } from "./schema";
import { MAP_HEIGHT, WORKSPACE_GRID } from "./workspace";

type Props = {
	readonly disabled: boolean;
	readonly setup: Setup;
	readonly content: Content;
	readonly siteName: string;
	readonly onChange: (content: Content) => void;
	/** Reports a whole-layer change that is still being worked out, so the page does not save or leave without it. */
	readonly onPending: (pending: boolean) => void;
	/** The map files row: what was read, and the ways to add to it or replace it. */
	readonly files: ReactNode;
	/** The step's Continue action. */
	readonly footer: ReactNode;
};

const BULK_ROLES = ["zones", "ground", "paths", "trees", "leave_out"] as const;
/** A longer layer starts closed: it usually takes one decision, and its features open on request. */
const OPEN_BY_DEFAULT = 8;

function keyOf(source: string, feature: string): string {
	return `${source}\u0000${feature}`;
}

/**
 * Step 1 after a project has been read: the map on one side and, beside it, every imported layer with the
 * use chosen for it. A layer takes one decision when its features belong together, and any feature can be
 * decided on its own. The open layer's features are numbered on the map and in the list, and pressing either
 * selects the other, so no one has to remember which shape "feature 4" was.
 */
export function LayersStep({ setup, content, siteName, onChange, onPending, disabled, files, footer }: Props) {
	const [busy, setBusy] = useState(false);
	const [batching, setBatching] = useState(false);
	useEffect(() => {
		onPending(batching);
		return () => onPending(false);
	}, [batching, onPending]);
	const [identityChoices, setIdentityChoices] = useState<Record<string, string>>({});
	const [selected, setSelected] = useState<{ source: string; feature: string } | null>(null);
	const [opened, setOpened] = useState<Record<string, boolean>>({});
	const [refusal, setRefusal] = useState<{ source: string; message: string } | null>(null);
	const [activeSource, setActiveSource] = useState<string | null>(null);
	const mapRef = useRef<MapController>(null);
	const mapBox = useRef<HTMLDivElement>(null);

	const plan = useMemo(() => setupPlan(siteName, setup.layers, content), [siteName, setup.layers, content]);
	const total = setup.layers.reduce((sum, layer) => sum + layer.features.length, 0);
	const undecided = sourceDisposition(setup.layers, content.assignments);
	const active =
		setup.layers.find(layer => layer.source_id === activeSource) ??
		setup.layers.find(layer => undecidedIn(layer, content.assignments) > 0) ??
		setup.layers[0];
	const shapes = useMemo<OverlayShape[]>(() => {
		if (!plan || !active) return [];
		return active.features.flatMap((entry, index) => {
			const shape = overlayShape(
				entry.feature,
				plan.frame,
				keyOf(active.source_id, entry.feature_key),
				index + 1,
				featureName(entry.feature, index)
			);
			return shape ? [shape] : [];
		});
	}, [plan, active]);

	function show(source: string, feature: string, fromMap = false) {
		setSelected({ source, feature });
		setActiveSource(source);
		setOpened(current => ({ ...current, [source]: true }));
		if (fromMap) {
			requestAnimationFrame(() =>
				document.getElementById(`feature-${source}-${feature}`)?.scrollIntoView({ block: "nearest" })
			);
			return;
		}
		const shape = shapes.find(item => item.key === keyOf(source, feature));
		if (shape && source === active?.source_id) mapRef.current?.showPoint(shape.anchor);
		// On a narrow screen the map sits above the list; bring it back when a row asks for it.
		const box = mapBox.current?.getBoundingClientRect();
		if (box && (box.bottom < 80 || box.top > window.innerHeight - 80))
			mapBox.current?.scrollIntoView({ block: "start", behavior: "smooth" });
	}

	async function choose(layer: SourceLayer, featureKey: string, role: Role) {
		const entry = layer.features.find(item => item.feature_key === featureKey);
		if (!entry) return;
		const prior = content.assignments.find(
			item => item.source_id === layer.source_id && item.feature_key === featureKey
		);
		if (prior?.role === role) return;
		setRefusal(null);
		setBusy(true);
		try {
			const id =
				prior?.zone_id ||
				(role === "zones" ? identityChoices[`${layer.source_id}:${featureKey}`] : null) ||
				(await adoptedZoneId(setup.setup_id, layer.source_id, featureKey));
			if (
				content.zones.some(zone => zone.zone_id === id) &&
				!window.confirm(
					"Remove the zone made from this feature? Any edits to that zone will be removed. Cancel keeps the current use and zone."
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
				setRefusal({
					source: layer.source_id,
					message:
						"A map has one site outline. Give the feature that is the outline now another use, then choose the new one."
				});
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

	/** One use for a whole layer. Zones are adopted one by one, so each keeps its own identity. */
	async function bulk(layer: SourceLayer, role: Role) {
		setRefusal(null);
		setActiveSource(layer.source_id);
		const roleOf = (featureKey: string) =>
			content.assignments.find(item => item.source_id === layer.source_id && item.feature_key === featureKey)
				?.role;
		if (
			layer.features.some(entry => {
				const current = roleOf(entry.feature_key);
				return current === "outline" || (current === "zones" && role !== "zones");
			})
		) {
			setRefusal({
				source: layer.source_id,
				message:
					"This layer already holds the site outline or a zone. Change those features one at a time, so nothing you have set up is replaced by accident."
			});
			return;
		}
		if (role === "zones") {
			setBusy(true);
			setBatching(true);
			try {
				let next = content;
				for (const entry of layer.features) {
					if (roleOf(entry.feature_key) === "zones") continue;
					const shape = readZoneGeometry(entry.feature.geometry);
					const properties = entry.feature.properties;
					const label =
						typeof properties?.label === "string"
							? properties.label
							: typeof properties?.name === "string"
								? properties.name
								: "";
					next = assignFeature(
						next,
						{ source_id: layer.source_id, feature_key: entry.feature_key, role },
						shape.ok ? shape.geometry : null,
						await adoptedZoneId(setup.setup_id, layer.source_id, entry.feature_key),
						label
					);
				}
				onChange(next);
			} finally {
				setBusy(false);
				setBatching(false);
			}
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
		<div className={WORKSPACE_GRID}>
			<div ref={mapBox} className="scroll-mt-4 lg:sticky lg:top-4">
				{plan ? (
					<MapFrame
						site={plan}
						title={siteName}
						subtitle={active ? `Numbered: ${active.name}` : undefined}
						mapVersion="Draft"
						controller={mapRef}
						className={MAP_HEIGHT}>
						<FeatureOverlay
							shapes={shapes}
							selected={selected ? keyOf(selected.source, selected.feature) : null}
							onSelect={key => {
								const [source = "", feature = ""] = key.split("\u0000");
								show(source, feature, true);
							}}
						/>
					</MapFrame>
				) : (
					<Note title="This project has no local vector map features.">
						Online background maps and other remote layers cannot provide editable boundaries. Add the
						project’s data files, or export the layers you need from QGIS as GeoJSON and add those.
					</Note>
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-6">
				<Island
					flush
					divided
					title="Map layers"
					meta={
						total > 0 ? (
							<span role="status">
								<span className="tnum">
									{total - undecided} of {total}
								</span>{" "}
								decided
							</span>
						) : undefined
					}
					className="@container">
					<IslandSection className="flex flex-col gap-4">
						{files}
						{total > 0 && (
							<p className="type-small text-ink-2">
								Choose how each layer is used. The site outline is the outer edge of the site, and
								observation zones are the areas observers record in. Ground features, paths and trees
								are drawn for orientation. Nothing is used or left out until you choose.
							</p>
						)}
					</IslandSection>
					<fieldset disabled={disabled} aria-label="Imported feature assignments" className="min-w-0">
						{setup.issues.map((issue, index) => {
							const left = content.confirmed_omissions.includes(issue.source_id);
							const online = issue.kind === "online_basemap";
							return (
								<IslandSection key={`${issue.source_id}-${index}`} rule className="flex flex-col gap-3">
									<div className="flex items-start gap-3">
										<Icon
											name={left ? "eye-off" : "triangle-alert"}
											size={18}
											className={cx("mt-0.5 shrink-0", left ? "text-ink-2" : "text-attention")}
										/>
										<div className="min-w-0">
											<p className="type-body font-semibold [overflow-wrap:anywhere]">
												{issue.layer}
											</p>
											<p className="type-small text-ink-2">{issue.message}</p>
										</div>
									</div>
									<div className="flex flex-wrap gap-2 pl-7.5">
										{left ? (
											<>
												<p className="self-center type-small font-semibold">
													Left out of this map
												</p>
												<Button
													variant="ghost"
													size="sm"
													icon="undo-2"
													onClick={() =>
														onChange({
															...content,
															confirmed_omissions: content.confirmed_omissions.filter(
																id => id !== issue.source_id
															)
														})
													}>
													Undo
												</Button>
											</>
										) : (
											<>
												{!online && (
													<Button
														variant="ink"
														size="sm"
														onClick={() =>
															document.getElementById(ADD_FILES_INPUT)?.click()
														}>
														Add the missing file
													</Button>
												)}
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														onChange({
															...content,
															confirmed_omissions: [
																...content.confirmed_omissions,
																issue.source_id
															]
														})
													}>
													{online
														? "Continue without this background map"
														: "Leave this source out"}
												</Button>
											</>
										)}
									</div>
								</IslandSection>
							);
						})}
						{setup.layers.map(layer => {
							const many = layer.features.length > 1;
							const left = undecidedIn(layer, content.assignments);
							const shared = sharedRole(layer, content.assignments);
							const open = opened[layer.source_id] ?? layer.features.length <= OPEN_BY_DEFAULT;
							const bulkRoles = BULK_ROLES.filter(
								role =>
									role === shared ||
									(layer.features.every(entry =>
										allowedRoles(entry.feature.geometry?.type ?? "").includes(role)
									) &&
										// A whole layer becomes new zones only when no saved zone is waiting to be matched.
										(role !== "zones" ||
											layer.features.every(
												entry =>
													availableZoneIdentityChoices(
														content,
														layer.source_id,
														entry.feature_key
													).length === 0
											)))
							);
							const isActive = active?.source_id === layer.source_id;
							const listId = `layer-${layer.source_id}-features`;
							return (
								<IslandSection
									as="section"
									key={layer.source_id}
									rule
									role="group"
									aria-label={layer.name}
									className="flex flex-col gap-3">
									<div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
										<div className="min-w-0">
											<h3 className="type-body font-semibold [overflow-wrap:anywhere]">
												{layer.name}
											</h3>
											<p className="type-small text-ink-2">
												{layerCount(layer)}
												{" · "}
												{left > 0
													? `${left} to decide`
													: shared
														? ROLE_LABELS_PLURAL[shared]
														: "Different uses"}
											</p>
										</div>
										{many && (
											<Select
												aria-label={`Use all of ${layer.name} as`}
												disabled={busy}
												value={shared ?? ""}
												className="@md:w-52 @md:shrink-0"
												onChange={event =>
													void bulk(layer, roleSchema.parse(event.target.value))
												}>
												<option value="" disabled>
													Use all as…
												</option>
												{bulkRoles.map(role => (
													<option key={role} value={role}>
														{role === "leave_out"
															? "Leave all out"
															: ROLE_LABELS_PLURAL[role]}
													</option>
												))}
											</Select>
										)}
									</div>
									{refusal?.source === layer.source_id && (
										<Note tone="attention" live="assertive">
											{refusal.message}
										</Note>
									)}
									{many && (
										<div className="flex flex-wrap items-center gap-x-4">
											<button
												type="button"
												aria-expanded={open}
												aria-controls={listId}
												className="-ml-2 inline-flex min-h-touch items-center gap-1.5 rounded-input px-2 type-small font-semibold text-ink hover:bg-well"
												onClick={() => {
													setOpened(current => ({ ...current, [layer.source_id]: !open }));
													if (!open) setActiveSource(layer.source_id);
												}}>
												<Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
												{open ? "Hide" : "Show"} each{" "}
												{shapeOf(layer.features[0]?.feature.geometry?.type)}
											</button>
											{open && !isActive && plan && (
												<button
													type="button"
													className="inline-flex min-h-touch items-center gap-1.5 rounded-input px-2 type-small text-ink-2 underline decoration-1 underline-offset-4 hover:text-ink"
													onClick={() => setActiveSource(layer.source_id)}>
													Number these on the map
												</button>
											)}
										</div>
									)}
									{(open || !many) && (
										<ul id={listId} className="-mx-2 flex flex-col">
											{layer.features.map((entry, index) => {
												const assignment = content.assignments.find(
													item =>
														item.source_id === layer.source_id &&
														item.feature_key === entry.feature_key
												);
												const name = featureName(entry.feature, index);
												const chosen =
													selected?.source === layer.source_id &&
													selected.feature === entry.feature_key;
												const roles = allowedRoles(entry.feature.geometry?.type ?? "");
												const identities =
													content.zones.length > 0 && roles.includes("zones") && !assignment
														? availableZoneIdentityChoices(
																content,
																layer.source_id,
																entry.feature_key
															)
														: [];
												const nameId = `feature-name-${layer.source_id}-${entry.feature_key}`;
												return (
													<li
														key={entry.feature_key}
														id={`feature-${layer.source_id}-${entry.feature_key}`}
														className={cx(
															"grid scroll-my-4 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-input px-2 py-1.5",
															"@md:grid-cols-[auto_minmax(0,1fr)_13rem]",
															chosen && "selected-bar bg-well"
														)}>
														<button
															type="button"
															aria-pressed={chosen}
															aria-label={`Show ${name} on the map`}
															disabled={!plan}
															className={cx(
																"inline-flex size-11 items-center justify-center rounded-pill",
																"not-disabled:hover:bg-ledge"
															)}
															onClick={() => show(layer.source_id, entry.feature_key)}>
															<span
																className={cx(
																	"inline-flex h-6 min-w-6 items-center justify-center rounded-pill border-2 border-ink px-1 type-mono-data",
																	chosen ? "bg-ink text-on-ink" : "bg-island text-ink"
																)}>
																{index + 1}
															</span>
														</button>
														<span
															id={nameId}
															className="min-w-0 type-body [overflow-wrap:anywhere]">
															{name}
														</span>
														<div className="col-span-2 flex flex-col gap-2 @md:col-span-1">
															{identities.length > 0 && (
																<Select
																	id={`identity-${layer.source_id}-${entry.feature_key}`}
																	aria-label={`Zone identity for ${layer.name} feature ${index + 1}`}
																	value={
																		identityChoices[
																			`${layer.source_id}:${entry.feature_key}`
																		] ?? ""
																	}
																	onChange={event =>
																		setIdentityChoices(current => ({
																			...current,
																			[`${layer.source_id}:${entry.feature_key}`]:
																				event.target.value
																		}))
																	}>
																	<option value="">As a zone: make a new zone</option>
																	{identities.map(zone => (
																		<option key={zone.zone_id} value={zone.zone_id}>
																			As a zone: new shape for {zone.zone_code} ·{" "}
																			{zone.zone_label}
																		</option>
																	))}
																</Select>
															)}
															<Select
																disabled={busy}
																id={`role-${layer.source_id}-${entry.feature_key}`}
																aria-label={`${layer.name} · feature ${index + 1}`}
																aria-describedby={nameId}
																value={assignment?.role ?? ""}
																onFocus={() => {
																	setSelected({
																		source: layer.source_id,
																		feature: entry.feature_key
																	});
																	setActiveSource(layer.source_id);
																}}
																onChange={event =>
																	void choose(
																		layer,
																		entry.feature_key,
																		roleSchema.parse(event.target.value)
																	)
																}>
																<option value="" disabled>
																	Choose a use
																</option>
																{roles.map(role => (
																	<option key={role} value={role}>
																		{ROLE_LABELS[role]}
																	</option>
																))}
															</Select>
														</div>
													</li>
												);
											})}
										</ul>
									)}
								</IslandSection>
							);
						})}
					</fieldset>
				</Island>
				{footer}
			</div>
		</div>
	);
}
