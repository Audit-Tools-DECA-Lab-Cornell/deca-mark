import type { Metadata } from "next";

import { ProjectLibraryGate } from "@/features/library/gates";
import { LibraryNotYet } from "@/features/library/LibraryNotYet";

export const metadata: Metadata = { title: "Library" };

/** A project's library: the variables of all four levels it can use. Open to everyone who sees Forms. */
export default async function ProjectLibraryPage({ params }: { params: Promise<{ org: string; project: string }> }) {
	const { org, project } = await params;
	return (
		<ProjectLibraryGate org={org} project={project} title="Library">
			<LibraryNotYet
				title="Library"
				lead="Variables and form templates this project's forms can use."
				place="project"
			/>
		</ProjectLibraryGate>
	);
}
