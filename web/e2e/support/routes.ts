import { listForms } from "./api";
import { manifest, orgPath, projectPath, type Role, SEED } from "./manifest";

/** One page the honesty scan opens, as the account that would normally see it. */
export type ScanRoute = {
	/** Screenshot file name and test title. */
	name: string;
	/** null: signed out. */
	role: Role | null;
	path: () => string | Promise<string>;
	status?: number;
	/** Pages without a primary action (and pages that are only a state) may have none; never more than one. */
	maxPrimary?: number;
	/**
	 * false only for the legal pages: a privacy policy must name servers, sign-in sessions and tokens to
	 * describe the processing truthfully. Sample strings, the primary count and axe still apply.
	 */
	copyRules?: boolean;
};

/** The seeded form's newest draft, if there is one (the seed leaves one; the forms spec adds and publishes others). */
async function seededDraft(): Promise<string> {
	const form = (await listForms()).find(item => item.code === SEED.form.code);
	const drafts = (form?.versions ?? []).filter(version => version.state === "draft");
	const draft = drafts.sort((a, b) => b.version - a.version)[0];
	return projectPath(`forms/versions/${draft?.code ?? `${SEED.form.code}-v2`}`);
}

export const SCAN_ROUTES: ScanRoute[] = [
	// Signed out.
	{ name: "home", role: null, path: () => "/" },
	{ name: "sign-in", role: null, path: () => "/sign-in" },
	{ name: "sign-up", role: null, path: () => "/sign-up" },
	{ name: "forgot-password", role: null, path: () => "/forgot-password" },
	// Without a code in progress these send the person on; the scan reads wherever they land.
	{ name: "verify", role: null, path: () => "/verify" },
	{ name: "reset-password", role: null, path: () => "/reset-password" },
	{ name: "privacy", role: null, path: () => "/privacy", copyRules: false },
	{ name: "privacy-delete-data", role: null, path: () => "/privacy/delete-data", copyRules: false },

	// Signed in, in no project yet.
	{ name: "no-project", role: "outsider", path: () => "/o" },
	{ name: "join", role: "joiner", path: () => "/join" },
	{ name: "invite-without-link", role: "joiner", path: () => "/invite" },
	{ name: "account", role: "manager", path: () => "/account" },

	// The manager's project.
	{ name: "project-overview", role: "manager", path: () => projectPath() },
	{ name: "data", role: "manager", path: () => projectPath("data") },
	{ name: "observation", role: "manager", path: () => projectPath(`data/${manifest().observations[0]}`) },
	{ name: "sites", role: "manager", path: () => projectPath("sites") },
	{ name: "site", role: "manager", path: () => projectPath(`sites/${SEED.sites.fallCreek}`) },
	{ name: "site-empty", role: "manager", path: () => projectPath(`sites/${SEED.sites.empty}`) },
	{ name: "packages", role: "manager", path: () => projectPath(`sites/${SEED.sites.fallCreek}/packages`) },
	{ name: "zones", role: "manager", path: () => projectPath(`sites/${SEED.sites.fallCreek}/zones`) },
	{ name: "zones-empty-site", role: "manager", path: () => projectPath(`sites/${SEED.sites.empty}/zones`) },
	{
		name: "packages-upload",
		role: "manager",
		path: () => projectPath(`sites/${SEED.sites.fallCreek}/packages?step=upload`)
	},
	{ name: "forms", role: "manager", path: () => projectPath("forms") },
	{ name: "form-versions", role: "manager", path: () => projectPath(`forms/versions?form=${SEED.form.code}`) },
	{ name: "form-published", role: "manager", path: () => projectPath(`forms/versions/${SEED.form.published}`) },
	{ name: "form-draft", role: "manager", path: seededDraft },
	{ name: "form-publish", role: "manager", path: async () => `${await seededDraft()}/publish` },
	{ name: "team", role: "manager", path: () => projectPath("team") },
	{ name: "qgis", role: "manager", path: () => projectPath("qgis") },
	{ name: "reports", role: "manager", path: () => projectPath("reports") },
	{ name: "project-settings", role: "manager", path: () => projectPath("settings") },
	{ name: "project-missing-page", role: "manager", path: () => projectPath("no-such-page"), status: 404 },

	// What a viewer and an observer see.
	{ name: "viewer-overview", role: "viewer", path: () => projectPath() },
	{ name: "viewer-team", role: "viewer", path: () => projectPath("team") },
	{ name: "viewer-zones", role: "viewer", path: () => projectPath(`sites/${SEED.sites.fallCreek}/zones`) },
	{ name: "observer-collect", role: "observer", path: () => orgPath("collect") },

	// The organization, as its owner.
	{ name: "org-projects", role: "owner", path: () => orgPath() },
	{ name: "org-members", role: "owner", path: () => orgPath("members") },
	{ name: "org-settings", role: "owner", path: () => orgPath("settings") },
	{ name: "org-missing", role: "owner", path: () => "/o/no-such-organization", status: 404 },
	// The sample workspace is gone: its old address is a plain not-found page, not a demo.
	{ name: "sample-workspace-gone", role: "manager", path: () => "/o/deca", status: 404 }
];

/**
 * Addresses the rebuild removed. Each must answer 404 or send the person somewhere else; none may still
 * render its old page.
 */
export const REMOVED_ROUTES: { name: string; path: () => string }[] = [
	{ name: "onboarding", path: () => "/onboarding" },
	{ name: "old overview", path: () => "/overview" },
	{ name: "old QGIS page", path: () => "/qgis" },
	{ name: "organization library", path: () => orgPath("library") },
	{ name: "saved report views", path: () => projectPath("reports/views") },
	{ name: "rounds plan", path: () => projectPath("settings/rounds") },
	{ name: "sample workspace", path: () => "/o/deca/p/play-study" }
];
