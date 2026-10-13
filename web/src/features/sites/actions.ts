"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequestError, failedWrite } from "@/lib/api/errors";
import { createSite, patchSite } from "@/lib/api/mutations";
import { getSite, resolveProject } from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";

import { SITE_CODE_PATTERN, SITE_CODE_RULE, SITE_DESCRIPTION_MAX, SITE_NAME_MAX } from "./code";

/**
 * Writes for the Sites screens: create a site and edit a site's name and description. The API decides who
 * may write (project managers); a refusal comes back as "Nothing was <verb>." and the reason.
 */

export type SiteScope = { org: string; project: string };
export type SiteField = "name" | "code" | "description";

export type SiteActionResult =
	| { status: "done"; code: string }
	| { status: "failed"; message: string; fields?: Partial<Record<SiteField, string>> };

const nameSchema = z
	.string()
	.trim()
	.min(1, "Enter a name for the site.")
	.max(SITE_NAME_MAX, `Use ${SITE_NAME_MAX} characters or fewer.`);
const descriptionSchema = z.string().max(SITE_DESCRIPTION_MAX, `Use ${SITE_DESCRIPTION_MAX} characters or fewer.`);
const scopeSchema = z.object({ org: z.string().min(1), project: z.string().min(1) });

const createSchema = z.object({
	name: nameSchema,
	code: z.string().regex(SITE_CODE_PATTERN, SITE_CODE_RULE),
	description: descriptionSchema.default("")
});

const editSchema = z.object({ name: nameSchema, description: descriptionSchema.default("") });

function fieldProblems(error: z.ZodError): Partial<Record<SiteField, string>> {
	const fields: Partial<Record<SiteField, string>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if ((field === "name" || field === "code" || field === "description") && !fields[field])
			fields[field] = issue.message;
	}
	return fields;
}

const KNOWN_FIELDS: readonly SiteField[] = ["name", "code", "description"];

function apiFields(fields: Readonly<Record<string, string>>): Partial<Record<SiteField, string>> {
	const known: Partial<Record<SiteField, string>> = {};
	for (const field of KNOWN_FIELDS) if (fields[field]) known[field] = fields[field];
	return known;
}

function sitesChanged(scope: SiteScope) {
	revalidatePath(`/o/${scope.org}/p/${scope.project}`, "layout");
}

/** Create site: the new site has no map package until one is uploaded for its code. */
export async function createSiteAction(
	rawScope: SiteScope,
	input: { name: string; code: string; description: string }
): Promise<SiteActionResult> {
	const scope = scopeSchema.parse(rawScope);
	const parsed = createSchema.safeParse(input);
	if (!parsed.success)
		return {
			status: "failed",
			message: "Nothing was created. Check the fields marked below.",
			fields: fieldProblems(parsed.error)
		};
	try {
		const project = await resolveProject(scope.org, scope.project);
		if (!project) return { status: "failed", message: "Nothing was created. This project is no longer available." };
		if (!projectAbilities(project.role).manage)
			return { status: "failed", message: "Nothing was created. Only project managers can create sites." };
		const description = parsed.data.description.trim();
		const site = await createSite(project.id, {
			code: parsed.data.code,
			name: parsed.data.name,
			...(description ? { description } : {})
		});
		sitesChanged(scope);
		return { status: "done", code: site.code };
	} catch (error) {
		const failure = apiRequestError(error);
		// A site code that is taken is the only way creating a site conflicts.
		if (failure.code === "conflict")
			return {
				status: "failed",
				message: "Nothing was created. This project already has a site with that code.",
				fields: { code: "This project already has a site with this code. Choose another." }
			};
		return {
			status: "failed",
			message: failedWrite("Nothing was created.", failure),
			fields: apiFields(failure.fields)
		};
	}
}

/** Edit details: a site's name and description. Its code never changes. */
export async function updateSiteAction(
	rawScope: SiteScope,
	code: string,
	input: { name: string; description: string }
): Promise<SiteActionResult> {
	const scope = scopeSchema.parse(rawScope);
	const parsed = editSchema.safeParse(input);
	if (!parsed.success)
		return {
			status: "failed",
			message: "Nothing was saved. Check the fields marked below.",
			fields: fieldProblems(parsed.error)
		};
	try {
		const project = await resolveProject(scope.org, scope.project);
		if (!project) return { status: "failed", message: "Nothing was saved. This project is no longer available." };
		if (!projectAbilities(project.role).manage)
			return { status: "failed", message: "Nothing was saved. Only project managers can edit sites." };
		const description = parsed.data.description.trim();
		// The API addresses a site by its UUID; the site list says which one this code is.
		const current = await getSite(project.id, z.string().min(1).parse(code));
		const site = await patchSite(project.id, current.site_id, {
			name: parsed.data.name,
			description: description || null
		});
		sitesChanged(scope);
		return { status: "done", code: site.code };
	} catch (error) {
		const failure = apiRequestError(error);
		return {
			status: "failed",
			message: failedWrite("Nothing was saved.", failure),
			fields: apiFields(failure.fields)
		};
	}
}
