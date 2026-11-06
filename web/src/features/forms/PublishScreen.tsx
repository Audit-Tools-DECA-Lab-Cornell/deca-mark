"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Checkbox } from "@/components/contour/Checkbox";
import { Island } from "@/components/contour/Island";
import { Mono } from "@/components/contour/Mono";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { TextLink } from "@/components/contour/TextLink";
import { useToast } from "@/components/contour/Toast";
import { projectHref } from "@/features/shell/navigation";
import { rejected } from "@/lib/action-rejection";
import { plural } from "@/lib/labels";

import { ActionNote } from "./ActionNote";
import { publishVersionAction } from "./actions";
import type { EditorVersion } from "./DraftEditorScreen";
import type { Delivery, QuestionChange, SiteRef } from "./model";
import { type FlaggedQuestionView, ProtocolNotes, type ProtocolNoteView } from "./ProtocolNotes";
import type { FormActionFailure } from "./result";

export type PublishReview = {
	questions: { id: string; label: string; required: boolean }[];
	/** The version the draft is compared with, when there is one. */
	base: string | null;
	changes: QuestionChange[];
	/** Labels of the questions the version before had and this one does not. */
	removed: string[];
	notes: ProtocolNoteView[];
	flagged: FlaggedQuestionView[];
	delivery: Delivery;
	/** Other versions of this form that are published now. */
	olderPublished: string[];
	/** Sites whose current map package names another version of this form. */
	otherVersionSites: SiteRef[];
	/** What the form checker still finds wrong. Publishing waits until there is none. */
	problems: string[];
};

/**
 * Publish: what the version asks, what changed since the version before, the decisions still open, and what
 * publishing does and does not do for observers. Publishing needs the box ticked. It freezes this version,
 * leaves older ones published and sends nothing to a device by itself.
 */
