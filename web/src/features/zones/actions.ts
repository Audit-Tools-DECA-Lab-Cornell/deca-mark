"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequestError, failedWrite } from "@/lib/api/errors";
import { createZoneDraft, replaceZoneDraftZones } from "@/lib/api/mutations";
import { getHistoricalZones, getSite, listPackages, resolveProject } from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";
import { historicalDraftZones } from "@/lib/zones/schemas";

import { restoreNote } from "./model";

/**
 * Starting a zone draft (UI plan 5.1, 5.2): a copy of the site's current version, made on the server with
 * the request ID the dialog chose when it opened, so a double click or a retry makes one draft. Restoring an
 * earlier version starts such a draft and then gives it that version's zones: a draft can only be published
 * from the current version.
 */

const scopeSchema = z.object({ org: z.string().min(1), project: z.string().min(1) });
const inputSchema = z.object({
	siteCode: z.string().min(1).max(200),
	requestId: z.uuid(),
	restoreFrom: z.uuid().nullable().default(null)
});

export type StartDraftResult =
	| { readonly status: "done"; readonly draftId: string }
	| { readonly status: "failed"; readonly message: string };

export async function startDraftAction(
	rawScope: { org: string; project: string },
	rawInput: { siteCode: string; requestId: string; restoreFrom?: string | null }
): Promise<StartDraftResult> {
	const scope = scopeSchema.parse(rawScope);
	const input = inputSchema.parse(rawInput);
	const nothing = "No draft was started.";
	let started: string | null = null;
	try {
		const project = await resolveProject(scope.org, scope.project);
		if (!project) return { status: "failed", message: `${nothing} This project is no longer available.` };
		if (!projectAbilities(project.role).manage)
			return { status: "failed", message: `${nothing} Only project managers can edit zones.` };
		const site = await getSite(project.id, input.siteCode);
		if (!site.current_package_id)
			return { status: "failed", message: `${nothing} This site has no map package yet.` };
		if (!site.zone_editing_available)
			return {
				status: "failed",
				message: `${nothing} Editing zones on the web is not available for this site yet.`
			};

		let restored: { version: number; zones: ReturnType<typeof historicalDraftZones> } | null = null;
		if (input.restoreFrom) {
			const history = await listPackages(project.id, site.site_id);
			const earlier = history.packages.find(
				item => item.package_id === input.restoreFrom && item.state === "ready"
			);
			if (!earlier) return { status: "failed", message: `${nothing} ${site.name} has no such map version.` };
			const zones = await getHistoricalZones(project.id, site.site_id, earlier.package_id);
			restored = { version: earlier.package_version, zones: historicalDraftZones(zones) };
		}

		const draft = await createZoneDraft(project.id, site.site_id, {
			request_id: input.requestId,
			base_package_id: site.current_package_id
		});
		started = draft.draft_id;
		// A replayed request returns the draft it made; it is restored only while it is still the first revision.
		if (restored && draft.revision === 1)
			await replaceZoneDraftZones(project.id, site.site_id, draft.draft_id, draft.etag, {
				zones: restored.zones,
				change_note: restoreNote(restored.version)
			});
		revalidatePath(`/o/${scope.org}/p/${scope.project}/sites/${site.code}/zones`);
		return { status: "done", draftId: draft.draft_id };
	} catch (error) {
		const failure = apiRequestError(error);
		if (started)
			return {
				status: "failed",
				message: `A draft was started, but the earlier boundaries were not copied into it. Try again, or open the draft from the list. ${failure.message}`
			};
		return { status: "failed", message: failedWrite(nothing, failure) };
	}
}
