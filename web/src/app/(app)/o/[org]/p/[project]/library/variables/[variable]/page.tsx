import type { Metadata } from "next";

import { ProjectLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";
import { projectHref } from "@/features/shell/navigation";

export const metadata: Metadata = { title: "Variable" };

/** One variable this project can use, read-only for anyone who may not change its level. */
export default async function ProjectVariablePage({ params }: { params: Promise<{ org: string; project: string }> }) {
	const { org, project } = await params;
	return (
		<ProjectLibraryGate org={org} project={project} title="Variable">
			<LibraryNotYet
				title="Variable"
				breadcrumbs={[{ label: "Library", href: projectHref(org, project, "library") }, { label: "Variable" }]}
				place="project"
			/>
		</ProjectLibraryGate>
	);
}
