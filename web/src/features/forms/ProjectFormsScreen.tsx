"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Island } from "@/components/contour/Island";
import { Mono } from "@/components/contour/Mono";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { projectHref } from "@/features/shell/navigation";
import { plural } from "@/lib/labels";
import { clock } from "@/lib/time";

import type { FormRow } from "./model";
import { NewFormDialog } from "./NewFormDialog";
import type { TemplateInfo } from "./starter";

const LINK = "text-ink underline decoration-1 underline-offset-4 hover:decoration-2";

/**
 * Forms: every form in the project with its published version, its draft, how many questions it asks and
 * which sites' current map packages use it, each with the version its map names (which can be older than
 * the published one). Managers also see drafts and can start a new form.
 */
export function ProjectFormsScreen({
	org,
	project,
	forms,
	timeZone,
	canManage,
	templates,
	sitesProblem
}: {
	org: string;
	project: string;
	forms: readonly FormRow[];
	timeZone: string;
	canManage: boolean;
	templates: readonly TemplateInfo[];
	/** Why the sites could not be read, when they could not: "Used by" then says it was not checked. */
	sitesProblem: string | null;
}) {
	const day = clock(timeZone).day;
	const editor = (code: string) => projectHref(org, project, `forms/versions/${code}`);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Forms"
				lead="A form is the set of questions observers answer at each observation. A draft can change; a published version never does."
				actions={
					canManage ? (
						<NewFormDialog
							org={org}
							project={project}
							templates={templates}
							takenCodes={forms.map(form => form.code)}
						/>
					) : undefined
				}
			/>

			{sitesProblem && (
				<Note tone="attention" title="Which sites use each form could not be checked.">
					{sitesProblem}
				</Note>
			)}

			<Island title="Forms in this project" meta={plural(forms.length, "form")} flush>
				{forms.length === 0 ? (
					<ScreenState
						kind="empty"
						icon="file-text"
						headingLevel={3}
						title="No forms yet"
						body={
							canManage
								? "A form holds the questions observers answer. Use New form to start one from a template."
								: "A project manager creates forms and publishes them. Published forms appear here."
						}
					/>
				) : (
					<ul className="divide-y divide-rule">
						{forms.map(form => (
							<li key={form.code} className="px-island-pad py-6">
								<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
									<h3 className="type-section text-ink">
										<Link
											prefetch={false}
											href={projectHref(
												org,
												project,
												`forms/versions?form=${encodeURIComponent(form.code)}`
											)}
											className={LINK}>
											{form.name}
										</Link>
									</h3>
									<Mono className="text-ink-2">{form.code}</Mono>
								</div>
								<dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
									<Fact label="Published">
										{form.published ? (
											<>
												<Link
													prefetch={false}
													href={editor(form.published.code)}
													className={LINK}>
													<Mono>{form.published.code}</Mono>
												</Link>
												{form.published.publishedAt && (
													<span className="block type-small text-ink-2">
														{day(form.published.publishedAt)}
													</span>
												)}
											</>
										) : (
											"Not published yet"
										)}
									</Fact>
									{canManage && (
										<Fact label="Draft">
											{form.drafts.length === 0 ? (
												"No draft"
											) : (
												<span className="flex flex-col gap-1">
													{form.drafts.map(draft => (
														<Link
															key={draft.code}
															prefetch={false}
															href={editor(draft.code)}
															className="w-fit">
															<StateBadge
																kind="form"
																state="draft"
																label={`Draft · v${draft.version}`}
															/>
														</Link>
													))}
												</span>
											)}
										</Fact>
									)}
									<Fact label="Questions">{questionsOf(form)}</Fact>
									<Fact label="Used by">
										{sitesProblem ? (
											"Not checked"
										) : form.uses.length === 0 ? (
											form.published ? (
												"No site's current map package"
											) : (
												"Nothing yet"
											)
										) : (
											<ul className="flex flex-col gap-1">
												{form.uses.map(use => (
													<li key={`${use.code}/${use.versionCode}`}>
														<Link
															prefetch={false}
															href={projectHref(
																org,
																project,
																`sites/${encodeURIComponent(use.code)}`
															)}
															className={LINK}>
															{use.name}
														</Link>{" "}
														<span className="text-ink-2">
															· <Mono>v{use.version}</Mono>
														</span>
													</li>
												))}
											</ul>
										)}
									</Fact>
								</dl>
							</li>
						))}
					</ul>
				)}
			</Island>

			<ul className="grid gap-x-8 gap-y-4 md:grid-cols-3" aria-label="What each version state means">
				{LEGEND.map(item => (
					<li key={item.state} className="flex flex-col gap-1">
						<StateBadge kind="form" state={item.state} />
						<p className="type-body text-ink-2">{item.body}</p>
					</li>
				))}
			</ul>
		</div>
	);
}

const LEGEND = [
	{ state: "draft", body: "Wording can change. Observers cannot collect with it." },
	{ state: "published", body: "Fixed. Observers collect with it through a map package that names it." },
	{
		state: "retired",
		body: "No new map package can name it. Records already collected with it stay readable and still upload."
	}
] as const;

function questionsOf(form: FormRow): string {
	const shown = form.published ?? form.drafts[0] ?? form.newest;
	if (!shown) return "None";
	if (shown.legacy) return "From before the form editor";
	const count = plural(shown.questionCount, "question");
	return shown.state === "draft" ? `${count} in the draft` : count;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="min-w-0">
			<dt className="type-mono-label text-ink-2">{label}</dt>
			<dd className="mt-1 type-body text-ink">{children}</dd>
		</div>
	);
}
