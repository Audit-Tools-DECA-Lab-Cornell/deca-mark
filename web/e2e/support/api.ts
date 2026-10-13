import { accessToken } from "./auth";
import { loopbackOrigin, manifest, type Role } from "./manifest";

/**
 * Direct calls to the LOCAL API with a seeded account's saved sign-in. Specs use these only to arrange
 * state the screen under test does not create (a join code to redeem) and to undo what a spec changed
 * (a membership), and to confirm a screen's write landed. Everything a person does goes through the UI.
 */
export async function api<T = unknown>(role: Role, method: string, path: string, body?: unknown): Promise<T> {
	const origin = loopbackOrigin(manifest().apiUrl, "The API address");
	const response = await fetch(`${origin}${path}`, {
		method,
		redirect: "error",
		signal: AbortSignal.timeout(20_000),
		headers: {
			Authorization: `Bearer ${accessToken(role)}`,
			...(body === undefined ? {} : { "Content-Type": "application/json" })
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
	if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
	if (response.status === 204) return undefined as T;
	const text = await response.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

const project = () => `/v1/projects/${manifest().projectId}`;

export type Member = { user_id: string; role: string; display_name: string | null };
export type Invitation = {
	id: string;
	role: string;
	email: string | null;
	revoked_at: string | null;
	use_count: number;
	max_uses: number;
	expires_at: string;
};
export type InvitationCreated = Invitation & { token: string; code: string };
export type PackageSummary = {
	package_id: string;
	package_version: number;
	state: "ready" | "blocked";
	site_id: string;
};
/** A site's packages, and which one is current (contract "Reads"). */
export type PackageHistory = { current_package_id: string | null; packages: PackageSummary[] };
export type FormVersion = { version_id: string; code: string; version: number; state: string };
export type FormSummary = { code: string; name: string; versions: FormVersion[] };
export type Project = { name: string; description: string | null; timezone: string; status: string };
export type SiteZone = { zone_id: string; zone_code: string; label: string };
export type Site = {
	site_id: string;
	code: string;
	name: string;
	observation_count: number;
	current_package_id: string | null;
	package: { package_id: string; package_version: number; forms: { play: { form_version: string } } } | null;
	zones: SiteZone[];
};

export const listProjectMembers = () => api<Member[]>("manager", "GET", `${project()}/members`);
export const listProjectInvitations = () => api<Invitation[]>("manager", "GET", `${project()}/invitations`);
/** A site's package history, by the site's code (the API takes its identity). */
export async function listPackages(code: string): Promise<PackageHistory> {
	const site = await siteByCode(code);
	return api<PackageHistory>("manager", "GET", `${project()}/packages?site_id=${encodeURIComponent(site.site_id)}`);
}
export const listForms = () => api<FormSummary[]>("manager", "GET", `${project()}/forms`);
export const getProject = () => api<Project>("manager", "GET", project());
export const listSites = () => api<Site[]>("manager", "GET", `${project()}/sites`);

/** A project invitation made by the seeded manager. The token and code are returned once. */
export function createProjectInvitation(body: {
	role: "manager" | "observer" | "viewer";
	email?: string;
	max_uses?: number;
	expires_in_days?: number;
}): Promise<InvitationCreated> {
	return api<InvitationCreated>("manager", "POST", `${project()}/invitations`, body);
}

export async function revokeProjectInvitation(id: string): Promise<void> {
	await api("manager", "DELETE", `${project()}/invitations/${id}`);
}

/** Takes `role`'s account back out of the seeded project, so a join spec can run again. */
export async function ensureNotProjectMember(role: Role): Promise<void> {
	const userId = manifest().accounts[role].id;
	const members = await listProjectMembers();
	if (members.some(member => member.user_id === userId)) {
		await api("manager", "DELETE", `${project()}/members/${userId}`);
	}
}

export async function siteByCode(code: string): Promise<Site> {
	const site = (await listSites()).find(entry => entry.code === code);
	if (!site) throw new Error(`No site ${code} in the seeded project.`);
	return site;
}

/** The version of the package the site names as current: the site's current map. */
export async function currentPackageVersion(code: string): Promise<number | null> {
	const history = await listPackages(code);
	return history.packages.find(item => item.package_id === history.current_package_id)?.package_version ?? null;
}

/** The newest version number a site has, so a spec knows which one its upload makes. */
export async function newestPackageVersion(code: string): Promise<number> {
	return Math.max(0, ...(await listPackages(code)).packages.map(item => item.package_version));
}

/** A zone of the site's current map, by its code. */
export async function currentZone(code: string, zoneCode: string): Promise<SiteZone> {
	const zone = (await siteByCode(code)).zones.find(entry => entry.zone_code === zoneCode);
	if (!zone) throw new Error(`Site ${code} has no zone ${zoneCode} in its current map.`);
	return zone;
}
