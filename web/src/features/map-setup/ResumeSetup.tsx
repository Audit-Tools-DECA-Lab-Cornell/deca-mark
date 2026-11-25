import "server-only";

import { z } from "zod";

import { ButtonLink } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { session } from "@/lib/api/client";

import { setupSummarySchema } from "./schema";

const summaries = z.array(setupSummarySchema);
async function readActive(projectId: string, siteId: string) {
	const identity = await session();
	const base = process.env.DECAMARK_API_URL;
	if (identity.status !== "signed-in" || !base) throw new Error("Map setup access could not be confirmed");
	const response = await fetch(`${base}/v1/projects/${projectId}/sites/${siteId}/map-setups`, {
		cache: "no-store",
		headers: { Authorization: `Bearer ${identity.token}` },
		signal: AbortSignal.timeout(15000)
	});
	if (!response.ok) throw new Error("Map setup could not be read");
	return summaries.parse(await response.json()).find(item => item.state === "draft");
}
/** Only render after the owning page has checked manager access. Failed reads stay visible. */
export async function ResumeSetup({
	projectId,
	siteId,
	siteHref,
	timezone
}: {
	readonly projectId: string;
	readonly siteId: string;
	readonly siteHref: string;
	readonly timezone: string;
}) {
	let active;
	try {
		active = await readActive(projectId, siteId);
	} catch {
		return (
			<Note title="Map setup could not be checked.">
				Open map setup to try again. Your saved work has not been replaced.
			</Note>
		);
	}
	if (!active) return null;
	if (active.ready_for_form)
		return (
			<Note title="Map saved. Assign a form to continue.">
				<p>
					The map is listed in Forms. Observers get it after you assign a published form and publish the map.
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
					<ButtonLink variant="ink" size="sm" href={`${siteHref.split("/sites/")[0]}/forms`}>
						Go to Forms
					</ButtonLink>
					<ButtonLink variant="outline" size="sm" href={`${siteHref}/map-setup/${active.setup_id}/add-map`}>
						Edit map
					</ButtonLink>
				</div>
			</Note>
		);
	const savedAt = new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: timezone
	}).format(new Date(active.updated_at));
	return (
		<Note title="Map setup in progress">
			<p>
				A draft map for this site was last saved <time dateTime={active.updated_at}>{savedAt}</time>. Observers
				cannot use it until you publish it.
			</p>
			<div className="mt-3">
				<ButtonLink variant="ink" size="sm" href={`${siteHref}/map-setup/${active.setup_id}/add-map`}>
					Resume map setup
				</ButtonLink>
			</div>
		</Note>
	);
}
