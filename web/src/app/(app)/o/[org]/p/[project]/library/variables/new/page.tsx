import type { Metadata } from "next";

import { ProjectLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { projectHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "New variable" };

/** A new Project or Site variable: project managers, and the organization's owners and admins. */
export default async function ProjectNewVariablePage({
	params
}: {
	params: Promise<{ org: string; project: string }>;
}) {
	const { org, project } = await params;
	return (
		<ProjectLibraryGate org={org} project={project} needs="change" title="New variable">
			<LibraryNotYet
				title="New variable"
				breadcrumbs={[
					{ label: "Library", href: projectHref(org, project, "library") },
					{ label: "New variable" }
				]}
				place="project"
			/>
		</ProjectLibraryGate>
	);
}
