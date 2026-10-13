import "server-only";

import type { OrgRole, ProjectRole } from "@/lib/workspace/types";
import type { DraftZone } from "@/lib/zones/geometry";
import { type ZoneDraft, zoneDraftSchema } from "@/lib/zones/schemas";

import { call, callEmpty } from "./client";
import { ApiError } from "./errors";
import { siteSchema } from "./sites";
import type {
	FormVersionDetail,
	InvitationCreated,
	InvitationCredential,
	InvitationPreview,
	InvitationRedeemed,
	Organization,
	OrganizationPatch,
	OrgInvitationCreate,
	Project,
	ProjectCreate,
	ProjectInvitationCreate,
	ProjectPatch,
	RawDefinition,
	Site,
	SiteCreate,
	SitePatch
} from "./types";

/**
 * One function per API write, for Server Actions. Each returns what the API answered or throws an
 * `ApiError`; the action catches it and says what did not happen ("Nothing was saved. " + its message),
 * then revalidates. Authorization is the API's: these never check roles themselves.
 *
 * Map package uploads and archive downloads go from the browser (`lib/api/browser.ts`): their bodies are
 * larger than a Server Action may carry.
 */

/* ── Organizations ────────────────────────────────────────────────────────── */

/** Owner/admin. `timezone` is an IANA name. */
export function createProject(orgId: string, body: ProjectCreate): Promise<Project> {
	return call(api => api.POST("/v1/orgs/{org}/projects", { params: { path: { org: orgId } }, body }));
}

/** Owner/admin: name and web address. Links that use the old address stop working. */
export function patchOrganization(orgId: string, patch: OrganizationPatch): Promise<Organization> {
	return call(api => api.PATCH("/v1/orgs/{org}", { params: { path: { org: orgId } }, body: patch }));
}

/** Owner only. The new owner must already be a member. */
export function transferOwnership(orgId: string, userId: string): Promise<void> {
	return callEmpty(api =>
		api.POST("/v1/orgs/{org}/transfer-ownership", { params: { path: { org: orgId } }, body: { user_id: userId } })
	);
}

export function setOrgRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
	return callEmpty(api =>
		api.PATCH("/v1/orgs/{org}/members/{member}", {
			params: { path: { org: orgId, member: userId } },
			body: { role }
		})
	);
}

export function removeOrgMember(orgId: string, userId: string): Promise<void> {
	return callEmpty(api =>
		api.DELETE("/v1/orgs/{org}/members/{member}", { params: { path: { org: orgId, member: userId } } })
	);
}

/** The link token and join code are in the answer once; lists never show them again. */
export function createOrgInvitation(orgId: string, body: OrgInvitationCreate): Promise<InvitationCreated> {
	return call(api => api.POST("/v1/orgs/{org}/invitations", { params: { path: { org: orgId } }, body }));
}

export function revokeOrgInvitation(orgId: string, invitationId: string): Promise<void> {
	return callEmpty(api =>
		api.DELETE("/v1/orgs/{org}/invitations/{invitation}", {
			params: { path: { org: orgId, invitation: invitationId } }
		})
	);
}

/* ── Projects ─────────────────────────────────────────────────────────────── */

/**
 * Manager: name, description, timezone, status. Archiving only marks the project finished: observers can
 * still upload records they already collected.
 */
export function patchProject(projectId: string, patch: ProjectPatch): Promise<Project> {
	return call(api => api.PATCH("/v1/projects/{project}", { params: { path: { project: projectId } }, body: patch }));
}

export function setProjectRole(projectId: string, userId: string, role: ProjectRole): Promise<void> {
	return callEmpty(api =>
		api.PATCH("/v1/projects/{project}/members/{member}", {
			params: { path: { project: projectId, member: userId } },
			body: { role }
		})
	);
}

export function removeProjectMember(projectId: string, userId: string): Promise<void> {
	return callEmpty(api =>
		api.DELETE("/v1/projects/{project}/members/{member}", {
			params: { path: { project: projectId, member: userId } }
		})
	);
}

export function createProjectInvitation(projectId: string, body: ProjectInvitationCreate): Promise<InvitationCreated> {
	return call(api =>
		api.POST("/v1/projects/{project}/invitations", { params: { path: { project: projectId } }, body })
	);
}

export function revokeProjectInvitation(projectId: string, invitationId: string): Promise<void> {
	return callEmpty(api =>
		api.DELETE("/v1/projects/{project}/invitations/{invitation}", {
			params: { path: { project: projectId, invitation: invitationId } }
		})
	);
}

/* ── Sites ────────────────────────────────────────────────────────────────── */

/** A new site has no map until its first package is uploaded. */
export async function createSite(projectId: string, body: SiteCreate): Promise<Site> {
	const data = await call<unknown>(api =>
		api.POST("/v1/projects/{project_id}/sites", { params: { path: { project_id: projectId } }, body })
	);
	const parsed = siteSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
}

