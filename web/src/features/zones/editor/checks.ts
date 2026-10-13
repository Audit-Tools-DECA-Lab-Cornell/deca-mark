import { plural } from "@/lib/labels";
import type { DraftZone } from "@/lib/zones/geometry";
import { issueText } from "@/lib/zones/issues";
import type { ZoneValidation } from "@/lib/zones/schemas";

import type { EditorProblem } from "./problems";
import { isDirty, type SaveQueue } from "./save-queue";
import { zoneName } from "./state";

/**
 * DECA Mark's checks of a saved revision (WUI-5): when one may be asked for, and what it found in the
 * Problems island's words. A check belongs to the revision it was made for; it is shown with that revision,
 * and one made for an older revision than the draft has now says so.
 */

/** How long the draft waits, saved and unchanged, before DECA Mark checks it. */
export const CHECK_IDLE_MS = 10_000;

/** A check, with the revision and the moment it was made for. */
export type DraftCheck = {
	readonly revision: number;
	readonly checkedAt: string;
	readonly validation: ZoneValidation;
};

/**
 * Whether the acknowledged revision can be checked now: nothing being saved or read, nothing paused, online,
 * and the draft in this tab is the one saved. Otherwise the check waits.
 */
export function canCheck(queue: SaveQueue): boolean {
	return !queue.pause && !queue.offline && !queue.inFlight && !queue.reading && !queue.invalid && !isDirty(queue);
}

/** Why "Check boundaries" waits, or null when it can run. */
export function checkUnavailable(queue: SaveQueue): string | null {
	if (queue.offline) return "Checking needs a connection.";
	if (queue.pause) return "Checking waits until the draft saves again.";
	if (queue.invalid || isDirty(queue) || queue.inFlight || queue.reading)
		return "Checking waits until your changes are saved.";
	return null;
}

/** Whether a check is still about the revision the draft has, or about an older one. */
export function checkIsCurrent(check: DraftCheck, queue: SaveQueue): boolean {
	return check.revision === queue.acknowledged.revision && !isDirty(queue);
}

/** A problem DECA Mark found, in the editor's numbering: problems that stop publishing, then warnings. */
export function checkProblems(
	validation: ZoneValidation,
	zones: readonly DraftZone[]
): Omit<EditorProblem, "number">[] {
	const byId = new Map(zones.map(zone => [zone.zone_id, zone]));
	const named = (ids: readonly string[]) =>
		ids.flatMap(id => {
			const zone = byId.get(id);
			if (!zone) return [];
			const name = zoneName(zone);
			return [name[0]!.toUpperCase() + name.slice(1)];
		});
	const problem = (issue: ZoneValidation["issues"][number], kind: "checked" | "warning") => ({
		kind,
		code: issue.code,
		zoneId: issue.zone_ids.find(id => byId.has(id)) ?? null,
		// DECA Mark locates a zone, not a point: showing it fits the zone in view.
		address: null,
		text: issueText(issue.code, named(issue.zone_ids))
	});
	return [
		...validation.issues.map(issue => problem(issue, "checked")),
		...validation.warnings.map(issue => problem(issue, "warning"))
	];
}

/**
 * The Problems island's line for a check: "Checked revision 6 at 11:33 · 2 problems · 1 warning", and when
 * the draft has changed since, that it is checked again once saved.
 */
export function checkLine(check: DraftCheck, current: boolean, time: (iso: string) => string): string {
	const { issues, warnings } = check.validation;
	const found =
		issues.length === 0 && warnings.length === 0
			? "nothing found"
			: [
					issues.length > 0 ? plural(issues.length, "problem") : null,
					warnings.length > 0 ? plural(warnings.length, "warning") : null
				]
					.filter(Boolean)
					.join(" · ");
	const line = `Checked revision ${check.revision} at ${time(check.checkedAt)} · ${found}`;
	return current ? line : `${line} · the draft has changed since, so it is checked again once saved`;
}
