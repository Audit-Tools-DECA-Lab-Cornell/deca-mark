"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Checkbox } from "@/components/contour/Checkbox";
import { FactsList } from "@/components/contour/FactsList";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { Textarea } from "@/components/contour/Textarea";
import { useToast } from "@/components/contour/Toast";
import { MapFrame } from "@/components/map/MapFrame";
import type { ZonePlanStyle } from "@/components/map/SitePlan";
import { packagePlans } from "@/features/data/plans";
import { projectHref } from "@/features/shell/navigation";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import { AccountChangedError } from "@/lib/api/browser";
import { apiRequestError } from "@/lib/api/errors";
import type { Publication } from "@/lib/api/sites";
import type { PackageForms } from "@/lib/api/sites";
import { type DraftAddress, getZoneDraft, publishZoneDraft } from "@/lib/api/zones-browser";
import { saveText } from "@/lib/download";
import { newId } from "@/lib/ids";
import type { ProjectedSite } from "@/lib/plan";
import { clock as makeClock } from "@/lib/time";
import { CHANGE_NOTE_MAX, codePoints, type DraftZone } from "@/lib/zones/geometry";
import { issueText } from "@/lib/zones/issues";

import { zonesChangedAction } from "../actions";
import { ConflictChoice } from "../ConflictChoice";
import { DiscardDraft } from "../DiscardDraft";
import { checkIsCurrent, checkLine, checkProblems } from "../editor/checks";
import { draftFileName, draftGeoJson } from "../editor/conflict";
import { planZone } from "../editor/projection";
import { isDirty, type SavedDraft, saveStatus } from "../editor/save-queue";
import { useDraftSaving } from "../editor/useDraftSaving";
import { LeaveDialog } from "../LeaveDialog";
import { StartDraft } from "../StartDraft";
import {
	CHANGE_WORDS,
	changeRows,
	changeSummary,
	closedLine,
	hatchedZones,
	publishedLine,
	publishedVersion,
	publishRequestKey,
	publishUnavailable
} from "./model";

export type PublishReviewProps = {
	org: string;
	project: string;
	address: DraftAddress;
	siteCode: string;
	siteName: string;
	timeZone: string;
	draft: SavedDraft;
	baseVersion: number;
	/** The site's current version when the page was read: a draft based on another one cannot be published. */
	currentPackageId: string | null;
	currentVersion: number | null;
	basePackageId: string;
	forms: PackageForms;
	/** The base version drawn without zones; the draft's zones are drawn on it. */
	site: ProjectedSite;
	baseZones: readonly DraftZone[];
};

/** What the last publish attempt came to. */
type Attempt =
	| { readonly kind: "idle" }
	| { readonly kind: "sending" }
	| { readonly kind: "replayed"; readonly publication: Publication }
	| { readonly kind: "unconfirmed" }
	| { readonly kind: "closed"; readonly state: "published" | "discarded"; readonly version: number | null }
	| { readonly kind: "conflict"; readonly currentVersion: number | null }
	| { readonly kind: "refused"; readonly message: string; readonly issues: readonly string[] };

/** The request ID for publishing this revision: the one this tab chose for it before, or a new one kept for it. */
function requestIdFor(draftId: string, revision: number): string {
	const key = publishRequestKey(draftId, revision);
	try {
		const kept = window.sessionStorage.getItem(key);
		if (kept) return kept;
		const fresh = newId();
		window.sessionStorage.setItem(key, fresh);
		return fresh;
	} catch {
		// Without storage a reload chooses a new one; DECA Mark still refuses publishing the revision twice.
		return newId();
	}
}

/**
 * Review and publish (UI plan 5.10, WUI-6): DECA Mark's check of this exact revision, what changed against
 * the version the draft started from, the plan with changed boundaries hatched, what observers will
 * experience, the forms, the change note (part of the draft, so it saves a revision), and a confirmation.
 * Publishing keeps one request ID per revision, so a lost answer is asked again and never publishes twice.
 */
