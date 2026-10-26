import "server-only";

import { cache } from "react";
import { ZodError } from "zod";

import { parseServedDefinition } from "@/lib/forms";
import { type ProjectedSite, projectSite } from "@/lib/plan";
import { PackageArchiveError, packageSiteCollection, readPackageArchive, siteBoundaryOf } from "@/lib/sites/archive";
import { buildWorkspaceIndex, unavailableWorkspace } from "@/lib/workspace/build";
import { toFailure } from "@/lib/workspace/result";
import type { OrgRef, ProjectRef, WorkspaceIndex } from "@/lib/workspace/types";
import type { PolygonRings } from "@/lib/zones/geometry";
import {
	draftSummaryListSchema,
	type HistoricalZones,
	historicalZonesSchema,
	type ZoneDraft,
	zoneDraftSchema,
	type ZoneDraftSummary
} from "@/lib/zones/schemas";

import { call, getIdentity, session } from "./client";
import { ApiError, errorCopy } from "./errors";
import {
	filterQuery,
	type ObservationDetail,
	observationDetailSchema,
	type ObservationFilters,
	type ObservationPage,
	observationPageSchema,
	type ObservationSummary,
	observationSummarySchema,
	PAGE_LIMIT
} from "./observations";
import {
	type PackageDetail,
	packageDetailSchema,
	type PackageHistory,
	packageHistorySchema,
	type PackageSummary,
	type Site,
	siteByCode,
	siteListSchema
} from "./sites";
import type {
	FormSummary,
	FormVersionDetail,
	Invitation,
	Organization,
	OrganizationMember,
	Project,
	ProjectMember,
	RawDefinition
} from "./types";

/**
 * Every server-side read the workspace makes. Each is wrapped in React `cache()`, so a layout and its
 * page asking for the same thing in one request share one API call; arguments are strings only, which
 * is what `cache()` compares.
 *
 * Reads throw `ApiError` on failure. Pages wrap them with `settle()` and show the failure; a failed read
 * is never turned into an empty list. `getWorkspace()` is the exception: it never throws.
 */

export const getMe = cache(getIdentity);

/**
 * The signed-in person, their organizations and their projects (training projects hidden). Never throws:
 * when the person cannot be placed it returns `status: "unavailable"` with the failure (signed out,
 * DECA Mark unreachable, sign-in not configured).
 */
export const getWorkspace = cache(async (): Promise<WorkspaceIndex> => {
	let claims: { sub: string; email: string | undefined } | null = null;
	try {
		const current = await session();
		if (current.status === "unconfigured")
			return unavailableWorkspace(
				{ code: "storage_unavailable", kind: "retry", message: errorCopy.storage_unavailable },
				null
			);
		if (current.status === "signed-out")
			return unavailableWorkspace(
				{ code: "unauthenticated", kind: "sign-in", message: errorCopy.unauthenticated },
				null
			);
		claims = { sub: current.userId, email: current.email };
		return buildWorkspaceIndex(await getMe(), claims);
	} catch (error) {
		return unavailableWorkspace(toFailure(error), claims);
	}
});

/** The failure of an unavailable workspace, as the ApiError a read would have thrown. */
function workspaceError(index: WorkspaceIndex): ApiError {
	const failure = index.failure;
	if (failure && failure.code in errorCopy)
		return new ApiError(failure.code as keyof typeof errorCopy, failure.kind, { retryAfter: failure.retryAfter });
	return new ApiError("unknown", failure?.kind ?? "retry");
}

/**
 * The organization at `/o/<slug>`, or null when the person has none there. Throws when the workspace is
 * unavailable, so a layout shows the failure rather than "not found".
 */
export const resolveOrg = cache(async (slug: string): Promise<OrgRef | null> => {
	const index = await getWorkspace();
	if (index.status !== "ready") throw workspaceError(index);
	return index.orgs.find(org => org.slug === slug) ?? null;
});

