import { ButtonLink } from "@/components/contour/Button";
import { Island } from "@/components/contour/Island";
import { Mono } from "@/components/contour/Mono";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { projectHref } from "@/features/shell/navigation";
import { plural } from "@/lib/labels";
import type { FormQuestion } from "@/lib/observations/answers";

import type { EditorVersion } from "./DraftEditorScreen";

const KIND: Record<FormQuestion["kind"], string> = {
	one: "Single choice",
	many: "Several choices",
	text: "Free text",
	number: "Number",
	dateTime: "Date/Time",
	boolean: "Yes or no"
};

/**
 * A version from before the form editor: a list of fields rather than questions. It is shown as it was
 * stored, so the records collected with it can be read, but it cannot be edited or copied.
 */
export function LegacyVersionScreen({
	org,
	project,
	version,
	fields
}: {
	org: string;
	project: string;
	version: EditorVersion;
	fields: readonly FormQuestion[];
}) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				breadcrumbs={[
					{ label: "Forms", href: projectHref(org, project, "forms") },
					{
						label: version.formName,
						href: projectHref(org, project, `forms/versions?form=${encodeURIComponent(version.formCode)}`)
					},
					{ label: version.code }
				]}
				title={version.formName}
				titleAddon={<StateBadge kind="form" state={version.state} />}
				lead={
					<>
						<Mono>{version.code}</Mono> is from before the form editor.
					</>
				}
			/>
			<Note tone="neutral" icon="lock">
				This form lists fields rather than questions, so it can be read here but not edited or copied. To
				replace it, create a new form on Forms.
			</Note>
			<Island title="Fields" meta={plural(fields.length, "field")} flush>
				{fields.length === 0 ? (
					<ScreenState
						kind="empty"
						icon="file-text"
						headingLevel={3}
						title="No fields to show"
						body="This version holds no fields that can be read."
						actions={
							<ButtonLink href={projectHref(org, project, "forms")} variant="ink" icon="arrow-left">
								Back to forms
							</ButtonLink>
						}
					/>
				) : (
					<ul className="divide-y divide-rule">
						{fields.map(field => (
							<li key={field.id} className="px-island-pad py-4">
								<p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
									<span className="type-body font-semibold text-ink">{field.label}</span>
									<Mono className="text-ink-2">{field.id}</Mono>
								</p>
								<p className="mt-1 type-small text-ink-2">
									{KIND[field.kind]} · {field.required ? "Required" : "Optional"}
									{field.options.length > 0 &&
										` · ${field.options.map(option => option.label).join(", ")}`}
								</p>
							</li>
						))}
					</ul>
				)}
			</Island>
		</div>
	);
}
