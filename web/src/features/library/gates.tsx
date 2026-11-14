import "server-only";

import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/contour/PageHeader";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { OrgNoAccess } from "@/features/org/NoAccess";
import { readOrg } from "@/features/org/read";
import { resolveOrg, resolveProject } from "@/lib/api/workspace";
import { stateOf } from "@/lib/contour";
import { orgAbilities, projectAbilities } from "@/lib/workspace/access";

/**
 * Who may open each library page (LIBRARY-UI.md section 3). A page renders its gate first and puts its
 * content inside, so nothing is read for someone the page is not for. Hiding the tab is not enough,
 * because people open addresses directly.
 */

/** The organization library and its form templates: owners and admins only. */
export async function OrgLibraryGate({ address, children }: { address: string; children: ReactNode }) {
	const found = await readOrg(address);
	if (!found.ok) return <LoadFailure failure={found.failure} what="the library" />;
	if (!orgAbilities(found.data.role).manage)
		return (
			<OrgNoAccess
				what="the library"
				noAccess="Only organization owners and admins can open the organization library."
			/>
		);
	return children;
}

/**
 * A project's library pages. Everyone who sees Forms may read them (the project layout has already sent
 * observers to the collect page). `change` is for pages that add to the library: project managers, and
 * the organization's owners and admins.
 */
export async function ProjectLibraryGate({
	org,
	project,
	needs = "read",
	title,
	children
}: {
	org: string;
	project: string;
	needs?: "read" | "change";
	/** The page's name, shown above the no-access state. */
	title: string;
	children: ReactNode;
}) {
	const [ref, orgRef] = await Promise.all([resolveProject(org, project), resolveOrg(org)]);
	if (!ref) notFound();
	const mayChange = projectAbilities(ref.role).manage || orgAbilities(orgRef?.role ?? null).manage;
	if (needs === "change" && !mayChange)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title={title} />
				<LoadFailure
					failure={{
						code: "role_required",
						kind: "rejected",
						message: `You are a ${stateOf("role", ref.role).label.toLowerCase()} on ${ref.name}. Ask a project manager if the library needs a new variable.`
					}}
					what="this page"
					noAccess="Only project managers can add variables to the library."
				/>
			</div>
		);
	return children;
}
