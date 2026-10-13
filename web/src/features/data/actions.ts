"use server";

import { z } from "zod";

import { apiRequestError } from "@/lib/api/errors";
import type { Observation, ObservationFilters, RawDefinition } from "@/lib/api/types";
import { getFormDefinitions, listObservations, resolveProject } from "@/lib/api/workspace";

/**
 * Data's reads from the browser: the next page of the observations the address matches. The filters the
 * page was loaded with come back with the cursor (the cursor is bound to them), and the person's access is
 * checked again on every page.
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
