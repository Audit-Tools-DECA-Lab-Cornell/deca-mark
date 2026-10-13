"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { packagePlans } from "@/features/data/plans";
import { projectHref } from "@/features/shell/navigation";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import type { DraftAddress } from "@/lib/api/zones-browser";
import { saveText } from "@/lib/download";
import type { ProjectedSite } from "@/lib/plan";
import { clock as makeClock } from "@/lib/time";
import { type DraftZone, type PolygonRings, structureIssues } from "@/lib/zones/geometry";

import { ConflictChoice } from "./ConflictChoice";
import { DiscardDraft } from "./DiscardDraft";
import { checkIsCurrent, checkLine, checkProblems, checkUnavailable } from "./editor/checks";
import { draftFileName, draftGeoJson } from "./editor/conflict";
import { blockingReason, editorProblems } from "./editor/problems";
import { isDirty, type SavedDraft, saveStatus } from "./editor/save-queue";
import { useDraftSaving } from "./editor/useDraftSaving";
import { ZoneEditor } from "./editor/ZoneEditor";
import { LeaveDialog } from "./LeaveDialog";

export type DraftEditorProps = {
	org: string;
	project: string;
	address: DraftAddress;
	siteCode: string;
	siteName: string;
	timeZone: string;
	/** The draft as the page read it; the editor reads it again before accepting edits. */
	draft: SavedDraft;
	baseVersion: number;
	/** The site's current map version; a draft based on another one cannot be published. */
	currentVersion: number | null;
	/** The base version drawn without zones, and its site boundary. */
	site: ProjectedSite;
	siteBoundary: readonly PolygonRings[];
	/** The base version's zones, for "New", "Changed" and "Unchanged". */
	baseZones: readonly DraftZone[];
};

/** Why the zones cannot be saved as they are, in a few words, or null. */
function invalidReason(
	zones: readonly DraftZone[],
	changeNote: string,
	boundary: readonly PolygonRings[]
): string | null {
	if (structureIssues(zones, changeNote).length === 0) return null;
	return blockingReason(editorProblems(zones, boundary, changeNote));
}

/**
 * A zone draft being edited (UI plan 5.3, 5.8, 5.9): the editor over the base version, saved to DECA Mark a
 * moment after each change. The header's meta line says what is saved; anything that stops saving says why
 * and what can be done, and never loses the edits in this tab: a conflict asks which draft to keep, and
 * every stop offers the edits as a file.
 */