export function PublishScreen({
	org,
	project,
	version,
	review
}: {
	org: string;
	project: string;
	version: EditorVersion;
	review: PublishReview;
}) {
	const router = useRouter();
	const toast = useToast();
	const confirmId = useId();
	const [confirmed, setConfirmed] = useState(false);
	const [failure, setFailure] = useState<FormActionFailure | null>(null);
	const [pending, start] = useTransition();

	const editor = projectHref(org, project, `forms/versions/${version.code}`);
	const versions = projectHref(org, project, `forms/versions?form=${encodeURIComponent(version.formCode)}`);
	const changedQuestions = new Set(review.changes.map(change => change.questionId)).size;
	const blocked = failure?.conflict
		? "Reload and review the changed draft before publishing."
		: review.problems.length > 0
			? "The form still has problems. Fix them in the editor first."
			: !confirmed
				? "Tick the box above to publish."
				: undefined;

	function publish() {
		if (blocked) return;
		setFailure(null);
		start(async () => {
			let result: Awaited<ReturnType<typeof publishVersionAction>>;
			try {
				result = await publishVersionAction({ org, project, version: version.code, etag: version.etag });
			} catch (error) {
				return setFailure(rejected(error, "reload", "Nothing was published."));
			}
			if (result.status === "failed") {
				setFailure(result);
				if (result.conflict) setConfirmed(false);
				return;
			}
			toast({
				title: `${version.code} is published`,
				description:
					review.olderPublished.length > 0
						? "Older versions stay published until you retire them."
						: "It is now fixed and cannot be edited.",
				tone: "saved"
			});
			router.push(versions);
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				breadcrumbs={[
					{ label: "Forms", href: projectHref(org, project, "forms") },
					{ label: version.formName, href: versions },
					{ label: version.code, href: editor },
					{ label: "Publish" }
				]}
				title="Review before publishing"
				lead={
					<>
						Publishing freezes <Mono>{version.code}</Mono> with its{" "}
						{plural(review.questions.length, "question")}. It cannot be edited afterwards.
					</>
				}
				actions={
					<ButtonLink href={editor} variant="outline" icon="arrow-left">
						Back to the editor
					</ButtonLink>
				}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.27fr)_minmax(0,1fr)]">
				<Island
					title={review.base ? `Changes since ${review.base}` : "Questions"}
					meta={
						review.base
							? `${plural(changedQuestions, "question")} changed · ${review.questions.length - changedQuestions} unchanged`
							: `First version · ${plural(review.questions.length, "question")}`
					}
					flush>
					{review.base ? (
						<>
							{review.changes.length === 0 && review.removed.length === 0 ? (
								<p className="px-island-pad py-5 type-body text-ink-2">
									No question differs from <Mono>{review.base}</Mono>. Publishing now makes a new
									version with the same wording.
								</p>
							) : (
								<ul className="divide-y divide-rule">
									{review.changes.map(change => (
										<li key={`${change.questionId}:${change.field}`} className="px-island-pad py-5">
											<Difference change={change} />
										</li>
									))}
									{review.removed.map(label => (
										<li key={`removed:${label}`} className="px-island-pad py-5">
											<p className="type-small text-ink-2">Removed since {review.base}</p>
											<p className="mt-1 type-body font-semibold text-ink">{label}</p>
										</li>
									))}
								</ul>
							)}
						</>
					) : (
						<ol className="divide-y divide-rule">
							{review.questions.map((question, index) => (
								<li
									key={question.id}
									className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 px-island-pad py-3">
									<span className="type-mono-data text-ink-2">
										{String(index + 1).padStart(2, "0")}
									</span>
									<span className="type-body text-ink">
										{question.label}
										<span className="block type-small text-ink-2">
											{question.required ? "Required" : "Optional"}
										</span>
									</span>
								</li>
							))}
						</ol>
					)}
				</Island>

				<div className="flex flex-col gap-6">
					<Island title="What happens for observers" divided={false}>
						<p className="type-body text-ink">{review.delivery.text}</p>
						{review.delivery.kind === "play" && review.otherVersionSites.length > 0 && (
							<p className="mt-3 type-body text-ink-2">
								Using another version of this form now:{" "}
								{review.otherVersionSites.map(site => site.name).join(", ")}.
							</p>
						)}
						<p className="mt-3 type-body text-ink-2">
							{review.olderPublished.length > 0
								? `Publishing does not retire older versions. ${review.olderPublished.join(", ")} ${review.olderPublished.length === 1 ? "stays" : "stay"} published until you retire ${review.olderPublished.length === 1 ? "it" : "them"}.`
								: "No other version of this form is published."}
						</p>
						{review.delivery.kind === "play" && (
							<p className="mt-3">
								<TextLink href={projectHref(org, project, "sites")}>
									Go to Sites to prepare a map package
								</TextLink>
							</p>
						)}
					</Island>
					<ProtocolNotes notes={review.notes} flagged={review.flagged} />
				</div>
			</div>

			<Island title="Publish" divided={false}>
				<div className="flex flex-col gap-5">
					{review.problems.length > 0 && (
						<Note tone="attention" title="The form checker found problems.">
							{review.problems.map(problem => (
								<span key={problem} className="block">
									{problem}
								</span>
							))}
						</Note>
					)}
					<Checkbox
						id={confirmId}
						checked={confirmed}
						disabled={review.problems.length > 0 || failure?.conflict}
						onCheckedChange={setConfirmed}>
						{review.delivery.confirm}
					</Checkbox>
					<ActionNote failure={failure} />
					<div>
						<Button
							variant="primary"
							icon="lock"
							disabled={blocked !== undefined}
							disabledReason={blocked}
							busy={pending}
							onClick={publish}>
							Publish {version.code}
						</Button>
					</div>
				</div>
			</Island>
		</div>
	);
}

function Difference({ change }: { change: QuestionChange }) {
	return (
		<div>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<Mono className="text-ink">{change.questionId}</Mono>
				<span className="type-small text-ink-2">{change.field}</span>
			</div>
			<dl className="mt-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
				{change.field !== "New question" && (
					<>
						<dt className="type-mono-label text-ink-2">Was</dt>
						<dd className="type-body text-ink-2">{change.was}</dd>
					</>
				)}
				<dt className="type-mono-label text-ink">Now</dt>
				<dd className="type-body font-semibold text-ink">{change.now}</dd>
			</dl>
			<p className="mt-3 type-small text-ink-2">{change.detail}</p>
		</div>
	);
}
