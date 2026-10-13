"use server";

import { z } from "zod";

import { apiRequestError } from "@/lib/api/errors";
import type { Observation, ObservationFilters, RawDefinition } from "@/lib/api/types";
import {
	getFormDefinitions,
	getSite,
	getSitePlan,
	listObservations,
	listPackages,
	resolveProject
} from "@/lib/api/workspace";
import type { ProjectedSite } from "@/lib/plan";

/**
 * Data's reads from the browser: the next page of the observations the address matches, and the plan of
 * another map version of the site in view. The filters the page was loaded with come back with the cursor
 * (the cursor is bound to them), and the person's access is checked again on every read.
 */

const scopeSchema = z.object({ org: z.string().min(1), project: z.string().min(1) });

const filtersSchema = z
	.object({
		siteId: z.uuid().optional(),
		packageId: z.uuid().optional(),
		zoneIds: z.array(z.uuid()).max(500).optional(),
		roundType: z.enum(["standard", "reliability", "inventory"]).optional(),
		observer: z.string().min(1).max(12).optional(),
		observedFrom: z.iso.datetime().optional(),
		observedBefore: z.iso.datetime().optional()
	})
	.strict();

export type NextPage =
	| {
			readonly status: "loaded";
			readonly items: Observation[];
			readonly nextCursor: string | null;
			readonly total: number;
			readonly generatedAt: string;
			/** The form versions of these items that the page has not read yet, by code. */
			readonly definitions: Record<string, RawDefinition>;
			readonly missingVersions: string[];
	  }
	| { readonly status: "failed"; readonly message: string };

export async function loadObservationsAction(
	rawScope: { org: string; project: string },
	rawFilters: ObservationFilters,
	cursor: string,
	knownVersions: readonly string[]
): Promise<NextPage> {
	const scope = scopeSchema.parse(rawScope);
	const filters = filtersSchema.parse(rawFilters);
	const after = z.string().min(1).max(2048).parse(cursor);
	try {
		const project = await resolveProject(scope.org, scope.project);
		if (!project)
			return { status: "failed", message: "Nothing more was loaded. This project is no longer available." };
		const page = await listObservations(project.id, filters, after);
		const known = new Set(knownVersions);
		const versions = [...new Set(page.items.map(item => item.form_version))].filter(code => !known.has(code));
		const { definitions, missing } = await getFormDefinitions(project.id, versions);
		return {
			status: "loaded",
			items: page.items,
			nextCursor: page.next_cursor,
			total: page.total_matching,
			generatedAt: page.generated_at,
			definitions,
			missingVersions: missing
		};
	} catch (error) {
		return { status: "failed", message: `Nothing more was loaded. ${apiRequestError(error).message}` };
	}
}

export type PlanRead =
	| { readonly status: "loaded"; readonly site: ProjectedSite }
	| { readonly status: "failed"; readonly message: string };

/** One map version of a site, drawn as a plan from its package: only a package of that site is drawn. */
export async function loadSitePlanAction(
	rawScope: { org: string; project: string },
	rawSiteCode: string,
	rawPackageId: string
): Promise<PlanRead> {
	const scope = scopeSchema.parse(rawScope);
	const siteCode = z.string().min(1).max(200).parse(rawSiteCode);
	const packageId = z.uuid().parse(rawPackageId);
	try {
		const project = await resolveProject(scope.org, scope.project);
		if (!project) return { status: "failed", message: "This project is no longer available." };
		const site = await getSite(project.id, siteCode);
		const history = await listPackages(project.id, site.site_id);
		if (!history.packages.some(item => item.package_id === packageId))
			return { status: "failed", message: `${site.name} has no such map version.` };
		const plan = await getSitePlan(project.id, packageId, site.name);
		if (!plan) return { status: "failed", message: "Its map package cannot be drawn as a plan." };
		return { status: "loaded", site: plan };
	} catch (error) {
		return { status: "failed", message: apiRequestError(error).message };
	}
}
