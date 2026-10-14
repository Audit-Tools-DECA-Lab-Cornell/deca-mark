"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Island } from "@/components/contour/Island";
import { Mono } from "@/components/contour/Mono";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { useToast } from "@/components/contour/Toast";
import { projectHref } from "@/features/shell/navigation";
import { plural } from "@/lib/labels";
import { clock } from "@/lib/time";

import { ActionNote } from "./ActionNote";
import { startDraftAction } from "./actions";
import { DiscardDialog } from "./DiscardDialog";
import type { FormRow, VersionRow } from "./model";
import type { FormActionFailure } from "./result";
import { RetireDialog } from "./RetireDialog";

const LINK = "text-ink underline decoration-1 underline-offset-4 hover:decoration-2";

/** Why a form cannot be copied into a new draft, or null when it can. */
function copyBlock(form: FormRow): string | null {
	if (!form.newest) return "This form has no version to copy.";
	if (form.newest.legacy)
		return "This form is from before the form editor, so it cannot be copied. Create a new form instead.";
	return null;
}

/** Start new draft. The label stays as it is while the draft is made, so the button keeps its name. */
function StartButton({
	form,
	variant,
	busy,
	onStart
}: {
	form: FormRow;
	variant: "primary" | "outline";
	busy: boolean;
	onStart: () => void;
}) {
	const block = copyBlock(form);
	return (
		<Button
			variant={variant}
			size={variant === "primary" ? "md" : "sm"}
			icon="pencil"
			disabled={block !== null}
			disabledReason={block ?? undefined}
			busy={busy}
			onClick={onStart}>
			Start new draft
		</Button>
	);
}

/**
 * Form versions: every version of a form with its state, the sites that use it and what a manager can do
 * with it. Start new draft copies the newest version; Discard removes a draft; Retire stops a published
 * version being used for new map packages. Readers see the same table without the actions.
 */
export function FormVersionsScreen({
	org,
	project,
	forms,
	requested,
	timeZone,
	canManage,
	sitesProblem
}: {
	org: string;
	project: string;
	/** The forms to show: the requested one, or all of them. */
	forms: readonly FormRow[];
	/** The form code in the address, when there is one. */
	requested: string | null;
	timeZone: string;
	canManage: boolean;
	sitesProblem: string | null;
}) {
	const router = useRouter();
	const toast = useToast();
	const [failure, setFailure] = useState<FormActionFailure | null>(null);
	const [pending, start] = useTransition();
	const [starting, setStarting] = useState<string | null>(null);
	const formsHref = projectHref(org, project, "forms");
	const editor = (code: string) => projectHref(org, project, `forms/versions/${code}`);
	const single = requested !== null ? (forms[0] ?? null) : null;

	function startDraft(form: FormRow) {
		setFailure(null);
		setStarting(form.code);
		start(async () => {
			const result = await startDraftAction({ org, project, form: form.code });
			setStarting(null);
			if (result.status === "failed") return setFailure(result);
			toast({
				title: `${result.version} is a new draft`,
				description: `Copied from ${form.newest?.code ?? "the newest version"}, which stays as it is.`,
				tone: "saved"
			});
			router.push(editor(result.version));
		});
	}

	if (requested !== null && !single)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader
					breadcrumbs={[{ label: "Forms", href: formsHref }, { label: "Form versions" }]}
					title="Form versions"
				/>
				<Island flush>
					<ScreenState
						kind="empty"
						icon="file-text"
						headingLevel={2}
						title="This form is not in the project"
						body={`No form has the code ${requested}. It may have been misspelled in the address.`}
						actions={
							<ButtonLink href={formsHref} variant="ink" icon="arrow-left">
								Back to forms
							</ButtonLink>
						}
					/>
				</Island>
			</div>
		);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				breadcrumbs={[{ label: "Forms", href: formsHref }, { label: single ? single.name : "Form versions" }]}
				title={single ? single.name : "Form versions"}
				lead={
					single ? (
						<>
							<Mono>{single.code}</Mono> · A draft can change. A published version never does.
						</>
					) : (
						"Every version of every form in this project. A draft can change; a published version never does."
					)
				}
				actions={
					canManage && single ? (
						<StartButton
							form={single}
							variant="primary"
							busy={pending && starting === single.code}
							onStart={() => startDraft(single)}
						/>
					) : undefined
				}
			/>

			{sitesProblem && (
				<Note tone="attention" title="Which sites use each version could not be checked.">
					{sitesProblem}
				</Note>
			)}
			<ActionNote failure={failure} />

			{forms.length === 0 ? (
				<Island flush>
					<ScreenState
						kind="empty"
						icon="file-text"
						headingLevel={2}
						title="No forms yet"
						body={
							canManage
								? "Create a form on Forms. Its versions appear here."
								: "A project manager creates forms and publishes them."
						}
						actions={
							<ButtonLink href={formsHref} variant="ink" icon="arrow-left">
								Back to forms
							</ButtonLink>
						}
					/>
				</Island>
			) : (
				forms.map(form => (
					<Island
						key={form.code}
						title={form.name}
						meta={
							<>
								<Mono>{form.code}</Mono> · {plural(form.versions.length, "version")}
							</>
						}
						actions={
							canManage && !single ? (
								<StartButton
									form={form}
									variant="outline"
									busy={pending && starting === form.code}
									onStart={() => startDraft(form)}
								/>
							) : undefined
						}
						flush>
						{form.versions.length === 0 ? (
							<ScreenState
								kind="empty"
								icon="file-text"
								headingLevel={3}
								title="Nothing is published yet"
								body="This form has no published version. A project manager publishes one."
							/>
						) : (
							<VersionsTable
								org={org}
								project={project}
								form={form}
								timeZone={timeZone}
								canManage={canManage}
								sitesChecked={sitesProblem === null}
							/>
						)}
					</Island>
				))
			)}
		</div>
	);
}