/** The project at `/o/<orgSlug>/p/<code>`, or null. Throws when the workspace is unavailable. */
export const resolveProject = cache(async (orgSlug: string, code: string): Promise<ProjectRef | null> => {
	const index = await getWorkspace();
	if (index.status !== "ready") throw workspaceError(index);
	return index.projects.find(project => project.orgSlug === orgSlug && project.code === code) ?? null;
});

/* ── Organizations ────────────────────────────────────────────────────────── */

/** Owner/admin only (403 otherwise): gate on `orgAbilities(role).manage` before calling. */
export const getOrganization = cache(
	(orgId: string): Promise<Organization> =>
		call(api => api.GET("/v1/orgs/{org}", { params: { path: { org: orgId } } }))
);

/** The organization's projects this person can open (training included only if they belong to it). */
export const listOrgProjects = cache(
	(orgId: string): Promise<Project[]> =>
		call(api => api.GET("/v1/orgs/{org}/projects", { params: { path: { org: orgId } } }))
);

/** Owner/admin only. */
export const listOrgMembers = cache(
	(orgId: string): Promise<OrganizationMember[]> =>
		call(api => api.GET("/v1/orgs/{org}/members", { params: { path: { org: orgId } } }))
);

/** Owner/admin only. Every invitation, including revoked, expired and used-up ones (see `activeInvitations`). */
export const listOrgInvitations = cache(
	(orgId: string): Promise<Invitation[]> =>
		call(api => api.GET("/v1/orgs/{org}/invitations", { params: { path: { org: orgId } } }))
);

/* ── Projects ─────────────────────────────────────────────────────────────── */

export const getProject = cache(
	(projectId: string): Promise<Project> =>
		call(api => api.GET("/v1/projects/{project}", { params: { path: { project: projectId } } }))
);

/** Managers only. */
export const listProjectMembers = cache(
	(projectId: string): Promise<ProjectMember[]> =>
		call(api => api.GET("/v1/projects/{project}/members", { params: { path: { project: projectId } } }))
);

/** Managers only. Every invitation, including revoked, expired and used-up ones. */
export const listProjectInvitations = cache(
	(projectId: string): Promise<Invitation[]> =>
		call(api => api.GET("/v1/projects/{project}/invitations", { params: { path: { project: projectId } } }))
);

/* ── Sites and map packages ───────────────────────────────────────────────── */

/**
 * Every site, with the package `current_package_id` names (its summary in `package`), that package's zones
 * and the exact observation count. Checked at runtime: an answer of another shape is a failed read.
 */
export const listSites = cache(async (projectId: string): Promise<Site[]> => {
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/sites", { params: { path: { project_id: projectId } } })
	);
	const parsed = siteListSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
});

/**
 * The site whose web address carries `code`. API paths take the site's UUID, which only the site list
 * supplies (codes and UUIDs are never inferred from each other), so this reads the list. A code the project
 * does not have is a 404.
 */
export const getSite = cache(async (projectId: string, code: string): Promise<Site> => {
	const site = siteByCode(await listSites(projectId), code);
	if (!site) throw new ApiError("not_found", "rejected", { status: 404 });
	return site;
});

/** Every package of one site, ready and blocked, and the site's current package. */
export const listPackages = cache(async (projectId: string, siteId: string): Promise<PackageHistory> => {
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/packages", {
			params: { path: { project_id: projectId }, query: { site_id: siteId } }
		})
	);
	const parsed = packageHistorySchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
});

/**
 * Every package of every site in the project, each with its site's code (the package list is per site).
 * Fails when any site's history cannot be read, rather than leaving that site out.
 */
export const listProjectPackages = cache(
	async (projectId: string): Promise<(PackageSummary & { readonly site_code: string })[]> => {
		const sites = await listSites(projectId);
		const histories = await Promise.all(sites.map(site => listPackages(projectId, site.site_id)));
		return histories.flatMap((history, index) =>
			history.packages.map(item => ({ ...item, site_code: sites[index]!.code }))
		);
	}
);

