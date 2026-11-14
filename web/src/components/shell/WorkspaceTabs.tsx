"use client";

import { InkTabs } from "@/components/contour/InkTabs";
import { ORG_SECTIONS, orgHref, PROJECT_SECTIONS, projectHref, visibleSections } from "@/features/shell/navigation";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";

/**
 * Overview · Data · Sites · Forms · Library · Team · QGIS · Reports · Settings. Team and Settings are for
 * project managers; a viewer does not see them.
 */
export function ProjectTabs({ org, project }: { org: string; project: string }) {
	const { projectAbilities } = useWorkspace();
	const items = visibleSections(PROJECT_SECTIONS, projectAbilities.manage).map(section => ({
		href: projectHref(org, project, section.segment),
		label: section.label
	}));
	return <InkTabs items={items} label="Project" />;
}

/** Projects · Members · Library · Settings. All but Projects are for organization owners and admins. */
export function OrgTabs({ org }: { org: string }) {
	const { orgAbilities } = useWorkspace();
	const items = visibleSections(ORG_SECTIONS, orgAbilities.manage).map(section => ({
		href: orgHref(org, section.segment),
		label: section.label
	}));
	return <InkTabs items={items} label="Organization" />;
}
