"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Island, IslandSection } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { Select } from "@/components/contour/Select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { TextLink } from "@/components/contour/TextLink";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { downloadPackageArchive } from "@/lib/api/browser";
import { apiRequestError, UNKNOWN_ERROR_COPY } from "@/lib/api/errors";
import type { Observation } from "@/lib/api/types";
import { packageFileName, saveText } from "@/lib/download";
import { RECORD_COLUMNS } from "@/lib/export/columns";
import { codebook, EMPTY_CELL_NOTE, exportColumns, exportFileName, toCsv, toGeoJson } from "@/lib/export/observations";
import { formatBytes, isRoundType, plural, ROUND_TYPES, roundLabel } from "@/lib/labels";
import { clock } from "@/lib/time";
import type { RoundType } from "@/lib/workspace/types";

import { exportScope, type MapRow } from "./model";

export type QgisScreenProps = {
	projectId: string;
	projectCode: string;
	timeZone: string;
	/** When the page read its data (an ISO time); the day in the files' names. */
	loadedAt: string;
	/** The project's address, for links. */
	base: string;
	/** Managers can upload a map package. */
	canUpload: boolean;
	maps: readonly MapRow[];
	/** The site and round the records were read for ("" for all). */
	site: string;
	round: RoundType | "";
	rows: readonly Observation[];
	/** Form version code → its definition, for the records' answer columns. */
	definitions: Readonly<Record<string, unknown>>;
	/** Form versions whose definition could not be read. */
	unreadableForms: number;
	/** The list came back with 500 records, so older ones may be missing. */
	limited: boolean;
};

/** What went wrong in words, for an error caught from a download. */
function failureMessage(error: unknown): string {
	try {
		return apiRequestError(error).message;
	} catch {
		return UNKNOWN_ERROR_COPY;
	}
}

/**
 * QGIS: the two directions between QGIS and DECA Mark. Maps come in as packages made in QGIS and uploaded
 * on a site's page; here every site's current package can be downloaded. Observations go out as files
 * QGIS can open, written in the browser from the records the page read, with each record's own form
 * version for its answer columns. There is no live connection to read from.
 */