/** A package with its preparation checks and manifest. */
export const getPackage = cache(async (projectId: string, packageId: string): Promise<PackageDetail> => {
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/packages/{package_id}", {
			params: { path: { project_id: projectId, package_id: packageId } }
		})
	);
	const parsed = packageDetailSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
});

/** A ready package's archive bytes. Blocked packages have none to download. */
export const getPackageArchive = cache(
	async (projectId: string, packageId: string): Promise<Uint8Array> =>
		new Uint8Array(
			await call<ArrayBuffer>(api =>
				api.GET("/v1/projects/{project_id}/packages/{package_id}/archive", {
					params: { path: { project_id: projectId, package_id: packageId } },
					parseAs: "arrayBuffer"
				})
			)
		)
);

/**
 * A package drawn as a site plan, from its archive. Null when the archive cannot be read as a plan;
 * throws when it cannot be fetched.
 */
export const getSitePlan = cache(
	async (projectId: string, packageId: string, siteName: string): Promise<ProjectedSite | null> => {
		const bytes = await getPackageArchive(projectId, packageId);
		try {
			const { manifest, layers } = readPackageArchive(bytes);
			return projectSite(packageSiteCollection(siteName, manifest, layers));
		} catch (error) {
			// An archive that cannot be read, or drawn, is shown without a plan.
			if (error instanceof PackageArchiveError || error instanceof ZodError) return null;
			throw error;
		}
	}
);

/**
 * What a zone draft is edited over: its base package drawn without zones (the editor draws the draft's), and
 * the site boundary in longitude and latitude for snapping. Null when the archive cannot be read as a plan.
 */
export const getEditorBase = cache(
	async (
		projectId: string,
		packageId: string,
		siteName: string
	): Promise<{ site: ProjectedSite; boundary: PolygonRings[] } | null> => {
		const bytes = await getPackageArchive(projectId, packageId);
		try {
			const { manifest, layers } = readPackageArchive(bytes);
			const collection = packageSiteCollection(siteName, manifest, layers);
			return { site: { ...projectSite(collection), zones: [] }, boundary: siteBoundaryOf(collection) };
		} catch (error) {
			if (error instanceof PackageArchiveError || error instanceof ZodError) return null;
			throw error;
		}
	}
);

/** One map version's zones, exactly as published. */
export const getHistoricalZones = cache(
	async (projectId: string, siteId: string, packageId: string): Promise<HistoricalZones> => {
		const data = await call<unknown>(api =>
			api.GET("/v1/projects/{project_id}/sites/{site_id}/zones", {
				params: { path: { project_id: projectId, site_id: siteId }, query: { package_id: packageId } }
			})
		);
		const parsed = historicalZonesSchema.safeParse(data);
		if (!parsed.success) throw new ApiError("unknown", "retry");
		return parsed.data;
	}
);

/* ── Zone drafts (managers) ───────────────────────────────────────────────── */

/** A site's zone drafts, without their zones. Managers only. */
export const listZoneDrafts = cache(
	async (
		projectId: string,
		siteId: string,
		state?: "draft" | "published" | "discarded"
	): Promise<ZoneDraftSummary[]> => {
		const data = await call<unknown>(api =>
			api.GET("/v1/projects/{project_id}/sites/{site_id}/zone-drafts", {
				params: { path: { project_id: projectId, site_id: siteId }, query: state ? { state } : {} }
			})
		);
		const parsed = draftSummaryListSchema.safeParse(data);
		if (!parsed.success) throw new ApiError("unknown", "retry");
		return parsed.data;
	}
);

/**
 * One zone draft with every zone. Managers only. The editor reads it again from the browser before it saves
 * anything, so a draft restored from the router's history is never the one written over.
 */
