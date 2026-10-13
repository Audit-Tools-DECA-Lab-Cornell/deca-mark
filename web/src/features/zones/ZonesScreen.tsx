import { ButtonLink } from "@/components/contour/Button";
import { FactsList } from "@/components/contour/FactsList";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { TextLink } from "@/components/contour/TextLink";
import { MapFrame } from "@/components/map/MapFrame";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { projectHref } from "@/features/shell/navigation";
import { plural } from "@/lib/labels";
import type { ProjectedSite } from "@/lib/plan";
import type { Failure } from "@/lib/workspace/types";

import { DiscardDraft } from "./DiscardDraft";
import type { DraftRow, VersionRow, ZoneEntry, ZoneTableRow } from "./model";
import { SaveDraftFile } from "./SaveDraftFile";
import { StartDraft } from "./StartDraft";

export type ZonesScreenProps = {
	org: string;
	project: string;
	projectId: string;
	userId: string | null;
	site: { readonly siteId: string; readonly code: string; readonly name: string };
	entry: ZoneEntry;
	canManage: boolean;
	/** The version on screen: the current one, or the earlier one `?version=` names. */
	shown: VersionRow | null;
	plan: ProjectedSite | null;
	planFailure: Failure | null;
	zones: ZoneTableRow[];
	zonesFailure: Failure | null;
	versions: VersionRow[];
	versionsFailure: Failure | null;
	/** Managers only; null for anyone else. */
	drafts: DraftRow[] | null;
	draftsFailure: Failure | null;
	ownDraft: DraftRow | null;
	/** Who else has a draft on the current version, for the start dialog. */
	othersNote: string | null;
	/** `?version=` named a version this site does not have. */
	missingVersion: number | null;
};

/**
 * A site's zones (UI plan 5.1): the current version's plan and zones, the open drafts (managers), and every
 * version with a read-only view of each (`?version=1`). Managers start a draft from the current version, or
 * restore an earlier version's boundaries in a new draft; nothing changes for observers until a draft is
 * published.
 */
