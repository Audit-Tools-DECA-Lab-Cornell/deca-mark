import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ShellMain, ShellTabsRow } from "@/components/shell/ShellMain";
import { ProjectTabs } from "@/components/shell/WorkspaceTabs";
import { projectHref } from "@/features/shell/navigation";
import { RememberPlace } from "@/features/shell/RememberPlace";
import { getWorkspace, resolveProject } from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";
import { collectPath } from "@/lib/workspace/home";

/**
 * A project's pages under its eight tabs (D21). The project comes from the person's memberships: one they
 * are not on is the in-shell "not found", and an observer, who collects on the phone, goes to the collect
 * page. Each page checks the role itself; Team and Settings are for managers.
 */
export default async function ProjectLayout({
	children,
	params
}: Readonly<{ children: ReactNode; params: Promise<{ org: string; project: string }> }>) {
	const { org, project } = await params;
	// The organization layout says why when the workspace could not load.
	if ((await getWorkspace()).status !== "ready") return null;
	const ref = await resolveProject(org, project);
	if (!ref) notFound();
	if (projectAbilities(ref.role).collectOnly) redirect(collectPath(org));
	return (
		<>
			<RememberPlace path={projectHref(org, project)} />
			<ShellTabsRow>
				<ProjectTabs org={org} project={project} />
			</ShellTabsRow>
			<ShellMain afterTabs>{children}</ShellMain>
		</>
	);
}
