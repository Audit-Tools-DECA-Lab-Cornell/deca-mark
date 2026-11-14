import type { IconName } from "@/components/contour/Icon";

/**
 * Where the workspace's pages are (D21) and what the shell calls them. Plain data, readable from server
 * and client components alike. Nothing here knows who is signed in: `useWorkspace()` decides which
 * sections a person sees, from their role.
 */

export type Section = {
	/** The URL segment under the project or organization; "" is the root page. */
	segment: string;
	/** The tab label. */
	label: string;
	/** The page's name in words, for the error page's "Page" fact and the palette. */
	pageName: string;
	icon: IconName;
	/** The `g` chord's second key. */
	go: string;
	/**
	 * Shown only to people who manage the place: project managers for project sections, organization
	 * owners and admins for organization sections. A viewer has no Team or Settings tab, and only owners
	 * and admins have the organization's Members, Library and Settings.
	 */
	managersOnly?: boolean;
};

export const PROJECT_SECTIONS: Section[] = [
	{ segment: "", label: "Overview", pageName: "Overview", icon: "layout-grid", go: "o" },
	{ segment: "data", label: "Data", pageName: "Observation data", icon: "table", go: "d" },
	{ segment: "sites", label: "Sites", pageName: "Sites", icon: "map", go: "s" },
	{ segment: "forms", label: "Forms", pageName: "Forms", icon: "file-text", go: "f" },
	{ segment: "library", label: "Library", pageName: "Library", icon: "book-open", go: "l" },
	{ segment: "team", label: "Team", pageName: "Project team", icon: "users", go: "t", managersOnly: true },
	{ segment: "qgis", label: "QGIS", pageName: "QGIS", icon: "layers", go: "q" },
	{ segment: "reports", label: "Reports", pageName: "Reports", icon: "printer", go: "r" },
	{
		segment: "settings",
		label: "Settings",
		pageName: "Project settings",
		icon: "settings",
		go: ",",
		managersOnly: true
	}
];

export const ORG_SECTIONS: Section[] = [
	{ segment: "", label: "Projects", pageName: "Projects", icon: "folder", go: "p" },
	{
		segment: "members",
		label: "Members",
		pageName: "Organization members",
		icon: "users",
		go: "m",
		managersOnly: true
	},
	{
		segment: "library",
		label: "Library",
		pageName: "Organization library",
		icon: "book-open",
		go: "l",
		managersOnly: true
	},
	{
		segment: "settings",
		label: "Settings",
		pageName: "Organization settings",
		icon: "settings",
		go: ",",
		managersOnly: true
	}
];

/** The sections a person sees: all of them when they manage the place, otherwise the open ones. */
export function visibleSections(sections: readonly Section[], manages: boolean): Section[] {
	return sections.filter(section => manages || !section.managersOnly);
}

/** The cookie `/o` reads to reopen the last project (`homeFor` in lib/workspace/home.ts). Path only. */
export const PLACE_COOKIE = "fm-place";

export function orgHref(org: string, segment = ""): string {
	return segment ? `/o/${org}/${segment}` : `/o/${org}`;
}

export function projectHref(org: string, project: string, segment = ""): string {
	return segment ? `/o/${org}/p/${project}/${segment}` : `/o/${org}/p/${project}`;
}

export type ScopeKind = "project" | "org" | "collect" | "account" | "other";

export type Scope = {
	kind: ScopeKind;
	/** The organization's web address in the path, or "" outside /o/<org>. */
	org: string;
	/** The project's code in the path, on a project page. */
	project?: string;
	/** The first URL segment under the project or organization: "data", "members", "" for the root. */
	section: string;
};

/** Reads the page's place in the workspace from its path, without checking that the place exists. */
export function scopeOf(pathname: string): Scope {
	const parts = pathname.split("/").filter(Boolean);
	if (parts[0] === "account") return { kind: "account", org: "", section: "" };
	if (parts[0] !== "o" || !parts[1]) return { kind: "other", org: "", section: "" };
	const org = parts[1];
	if (parts[2] === "p" && parts[3]) return { kind: "project", org, project: parts[3], section: parts[4] ?? "" };
	if (parts[2] === "collect") return { kind: "collect", org, section: "collect" };
	return { kind: "org", org, section: parts[2] ?? "" };
}

/** The page's name in words, from its path: "Observation data", "Organization members". */
export function pageNameOf(pathname: string): string {
	const scope = scopeOf(pathname);
	if (scope.kind === "account") return "Account";
	if (scope.kind === "collect") return "Collect on your phone";
	if (scope.kind === "project") {
		return PROJECT_SECTIONS.find(section => section.segment === scope.section)?.pageName ?? "Project page";
	}
	if (scope.kind === "org") {
		return ORG_SECTIONS.find(section => section.segment === scope.section)?.pageName ?? "Organization page";
	}
	return "Workspace page";
}