export function ZonesScreen(props: ZonesScreenProps) {
	const { org, project, site, entry, canManage, shown, versions } = props;
	const sitesHref = projectHref(org, project, "sites");
	const siteHref = `${sitesHref}/${site.code}`;
	const zonesHref = `${siteHref}/zones`;
	const draftsHref = `${zonesHref}/drafts`;
	const draftHref = (draftId: string) => `${draftsHref}/${draftId}`;
	const current = versions.find(row => row.current) ?? null;
	const editing = canManage && entry === "editable" && current !== null;
	const earlier = shown !== null && !shown.current;

	const header = (
		<PageHeader
			breadcrumbs={[
				{ label: "Sites", href: sitesHref },
				{ label: site.name, href: siteHref },
				{ label: "Zones" }
			]}
			title={`Zones · ${site.name}`}
			lead={
				current
					? `Map v${current.version} · published ${current.published} · ${current.madeBy.toLowerCase()}`
					: "No map package yet"
			}
			actions={
				editing && current ? (
					<>
						{props.ownDraft && (
							<ButtonLink variant="ink" icon="pencil" href={draftHref(props.ownDraft.draftId)}>
								Open your draft
							</ButtonLink>
						)}
						<StartDraft
							org={org}
							project={project}
							siteCode={site.code}
							label={props.ownDraft ? "Start another draft" : `Start a draft from v${current.version}`}
							variant={props.ownDraft ? "outline" : "ink"}
							title={`Start a draft from v${current.version}?`}
							description={`The draft starts as a copy of v${current.version}'s zones. Only managers see it, and observers keep v${current.version} until a draft is published as the next version.`}
							note={props.othersNote}
							draftsHref={draftsHref}
						/>
					</>
				) : undefined
			}
		/>
	);

	if (entry === "no-package")
		return (
			<div className="flex flex-col gap-6">
				{header}
				<ScreenState
					kind="empty"
					icon="layers"
					title="No map package yet"
					body="A site's zones come from its first map package. Upload one, then its zones appear here."
					actions={
						canManage ? (
							<ButtonLink variant="primary" icon="upload" href={`${siteHref}/packages?step=upload`}>
								Upload package
							</ButtonLink>
						) : undefined
					}
				/>
			</div>
		);

	return (
		<div className="flex flex-col gap-6">
			{header}
			{entry === "unavailable" && (
				<NotAvailable
					title="Editing zones on the web for this site"
					instead="Edit the zones layer in QGIS and upload a new package."
				/>
			)}
			{props.missingVersion !== null && (
				<Note tone="neutral">{`${site.name} has no map v${props.missingVersion}, so the current version is shown.`}</Note>
			)}
			{earlier && shown && (
				<Note tone="neutral" title={`Map v${shown.version}, an earlier version.`}>
					<span className="flex flex-col items-start gap-2">
						<span>Published versions never change. This one is shown as it was published.</span>
						<TextLink href={zonesHref} tone="ink">
							Show the current version
						</TextLink>
					</span>
				</Note>
			)}

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.36fr)_minmax(0,1fr)]">
				<div className="min-w-0">
					{props.planFailure ? (
						<LoadFailure failure={props.planFailure} what={`map v${shown?.version ?? ""}`} />
					) : props.plan && shown ? (
						<MapFrame site={props.plan} mapVersion={`v${shown.version}`} title={site.name} />
					) : (
						<Note tone="neutral">{`Map v${shown?.version ?? ""} cannot be drawn as a plan. Its zones are listed beside it.`}</Note>
					)}
				</div>

				<div className="flex min-w-0 flex-col gap-6">
					<Island
						flush
						title={shown ? `Zones of v${shown.version}` : "Zones"}
						meta={props.zonesFailure ? undefined : plural(props.zones.length, "zone")}>
						{props.zonesFailure ? (
							<LoadFailure failure={props.zonesFailure} what="the zones" bare />
						) : (
							<Table caption={`The zones of map v${shown?.version ?? ""}`}>
								<THead>
									<tr>
										<Th>Zone</Th>
										<Th>Code</Th>
										<Th>Shape</Th>
									</tr>
								</THead>
								<TBody>
									{props.zones.map(zone => (
										<Tr key={zone.zoneId}>
											<Td>{zone.label}</Td>
											<Td mono>{zone.code}</Td>
											<Td nowrap>{zone.shape}</Td>
										</Tr>
									))}
								</TBody>
							</Table>
						)}
					</Island>

					{shown && (
						<Island flush divided title={`About v${shown.version}`}>
							<FactsList
								className="px-island-pad py-4"
								labelWidth="8.5rem"
								items={[
									{ label: "Version", value: `v${shown.version}`, mono: true },
									{ label: "Published", value: shown.published },
									{ label: "Made", value: shown.madeBy },
									{
										label: "Change note",
										value: shown.changeNote ? (
											<span className="break-words whitespace-pre-line">{shown.changeNote}</span>
										) : (
											<span className="text-ink-2">No note</span>
										)
									}
								]}
							/>
						</Island>
					)}
				</div>
			</div>

			{props.drafts !== null && (
				<Island
					flush
					title="Open drafts"
					meta={props.draftsFailure ? undefined : plural(props.drafts.length, "draft")}
					footnote="Drafts are seen only by managers. Each one is published as the next version, and the first one published wins.">
					{props.draftsFailure ? (
						<LoadFailure failure={props.draftsFailure} what="the drafts" bare />
					) : props.drafts.length === 0 ? (
						<p className="px-island-pad py-4 type-body text-ink-2">No open drafts.</p>
					) : (
						<ul>
							{props.drafts.map(row => (
								<li
									key={row.draftId}
									className="flex flex-col gap-3 border-t border-rule px-island-pad py-4 first:border-t-0 md:flex-row md:items-center md:justify-between">
									<div className="flex min-w-0 flex-col gap-1">
										<p className="type-body font-semibold text-ink">{row.owner}</p>
										<p className="type-small text-ink-2">
											{row.basedOn} · {row.edited} · revision{" "}
											<span className="type-mono-data">{row.revision}</span>
										</p>
										{row.stale && (
											<p className="type-small text-ink-2">
												It cannot be published as it is: start a new draft from the current
												version.
											</p>
										)}
									</div>
									<div className="flex flex-wrap gap-2">
										<ButtonLink variant="outline" size="sm" href={draftHref(row.draftId)}>
											Open
										</ButtonLink>
										{props.userId && (
											<>
												<SaveDraftFile
													address={{
														projectId: props.projectId,
														siteId: site.siteId,
														draftId: row.draftId,
														userId: props.userId
													}}
													siteCode={site.code}
												/>
												<DiscardDraft
													org={org}
													project={project}
													siteCode={site.code}
													address={{
														projectId: props.projectId,
														siteId: site.siteId,
														draftId: row.draftId,
														userId: props.userId
													}}
													etag={row.etag}
													zonesHref={zonesHref}
													size="sm"
												/>
											</>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</Island>
			)}

			<Island
				flush
				title="Versions"
				meta={props.versionsFailure ? undefined : plural(versions.length, "version")}
				footnote="Observations keep the version they were recorded with. Restoring an earlier version starts a draft from the current one with its boundaries.">
				{props.versionsFailure ? (
					<LoadFailure failure={props.versionsFailure} what="the versions" bare />
				) : (
					<ul>
						{versions.map(row => (
							<li
								key={row.packageId}
								className="flex flex-col gap-3 border-t border-rule px-island-pad py-4 first:border-t-0 md:flex-row md:items-center md:justify-between">
								<div className="flex min-w-0 flex-col gap-1">
									<p className="flex flex-wrap items-center gap-3">
										<span className="type-mono-data font-semibold text-ink">{`v${row.version}`}</span>
										<StateBadge kind="package" state={row.current ? "active" : "archived"} />
										{row.replacedBy && (
											<span className="type-small text-ink-2">{row.replacedBy}</span>
										)}
									</p>
									<p className="type-small text-ink-2">
										{row.published} · {row.madeBy}
									</p>
									{row.changeNote && (
										<p className="type-small break-words whitespace-pre-line text-ink">
											{row.changeNote}
										</p>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{shown?.packageId === row.packageId ? (
										<span className="type-small text-ink-2">Shown above</span>
									) : (
										<TextLink
											href={row.current ? zonesHref : `${zonesHref}?version=${row.version}`}
											tone="ink">
											{`Show v${row.version}`}
										</TextLink>
									)}
									{editing && current && !row.current && (
										<StartDraft
											org={org}
											project={project}
											siteCode={site.code}
											label={`Restore v${row.version} boundaries in a new draft`}
											variant="outline"
											icon="history"
											size="sm"
											title={`Restore v${row.version} boundaries?`}
											description={`A new draft from v${current.version} gets v${row.version}'s zones, with the same identities and codes. Zones added after v${row.version} show as removed. Nothing changes for observers until the draft is published.`}
											note={props.othersNote}
											restoreFrom={row.packageId}
											draftsHref={draftsHref}
											opens="review"
										/>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</Island>
		</div>
	);
}