function VersionActions({
	org,
	project,
	version,
	canManage
}: {
	org: string;
	project: string;
	version: VersionRow;
	canManage: boolean;
}) {
	if (!canManage) return null;
	if (version.state === "draft")
		return (
			<div className="flex flex-wrap items-center gap-2">
				<ButtonLink
					href={projectHref(org, project, `forms/versions/${version.code}`)}
					variant="outline"
					size="sm"
					icon="pencil"
					aria-label={`Edit draft ${version.code}`}>
					Edit draft
				</ButtonLink>
				<DiscardDialog org={org} project={project} version={version} />
			</div>
		);
	if (version.state === "published") return <RetireDialog org={org} project={project} version={version} />;
	return null;
}

const STATE_WORD = { draft: "Draft", published: "Published", retired: "Retired" } as const;

function stateLabel(version: VersionRow): string {
	return `${STATE_WORD[version.state]} · v${version.version}`;
}

function VersionsTable({
	org,
	project,
	form,
	timeZone,
	canManage,
	sitesChecked
}: {
	org: string;
	project: string;
	form: FormRow;
	timeZone: string;
	canManage: boolean;
	sitesChecked: boolean;
}) {
	const day = clock(timeZone).day;
	const editor = (code: string) => projectHref(org, project, `forms/versions/${code}`);
	const when = (version: VersionRow) =>
		version.state === "draft"
			? `Started ${day(version.createdAt)}`
			: version.publishedAt
				? `Published ${day(version.publishedAt)}`
				: "Not published";
	const used = (version: VersionRow) =>
		!sitesChecked
			? "Not checked"
			: version.sites.length > 0
				? version.sites.map(site => site.name).join(", ")
				: "No site";
	const questions = (version: VersionRow) =>
		version.legacy ? "From before the form editor" : plural(version.questionCount, "question");

	return (
		<>
			{/* Below 640 px each version is a card: the code and state on top, then its facts, then its actions. */}
			<ul className="divide-y divide-rule sm:hidden">
				{form.versions.map(version => (
					<li key={version.code} className="flex flex-col gap-2 px-island-pad py-4">
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<Link prefetch={false} href={editor(version.code)} className={LINK}>
								<Mono>{version.code}</Mono>
							</Link>
							<StateBadge kind="form" state={version.state} label={stateLabel(version)} />
						</div>
						<p className="type-small text-ink-2">
							{questions(version)} · {when(version)}
						</p>
						<p className="type-small text-ink-2">Used by: {used(version)}</p>
						<VersionActions org={org} project={project} version={version} canManage={canManage} />
					</li>
				))}
			</ul>
			<div className="hidden sm:block">
				<Table caption={`Versions of ${form.name}`}>
					<THead>
						<tr>
							<Th>Version</Th>
							<Th>State</Th>
							<Th>Questions</Th>
							<Th>When</Th>
							<Th>Used by</Th>
							{canManage && (
								<Th>
									<span className="sr-only">Actions</span>
								</Th>
							)}
						</tr>
					</THead>
					<TBody>
						{form.versions.map(version => (
							<Tr key={version.code}>
								<Td nowrap>
										<Link prefetch={false} href={editor(version.code)} className={LINK}>
										<Mono>{version.code}</Mono>
									</Link>
								</Td>
								<Td nowrap>
									<StateBadge kind="form" state={version.state} label={stateLabel(version)} />
								</Td>
								<Td>{questions(version)}</Td>
								<Td>{when(version)}</Td>
								<Td>{used(version)}</Td>
								{canManage && (
									<Td>
										<VersionActions
											org={org}
											project={project}
											version={version}
											canManage={canManage}
										/>
									</Td>
								)}
							</Tr>
						))}
					</TBody>
				</Table>
			</div>
		</>
	);
}
