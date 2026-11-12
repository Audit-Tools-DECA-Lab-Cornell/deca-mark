"use client";
import { type ReactNode, useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/contour/Button";
import { Checkbox } from "@/components/contour/Checkbox";
import { Icon } from "@/components/contour/Icon";
import { InnerPanel } from "@/components/contour/InnerPanel";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { importSubmission } from "@/features/packages/project-import";
import { apiRequestError } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { formatBytes, plural } from "@/lib/labels";

import { type Address, request } from "./api";
import { FilePick } from "./FilePick";
import { createInitialImportAttempt, type InitialImportAttempt, submitInitialImport } from "./initial-import";
import { layerSchema, type Setup, setupEtag, setupSchema } from "./schema";
import { WORKSPACE_GRID } from "./workspace";

/** The input that starts a setup and, later, adds data files to it. Other parts of the step press it. */
export const ADD_FILES_INPUT = "map-source-files";
const REPLACE_INPUT = "map-replacement-files";

type Props = {
	readonly address: Address;
	readonly setup: Setup | null;
	readonly expectedCurrent: string | null;
	readonly onImported: (setup: Setup) => void;
	readonly onPending: (pending: boolean) => void;
	readonly beforeRead: () => Promise<Setup | null | false>;
};
const candidateSchema = z.object({
	candidate_hash: z.string(),
	layers: z.array(layerSchema),
	issues: setupSchema.shape.issues
});
type Candidate = {
	hash: string;
	requestId: string;
	layers: z.infer<typeof candidateSchema>["layers"];
	issues: z.infer<typeof candidateSchema>["issues"];
	files: Awaited<ReturnType<typeof importSubmission>>["files"];
	replaceProject: boolean;
};

const LIMITS = "Up to 64 files, 16 MB together and 20,000 map features. Imagery and QGIS styling are not imported.";

/**
 * Reading map files. Before a setup exists this is the whole first step: choose a QGIS project. Once a
 * project has been read it shrinks to one row of the layers panel, where data files can be added or the
 * project replaced; both show what was read and wait for a decision before the saved setup changes.
 */
export function Intake({ address, setup, expectedCurrent, onImported, beforeRead, onPending }: Props) {
	const [busy, setBusy] = useState(false);
	const [reading, setReading] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// A keep whose answer was lost may have been saved; it is not a file that could not be read.
	const [unconfirmed, setUnconfirmed] = useState(false);
	const [mode, setMode] = useState<"project" | "geojson">("project");
	const [uncertain, setUncertain] = useState<InitialImportAttempt | null>(null);
	const [candidate, setCandidate] = useState<Candidate | null>(null);
	const [dropping, setDropping] = useState(false);
	useEffect(() => {
		onPending(busy || candidate !== null || uncertain !== null);
		return () => onPending(false);
	}, [busy, candidate, uncertain, onPending]);
	async function submitFirst(attempt: InitialImportAttempt): Promise<void> {
		const result = await submitInitialImport(attempt, {
			create: async body =>
				setupSchema.parse(
					await request(address, "/import", {
						method: "POST",
						body: JSON.stringify(body)
					})
				)
		});
		if (result.status === "accepted") {
			setUncertain(null);
			onImported(result.setup);
			return;
		}
		if (result.status === "refused") {
			setUncertain(null);
			setError(result.failure.detail ?? result.failure.message);
			return;
		}
		setUncertain(attempt);
		setError(null);
	}
	async function read(files: readonly File[], replaceProject: boolean) {
		setUnconfirmed(false);
		setBusy(true);
		setReading(files.length === 1 ? (files[0]?.name ?? null) : plural(files.length, "file"));
		setError(null);
		try {
			const base = await beforeRead();
			if (base === false) return;
			const submission = await importSubmission(files);
			if (base) {
				const result = candidateSchema.parse(
					await request(address, `/${base.setup_id}/sources`, {
						method: "POST",
						headers: { "If-Match": setupEtag(base) },
						body: JSON.stringify({
							...submission,
							request_id: crypto.randomUUID(),
							preview: true,
							replace_project: replaceProject
						})
					})
				);
				setCandidate({
					hash: result.candidate_hash,
					requestId: crypto.randomUUID(),
					files: submission.files,
					replaceProject,
					layers: result.layers,
					issues: result.issues
				});
			} else {
				await submitFirst(createInitialImportAttempt(submission, expectedCurrent, mode, crypto.randomUUID()));
			}
		} catch (raised) {
			const failure = apiRequestError(raised);
			setError(failure.detail ?? failure.message);
		} finally {
			setBusy(false);
			setReading(null);
		}
	}
	const locked = busy || uncertain !== null || candidate !== null;
	const status = busy && (
		<p role="status" className="flex items-center gap-2 type-small text-ink-2">
			<Icon name="clock" size={16} className="shrink-0" />
			{reading ? `Reading ${reading}…` : "Reading…"}
		</p>
	);
	const failure = error && (
		<Note tone="attention" title={unconfirmed ? undefined : "The files could not be read."} live="assertive">
			{error}
			{!unconfirmed && (setup ? " Your saved draft has not changed." : " Nothing was saved.")}
		</Note>
	);

	if (!setup)
		return (
			<div className={WORKSPACE_GRID}>
				<InnerPanel
					dashed
					className="hidden min-h-88 flex-col items-center justify-center gap-3 px-6 text-center lg:flex lg:h-[min(64svh,36rem)]">
					<Icon name="map" size={24} className="text-ink-2" />
					<p className="max-w-sm type-body text-ink-2">
						Your map appears here once the project has been read.
					</p>
				</InnerPanel>
				<Island
					title="Choose your QGIS project"
					onDragOver={event => {
						if (locked) return;
						event.preventDefault();
						setDropping(true);
					}}
					onDragLeave={() => setDropping(false)}
					onDrop={event => {
						if (locked) return;
						event.preventDefault();
						setDropping(false);
						const files = Array.from(event.dataTransfer.files);
						if (files.length) void read(files, false);
					}}
					className={cx(dropping && "outline-2 outline-offset-2 outline-ink outline-dashed")}>
					<div className="flex flex-col gap-5">
						<p className="type-body text-ink-2">
							{mode === "project"
								? "Choose the project file (.qgz or .qgs). If the project keeps its layers in separate files, choose them together, or choose one ZIP that holds everything."
								: "Choose the GeoJSON files you exported from QGIS, one for each layer."}
						</p>
						<div className="flex flex-col gap-3">
							<div>
								<FilePick
									id={ADD_FILES_INPUT}
									label="QGIS project and its data files"
									variant="primary"
									icon="upload"
									disabled={locked}
									onFiles={files => void read(files, false)}>
									Choose files
								</FilePick>
							</div>
							{status}
							<p className="type-small text-ink-2">
								If a data file is missing, the next screen names it. A site outline or zones that are
								not in the project can be drawn here afterwards.
							</p>
							<p className="type-small text-ink-2">{LIMITS}</p>
						</div>
						{failure}
						{uncertain && (
							<Note
								tone="attention"
								title="We could not confirm whether the map setup started."
								live="assertive">
								<p>
									DECA Mark tried the same files twice and got no answer. Try again: it sends exactly
									the same files, so it cannot start a second setup.
								</p>
								<div className="mt-3">
									<Button
										variant="ink"
										size="sm"
										disabled={busy}
										onClick={async () => {
											setBusy(true);
											setError(null);
											try {
												await submitFirst(uncertain);
											} catch (raised) {
												const next = apiRequestError(raised);
												setError(next.detail ?? next.message);
											} finally {
												setBusy(false);
											}
										}}>
										Retry same map import
									</Button>
								</div>
							</Note>
						)}
						<div className="border-t border-rule pt-4">
							<Checkbox
								id="map-geojson-mode"
								checked={mode === "geojson"}
								disabled={locked}
								onCheckedChange={checked => setMode(checked ? "geojson" : "project")}
								description="Use this when you have exported layers but no project file.">
								I have GeoJSON files, not a QGIS project
							</Checkbox>
						</div>
					</div>
				</Island>
			</div>
		);

	const shown = setup.sources.slice(0, 3);
	const more = setup.sources.length - shown.length;
	return (
		<section aria-labelledby="map-files-heading" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="min-w-0">
					<h3 id="map-files-heading" className="type-small font-semibold text-ink">
						Map files
					</h3>
					<p className="type-small [overflow-wrap:anywhere] text-ink-2">
						{shown.length === 0
							? "No files kept"
							: shown.map((source, index) => (
									<span key={`${source.file_name}-${index}`}>
										{index > 0 && ", "}
										{source.file_name}{" "}
										<span className="type-mono-data">{formatBytes(source.size)}</span>
									</span>
								))}
						{more > 0 && ` and ${more} more`}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<FilePick
						id={ADD_FILES_INPUT}
						label="Add data files"
						size="sm"
						icon="plus"
						disabled={locked}
						onFiles={files => void read(files, false)}>
						Add data files
					</FilePick>
					<FilePick
						id={REPLACE_INPUT}
						label="Replace project"
						size="sm"
						disabled={locked}
						onFiles={files => void read(files, true)}>
						Replace project
					</FilePick>
				</div>
			</div>
			{status}
			{failure}
			{candidate && (
				<CandidateReview
					candidate={candidate}
					busy={busy}
					onCancel={() => setCandidate(null)}
					onKeep={async () => {
						setBusy(true);
						setError(null);
						setUnconfirmed(false);
						try {
							onImported(
								setupSchema.parse(
									await request(address, `/${setup.setup_id}/sources`, {
										method: "POST",
										headers: { "If-Match": setupEtag(setup) },
										body: JSON.stringify({
											files: candidate.files,
											replace_project: candidate.replaceProject,
											request_id: candidate.requestId,
											preview: false,
											candidate_hash: candidate.hash
										})
									})
								)
							);
							setCandidate(null);
						} catch (raised) {
							const next = apiRequestError(raised);
							setUnconfirmed(next.kind === "retry");
							setError(
								next.kind === "retry"
									? "The added files could not be confirmed. Your saved setup is still available."
									: (next.detail ?? next.message)
							);
						} finally {
							setBusy(false);
						}
					}}
				/>
			)}
		</section>
	);
}

function CandidateReview({
	candidate,
	busy,
	onKeep,
	onCancel
}: {
	readonly candidate: Candidate;
	readonly busy: boolean;
	readonly onKeep: () => void;
	readonly onCancel: () => void;
}): ReactNode {
	const replacing = candidate.replaceProject;
	return (
		<Note
			title={
				replacing
					? "Review the replacement project before keeping it."
					: "Review the added files before keeping them."
			}>
			<ul className="mt-2 list-disc space-y-1 pl-5 type-small">
				{candidate.layers.map(layer => (
					<li key={layer.source_id}>
						{layer.name}: {plural(layer.features.length, "feature")}
					</li>
				))}
				{candidate.issues.map(issue => (
					<li key={issue.source_id}>
						{issue.layer}: {issue.message}
					</li>
				))}
			</ul>
			<p className="mt-2 type-small">
				{replacing
					? "Keeping it replaces the project and data files you chose before. The outline and zones you have drawn stay. You will decide again how each layer is used."
					: "The outline and zones you have drawn stay. You will decide again how each layer is used."}
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<Button variant="ink" size="sm" disabled={busy} onClick={onKeep}>
					{replacing ? "Keep replacement project" : "Keep added files"}
				</Button>
				<Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
					{replacing ? "Cancel replacement" : "Cancel added files"}
				</Button>
			</div>
		</Note>
	);
}