export function PublishReview(props: PublishReviewProps) {
	const { org, project, address, siteCode, siteName, timeZone, baseVersion, currentVersion } = props;
	const saving = useDraftSaving(address, props.draft, { checkDelayMs: 500 });
	const { queue } = saving;
	const { toast } = useToast();
	const clock = useMemo(() => makeClock(timeZone), [timeZone]);
	const noteId = useId();
	const confirmId = useId();
	const [confirmed, setConfirmed] = useState(false);
	const [attempt, setAttempt] = useState<Attempt>({ kind: "idle" });
	// A publication answered after the person left this page never takes them back to the zones.
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const siteHref = projectHref(org, project, `sites/${siteCode}`);
	const zonesHref = `${siteHref}/zones`;
	const editorHref = `${zonesHref}/drafts/${address.draftId}`;
	const unsaved = isDirty(queue) || queue.inFlight !== null;
	// Where "Save and leave" was going: it leaves once the note is saved; the guard stays on until then.
	const [leaveFor, setLeaveFor] = useState<string | null>(null);
	const guard = useLeaveGuard(saving.ready && !saving.fenced && (unsaved || leaveFor !== null));
	const savingToLeave = leaveFor !== null && leaveFor === guard.leavingTo && queue.pause === null;
	useEffect(() => {
		if (savingToLeave && !unsaved) guard.leave();
	}, [savingToLeave, unsaved, guard]);
	const status = saveStatus(queue, iso => clock.time(iso));
	const stale = props.currentPackageId !== props.basePackageId;
	const nextVersion = currentVersion !== null ? currentVersion + 1 : null;

	const check = saving.check;
	const current = check !== null && checkIsCurrent(check, queue);
	const problems = useMemo(
		() => (check ? checkProblems(check.validation, queue.local.zones) : []),
		[check, queue.local.zones]
	);
	const blocking = problems.filter(problem => problem.kind === "checked");
	const warnings = problems.filter(problem => problem.kind === "warning");
	const changes = useMemo(
		() => (check ? changeRows(check.validation, queue.local.zones, props.baseZones) : []),
		[check, queue.local.zones, props.baseZones]
	);
	const hatched = useMemo(() => hatchedZones(changes), [changes]);
	const plan = useMemo<ProjectedSite>(
		() => ({ ...props.site, zones: queue.local.zones.map(zone => planZone(zone, props.site.frame)) }),
		[props.site, queue.local.zones]
	);
	const zoneStyles = useMemo<Record<string, ZonePlanStyle>>(
		() =>
			Object.fromEntries(
				plan.zones.map(zone => [zone.id, hatched.has(zone.id) ? { hatched: true, emphasis: "focus" } : {}])
			),
		[plan.zones, hatched]
	);

	const unavailable =
		attempt.kind === "sending"
			? "Publishing…"
			: publishUnavailable({
					ready: current && check!.validation.ready,
					checkedRevision: check?.revision ?? null,
					revision: queue.acknowledged.revision,
					unsaved: unsaved || queue.pause !== null,
					stale,
					confirmed,
					blocking: blocking.length
				});

	const saveFile = () =>
		saveText(
			draftGeoJson(queue.local.zones),
			draftFileName(siteCode, queue.acknowledged.revision),
			"application/geo+json"
		);

	/** Publishes the revision this page checked; a replay sends the very same request again. */
	async function send(requestId: string) {
		return publishZoneDraft(address, queue.acknowledged.etag, {
			requestId,
			expectedCurrentPackageId: props.currentPackageId!
		});
	}

	async function publish() {
		if (!props.currentPackageId) return;
		const revision = queue.acknowledged.revision;
		const requestId = requestIdFor(address.draftId, revision);
		setAttempt({ kind: "sending" });
		try {
			const publication = await send(requestId);
			await done(publication);
		} catch (error) {
			await failed(error, requestId);
		}
	}

	async function done(publication: Publication) {
		await zonesChangedAction({ org, project }, siteCode);
		if (publication.replayed) {
			setAttempt({ kind: "replayed", publication });
			return;
		}
		const line = publishedLine(publication);
		toast({ title: line.title, description: line.body, tone: "saved" });
		if (mounted.current) guard.go(zonesHref);
	}

	/** After any 409 or a lost answer: what the draft says now decides what happened. */
	async function settle(requestId: string, conflict: boolean) {
		try {
			const { draft } = await getZoneDraft(address);
			if (draft.state === "published") {
				// The same request again (same revision, same ID) returns the first answer with its version.
				try {
					await done(await send(requestId));
				} catch {
					setAttempt({ kind: "closed", state: "published", version: publishedVersion(draft) });
				}
				return;
			}
			if (draft.state === "discarded") return setAttempt({ kind: "closed", state: "discarded", version: null });
			if (conflict) return setAttempt({ kind: "conflict", currentVersion: draft.current_package_version });
			setAttempt({ kind: "unconfirmed" });
		} catch {
			setAttempt({ kind: "unconfirmed" });
		}
	}

	async function failed(error: unknown, requestId: string) {
		if (error instanceof AccountChangedError) {
			setAttempt({
				kind: "refused",
				message: "You are signed in as someone else. Nothing was published.",
				issues: []
			});
			return;
		}
		const failure = apiRequestError(error);
		const status = failure.status;
		if (status === undefined || status >= 500) return settle(requestId, false);
		if (status === 409) return settle(requestId, true);
		if (status === 412) {
			setAttempt({
				kind: "refused",
				message:
					"Nothing was published. The draft changed since this page read it, so it is read and checked again.",
				issues: []
			});
			saving.retryMount();
			return;
		}
		if (status === 429)
			return setAttempt({
				kind: "refused",
				message: `Publishing paused for ${failure.retryAfter ?? 20} s. Nothing was published. Try again after that.`,
				issues: []
			});
		const names = new Map(queue.local.zones.map(zone => [zone.zone_id, zone.zone_label || zone.zone_code]));
		setAttempt({
			kind: "refused",
			message: `Nothing was published. ${failure.message}`,
			issues: failure.issues.map(issue =>
				issueText(
					issue.code,
					issue.zoneIds.flatMap(id => (names.has(id) ? [names.get(id)!] : []))
				)
			)
		});
	}

	// Another account signed in: nothing read for the previous one stays in this tab.
	useEffect(() => {
		if (saving.fenced) packagePlans.clear();
	}, [saving.fenced]);

	if (saving.fenced) {
		return (
			<ScreenState
				kind="no-access"
				title="You are signed in as someone else."
				body="This draft belongs to the previous account, so it is not shown. Sign in as that account to publish it."
				actions={
					<ButtonLink variant="outline" href="/o">
						Open your projects
					</ButtonLink>
				}
			/>
		);
	}

	const leaveDialog = (
		<LeaveDialog
			leavingTo={guard.leavingTo}
			onStay={() => {
				setLeaveFor(null);
				guard.stay();
			}}
			onLeave={guard.leave}
			closed={queue.pause?.kind === "closed"}
			onSaveFile={saveFile}
			save={{
				busy: savingToLeave,
				unavailable: queue.invalid
					? `${queue.invalid} Or leave without saving.`
					: queue.pause
						? status.text
						: null,
				onSave: () => {
					setLeaveFor(guard.leavingTo);
					saving.flush();
				}
			}}
		/>
	);

	const header = (
		<PageHeader
			breadcrumbs={[
				{ label: "Sites", href: projectHref(org, project, "sites") },
				{ label: siteName, href: siteHref },
				{ label: "Zones", href: zonesHref },
				{ label: "Draft", href: editorHref },
				{ label: "Publish" }
			]}
			title={`Publish zones · ${siteName}`}
			lead={
				<>
					<span className="block">
						{currentVersion !== null
							? `Publishing creates the next version after v${currentVersion}. v${currentVersion} never changes.`
							: "Publishing creates the next version of this site's zones."}
					</span>
					{saving.ready && <span className="block type-small text-ink-2">{status.text}</span>}
				</>
			}
			actions={
				saving.ready ? (
					<>
						<ButtonLink variant="outline" icon="arrow-left" href={editorHref}>
							Back to the editor
						</ButtonLink>
						<DiscardDraft
							org={org}
							project={project}
							siteCode={siteCode}
							address={address}
							etag={queue.acknowledged.etag}
							zonesHref={zonesHref}
							disabled={queue.inFlight ? "Discarding waits until the save in progress finishes." : null}
							onDone={guard.go}
						/>
					</>
				) : undefined
			}
		/>
	);

	if (!saving.ready)
		return (
			<div className="flex flex-col gap-6">
				{header}
				{leaveDialog}
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

	if (attempt.kind === "replayed") {
		const line = publishedLine(attempt.publication);
		return (
			<div className="flex flex-col gap-6">
				{header}
				{leaveDialog}
				<Note tone="saved" title={line.title}>
					<span className="flex flex-col items-start gap-3">
						<span>{line.body}</span>
						<ButtonLink variant="ink" href={zonesHref}>
							Open the zones
						</ButtonLink>
					</span>
				</Note>
			</div>
		);
	}

	if (attempt.kind === "closed" || queue.pause?.kind === "closed") {
		// The save queue's read names no version; the publish attempt's read does when it is current.
		const line =
			attempt.kind === "closed"
				? closedLine(attempt.state, attempt.version)
				: closedLine(
						queue.pause?.kind === "closed" && queue.pause.server?.state === "discarded"
							? "discarded"
							: "published",
						null
					);
		return (
			<div className="flex flex-col gap-6">
				{header}
				{leaveDialog}
				<ScreenState
					kind="empty"
					icon="info"
					title={line.title}
					body={line.body}
					actions={
						<ButtonLink variant="ink" href={zonesHref}>
							{line.open}
						</ButtonLink>
					}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{header}
			{leaveDialog}
			<p aria-live="polite" className="sr-only">
				{status.live === "polite" ? status.text : ""}
			</p>
			<p aria-live="assertive" className="sr-only">
				{status.live === "assertive" ? status.text : ""}
			</p>

			{stale && (
				<Note tone="attention" title={`v${currentVersion ?? "?"} was published after this draft was started.`}>
					<span className="flex flex-col items-start gap-3">
						<span>{`This draft is based on v${baseVersion}, so it cannot be published. Start a draft from v${currentVersion ?? "?"} to publish.`}</span>
						{currentVersion !== null && (
							<StartDraft
								org={org}
								project={project}
								siteCode={siteCode}
								label={`Start a draft from v${currentVersion}`}
								variant="ink"
								title={`Start a draft from v${currentVersion}?`}
								description={`The draft starts as a copy of v${currentVersion}'s zones. This draft stays as it is, to compare with.`}
								draftsHref={`${zonesHref}/drafts`}
							/>
						)}
					</span>
				</Note>
			)}
			<ConflictChoice
				pause={queue.pause}
				local={queue.local}
				time={iso => clock.time(iso)}
				onKeepMine={saving.keepMine}
				onTakeSaved={saving.takeSaved}
				onSaveFile={saveFile}
			/>
			{attempt.kind === "conflict" && (
				<Note tone="attention" live="assertive" title="Not published.">
					<span className="flex flex-col items-start gap-3">
						<span>
							{`v${attempt.currentVersion ?? "?"} was published while you were reviewing. Your draft is based on v${baseVersion} and is unchanged.`}
						</span>
						<span className="flex flex-wrap gap-2">
							{attempt.currentVersion !== null && (
								<StartDraft
									org={org}
									project={project}
									siteCode={siteCode}
									label={`Start a draft from v${attempt.currentVersion}`}
									variant="ink"
									title={`Start a draft from v${attempt.currentVersion}?`}
									description={`The draft starts as a copy of v${attempt.currentVersion}'s zones. This draft stays readable, to compare with.`}
									draftsHref={`${zonesHref}/drafts`}
								/>
							)}
							<Button variant="outline" icon="download" onClick={saveFile}>
								Save this draft as a file
							</Button>
						</span>
					</span>
				</Note>
			)}
			{attempt.kind === "unconfirmed" && (
				<Note tone="attention" live="assertive" title="DECA Mark could not confirm whether this was published.">
					<span className="flex flex-col items-start gap-3">
						<span>Nothing is lost. Trying again sends the same request, so it never publishes twice.</span>
						<Button variant="outline" icon="rotate-cw" onClick={() => void publish()}>
							Try again
						</Button>
					</span>
				</Note>
			)}
			{attempt.kind === "refused" && (
				<Note tone="attention" live="assertive" title="Not published.">
					<span className="flex flex-col gap-2">
						<span>{attempt.message}</span>
						{attempt.issues.length > 0 && (
							<ul className="list-disc pl-5">
								{attempt.issues.map(text => (
									<li key={text}>{text}</li>
								))}
							</ul>
						)}
					</span>
				</Note>
			)}

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.36fr)_minmax(0,1fr)]">
				<Island title="The new boundaries" meta={`Draft from v${baseVersion}`} className="min-w-0">
					<div className="flex flex-col gap-3">
						<MapFrame
							site={plan}
							surface="panel"
							mapVersion={`v${baseVersion} draft`}
							title={siteName}
							subtitle={`Draft from v${baseVersion}`}
							zones={zoneStyles}
						/>
						<p className="type-small text-ink-2">{`Hatched: a boundary changed since v${baseVersion}, or a new zone.`}</p>
					</div>
				</Island>

				<div className="flex min-w-0 flex-col gap-6">
					<Island
						flush
						title="Ready to publish?"
						meta={check ? checkLine(check, current, iso => clock.time(iso)) : "Checking this revision…"}>
						<div className="flex flex-col gap-3 px-island-pad py-4">
							{!check ? (
								<p role="status" className="type-body text-ink-2">
									DECA Mark is checking revision {queue.acknowledged.revision}.
								</p>
							) : !current ? (
								<p role="status" className="type-body text-ink-2">
									The draft changed since that check. It is checked again once saved.
								</p>
							) : check.validation.ready ? (
								<p className="type-body font-semibold text-ink">
									{`Ready to publish: revision ${check.revision} has no problems.`}
								</p>
							) : (
								<>
									<p className="type-body text-ink">
										{`Not ready: ${blocking.length} ${blocking.length === 1 ? "problem stops" : "problems stop"} publishing.`}
									</p>
									<ul className="flex flex-col gap-2">
										{blocking.map(problem => (
											<li key={problem.text} className="type-body text-ink">
												{problem.text}
											</li>
										))}
									</ul>
									<ButtonLink variant="outline" size="sm" href={editorHref}>
										Fix in the editor
									</ButtonLink>
								</>
							)}
							{current && warnings.length > 0 && (
								<div className="flex flex-col gap-2">
									<p className="type-mono-label text-ink-2">Warnings</p>
									<ul className="flex flex-col gap-2">
										{warnings.map(problem => (
											<li key={problem.text} className="type-body text-ink">
												{problem.text}
											</li>
										))}
									</ul>
								</div>
							)}
							{saving.checkProblem && <p className="type-small text-ink-2">{saving.checkProblem}</p>}
						</div>
					</Island>

					<Island flush title="Changes" meta={check ? changeSummary(changes, baseVersion) : undefined}>
						{changes.length === 0 ? (
							<p className="px-island-pad py-4 type-body text-ink-2">
								{check
									? `Each zone is as it is in v${baseVersion}.`
									: "Changes appear once the revision is checked."}
							</p>
						) : (
							<ul>
								{changes.map(row => (
									<li
										key={row.zoneId}
										className="flex items-baseline justify-between gap-4 border-t border-rule px-island-pad py-3 first:border-t-0">
										<span className="min-w-0 break-words text-ink">{row.name}</span>
										<span className="type-small whitespace-nowrap text-ink-2">
											{CHANGE_WORDS[row.change]}
										</span>
									</li>
								))}
							</ul>
						)}
					</Island>
				</div>
			</div>

			<div className="grid items-start gap-6 lg:grid-cols-2">
				<Island title="What observers experience">
					<p className="type-body text-ink">
						{`Observers keep v${baseVersion} for observations they have started and for anything not yet uploaded. They get the new version once they download it in the DECA Mark app, and use it from their next collection after that. Until then they can keep collecting on v${baseVersion}, and those observations keep v${baseVersion}.`}
					</p>
				</Island>
				<Island flush divided title="Forms">
					<FactsList
						className="px-island-pad py-4"
						labelWidth="8.5rem"
						items={[
							{ label: "Play form", value: props.forms.play.form_version, mono: true },
							{
								label: "Inventory form",
								value: props.forms.inventory?.form_version ?? "No inventory on this map",
								mono: props.forms.inventory !== null
							}
						]}
					/>
				</Island>
			</div>

			<Island title="Publish">
				<div className="flex flex-col gap-5">
					<Field
						label="Change note"
						htmlFor={noteId}
						optional
						hint="Recommended: what changed and why. It is saved with the draft, and shown with the version."
						error={
							codePoints(queue.local.changeNote.trim()) > CHANGE_NOTE_MAX
								? "Shorten the note to 2,000 characters or fewer."
								: undefined
						}>
						<Textarea
							id={noteId}
							value={queue.local.changeNote}
							// The note publishes as it was checked; an edit made meanwhile would be left behind.
							readOnly={attempt.kind === "sending"}
							maxLength={CHANGE_NOTE_MAX}
							showCount
							rows={3}
							onChange={event => {
								const note = event.target.value;
								saving.edited(
									{ zones: queue.local.zones, changeNote: note },
									codePoints(note.trim()) > CHANGE_NOTE_MAX
										? "The change note is longer than 2,000 characters."
										: null
								);
							}}
						/>
					</Field>
					<Checkbox id={confirmId} checked={confirmed} onCheckedChange={setConfirmed}>
						I understand published boundaries cannot be edited. Changes need a new version.
					</Checkbox>
					<div>
						<Button
							variant="primary"
							icon="upload"
							busy={attempt.kind === "sending"}
							busyLabel="Publishing…"
							disabled={unavailable !== null}
							disabledReason={unavailable ?? undefined}
							onClick={() => void publish()}>
							{nextVersion !== null ? `Publish v${nextVersion}` : "Publish new version"}
						</Button>
					</div>
				</div>
			</Island>
		</div>
	);
}
