"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Icon } from "@/components/contour/Icon";
import { InnerPanel } from "@/components/contour/InnerPanel";
import { Island, IslandSection } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { StateBadge } from "@/components/contour/StateBadge";
import { Textarea } from "@/components/contour/Textarea";
import { MapFrame } from "@/components/map/MapFrame";
import { preparePackage } from "@/lib/api/browser";
import { apiRequestError, wasRefused } from "@/lib/api/errors";
import type { PackageSubmission, ProjectImportResult, Publication, SiteZone } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { newId } from "@/lib/ids";
import { formatBytes, plural } from "@/lib/labels";
import {
	analyzeLayer,
	canUpload,
	LAYER_NAMES,
	type LayerName,
	LayerReadError,
	type LayerSlotState,
	matchSlot,
	type ProjectSlotState,
	readLayer,
	readProjectFile,
	REQUIRED_LAYERS,
	runClientChecks,
	SLOT_LABELS,
	SLOT_ORDER,
	type SlotTarget,
	submissionLayers,
	type UnassignedFile,
	unexpectedGeometry
} from "@/lib/packages";
import { issueText } from "@/lib/zones/issues";

import { packageUploaded } from "./actions";
import { CheckBadge } from "./CheckBadge";
import type { PublishedVersion } from "./forms";
import {
	choose,
	type CurrentZone,
	identityMap,
	initialMapping,
	mappingProblems,
	type MappingRow,
	namedZonesLayer,
	sourceZones
} from "./identity";
import { importedFiles, importedProject, normalizeImportedLayer } from "./project-import";
import { ProjectImport } from "./ProjectImport";
import { previewPlan } from "./upload-preview";
import { ZoneMapping } from "./ZoneMapping";

const ACCEPT = ".json,.geojson,application/json,application/geo+json,.qgz,.qgs";

const EMPTY_SLOTS: Record<LayerName, LayerSlotState> = {
	ground: { kind: "empty" },
	paths: { kind: "empty" },
	trees: { kind: "empty" },
	zones: { kind: "empty" }
};

function SlotBadge({ name, slot }: { name: LayerName; slot: LayerSlotState }) {
	if (slot.kind === "empty") return <span className="type-small text-ink-2">Not chosen</span>;
	if (slot.kind === "reading") return <StateBadge kind="check" state="checking" label="Reading" size="sm" />;
	if (slot.kind === "error") return <StateBadge kind="check" state="fails" label="Unreadable" size="sm" />;
	return unexpectedGeometry(name, slot.analysis).length > 0 || slot.analysis.withoutGeometry > 0 ? (
		<StateBadge kind="check" state="fails" label="Wrong shapes" size="sm" />
	) : (
		<StateBadge kind="check" state="passes" label="Ready" size="sm" />
	);
}

/** A file input dressed as a small outline button, so every slot can be filled without a mouse. */
function FilePick({
	id,
	label,
	accept,
	multiple = false,
	disabled = false,
	onFiles,
	children
}: {
	id: string;
	label: string;
	accept: string;
	multiple?: boolean;
	disabled?: boolean;
	onFiles: (files: File[]) => void;
	children: string;
}) {
	return (
		<>
			<input
				id={id}
				type="file"
				multiple={multiple}
				disabled={disabled}
				accept={accept}
				aria-label={label}
				className="peer sr-only"
				onChange={event => {
					onFiles(Array.from(event.target.files ?? []));
					event.target.value = "";
				}}
			/>
			<label
				htmlFor={id}
				className={cx(
					"relative inline-flex min-h-control-sm cursor-pointer items-center justify-center gap-2 rounded-pill border-2 border-ink bg-island px-4 py-1.5 text-sm font-semibold text-ink",
					"transition-[background-color] duration-(--ct-duration-quick) ease-standard hover:bg-well",
					"peer-disabled:cursor-not-allowed peer-disabled:border-transparent peer-disabled:bg-well peer-disabled:text-ink-2 peer-disabled:hover:bg-well",
					"before:absolute before:inset-x-0 before:-inset-y-1",
					"peer-focus-visible:outline-(length:--ct-size-focus-ring) peer-focus-visible:outline-offset-(--ct-size-focus-gap) peer-focus-visible:outline-focus peer-focus-visible:outline-solid"
				)}>
				{children}
			</label>
		</>
	);
}