export const getZoneDraft = cache(async (projectId: string, siteId: string, draftId: string): Promise<ZoneDraft> => {
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/sites/{site_id}/zone-drafts/{draft_id}", {
			params: { path: { project_id: projectId, site_id: siteId, draft_id: draftId } }
		})
	);
	const parsed = zoneDraftSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
});

/* ── Forms ────────────────────────────────────────────────────────────────── */

/** Every form with its versions, newest first. Drafts only for managers. */
export const listForms = cache(
	(projectId: string): Promise<FormSummary[]> =>
		call(api => api.GET("/v1/projects/{project_id}/forms", { params: { path: { project_id: projectId } } }))
);

/** One form version and its definition. A draft is 404 for anyone but a manager. */
export const getFormVersion = cache(
	(projectId: string, code: string): Promise<FormVersionDetail> =>
		call(api =>
			api.GET("/v1/projects/{project_id}/form-versions/{version_code}", {
				params: { path: { project_id: projectId, version_code: code } }
			})
		)
);

/**
 * The historical definitions of several form versions, for labelling and exporting records. Each version
 * is a cached read; a version that cannot be read is listed in `missing` instead of failing the rest.
 */
export async function getFormDefinitions(
	projectId: string,
	codes: readonly string[]
): Promise<{ definitions: Record<string, RawDefinition>; missing: string[] }> {
	const unique = [...new Set(codes)];
	const settled = await Promise.allSettled(unique.map(code => getFormVersion(projectId, code)));
	const definitions: Record<string, RawDefinition> = {};
	const missing: string[] = [];
	settled.forEach((result, index) => {
		const code = unique[index]!;
		if (result.status === "fulfilled") definitions[code] = result.value.definition;
		else {
			toFailure(result.reason); // rethrows anything that is not an API failure
			missing.push(code);
		}
	});
	return { definitions, missing };
}

/* ── Observations ─────────────────────────────────────────────────────────── */

const observationPage = cache(async (projectId: string, filters: string, cursor: string): Promise<ObservationPage> => {
	const query = {
		...(JSON.parse(filters) as Record<string, unknown>),
		limit: PAGE_LIMIT,
		...(cursor ? { cursor } : {})
	};
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/observations", {
			params: { path: { project_id: projectId }, query: query as never }
		})
	);
	const parsed = observationPageSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
});

/**
 * One page of the observations matching `filters`, newest first, at most 500. `total_matching` counts every
 * match, so a count never stops at the page. `next_cursor` reads the following page (with the same filters),
 * or is null on the last one.
 */
export function listObservations(
	projectId: string,
	filters: ObservationFilters = {},
	cursor: string | null = null
): Promise<ObservationPage> {
	return observationPage(projectId, JSON.stringify(filterQuery(filters)), cursor ?? "");
}

const observationSummary = cache(async (projectId: string, filters: string): Promise<ObservationSummary> => {
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/observations/summary", {
			params: { path: { project_id: projectId }, query: JSON.parse(filters) as never }
		})
	);
	const parsed = observationSummarySchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	return parsed.data;
});

/** Counts of every observation matching `filters`, by site, map version, zone, round type and support. */
export function summarizeObservations(
	projectId: string,
	filters: ObservationFilters = {}
): Promise<ObservationSummary> {
	return observationSummary(projectId, JSON.stringify(filterQuery(filters)));
}

/** One observation with its recorded binding and the form definition it was collected with. */
export const getObservation = cache(async (projectId: string, observationId: string): Promise<ObservationDetail> => {
	const data = await call<unknown>(api =>
		api.GET("/v1/projects/{project_id}/observations/{observation_id}", {
			params: { path: { project_id: projectId, observation_id: observationId } }
		})
	);
	const parsed = observationDetailSchema.safeParse(data);
	if (!parsed.success) throw new ApiError("unknown", "retry");
	parseServedDefinition(parsed.data.schema_version, parsed.data.definition);
	return parsed.data;
});