export function DraftEditor(props: DraftEditorProps) {
	const { org, project, address, siteCode, siteName, timeZone, draft, baseVersion, currentVersion } = props;
	const saving = useDraftSaving(address, draft);
	const { queue } = saving;
	const clock = useMemo(() => makeClock(timeZone), [timeZone]);
	// Where "Save and leave" was going: it leaves once everything is saved, and waits while saving is stopped.
	const [leaveFor, setLeaveFor] = useState<string | null>(null);

	const siteHref = projectHref(org, project, `sites/${siteCode}`);
	const unsaved = isDirty(queue) || queue.inFlight !== null;
	// "Review and publish" saves first, then opens the review.
	const [toReview, setToReview] = useState(false);
	// While "Save and leave" or the review waits, the guard stays on: letting go first would step Back over it.
	const guard = useLeaveGuard(saving.ready && !saving.fenced && (unsaved || leaveFor !== null || toReview));
	const status = saveStatus(queue, iso => clock.time(iso));
	const pause = queue.pause;

	// Another account signed in: nothing read for the previous one stays in this tab.
	useEffect(() => {
		if (saving.fenced) packagePlans.clear();
	}, [saving.fenced]);

	const savingToLeave = leaveFor !== null && leaveFor === guard.leavingTo && pause === null;
	useEffect(() => {
		if (savingToLeave && !unsaved) guard.leave();
	}, [savingToLeave, unsaved, guard]);

	const zonesHref = `${siteHref}/zones`;
	const reviewHref = `${zonesHref}/drafts/${address.draftId}/publish`;
	const savingToReview = toReview && pause === null;
	useEffect(() => {
		if (savingToReview && !unsaved) guard.go(reviewHref);
	}, [savingToReview, unsaved, guard, reviewHref]);

	const { edited, flush } = saving;
	const changeNote = queue.local.changeNote;
	const onZonesChange = useCallback(
		(zones: readonly DraftZone[]) =>
			edited({ zones, changeNote }, invalidReason(zones, changeNote, props.siteBoundary)),
		[edited, changeNote, props.siteBoundary]
	);

	const saveFile = () =>
		saveText(
			draftGeoJson(queue.local),
			draftFileName(siteCode, queue.acknowledged.revision),
			"application/geo+json"
		);

	const check = saving.check;
	const checks = useMemo(
		() =>
			check
				? {
						problems: checkProblems(check.validation, queue.local.zones),
						line: checkLine(check, checkIsCurrent(check, queue), iso => clock.time(iso))
					}
				: { problems: [], line: null },
		[check, queue, clock]
	);
	const unavailable = checkUnavailable(queue);

	if (saving.fenced)
		return (
			<ScreenState
				kind="no-access"
				title="You are signed in as someone else."
				body="This draft belongs to the previous account, so its unsaved changes are not shown. Sign in as that account to edit it."
				actions={
					<ButtonLink variant="outline" href="/o">
						Open your projects
					</ButtonLink>
				}
			/>
		);

	const leaveDialog = (
		<LeaveDialog
			leavingTo={guard.leavingTo}
			onStay={() => {
				setLeaveFor(null);
				guard.stay();
			}}
			onLeave={guard.leave}
			closed={pause?.kind === "closed"}
			onSaveFile={saveFile}
			save={{
				busy: savingToLeave,
				unavailable: queue.invalid ? `${queue.invalid} Or leave without saving.` : pause ? status.text : null,
				onSave: () => {
					setLeaveFor(guard.leavingTo);
					flush();
				}
			}}
		/>
	);

	const header = (
		<PageHeader
			breadcrumbs={[
				{ label: "Sites", href: projectHref(org, project, "sites") },
				{ label: siteName, href: siteHref },
				{ label: "Zones", href: `${siteHref}/zones` },
				{ label: "Draft" }
			]}
			title={`Edit zones · ${siteName}`}
			actions={
				saving.ready && pause?.kind !== "closed" ? (
					<>
						<DiscardDraft
							org={org}
							project={project}
							siteCode={siteCode}
							address={address}
							etag={queue.acknowledged.etag}
							zonesHref={zonesHref}
							disabled={
								queue.inFlight || queue.reading
									? "Discarding waits until the save in progress finishes."
									: null
							}
							onDone={guard.go}
						/>
						<Button
							variant="ink"
							icon="arrow-right"
							busy={savingToReview}
							busyLabel="Saving…"
							disabled={queue.invalid !== null || (pause !== null && pause.kind !== "waiting")}
							disabledReason={
								queue.invalid ? `Not saved yet · ${queue.invalid}` : pause ? status.text : undefined
							}
							onClick={() => {
								if (!unsaved) guard.go(reviewHref);
								else {
									setToReview(true);
									flush();
								}
							}}>
							Review and publish
						</Button>
					</>
				) : undefined
			}
			lead={
				<>
					<span className="block">{`A draft based on map v${baseVersion}. Changes save to the draft a moment after you make them.`}</span>
					{saving.ready && <span className="block type-small text-ink-2">{status.text}</span>}
				</>
			}
		/>
	);

	if (!saving.ready)
		return (
			<div className="flex flex-col gap-6">
				{header}
				{saving.mountProblem ? (
					<ScreenState
						kind="error"
						title="Couldn't open the draft."
						body={saving.mountProblem}
						actions={
							<Button variant="outline" icon="rotate-cw" onClick={saving.retryMount}>
								Try again
							</Button>
						}
					/>
				) : (
					<ScreenState kind="loading" title="Opening the draft…" />
				)}
			</div>
		);

	if (pause?.kind === "closed")
		return (
			<div className="flex flex-col gap-6">
				{header}
				<ScreenState
					kind="empty"
					icon="info"
					title={
						pause.server?.state === "discarded"
							? "This draft was discarded."
							: pause.server?.state === "published"
								? "This draft was published."
								: "This draft is no longer open."
					}
					body="Nothing more is saved to it. Your edits in this tab can still be kept as a file."
					actions={
						<>
							<ButtonLink variant="ink" href={`${siteHref}/zones`}>
								Open the zones
							</ButtonLink>
							<Button variant="outline" icon="download" onClick={saveFile}>
								Save my edits as a file
							</Button>
						</>
					}
				/>
				{leaveDialog}
			</div>
		);

	return (
		<div className="flex flex-col gap-6">
			{header}
			{/* Saving stops and changes are announced; the meta line under the title always shows the state. */}
			<p aria-live="polite" className="sr-only">
				{status.live === "polite" ? status.text : ""}
			</p>
			<p aria-live="assertive" className="sr-only">
				{status.live === "assertive" ? status.text : ""}
			</p>

			{currentVersion !== null && currentVersion !== baseVersion && (
				<Note tone="neutral" title={`v${currentVersion} is current.`}>
					{`This draft is based on v${baseVersion}, so it cannot be published as it is. Start a new draft from v${currentVersion} to publish.`}
				</Note>
			)}
			<ConflictChoice
				pause={pause}
				local={queue.local}
				time={iso => clock.time(iso)}
				onKeepMine={saving.keepMine}
				onTakeSaved={saving.takeSaved}
				onSaveFile={saveFile}
			/>
			{(pause?.kind === "no-access" || pause?.kind === "too-large") && (
				<Note tone="attention" title="Not saved.">
					<span className="flex flex-col items-start gap-3">
						<span>
							{pause.kind === "no-access"
								? "You no longer have access to this draft. Your edits stay in this tab until you leave it."
								: "This draft is larger than DECA Mark accepts. Remove zones or points, or keep your edits as a file."}
						</span>
						<Button variant="outline" size="sm" icon="download" onClick={saveFile}>
							Save my edits as a file
						</Button>
					</span>
				</Note>
			)}
			{saving.checkProblem && <Note tone="neutral">{saving.checkProblem}</Note>}

			<ZoneEditor
				key={saving.generation}
				site={props.site}
				siteBoundary={props.siteBoundary}
				zones={queue.local.zones}
				baseZones={props.baseZones}
				baseVersion={`v${baseVersion}`}
				mapTitle={siteName}
				mapSubtitle={`Draft from v${baseVersion}`}
				onZonesChange={onZonesChange}
				checks={{
					...checks,
					action: (
						<Button
							variant="outline"
							size="sm"
							icon="refresh-cw"
							busy={saving.checking}
							busyLabel="Checking…"
							disabled={unavailable !== null}
							disabledReason={unavailable ?? undefined}
							onClick={() => {
								flush();
								saving.checkNow();
							}}>
							Check boundaries
						</Button>
					)
				}}
			/>

			{leaveDialog}
		</div>
	);
}