const UNCONFIRMED_UPLOAD_COPY =
	"DECA Mark could not confirm the upload. Check the history below for a new version before you upload again: uploading the same files again finds the version it made.";

/** The longest change note a version keeps. */
const CHANGE_NOTE_MAX = 2000;

/** The inventory choice that keeps the current map's inventory form (the request then leaves it out). */
const KEEP_INVENTORY = "~keep";
const EMPTY_ROWS: MappingRow[] = [];
const NO_INVENTORY = "~none";

/**
 * Why the upload failed, in words: a file problem, or DECA Mark's reason, naming the zones of the file it
 * is about. With no answer from DECA Mark, or a failure on its side, the package may have arrived, and
 * `confirmed` is false so the screen does not say it was not uploaded.
 */
function uploadProblem(
	error: unknown,
	rows: readonly MappingRow[],
	current: readonly CurrentZone[]
): { message: string; confirmed: boolean; formVersion?: string } {
	if (error instanceof LayerReadError) return { message: error.message, confirmed: true };
	const failure = apiRequestError(error);
	if (failure.code === "storage_unavailable" && failure.status === 503)
		return {
			message: "Not uploaded. The map could not be saved. Your files stay chosen. Try again.",
			confirmed: true
		};
	if (!wasRefused(failure)) return { message: UNCONFIRMED_UPLOAD_COPY, confirmed: false };
	if (failure.code === "publication_conflict") {
		const version = failure.conflict?.currentPackageVersion;
		return {
			message: `Not uploaded. ${version ? `Map v${version} was published meanwhile.` : "The site's current map changed meanwhile."} Read the current version and choose each zone again.`,
			confirmed: true
		};
	}
	if (failure.issues.length > 0) {
		// Name each zone by the file's id: an issue points at a mapping entry, or names zone identities.
		const sent = identityMap(rows, current);
		const nameOf = (zoneId: string) => sent.find(entry => entry.zone_id === zoneId)?.source_feature_id ?? null;
		const lines = failure.issues.map(issue => {
			const entry = /^\/zone_identity_map\/(\d+)/.exec(issue.path);
			const fromPath = entry ? sent[Number(entry[1])]?.source_feature_id : undefined;
			const names = [
				...(fromPath ? [`Zone ${fromPath}`] : []),
				...issue.zoneIds.flatMap(zoneId => {
					const name = nameOf(zoneId.toLowerCase());
					return name && name !== fromPath ? [`Zone ${name}`] : [];
				})
			];
			return issueText(issue.code, names);
		});
		return { message: `Not uploaded. ${[...new Set(lines)].join(" ")}`, confirmed: true };
	}
	return {
		// A rejected package carries a message that names the layer and the problem; show it.
		message: failure.code === "validation_failed" ? (failure.detail ?? failure.message) : failure.message,
		confirmed: true,
		...(failure.fields.form_version ? { formVersion: failure.fields.form_version } : {})
	};
}

