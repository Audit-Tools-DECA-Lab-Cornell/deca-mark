import { notFound, redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";
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
 *
 * The loading skeleton is one Suspense here, around the page, and not a `loading.tsx`: a `loading.tsx` makes
 * Next key a new boundary by each child segment, so every tab switch mounted one and React's 300 ms fallback
 * reveal throttle held the ready page (WEB-50). This boundary stays mounted across tabs; a hard load still
 * shows the skeleton, still rows after the skeleton delay.
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
			<ShellMain afterTabs>
				<Suspense
					fallback={
						<Island flush divided={false}>
							<ScreenState kind="loading" loadingLabel="Loading the project…" rows={5} />
						</Island>
					}>
					{children}
				</Suspense>
			</ShellMain>
		</>
	);
}
