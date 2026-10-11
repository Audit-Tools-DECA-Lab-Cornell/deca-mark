"use client";

import { useId, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Note } from "@/components/contour/Note";
import { importQgisProject } from "@/lib/api/browser";
import { apiRequestError } from "@/lib/api/errors";
import type { ProjectImportResult } from "@/lib/api/types";
import { LayerReadError } from "@/lib/packages";

import { importSubmission } from "./project-import";

export function ProjectImport({
	projectId,
	disabled,
	onImported,
	onBusy
}: {
	readonly projectId: string;
	readonly disabled: boolean;
	readonly onImported: (result: ProjectImportResult, files: readonly File[]) => Promise<void>;
	readonly onBusy: (busy: boolean) => void;
}) {
	const id = useId();
	const [files, setFiles] = useState<File[]>([]);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<ProjectImportResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const hasProject = files.some(file => /\.(qgz|qgs|zip)$/i.test(file.name));

	async function read() {
		setBusy(true);
		onBusy(true);
		setError(null);
		setResult(null);
		try {
			const imported = await importQgisProject(projectId, await importSubmission(files));
			await onImported(imported, files);
			setResult(imported);
		} catch (raised) {
			const failure = apiRequestError(raised);
			setError(raised instanceof LayerReadError ? raised.message : (failure.detail ?? failure.message));
		} finally {
			setBusy(false);
			onBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="type-body font-semibold">Start with your QGIS project</p>
			<p className="type-small text-ink-2">
				Choose a .qgz or .qgs file. Include any GeoPackage or shapefiles it uses, or choose a ZIP of the project
				folder. GeoJSON exports are optional and replace matching project layers.
			</p>
			<Field
				label="QGIS project and source files"
				htmlFor={id}
				hint="Up to 64 files totalling 16 MB. Include only the project and its vector layers.">
				<input
					id={id}
					type="file"
					multiple
					accept=".qgz,.qgs,.zip,.gpkg,.shp,.shx,.dbf,.prj,.cpg,.geojson,.json"
					disabled={disabled || busy}
					className="block w-full type-small file:mr-3 file:min-h-control-sm file:rounded-pill file:border-2 file:border-ink file:bg-island file:px-4 file:py-2 file:font-semibold file:text-ink"
					onChange={event => {
						const chosen = Array.from(event.target.files ?? []);
						setFiles(current => [
							...current.filter(file => !chosen.some(next => next.name === file.name)),
							...chosen
						]);
						setResult(null);
						setError(null);
						event.target.value = "";
					}}
				/>
			</Field>
			{files.length > 0 && (
				<div className="flex flex-wrap items-center gap-3">
					<p className="min-w-0 flex-1 type-small wrap-break-word">
						{files.map(file => file.name).join(", ")}
					</p>
					<Button
						variant="outline"
						size="sm"
						disabled={disabled || busy}
						onClick={() => {
							setFiles([]);
							setResult(null);
							setError(null);
						}}>
						Clear selection
					</Button>
				</div>
			)}
			<div>
				<Button
					variant="ink"
					busy={busy}
					busyLabel="Reading project…"
					disabled={disabled || !hasProject}
					onClick={() => void read()}>
					Read project
				</Button>
			</div>
			<p className="type-small text-ink-2">
				Reading sends these files for conversion. Review the layers below before saving a map package. Imagery
				and QGIS styling are not imported.
			</p>
			{error && (
				<Note tone="attention" title="The project could not be read." live="assertive">
					{error}
				</Note>
			)}
			{result && (
				<Note
					title={`${result.layers.length} ${result.layers.length === 1 ? "layer" : "layers"} read. Nothing saved yet.`}
					live="polite">
					{result.layers.length > 0 && (
						<p>
							Check the ground and zones below. Assign any unmatched layers to their slots, or choose
							GeoJSON files to replace them.
						</p>
					)}
					{result.issues.length > 0 && (
						<ul className="mt-2 list-disc pl-5">
							{result.issues.map((issue, index) => (
								<li key={`${issue.layer}-${index}`}>
									<strong>{issue.layer}:</strong> {issue.message}
								</li>
							))}
						</ul>
					)}
				</Note>
			)}
		</div>
	);
}
