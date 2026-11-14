import type { Metadata } from "next";

import { ProjectLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { projectHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "Form templates" };

/** The form templates a new form can start from. Read-only here; they are edited in the organization library. */
export default async function ProjectTemplatesPage({ params }: { params: Promise<{ org: string; project: string }> }) {
	const { org, project } = await params;
	return (
		<ProjectLibraryGate org={org} project={project} title="Form templates">
			<LibraryNotYet
				title="Form templates"
				breadcrumbs={[
					{ label: "Library", href: projectHref(org, project, "library") },
					{ label: "Form templates" }
				]}
				place="project"
			/>
		</ProjectLibraryGate>
	);
}