/** Name and description; a site's code never changes. The site is named by its UUID. */
export async function patchSite(projectId: string, siteId: string, patch: SitePatch): Promise<Site> {
	const data = await call<unknown>(api =>
		api.PATCH("/v1/projects/{project_id}/sites/{site_id}", {
			params: { path: { project_id: projectId, site_id: siteId } },
			body: patch
		})
	);
	const parsed = siteSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
}

/* ── Forms ────────────────────────────────────────────────────────────────── */

/** A new form; the answer is its first draft. */
export function createForm(
	projectId: string,
	body: { code: string; name: string; definition: RawDefinition }
): Promise<FormVersionDetail> {
	return call(api =>
		api.POST("/v1/projects/{project_id}/forms", { params: { path: { project_id: projectId } }, body })
	);
}

/**
 * The form's next version as a draft: a copy of its newest version, or `definition` when given. Never
 * sends an empty definition, which the API refuses. 409 when another draft was started at the same time.
 */
export function createDraft(
	projectId: string,
	formCode: string,
	definition?: RawDefinition
): Promise<FormVersionDetail> {
	return call(api =>
		api.POST("/v1/projects/{project_id}/forms/{form_code}/versions", {
			params: { path: { project_id: projectId, form_code: formCode } },
			body: definition ? { definition } : {}
		})
	);
}

/** Replaces a draft's definition. 422 with field problems when the definition is refused. */
export function saveDraft(
	projectId: string,
	versionCode: string,
	definition: RawDefinition
): Promise<FormVersionDetail> {
	return call(api =>
		api.PUT("/v1/projects/{project_id}/form-versions/{version_code}", {
			params: { path: { project_id: projectId, version_code: versionCode } },
			body: { definition }
		})
	);
}

/** Deletes a draft. 409 when it was published meanwhile. */
export function discardDraft(projectId: string, versionCode: string): Promise<void> {
	return callEmpty(api =>
		api.DELETE("/v1/projects/{project_id}/form-versions/{version_code}", {
			params: { path: { project_id: projectId, version_code: versionCode } }
		})
	);
}

/** Freezes a draft for collection. Older published versions stay published until retired. */
export function publishVersion(projectId: string, versionCode: string): Promise<FormVersionDetail> {
	return call(api =>
		api.POST("/v1/projects/{project_id}/form-versions/{version_code}/publish", {
			params: { path: { project_id: projectId, version_code: versionCode } }
		})
	);
}

/** Stops new collection with a version; records already made with it still upload. */
export function retireVersion(projectId: string, versionCode: string): Promise<FormVersionDetail> {
	return call(api =>
		api.POST("/v1/projects/{project_id}/form-versions/{version_code}/retire", {
			params: { path: { project_id: projectId, version_code: versionCode } }
		})
	);
}

/* ── Invitations ──────────────────────────────────────────────────────────── */

/** What an invitation offers, without using it. Shares a rate limit with redeeming (429, Retry-After). */
export function previewInvitation(credential: InvitationCredential): Promise<InvitationPreview> {
	return call(api => api.POST("/v1/invitations/preview", { body: credential }));
}

/** Joins with the invitation. 410 when it expired; an existing member cannot redeem it again. */
export function redeemInvitation(credential: InvitationCredential): Promise<InvitationRedeemed> {
	return call(api => api.POST("/v1/invitations/redeem", { body: credential }));
}

/* ── Zone drafts ──────────────────────────────────────────────────────────── */

/**
 * Manager: a draft of a site's zones, copied from `base_package_id` (the current version). The same
 * `request_id` again returns the draft the first request made, so a double click or a retry makes one.
 */
export async function createZoneDraft(
	projectId: string,
	siteId: string,
	body: { request_id: string; base_package_id: string }
): Promise<ZoneDraft> {
	const data = await call<unknown>(api =>
		api.POST("/v1/projects/{project_id}/sites/{site_id}/zone-drafts", {
			params: { path: { project_id: projectId, site_id: siteId } },
			body
		})
	);
	const parsed = zoneDraftSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
}

/** Manager: replaces a draft's zones and note, if it is still at `etag`. */
export async function replaceZoneDraftZones(
	projectId: string,
	siteId: string,
	draftId: string,
	etag: string,
	body: { zones: readonly DraftZone[]; change_note: string }
): Promise<ZoneDraft> {
	const data = await call<unknown>(api =>
		api.PUT("/v1/projects/{project_id}/sites/{site_id}/zone-drafts/{draft_id}", {
			params: {
				path: { project_id: projectId, site_id: siteId, draft_id: draftId },
				header: { "if-match": etag }
			},
			body: { zones: body.zones as never, change_note: body.change_note }
		})
	);
	const parsed = zoneDraftSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
}
