"use client";

import { useState } from "react";

import { Button } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Note } from "@/components/contour/Note";
import { RadioRows } from "@/components/contour/RadioRows";
import { useToast } from "@/components/contour/Toast";
import { downloadObservationExport } from "@/lib/api/browser";
import { apiRequestError } from "@/lib/api/errors";
import type { ObservationFilters } from "@/lib/api/types";
import { EXPORT_TOO_LARGE, exportAction, exportBlocked, exportFileName } from "@/lib/export/files";
import { formatCount } from "@/lib/labels";

type Format = "csv" | "geojson";

export type ExportObservationsProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	/** The filters the page applies; the export covers every observation they match. */
	filters: ObservationFilters;
	/** How many observations match them, as DECA Mark counted. */
	matching: number;
	/** Whether a search narrows the loaded observations on the page (the export does not search). */
	searched: boolean;
	/** The filters in words, one line each. */
	scope: readonly string[];
	/** The site's code, or the project's: the start of the file's name. */
	fileStem: string;
	/** Today in the project's time zone, for the file's name. */
	dayKey: string;
};

/** What a failed export says: the size limit in the same words as the disabled button, otherwise the cause. */
function exportFailure(error: unknown): string {
	const failure = apiRequestError(error);
	return failure.issues.some(issue => issue.code === "export_scope_too_large") ? EXPORT_TOO_LARGE : failure.message;
}

/**
 * Export: DECA Mark writes every observation the filters match into one ZIP, as CSV or GeoJSON, with a
 * codebook of every column, the forms the answers were given with and the zone boundaries each record was
 * collected on. The dialog repeats the scope, says the search is not applied, and refuses more than 10,000.
 */
export function ExportObservations({
	open,
	onOpenChange,
	projectId,
	filters,
	matching,
	searched,
	scope,
	fileStem,
	dayKey
}: ExportObservationsProps) {
	const { toast } = useToast();
	const [format, setFormat] = useState<Format>("csv");
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const blocked = exportBlocked(matching);

	async function download() {
		setBusy(true);
		setProblem(null);
		const fileName = exportFileName(fileStem, dayKey);
		try {
			await downloadObservationExport(projectId, filters, format, fileName);
			onOpenChange(false);
			toast({ title: `Download started: ${fileName}`, tone: "saved" });
		} catch (error) {
			setProblem(exportFailure(error));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (!next) setProblem(null);
				onOpenChange(next);
			}}
			title="Export observations"
			description={`Every observation these filters match: ${formatCount(matching)}, counted by DECA Mark.`}
			footer={
				<>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button
						variant="primary"
						icon="download"
						busy={busy}
						busyLabel="Preparing the file…"
						disabled={blocked !== null}
						disabledReason={blocked ?? undefined}
						onClick={() => void download()}>
						{exportAction(matching)}
					</Button>
				</>
			}>
			<div className="flex flex-col gap-5">
				<RadioRows
					label="File type"
					value={format}
					onValueChange={value => setFormat(value as Format)}
					options={[
						{
							value: "csv",
							label: "CSV",
							description: "One row per observation, with longitude and latitude columns, for Excel or R."
						},
						{
							value: "geojson",
							label: "GeoJSON",
							description:
								"One feature per observation with its answers, for QGIS. Inventories describe a whole zone and have no point."
						}
					]}
				/>
				<div className="flex flex-col gap-1">
					<p className="type-small font-semibold text-ink">What the file holds</p>
					<ul className="flex flex-col gap-1 type-small text-ink-2">
						{scope.map(line => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
				{searched && (
					<Note tone="neutral" title="The search is not applied.">
						The file holds every observation the filters match, not only the ones the search finds.
					</Note>
				)}
				{problem && (
					<Note tone="attention" live="assertive" title="Nothing was downloaded.">
						{problem}
					</Note>
				)}
				<p className="type-small text-ink-2">
					The ZIP also holds a codebook of every column, the forms the answers were given with, and the zone
					boundaries of each map version the observations were recorded on. Observations still on
					observers&apos; devices are not included.
				</p>
			</div>
		</Dialog>
	);
}
