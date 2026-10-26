"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Dialog, DialogClose } from "@/components/contour/Dialog";
import { Island } from "@/components/contour/Island";
import { Mono } from "@/components/contour/Mono";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { Segmented } from "@/components/contour/Segmented";
import { StateBadge } from "@/components/contour/StateBadge";
import { useToast } from "@/components/contour/Toast";
import { projectHref } from "@/features/shell/navigation";
import { useLeaveGuard } from "@/features/shell/useLeaveGuard";
import type { VersionState } from "@/lib/api/types";
import { validateFormDefinition } from "@/lib/forms";
import { plural } from "@/lib/labels";
import type { ProjectedSite } from "@/lib/plan";

import { ActionNote } from "./ActionNote";
import { saveDraftAction, startDraftAction } from "./actions";
import { AddQuestionDialog } from "./AddQuestionDialog";
import { CollectorPreview, type PreviewDevice } from "./CollectorPreview";
import { changedIds, isZoneForm, previousQuestion, questionNumber, sameDefinition, toForm } from "./model";
import { moveQuestion, questionIdColumns, renameQuestion } from "./operations";
import { draftProblems } from "./problems";
import { QuestionList } from "./QuestionList";
import { type QuestionPatch, QuestionSettings, saveProblem } from "./QuestionSettings";
import { addQuestion, type QuestionKind, type RawDefinition, removeQuestion, updateQuestion } from "./raw";
import type { FormActionFailure } from "./result";

/** What the collector view draws: the first site that has a map package, when there is one. */
export type CollectorContext = {
	plan: ProjectedSite | null;
	siteName: string;
	zoneId: string | null;
	zoneName: string | null;
	/** "v3"; null when no site has a map package. */
	mapVersion: string | null;
	timeZone?: string;
	observer?: { userId: string; code: string };
	captureInstant?: string;
};

export type EditorVersion = {
	etag: string;
	code: string;
	state: VersionState;
	formCode: string;
	formName: string;
};

/** Applies a patch to one question. An emptied guidance removes the key, as authored files have it. */
function patched(raw: RawDefinition, id: string, patch: QuestionPatch): RawDefinition {
	const clean: QuestionPatch = { ...patch };
	if ("hint" in clean && !clean.hint) clean.hint = undefined;
	return updateQuestion(raw, id, clean);
}

/**
 * The form editor: the version's questions, the selected question's settings and the collector view running
 * the edited version through the engine the device runs, as it is typed. A draft saves as a whole with
 * Save draft; the manager can leave only after saving or giving the edits up. A published or retired
 * version opens read-only, with a way to start a new draft from it.
 */