export function UploadStep({
	org,
	project,
	projectId,
	siteId,
	siteName,
	currentPackageId,
	currentZones,
	currentInventoryFormVersion,
	forms,
	inventoryForms,
	defaultFormVersion,
	defaultInventoryFormVersion,
	packagesHref
}: {
	org: string;
	project: string;
	projectId: string;
	siteId: string;
	siteName: string;
	/** The site's current package, which the upload must follow: null before its first. */
	currentPackageId: string | null;
	/** The current version's zones, which the file's zones are mapped to. */
	currentZones: readonly SiteZone[];
	/** The inventory form the current version binds, or null. */
	currentInventoryFormVersion: string | null;
	/** Published form versions, the most recent first. */
	forms: PublishedVersion[];
	/** The published versions that ask only about a zone: the only ones a map can take as its inventory form. */
	inventoryForms: PublishedVersion[];
	defaultFormVersion: string;
	/** On a site's first upload, the inventory form to start on; null starts with Inventory off. */
	defaultInventoryFormVersion: string | null;
	/** The packages page, for the link to the version just prepared. */
	packagesHref: string;
}) {
	const router = useRouter();
	const fieldId = useId();
	const nextId = useRef(0);

	const [formVersion, setFormVersion] = useState(defaultFormVersion);
	const [slots, setSlots] = useState<Record<LayerName, LayerSlotState>>(EMPTY_SLOTS);
	const [projectSlot, setProjectSlot] = useState<ProjectSlotState>({ kind: "empty" });
	const [unassigned, setUnassigned] = useState<readonly UnassignedFile[]>([]);
	const [dragging, setDragging] = useState(false);
	const [uploading, setBusy] = useState(false);
	const [importing, setImporting] = useState(false);
	const [importReset, setImportReset] = useState(0);
	const busy = uploading || importing;
	const convertedFiles = useRef(new WeakSet<File>());
	const [error, setError] = useState<string | null>(null);
	const [uncertain, setUncertain] = useState(false);
	const [formVersionProblem, setFormVersionProblem] = useState<string | null>(null);
	const [result, setResult] = useState<Publication | null>(null);
	const [changeNote, setChangeNote] = useState("");
	const [inventory, setInventory] = useState(
		currentPackageId ? KEEP_INVENTORY : (defaultInventoryFormVersion ?? NO_INVENTORY)
	);

	// The last request sent, kept while its answer is unknown: sending again sends it unchanged (same request
	// ID, same expected current map, same identities), so if it did arrive DECA Mark answers with the version
	// it made instead of making another.
	const [unanswered, setUnanswered] = useState<{
		submission: PackageSubmission;
		inputs: readonly unknown[];
		current: CurrentZone[];
	} | null>(null);
	// A changed request after an unknown answer is still checked against the map that request expected, so if
	// the first one did arrive, DECA Mark refuses the second instead of applying it to the newer map.
	const expectedPackageId = unanswered ? unanswered.submission.expected_current_package_id : currentPackageId;

	// The current version's zones, which each zone of the file is mapped to (held still while an answer is
	// unknown, so the page reading the history again does not change the request).
	const liveCurrent = useMemo<CurrentZone[]>(
		() => currentZones.map(zone => ({ zoneId: zone.zone_id, code: zone.zone_code, label: zone.label })),
		[currentZones]
	);
	const current = unanswered?.current ?? liveCurrent;
	// The mapping starts again whenever the zones file or the current version changes.
	const zonesLayer = slots.zones.kind === "ready" ? slots.zones.collection : null;
	const [mapping, setMapping] = useState<{
		layer: typeof zonesLayer;
		against: CurrentZone[];
		rows: MappingRow[];
	}>({ layer: null, against: current, rows: [] });
	const stale = mapping.layer !== zonesLayer || mapping.against !== current;
	if (stale)
		setMapping({
			layer: zonesLayer,
			against: current,
			rows: zonesLayer ? initialMapping(sourceZones(zonesLayer.features), current, newId) : []
		});
	const rows = stale ? EMPTY_ROWS : mapping.rows;
	const problems = useMemo(() => mappingProblems(rows, current), [rows, current]);
	const inputs = [slots, projectSlot, rows, changeNote, formVersion, inventory];
	const resending =
		unanswered !== null &&
		unanswered.inputs.length === inputs.length &&
		unanswered.inputs.every((input, index) => input === inputs[index]);

	const clientChecks = useMemo(() => runClientChecks(slots, projectSlot), [slots, projectSlot]);
	const plan = useMemo(() => previewPlan(siteName, slots), [siteName, slots]);

	async function assignLayer(name: LayerName, file: File) {
		setSlots(current => ({ ...current, [name]: { kind: "reading", file } }));
		try {
			const read = await readLayer(file);
			const collection = convertedFiles.current.has(file) ? normalizeImportedLayer(name, read) : read;
			setSlots(current => ({
				...current,
				[name]: { kind: "ready", file, collection, analysis: analyzeLayer(collection) }
			}));
		} catch (raised) {
			const message = raised instanceof LayerReadError ? raised.message : `${file.name} could not be read.`;
			setSlots(current => ({ ...current, [name]: { kind: "error", file, message } }));
		}
	}

	async function acceptImport(imported: ProjectImportResult, originals: readonly File[]) {
		const nextSlots = { ...slots };
		for (const name of LAYER_NAMES) {
			const slot = nextSlots[name];
			if (slot.kind !== "empty" && convertedFiles.current.has(slot.file)) nextSlots[name] = { kind: "empty" };
		}
		const parked = unassigned.filter(entry => !convertedFiles.current.has(entry.file));
		for (const file of importedFiles(imported, originals)) {
			const converted = !originals.includes(file);
			if (converted) convertedFiles.current.add(file);
			const name = matchSlot(file.name);
			if (name && name !== "project" && (nextSlots[name].kind === "empty" || !converted)) {
				const read = await readLayer(file);
				const collection = converted ? normalizeImportedLayer(name, read) : read;
				nextSlots[name] = { kind: "ready", file, collection, analysis: analyzeLayer(collection) };
			} else {
				nextId.current += 1;
				parked.push({ id: `file-${nextId.current}`, file, guess: name });
			}
		}
		setSlots(nextSlots);
		setUnassigned(parked);
		setProjectSlot({ kind: "ready", file: importedProject(imported) });
		setResult(null);
		setError(null);
	}

	/** A whole drop or selection at once: files whose name matches a free slot go there; the rest wait. */
	function ingestFiles(incoming: File[]) {
		if (incoming.length === 0 || busy) return;
		setResult(null);
		setError(null);
		const claimedLayers = new Set<LayerName>(
			LAYER_NAMES.filter(name => {
				const slot = slots[name];
				return slot.kind !== "empty" && !convertedFiles.current.has(slot.file);
			})
		);
		let claimedProject = projectSlot.kind !== "empty";
		const parked: UnassignedFile[] = [];
		for (const file of incoming) {
			const guess = matchSlot(file.name);
			if (guess === "project" && !claimedProject) {
				claimedProject = true;
				setProjectSlot({ kind: "ready", file });
				continue;
			}
			if (guess !== null && guess !== "project" && !claimedLayers.has(guess)) {
				claimedLayers.add(guess);
				void assignLayer(guess, file);
				continue;
			}
			nextId.current += 1;
			parked.push({ id: `file-${nextId.current}`, file, guess });
		}
		if (parked.length > 0) setUnassigned(current => [...current, ...parked]);
	}

	function assignUnassigned(id: string, target: SlotTarget) {
		const entry = unassigned.find(item => item.id === id);
		if (!entry) return;
		setUnassigned(current => current.filter(item => item.id !== id));
		if (target === "project") setProjectSlot({ kind: "ready", file: entry.file });
		else void assignLayer(target, entry.file);
	}

	function onDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragging(false);
		// The files being uploaded are fixed until the upload ends; a drop is still caught so the browser does not open it.
		if (!busy) ingestFiles(Array.from(event.dataTransfer.files));
	}

	const missing = REQUIRED_LAYERS.filter(name => slots[name].kind !== "ready");
	const reading = LAYER_NAMES.some(name => slots[name].kind === "reading");
	const blocked = clientChecks.some(check => check.state === "blocked");
	const ready = canUpload(slots, clientChecks) && formVersion !== "" && problems.size === 0 && rows.length > 0;

	const reason = importing
		? "Wait for the project to finish reading."
		: ready
			? null
			: missing.length > 0
				? `The button turns on when ${missing.map(name => SLOT_LABELS[name].toLowerCase()).join(" and ")} ${missing.length === 1 ? "is" : "are"} chosen.`
				: reading
					? "The button turns on when your files have been read."
					: blocked
						? "A check below blocks this package. Fix the export in QGIS and choose the file again."
						: problems.size > 0
							? "Choose which zone each zone in the file is."
							: "Choose a form version.";

	async function send() {
		setBusy(true);
		setError(null);
		setUncertain(false);
		setFormVersionProblem(null);
		setResult(null);
		try {
			const layers = submissionLayers(slots);
			const submission: PackageSubmission =
				resending && unanswered
					? unanswered.submission
					: {
							site_id: siteId,
							request_id: newId(),
							expected_current_package_id: expectedPackageId,
							form_version: formVersion,
							// Left out, the current map's inventory form carries over (none on a site's first map).
							...(inventory === KEEP_INVENTORY
								? {}
								: { inventory_form_version: inventory === NO_INVENTORY ? null : inventory }),
							layers: {
								...layers,
								...(layers.zones ? { zones: namedZonesLayer(layers.zones as never) } : {})
							},
							zone_identity_map: identityMap(rows, current),
							change_note: changeNote.trim(),
							...(projectSlot.kind === "ready"
								? { project_file: await readProjectFile(projectSlot.file) }
								: {})
						};
			// The attempt (and the zones its mapping was made against) is kept until DECA Mark answers it: a
			// resend that is also lost keeps the same one, so the next resend still replays it.
			let prepared: Publication;
			try {
				prepared = await preparePackage(projectId, submission);
			} catch (raised) {
				// No answer, or a failure on DECA Mark's side: it may have arrived, so the request is kept to resend.
				const unknown = !(raised instanceof LayerReadError) && !wasRefused(apiRequestError(raised));
				setUnanswered(
					unknown ? (resending && unanswered ? unanswered : { submission, inputs, current }) : null
				);
				throw raised;
			}
			setUnanswered(null);
			setResult(prepared);
			setChangeNote("");
			// The files are uploaded: clear them so one press cannot make the same version twice.
			setSlots(EMPTY_SLOTS);
			setProjectSlot({ kind: "empty" });
			setUnassigned([]);
			setImportReset(current => current + 1);
			// Everything that shows this site's current package refreshes, then this page does.
			await packageUploaded({ org, project }).catch(() => undefined);
			router.refresh();
		} catch (raised) {
			const problem = uploadProblem(raised, rows, current);
			setError(problem.message);
			setUncertain(!problem.confirmed);
			if (problem.formVersion) setFormVersionProblem(problem.formVersion);
			if (!problem.confirmed) {
				// It may have arrived: show the history as it is now, keeping the chosen files.
				await packageUploaded({ org, project }).catch(() => undefined);
				router.refresh();
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
			<Island flush divided title="Upload from QGIS" meta="Ground and zones are required">
				<IslandSection className="pt-5">
					<ProjectImport
						key={importReset}
						projectId={projectId}
						disabled={uploading}
						onImported={acceptImport}
						onBusy={setImporting}
					/>
				</IslandSection>
				<IslandSection className="pt-5">
					<Field
						label="Form version"
						htmlFor={`${fieldId}-form`}
						hint="The published form observers use with this map."
						error={formVersionProblem}>
						<Select value={formVersion} onChange={event => setFormVersion(event.target.value)}>
							{forms.map(version => (
								<option key={version.code} value={version.code}>
									{version.formName} · {version.code}
								</option>
							))}
						</Select>
					</Field>
					<Field
						label="Inventory form"
						htmlFor={`${fieldId}-inventory`}
						className="mt-4"
						hint={
							inventoryForms.length > 0
								? "The published form observers use for a whole-zone inventory. Only forms that ask about a zone alone are offered. Without one, Inventory is off on this map."
								: "No published form asks about a zone alone, so Inventory stays as it is or is off on this map."
						}>
						<Select
							id={`${fieldId}-inventory`}
							value={inventory}
							onChange={event => setInventory(event.target.value)}>
							{currentPackageId && (
								<option value={KEEP_INVENTORY}>
									{currentInventoryFormVersion
										? `Keep the current one · ${currentInventoryFormVersion}`
										: "Keep the current choice · none"}
								</option>
							)}
							<option value={NO_INVENTORY}>None: no Inventory on this map</option>
							{inventoryForms.map(version => (
								<option key={version.code} value={version.code}>
									{version.formName} · {version.code}
								</option>
							))}
						</Select>
					</Field>
				</IslandSection>

				<IslandSection className="pt-1 pb-5">
					<div
						onDragOver={event => {
							event.preventDefault();
							setDragging(!busy);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={onDrop}>
						<InnerPanel
							dashed={!dragging}
							className={cx(
								"flex flex-col items-center gap-3 px-6 py-8 text-center transition-[background-color,border-color] duration-(--ct-duration-quick) ease-standard",
								dragging && "border-2 border-ink bg-well"
							)}>
							<span className="grid size-12 place-items-center rounded-pill bg-well text-ink">
								<Icon name="upload" size={22} />
							</span>
							<p className="type-body font-semibold text-ink">Add or replace layers with GeoJSON</p>
							<p className="max-w-md type-small text-ink-2">
								Optional after reading a project. You can also upload ground and zones directly, with
								paths and trees if needed. Files are matched to their slot by name.
							</p>
							<FilePick
								id={`${fieldId}-files`}
								label="Choose files from the QGIS export"
								accept={ACCEPT}
								multiple
								disabled={busy}
								onFiles={ingestFiles}>
								Choose files
							</FilePick>
						</InnerPanel>
					</div>
				</IslandSection>

				<ul aria-label="Package files" className="border-t border-rule">
					{SLOT_ORDER.map(name => {
						const slot = slots[name];
						return (
							<li
								key={name}
								className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-island-pad py-3">
								<span className="w-28 shrink-0">
									<span className="block type-body font-semibold text-ink">{SLOT_LABELS[name]}</span>
									<span className="block type-small text-ink-2">
										{REQUIRED_LAYERS.includes(name) ? "Required" : "Optional"}
									</span>
								</span>
								<span className="min-w-0 flex-1 basis-40">
									<span className="block type-mono-data break-all text-ink" translate="no">
										{slot.kind === "empty" ? "—" : slot.file.name}
									</span>
									<span className="block type-small text-ink-2">
										{slot.kind === "empty"
											? "No file yet"
											: slot.kind === "ready"
												? `${formatBytes(slot.file.size)} · ${plural(slot.analysis.featureCount, "feature")} · ${slot.analysis.geometryTypes.join(", ") || "no shapes"}`
												: slot.kind === "error"
													? slot.message
													: formatBytes(slot.file.size)}
									</span>
								</span>
								<SlotBadge name={name} slot={slot} />
								<span className="flex shrink-0 items-center gap-2">
									<FilePick
										id={`${fieldId}-slot-${name}`}
										label={`${slot.kind === "empty" ? "Choose" : "Replace"} the ${SLOT_LABELS[name]} file`}
										accept={ACCEPT}
										disabled={busy}
										onFiles={([file]) => file && void assignLayer(name, file)}>
										{slot.kind === "empty" ? "Choose" : "Replace"}
									</FilePick>
									{slot.kind !== "empty" && (
										<Button
											variant="outline"
											size="sm"
											aria-label={`Remove the ${SLOT_LABELS[name]} file`}
											disabled={busy}
											onClick={() =>
												setSlots(current => ({ ...current, [name]: { kind: "empty" } }))
											}>
											Remove
										</Button>
									)}
								</span>
							</li>
						);
					})}
					<li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-island-pad py-3">
						<span className="w-28 shrink-0">
							<span className="block type-body font-semibold text-ink">{SLOT_LABELS.project}</span>
							<span className="block type-small text-ink-2">Optional</span>
						</span>
						<span className="min-w-0 flex-1 basis-40">
							<span className="block type-mono-data break-all text-ink" translate="no">
								{projectSlot.kind === "empty" ? "—" : projectSlot.file.name}
							</span>
							<span className="block type-small text-ink-2">
								{projectSlot.kind === "empty"
									? "Without it, the project and imagery checks are skipped."
									: formatBytes(projectSlot.file.size)}
							</span>
						</span>
						{projectSlot.kind === "ready" ? (
							<StateBadge kind="check" state="passes" label="Ready" size="sm" />
						) : (
							<span className="type-small text-ink-2">Not chosen</span>
						)}
						<span className="flex shrink-0 items-center gap-2">
							<FilePick
								id={`${fieldId}-slot-project`}
								label={`${projectSlot.kind === "empty" ? "Choose" : "Replace"} the QGIS project file`}
								accept=".qgz,.qgs"
								disabled={busy}
								onFiles={([file]) => file && setProjectSlot({ kind: "ready", file })}>
								{projectSlot.kind === "empty" ? "Choose" : "Replace"}
							</FilePick>
							{projectSlot.kind !== "empty" && (
								<Button
									variant="outline"
									size="sm"
									aria-label="Remove the QGIS project file"
									disabled={busy}
									onClick={() => setProjectSlot({ kind: "empty" })}>
									Remove
								</Button>
							)}
						</span>
					</li>
				</ul>

				{unassigned.length > 0 && (
					<IslandSection className="flex flex-col gap-3 pt-5">
						<p className="type-mono-label text-ink-2">Not matched by name</p>
						{unassigned.map(entry => (
							<div key={entry.id} className="flex flex-wrap items-end gap-3">
								<Field
									label={<span className="type-mono-data break-all">{entry.file.name}</span>}
									htmlFor={`${fieldId}-unassigned-${entry.id}`}
									className="min-w-0 flex-1 basis-56">
									<Select
										defaultValue={entry.guess ?? ""}
										disabled={busy}
										onChange={event => {
											const value = event.target.value;
											if (value !== "") assignUnassigned(entry.id, value as SlotTarget);
										}}>
										<option value="" disabled>
											Choose its slot
										</option>
										{SLOT_ORDER.map(name => (
											<option key={name} value={name}>
												{SLOT_LABELS[name]}
											</option>
										))}
										<option value="project">{SLOT_LABELS.project}</option>
									</Select>
								</Field>
								<Button
									variant="outline"
									icon="x"
									disabled={busy}
									onClick={() =>
										setUnassigned(current => current.filter(item => item.id !== entry.id))
									}>
									Discard file
								</Button>
							</div>
						))}
					</IslandSection>
				)}

				{rows.length > 0 && (
					<ZoneMapping
						rows={rows}
						current={current}
						problems={problems}
						disabled={busy || resending}
						onChoose={(sourceId, choice) =>
							setMapping(state => ({ ...state, rows: choose(state.rows, sourceId, choice, newId) }))
						}
					/>
				)}

				<IslandSection className="flex flex-col gap-4 pt-5 pb-island-pad">
					<Field
						label="What changed"
						htmlFor={`${fieldId}-note`}
						hint="Recommended. Kept with the version, for whoever reads its history."
						counter={`${changeNote.length} of ${CHANGE_NOTE_MAX}`}>
						<Textarea
							id={`${fieldId}-note`}
							value={changeNote}
							maxLength={CHANGE_NOTE_MAX}
							rows={2}
							disabled={busy || resending}
							onChange={event => setChangeNote(event.target.value)}
						/>
					</Field>
					<div className="flex flex-col items-start gap-2">
						<Button
							variant="primary"
							icon="upload"
							busy={uploading}
							busyLabel="Uploading…"
							disabled={reason !== null}
							disabledReason={reason ?? undefined}
							onClick={() => void send()}>
							{resending ? "Upload package again" : "Upload package"}
						</Button>
						<p className="type-small text-ink-2">
							{resending
								? "This sends the same package again. If the first one arrived, DECA Mark shows the version it made instead of making another."
								: "The package is sent to DECA Mark as you. It becomes the site’s next version once its checks pass."}
						</p>
					</div>

					{error && (
						<Note
							tone="attention"
							title={
								uncertain ? "The package may not have been uploaded." : "The package was not uploaded."
							}
							live="assertive">
							{error} Your files are still chosen here.
						</Note>
					)}
				</IslandSection>
			</Island>

			<div className="flex min-w-0 flex-col gap-6">
				{result && <ServerResult result={result} siteName={siteName} packagesHref={packagesHref} />}

				{plan && (
					<section aria-label="Chosen files on a plan" className="flex flex-col gap-3">
						<MapFrame
							site={plan}
							mapVersion="to upload"
							title="Chosen files"
							subtitle="Read in this browser, not uploaded yet"
						/>
						<p className="type-small text-ink-2">
							A plan drawn from the chosen layers. The site changes only when you upload the package.
						</p>
					</section>
				)}

				<Island
					flush
					title="Checked in this browser"
					meta={clientChecks.length > 0 ? undefined : "Waiting for files"}>
					{clientChecks.length === 0 ? (
						<p className="px-island-pad pb-island-pad type-body text-ink-2">
							Checks appear once a layer is chosen. DECA Mark runs its own checks after the upload.
						</p>
					) : (
						<ul className="border-t border-rule">
							{clientChecks.map(check => (
								<li
									key={check.id}
									className="flex items-start justify-between gap-4 border-b border-rule px-island-pad py-3 last:border-b-0">
									<span className="min-w-0">
										<span className="block type-body font-semibold text-ink">{check.label}</span>
										<span className="block type-small break-words text-ink-2">{check.detail}</span>
									</span>
									<CheckBadge state={check.state} />
								</li>
							))}
						</ul>
					)}
				</Island>
			</div>
		</div>
	);
}

/**
 * What DECA Mark made of the upload: the version it published. A request sent again returns the version
 * it made the first time, which a later version may have replaced, so the page says which one is current.
 */
function ServerResult({
	result,
	siteName,
	packagesHref
}: {
	result: Publication;
	siteName: string;
	packagesHref: string;
}) {
	const pkg = result.package;
	const isCurrent = result.current_package_id === pkg.package_id;
	return (
		<Island
			flush
			title="Uploaded to DECA Mark"
			meta={<StateBadge kind="package" state={isCurrent ? "active" : "archived"} />}
			aria-live="polite">
			<p className="border-t border-rule px-island-pad py-3 type-mono-data text-ink">
				{siteName} · v{pkg.package_version} · {plural(pkg.zone_count, "zone")} ·{" "}
				{formatBytes(pkg.archive_bytes)}
			</p>
			<IslandSection className="flex flex-col gap-3 pt-4 pb-island-pad">
				<Note tone="saved">
					{isCurrent
						? `Version ${pkg.package_version} is the site's current map. Observers get it the next time they make the site ready offline in the DECA Mark app.`
						: `This package was uploaded earlier as version ${pkg.package_version}. A later version is the site's current map now.`}
				</Note>
				{result.replayed && (
					<p className="type-small text-ink-2">
						The same package had already arrived, so no new version was made.
					</p>
				)}
				<Link
					href={`${packagesHref}?package=${pkg.package_id}`}
					prefetch={false}
					className="font-semibold text-accent underline-offset-4 hover:underline">
					See version {pkg.package_version}
				</Link>
			</IslandSection>
		</Island>
	);
}
