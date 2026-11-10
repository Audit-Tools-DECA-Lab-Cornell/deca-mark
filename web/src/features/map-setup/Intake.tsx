"use client";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { importSubmission } from "@/features/packages/project-import";
import { apiRequestError } from "@/lib/api/errors";

import { type Address, request } from "./api";
import { createInitialImportAttempt, type InitialImportAttempt, submitInitialImport } from "./initial-import";
import { layerSchema, type Setup, setupEtag, setupSchema } from "./schema";

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
export function Intake({ address, setup, expectedCurrent, onImported, beforeRead, onPending }: Props) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<"project" | "geojson">("project");
	const [uncertain, setUncertain] = useState<InitialImportAttempt | null>(null);
	const [candidate, setCandidate] = useState<{
		hash: string;
		requestId: string;
		layers: z.infer<typeof candidateSchema>["layers"];
		issues: z.infer<typeof candidateSchema>["issues"];
		files: Awaited<ReturnType<typeof importSubmission>>["files"];
	} | null>(null);
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
	async function read(files: readonly File[]) {
		setBusy(true);
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
						body: JSON.stringify({ ...submission, request_id: crypto.randomUUID(), preview: true })
					})
				);
				setCandidate({
					hash: result.candidate_hash,
					requestId: crypto.randomUUID(),
					files: submission.files,
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
		}
	}
	return (
		<section className="flex flex-col gap-4">
			<h2 className="type-heading">{setup ? "Add missing files" : "Choose QGIS project"}</h2>
			<p className="type-body text-ink-2">
				Start with a .qgz or .qgs file. If it uses files stored separately, we’ll tell you which ones to add.
				You can also choose a ZIP containing the project and its data files.
			</p>
			<label className="type-body font-semibold" htmlFor="map-source-files">
				{setup ? "Missing data files or replacement project" : "QGIS project and its data files"}
			</label>
			<input
				id="map-source-files"
				type="file"
				multiple
				disabled={busy || uncertain !== null}
				accept=".qgz,.qgs,.zip,.gpkg,.shp,.shx,.dbf,.prj,.cpg,.geojson,.json"
				className="min-h-touch type-body file:min-h-touch file:mr-3"
				onChange={event => {
					const files = Array.from(event.target.files ?? []);
					event.target.value = "";
					if (files.length) void read(files);
				}}
			/>
			<p className="type-small text-ink-2">
				Up to 64 files, 16 MB total. Imagery and QGIS styling are not imported.
			</p>
			<details>
				<summary className="min-h-touch cursor-pointer type-small">
					Use separate GeoJSON files (optional)
				</summary>
				<p className="type-small">
					Choose this for exported map features. Missing outline and zones can be drawn in the next step.
				</p>
				<Button
					variant="outline"
					disabled={busy || uncertain !== null}
					onClick={() => setMode(mode === "project" ? "geojson" : "project")}>
					{mode === "geojson" ? "Use a QGIS project instead" : "Use GeoJSON exports"}
				</Button>
				<p className="type-small">
					Current selection: {mode === "project" ? "QGIS project" : "GeoJSON exports"}
				</p>
			</details>
			{busy && <p role="status">Reading project…</p>}
			{error && (
				<Note tone="attention" title="The project could not be read." live="assertive">
					{error}
				</Note>
			)}
			{uncertain && !setup && (
				<Note tone="attention" title="We could not confirm whether the map setup started." live="assertive">
					<p>
						The exact first import was retried automatically, but DECA Mark still could not confirm it.
						Retry the same import below. It keeps the original files and request identity, so it cannot
						adopt another manager’s setup.
					</p>
					<Button
						variant="ink"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							setError(null);
							try {
								await submitFirst(uncertain);
							} catch (raised) {
								const failure = apiRequestError(raised);
								setError(failure.detail ?? failure.message);
							} finally {
								setBusy(false);
							}
						}}>
						Retry same map import
					</Button>
				</Note>
			)}
			{candidate && setup && (
				<Note title="Review the added files before keeping them.">
					<ul className="list-disc pl-5">
						{candidate.layers.map(layer => (
							<li key={layer.source_id}>
								{layer.name}: {layer.features.length} features
							</li>
						))}
						{candidate.issues.map(issue => (
							<li key={issue.source_id}>
								{issue.layer}: {issue.message}
							</li>
						))}
					</ul>
					<p>Existing drawn boundaries will be kept. You will need to review the imported features again.</p>
					<Button
						variant="ink"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							setError(null);
							try {
								onImported(
									setupSchema.parse(
										await request(address, `/${setup.setup_id}/sources`, {
											method: "POST",
											headers: { "If-Match": setupEtag(setup) },
											body: JSON.stringify({
												files: candidate.files,
												request_id: candidate.requestId,
												preview: false,
												candidate_hash: candidate.hash
											})
										})
									)
								);
								setCandidate(null);
							} catch (raised) {
								const failure = apiRequestError(raised);
								setError(
									failure.kind === "retry"
										? "The added files could not be confirmed. Your saved setup is still available."
										: (failure.detail ?? failure.message)
								);
							} finally {
								setBusy(false);
							}
						}}>
						Keep added files
					</Button>
					<Button variant="outline" onClick={() => setCandidate(null)}>
						Cancel added files
					</Button>
				</Note>
			)}
		</section>
	);
}