export function DraftEditorScreen({
	org,
	project,
	version,
	definition,
	base,
	baseProblem,
	canManage,
	collector
}: {
	org: string;
	project: string;
	version: EditorVersion;
	definition: RawDefinition;
	/** The version before this one, to mark what changed. */
	base: { code: string; definition: RawDefinition } | null;
	/** Why the version before could not be read, when it could not. */
	baseProblem: string | null;
	canManage: boolean;
	collector: CollectorContext;
}) {
	const router = useRouter();
	const toast = useToast();
	const editable = canManage && version.state === "draft";
	const readOnly = !editable;

	const [etag, setEtag] = useState(version.etag);
	const [saved, setSaved] = useState(definition);
	const [raw, setRaw] = useState(() => (editable ? questionIdColumns(definition) : definition));
	const [chosen, setChosen] = useState<string | null>(null);
	const [device, setDevice] = useState<PreviewDevice>("phone");
	const [failure, setFailure] = useState<FormActionFailure | null>(null);
	const [refused, setRefused] = useState<Record<string, Record<string, string>>>({});
	const [general, setGeneral] = useState<readonly string[]>([]);
	const [savedOnce, setSavedOnce] = useState(false);
	const [pending, start] = useTransition();

	const dirty = useMemo(() => editable && !sameDefinition(raw, saved), [editable, raw, saved]);
	const form = useMemo(() => toForm(raw), [raw]);
	const baseRaw = base?.definition;
	const changed = useMemo(() => changedIds(raw, baseRaw), [raw, baseRaw]);
	const unsaved = useMemo(() => {
		const before = new Map(saved.questions.map(question => [question.id, JSON.stringify(question)] as const));
		return new Set(raw.questions.filter(q => before.get(q.id) !== JSON.stringify(q)).map(q => q.id));
	}, [raw, saved]);
	const refusedIds = useMemo(() => new Set(Object.keys(refused)), [refused]);

	// The first thing that stops Save draft, in the order the questions are asked.
	const blocker = useMemo(() => {
		for (const [index, question] of raw.questions.entries()) {
			const problem = saveProblem(
				question,
				baseRaw?.questions.find(other => other.id === question.id)
			);
			if (problem) return `Question ${questionNumber(index)}: ${problem}`;
		}
		return validateFormDefinition(form)[0] ?? null;
	}, [raw, baseRaw, form]);

	// Leaving with unsaved edits asks first: closing the tab gets the browser's question, and a link inside
	// the workspace (Publish, a breadcrumb, a tab) is held until the manager saves, gives the edits up or stays.
	// Without this, the publish page would read the older saved wording.
	const guard = useLeaveGuard(dirty);

	const forms = projectHref(org, project, "forms");
	const versions = projectHref(org, project, `forms/versions?form=${encodeURIComponent(version.formCode)}`);
	const questions = raw.questions;
	const selectedId = questions.some(question => question.id === chosen) ? chosen : (questions[0]?.id ?? null);
	const selectedIndex = questions.findIndex(question => question.id === selectedId);
	const selected = questions[selectedIndex];
	const word = version.state === "draft" ? "draft" : version.state;

	function change(patch: QuestionPatch) {
		if (!selectedId || readOnly) return;
		setRaw(current => questionIdColumns(patched(current, selectedId, patch)));
		setRefused(current => {
			if (!(selectedId in current)) return current;
			return Object.fromEntries(Object.entries(current).filter(([id]) => id !== selectedId));
		});
	}

	function rename(nextId: string): string | null {
		if (!selectedId || readOnly) return "Choose an editable question first.";
		const result = renameQuestion(raw, selectedId, nextId);
		if (!result.ok) return result.problem;
		setRaw(result.raw);
		setChosen(result.id);
		setRefused({});
		return null;
	}

	function move(id: string, target: number): string | null {
		if (readOnly) return "Start a new draft to change the question order.";
		const result = moveQuestion(raw, id, target);
		if (!result.ok) return result.problem;
		setRaw(result.raw);
		setChosen(id);
		setRefused({});
		return null;
	}

	function save(afterwards?: () => void) {
		if (!editable || pending || blocker || failure?.conflict) return;
		const sent = raw;
		setFailure(null);
		start(async () => {
			const result = await saveDraftAction({
				org,
				project,
				version: version.code,
				etag,
				definition: JSON.parse(JSON.stringify(sent)) as Record<string, unknown>
			});
			if (result.status === "done") {
				setSaved(sent);
				setEtag(result.etag);
				setRefused({});
				setGeneral([]);
				setSavedOnce(true);
				toast({
					title: "Draft saved",
					description: `${version.code} has the wording you see here.`,
					tone: "saved"
				});
				afterwards?.();
				return;
			}
			setFailure(result);
			const placed = draftProblems(result.fields);
			setGeneral(placed.general);
			const byId: Record<string, Record<string, string>> = {};
			for (const [index, properties] of Object.entries(placed.byQuestion)) {
				const question = sent.questions[Number(index)];
				if (question) byId[question.id] = { ...properties };
			}
			setRefused(byId);
			const first = sent.questions.find(question => byId[question.id]);
			if (first) setChosen(first.id);
		});
	}

	function add(label: string, kind: QuestionKind) {
		const { raw: next, id } = addQuestion(raw, "Record", kind, label, collector.timeZone ?? "UTC");
		setRaw(next);
		setChosen(id);
	}

	function remove(id: string) {
		setRaw(current => removeQuestion(current, id));
		setChosen(null);
	}

	function startFromThis() {
		setFailure(null);
		start(async () => {
			const result = await startDraftAction({ org, project, form: version.formCode, from: version.code });
			if (result.status === "failed") return setFailure(result);
			toast({
				title: `${result.version} is a new draft`,
				description: `Copied from ${version.code}, which stays as it is.`,
				tone: "saved"
			});
			router.push(projectHref(org, project, `forms/versions/${result.version}`));
		});
	}

	function leaveWithoutSaving() {
		setRaw(saved);
		guard.leave();
	}

	const lead = readOnly ? (
		<>
			<Mono>{version.code}</Mono> is {word}. Its wording and rules are fixed.
		</>
	) : (
		<>
			<Mono>{version.code}</Mono> is a draft. Reword and add questions, then save. Nothing reaches observers until
			you publish it.
		</>
	);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				breadcrumbs={[
					{ label: "Forms", href: forms },
					{ label: version.formName, href: versions },
					{ label: version.code }
				]}
				title={version.formName}
				titleAddon={<StateBadge kind="form" state={version.state} />}
				lead={lead}
				actions={
					editable ? (
						<>
							<Button
								variant="primary"
								icon="check"
								busy={pending}
								disabled={!dirty || blocker !== null || failure?.conflict}
								disabledReason={
									failure?.conflict
										? "Reload and reconcile the changed draft before saving."
										: (blocker ??
											(savedOnce ? "All changes saved." : "No changes since the last save."))
								}
								onClick={() => save()}>
								Save draft
							</Button>
							<ButtonLink
								variant="ink"
								iconRight="arrow-right"
								href={projectHref(org, project, `forms/versions/${version.code}/publish`)}>
								Publish
							</ButtonLink>
						</>
					) : undefined
				}
			/>

			{readOnly && (
				<Note tone="neutral" icon="lock">
					<span className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
						<span>
							{version.state === "retired"
								? "A retired version cannot change. It stays readable for the records collected with it."
								: version.state === "published"
									? canManage
										? "A published version cannot change. Start a new draft to edit."
										: "A published version cannot change. Only project managers can start a new draft."
									: "Only project managers can edit a draft."}
						</span>
						{canManage && version.state !== "draft" && (
							<Button variant="outline" icon="pencil" busy={pending} onClick={startFromThis}>
								Start a new draft from this version
							</Button>
						)}
					</span>
				</Note>
			)}
			{baseProblem && (
				<Note tone="waiting" icon="clock">
					{baseProblem}
				</Note>
			)}
			<ActionNote
				failure={failure}
				reloadLabel="Open latest draft"
				onReload={() => window.open(window.location.href, "_blank", "noopener")}
			/>
			{failure?.conflict && (
				<Note tone="waiting">
					Your unsaved edits are still here. Open the latest draft in another tab to compare. Reload this page
					before saving again.
				</Note>
			)}
			{general.length > 0 && (
				<Note tone="attention" title="The form checker found problems.">
					{general.map(problem => (
						<span key={problem} className="block">
							{problem}
						</span>
					))}
				</Note>
			)}

			<div
				className={
					device === "tablet"
						? "grid items-start gap-6 lg:grid-cols-2"
						: "grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,0.95fr)]"
				}>
				<Island title="Questions" meta={dirty ? "Unsaved changes" : plural(questions.length, "question")} flush>
					{questions.length === 0 ? (
						<ScreenState
							kind="empty"
							icon="file-text"
							headingLevel={3}
							title="No questions yet"
							body="This version has no questions to show."
						/>
					) : (
						<QuestionList
							questions={questions}
							selectedId={selectedId}
							changed={changed}
							unsaved={unsaved}
							refused={refusedIds}
							onSelect={setChosen}
							readOnly={readOnly}
							onMove={move}
						/>
					)}
					{editable && (
						<div className="border-t border-rule px-5 py-4">
							<AddQuestionDialog onAdd={add} />
						</div>
					)}
				</Island>

				<Island
					title="Question settings"
					meta={
						selected ? (
							<Mono className="text-ink-2">{`${questionNumber(selectedIndex)} · ${selected.code}`}</Mono>
						) : undefined
					}
					divided={false}>
					{selected ? (
						<QuestionSettings
							key={selected.id}
							question={selected}
							questions={questions}
							base={previousQuestion(selected, baseRaw)}
							baseVersion={base?.code ?? null}
							readOnly={readOnly}
							timeZone={collector.timeZone}
							problems={refused[selected.id] ?? {}}
							onChange={change}
							onRename={rename}
							onRemove={questions.length > 1 ? () => remove(selected.id) : undefined}
						/>
					) : (
						<p className="type-body text-ink-2">Choose a question to see its settings.</p>
					)}
				</Island>

				<section
					aria-label="Collector view"
					className={
						device === "tablet"
							? "flex flex-col gap-4 lg:col-span-2"
							: "flex flex-col gap-4 lg:col-span-2 xl:col-span-1"
					}>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="min-w-32 grow basis-0 type-mono-label text-ink-2">
							As observers see it · {device}
						</h2>
						<div className="shrink-0">
							<Segmented
								label="Device"
								value={device}
								onValueChange={value => setDevice(value as PreviewDevice)}
								options={[
									{ value: "phone", label: "Phone" },
									{ value: "tablet", label: "Tablet" }
								]}
							/>
						</div>
					</div>
					<CollectorPreview
						form={form}
						versionLabel={`${version.code} ${word}`}
						device={device}
						focusQuestionId={selectedId}
						plan={collector.plan}
						zoneId={collector.zoneId}
						siteName={collector.siteName}
						zoneName={collector.zoneName}
						round={isZoneForm(raw) ? "Inventory round" : "Standard round"}
						mapVersion={collector.mapVersion}
						observer={collector.observer}
						captureInstant={collector.captureInstant}
					/>
				</section>
			</div>

			<Dialog
				open={guard.leavingTo !== null}
				onOpenChange={open => {
					if (!open) guard.stay();
				}}
				title="Save your changes first?"
				description="This draft has edits that are not saved. If you leave without saving, they are lost and the draft keeps its earlier wording."
				footer={
					<>
						<DialogClose asChild>
							<Button variant="outline">Keep editing</Button>
						</DialogClose>
						<Button variant="outline" icon="arrow-right" onClick={leaveWithoutSaving}>
							Leave without saving
						</Button>
						<Button
							variant="ink"
							icon="check"
							busy={pending}
							disabled={blocker !== null || failure?.conflict}
							disabledReason={
								failure?.conflict
									? "Reload and reconcile the changed draft before saving."
									: blocker
										? `${blocker} Or leave without saving.`
										: undefined
							}
							onClick={() => save(() => guard.leave())}>
							Save and leave
						</Button>
					</>
				}
			/>
		</div>
	);
}
