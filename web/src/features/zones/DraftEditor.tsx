"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
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

import { checkIsCurrent, checkLine, checkProblems, checkUnavailable } from "./editor/checks";
import { differingZones, draftFileName, draftGeoJson, nameList } from "./editor/conflict";
import { blockingReason, editorProblems } from "./editor/problems";
import { isDirty, type SavedDraft, saveStatus } from "./editor/save-queue";
import { useDraftSaving } from "./editor/useDraftSaving";
import { ZoneEditor } from "./editor/ZoneEditor";

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
	const [dismissed, setDismissed] = useState<string | null>(null);
	const [replacing, setReplacing] = useState(false);
	// Where "Save and leave" was going: it leaves once everything is saved, and waits while saving is stopped.
	const [leaveFor, setLeaveFor] = useState<string | null>(null);

	const siteHref = projectHref(org, project, `sites/${siteCode}`);
	const unsaved = isDirty(queue) || queue.inFlight !== null;
	// While "Save and leave" waits, the guard stays on: letting go first would step Back over the leave.
	const guard = useLeaveGuard(saving.ready && !saving.fenced && (unsaved || leaveFor !== null));
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

	const { edited, flush } = saving;
	const changeNote = queue.local.changeNote;
	const onZonesChange = useCallback(
		(zones: readonly DraftZone[]) =>
			edited({ zones, changeNote }, invalidReason(zones, changeNote, props.siteBoundary)),
		[edited, changeNote, props.siteBoundary]
	);

	const saveFile = () =>
		saveText(
			draftGeoJson(queue.local.zones),
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

	const header = (
		<PageHeader
			breadcrumbs={[
				{ label: "Sites", href: projectHref(org, project, "sites") },
				{ label: siteName, href: siteHref },
				{ label: "Zone draft" }
			]}
			title={`Edit zones · ${siteName}`}
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
							<ButtonLink variant="ink" href={siteHref}>
								Open the site
							</ButtonLink>
							<Button variant="outline" icon="download" onClick={saveFile}>
								Save my edits as a file
							</Button>
						</>
					}
				/>
			</div>
		);

	const conflict =
		(pause?.kind === "conflict" || pause?.kind === "precondition") && pause.server ? pause.server : null;
	const conflictKey = conflict ? `${conflict.revision}:${pause?.kind}` : null;
	const differing = conflict ? differingZones(queue.local.zones, conflict.zones) : [];

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
			{conflict && dismissed === conflictKey && (
				<Note tone="attention" title="Not saved.">
					<span className="flex flex-col items-start gap-3">
						<span>Someone else saved this draft. Choose which edits to keep.</span>
						<Button variant="outline" size="sm" onClick={() => setDismissed(null)}>
							Choose what to keep
						</Button>
					</span>
				</Note>
			)}
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

			<Dialog
				open={conflict !== null && dismissed !== conflictKey}
				onOpenChange={open => {
					if (!open) {
						setDismissed(conflictKey);
						setReplacing(false);
					}
				}}
				title={replacing ? "Replace the saved draft?" : "Someone else saved this draft"}
				description={
					replacing
						? `The draft saved at ${conflict ? clock.time(conflict.updatedAt) : ""} is replaced by the edits in this tab. Its own changes are lost.`
						: `${conflict?.updatedBy ?? "Another manager"} saved it at ${conflict ? clock.time(conflict.updatedAt) : ""}. Your edits are still here and are not saved.`
				}
				footer={
					replacing ? (
						<>
							<Button variant="outline" onClick={() => setReplacing(false)}>
								Back
							</Button>
							<Button
								variant="danger-solid"
								onClick={() => {
									setReplacing(false);
									saving.keepMine();
								}}>
								Replace the saved draft
							</Button>
						</>
					) : (
						<>
							<DialogClose asChild>
								<Button variant="outline">Decide later</Button>
							</DialogClose>
							<Button variant="outline" icon="download" onClick={saveFile}>
								Save my edits as a file
							</Button>
							<Button variant="outline" onClick={saving.takeSaved}>
								Discard my edits and load the saved draft
							</Button>
							<Button variant="ink" onClick={() => setReplacing(true)}>
								Replace the saved draft with my edits
							</Button>
						</>
					)
				}>
				{!replacing && (
					<p className="type-body text-ink-2">
						{differing.length === 0
							? "The saved draft has the same zones as yours."
							: `Zones that differ: ${nameList(differing)}.`}
					</p>
				)}
			</Dialog>

			<Dialog
				open={guard.leavingTo !== null}
				onOpenChange={open => {
					if (!open) {
						setLeaveFor(null);
						guard.stay();
					}
				}}
				title="Save your changes first?"
				description="Some changes to this draft are not saved yet. If you leave without saving, they are lost and the draft keeps its last saved revision."
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Keep editing</Button>
						</DialogClose>
						<Button variant="outline" icon="arrow-right" onClick={guard.leave}>
							Leave without saving
						</Button>
						<Button
							variant="ink"
							busy={savingToLeave}
							busyLabel="Saving…"
							disabled={queue.invalid !== null || pause !== null}
							disabledReason={
								queue.invalid
									? `${queue.invalid} Or leave without saving.`
									: pause
										? status.text
										: undefined
							}
							onClick={() => {
								setLeaveFor(guard.leavingTo);
								flush();
							}}>
							Save and leave
						</Button>
					</>
				}
			/>
		</div>
	);
}