export function QgisScreen({
	projectId,
	projectCode,
	timeZone,
	loadedAt,
	base,
	canUpload,
	maps,
	site,
	round,
	rows,
	definitions,
	unreadableForms,
	limited
}: QgisScreenProps) {
	const ids = useId();
	const router = useRouter();
	const pathname = usePathname();
	const [pending, startTransition] = useTransition();
	const [downloading, setDownloading] = useState<string | null>(null);
	const [failed, setFailed] = useState<{ package: string; message: string } | null>(null);
	const projectClock = useMemo(() => clock(timeZone), [timeZone]);
	const day = projectClock.dayKey(loadedAt);
	const siteName = maps.find(entry => entry.code === site)?.name ?? null;
	const columns = useMemo(() => exportColumns(rows, definitions), [rows, definitions]);

	function choose(next: { site: string; round: string }) {
		const query = new URLSearchParams();
		if (next.site) query.set("site", next.site);
		if (next.round) query.set("round", next.round);
		const text = query.toString();
		startTransition(() => router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false }));
	}

	async function downloadMap(entry: MapRow) {
		if (!entry.package) return;
		setFailed(null);
		setDownloading(entry.package.id);
		try {
			await downloadPackageArchive(
				projectId,
				entry.package.id,
				packageFileName(entry.code, entry.package.version)
			);
		} catch (error) {
			setFailed({ package: entry.package.id, message: failureMessage(error) });
		} finally {
			setDownloading(null);
		}
	}

	function save(kind: "csv" | "geojson" | "codebook") {
		if (kind === "csv")
			saveText(
				toCsv(rows, definitions, { byteOrderMark: true }),
				exportFileName(projectCode, "observations", day, "csv"),
				"text/csv"
			);
		else if (kind === "geojson")
			saveText(
				toGeoJson(rows, definitions),
				exportFileName(projectCode, "observations", day, "geojson"),
				"application/geo+json"
			);
		else saveText(codebook(definitions, rows), exportFileName(projectCode, "codebook", day, "csv"), "text/csv");
	}

	const none = rows.length === 0;
	const noneReason = "There are no observations to download.";

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="QGIS"
				lead="Maps go in as packages made in QGIS. Observations come out as files QGIS can open."
			/>

			<div className="grid gap-6 lg:grid-cols-2 lg:items-start">
				<Island
					flush
					divided={false}
					title="Maps in"
					meta={plural(maps.length, "site")}
					footnote="Open a site's upload page to read a QGIS project with its source files, or upload GeoJSON layers. Review the layers before saving its map package.">
					{maps.length === 0 ? (
						<ScreenState
							kind="empty"
							icon="map"
							title="No sites yet"
							body="A map package belongs to a site. Add a site, then upload its map package from QGIS."
							actions={
								canUpload ? (
									<ButtonLink variant="outline" href={`${base}/sites`}>
										Open sites
									</ButtonLink>
								) : undefined
							}
						/>
					) : (
						<ul className="divide-y divide-rule border-t border-rule">
							{maps.map(entry => (
								<li key={entry.code} className="flex flex-col gap-3 px-island-pad py-4">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div className="min-w-0">
											<p className="font-semibold">
												<TextLink tone="ink" href={`${base}/sites/${entry.code}`}>
													{entry.name}
												</TextLink>
											</p>
											<p className="type-small text-ink-2">
												{entry.package ? (
													<>
														<span className="type-mono-data">v{entry.package.version}</span>{" "}
														· prepared {projectClock.day(entry.package.preparedAt)} ·{" "}
														{formatBytes(entry.package.bytes)} ·{" "}
														{plural(entry.zoneCount, "zone")}
													</>
												) : (
													"No map package yet"
												)}
											</p>
										</div>
										<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
											{entry.package && (
												<Button
													variant="outline"
													size="sm"
													icon="download"
													aria-label={`Download ${entry.name} map package v${entry.package.version}`}
													busy={downloading === entry.package.id}
													busyLabel="Downloading…"
													onClick={() => void downloadMap(entry)}>
													Download
												</Button>
											)}
											{canUpload && (
												<TextLink href={`${base}/sites/${entry.code}/packages?step=upload`}>
													{entry.package ? "Upload a new version" : "Upload a map package"}
												</TextLink>
											)}
										</div>
									</div>
									{entry.package && failed?.package === entry.package.id && (
										<Note tone="attention" live="polite" title="Nothing was downloaded.">
											{failed.message}
										</Note>
									)}
								</li>
							))}
						</ul>
					)}
				</Island>

				<Island flush divided={false} title="Records out" aria-busy={pending || undefined}>
					<IslandSection className="flex flex-col gap-4 border-t border-rule pt-5">
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="Site" htmlFor={`${ids}-site`}>
								<Select
									id={`${ids}-site`}
									value={site}
									onChange={event => choose({ site: event.target.value, round })}>
									<option value="">All sites</option>
									{maps.map(entry => (
										<option key={entry.code} value={entry.code}>
											{entry.name}
										</option>
									))}
								</Select>
							</Field>
							<Field label="Round" htmlFor={`${ids}-round`}>
								<Select
									id={`${ids}-round`}
									value={round}
									onChange={event =>
										choose({
											site,
											round: isRoundType(event.target.value) ? event.target.value : ""
										})
									}>
									<option value="">All rounds</option>
									{ROUND_TYPES.map(type => (
										<option key={type} value={type}>
											{roundLabel(type)}
										</option>
									))}
								</Select>
							</Field>
						</div>
						<p role="status" className="type-body font-semibold text-ink">
							{exportScope({ count: rows.length, siteName, round: round || null })}
						</p>
						{limited && (
							<Note title="Based on the newest 500 observations.">
								Older observations are not in the files. Choose a site or a round to narrow the list.
							</Note>
						)}
						{unreadableForms > 0 && (
							<Note tone="attention" title="Some answers have no names.">
								{unreadableForms === 1
									? "One form version could not be loaded, so its answer columns use the question ids."
									: `${unreadableForms} form versions could not be loaded, so their answer columns use the question ids.`}
							</Note>
						)}
						<div className="flex flex-wrap gap-3">
							<Button
								variant="primary"
								icon="download"
								disabled={none}
								disabledReason={none ? noneReason : undefined}
								onClick={() => save("csv")}>
								Download CSV
							</Button>
							<Button variant="outline" icon="download" disabled={none} onClick={() => save("geojson")}>
								Download GeoJSON
							</Button>
							<Button variant="outline" icon="file-text" disabled={none} onClick={() => save("codebook")}>
								Download codebook
							</Button>
						</div>
						<p className="type-small text-ink-2">
							In QGIS, choose Layer, Add Layer, Add Vector Layer and pick the GeoJSON file. For the CSV,
							use Add Delimited Text Layer with longitude as X and latitude as Y (EPSG:4326). Inventory
							records describe a whole zone, so they have no point: in the GeoJSON their geometry is
							empty. {EMPTY_CELL_NOTE} Download again to refresh a layer.
						</p>
					</IslandSection>
				</Island>
			</div>

			<Island flush title="Columns in the files" meta={plural(RECORD_COLUMNS.length + columns.length, "column")}>
				<Table caption="Columns in the CSV and GeoJSON files">
					<THead>
						<tr>
							<Th>Column</Th>
							<Th>What it holds</Th>
						</tr>
					</THead>
					<TBody>
						{RECORD_COLUMNS.map(entry => (
							<Tr key={entry.column}>
								<Td className="[overflow-wrap:anywhere]">
									<span className="block type-mono-data">{entry.column}</span>
									<span className="block type-small text-ink-2">{entry.type}</span>
								</Td>
								<Td>{entry.label}</Td>
							</Tr>
						))}
						{columns.map(entry => (
							<Tr key={entry.header}>
								<Td className="[overflow-wrap:anywhere]">
									<span className="block type-mono-data">{entry.header}</span>
									<span className="block type-small text-ink-2">{entry.type}</span>
								</Td>
								<Td>
									{entry.label}
									{entry.values && (
										<span className="mt-1 block type-small text-ink-2">{entry.values}</span>
									)}
								</Td>
							</Tr>
						))}
					</TBody>
				</Table>
			</Island>

			<NotAvailable
				title="Connecting QGIS directly to the database"
				reason="QGIS cannot read DECA Mark records live yet."
				instead="Download a file above and add it to QGIS. Download again when you want the newest records."
			/>
		</div>
	);
}
