import {
	type DraftZone,
	type PolygonRings,
	type StructureIssue,
	structureIssues,
	type VertexAddress
} from "@/lib/zones/geometry";
import { type ZoneHint, zoneHints } from "@/lib/zones/hints";

import { ringName, zoneName } from "./state";

/**
 * What the Problems island lists while editing (UI plan 5.3, WUI-5): problems that stop the draft from being
 * saved, found by the structural checks, and hints "Found while editing", which only the server can confirm.
 * Each says what, where and what to do, in manager language (UI plan 6.7), and is numbered: the same number
 * marks its zone on the plan.
 */

export type EditorProblem = {
	readonly number: number;
	/** blocking stops saving; hint is the browser's own finding, which the server decides. */
	readonly kind: "blocking" | "hint";
	readonly code: StructureIssue["code"] | ZoneHint["code"];
	readonly zoneId: string | null;
	/** The point to show, when the problem is at one. */
	readonly address: VertexAddress | null;
	readonly text: string;
};

const thousands = (value: number) => value.toLocaleString("en-US");

function possessive(name: string): string {
	return `${name}${name.endsWith("s") ? "’" : "’s"}`;
}

function structureText(issue: StructureIssue, zones: ReadonlyMap<string, DraftZone>): string {
	const zone = issue.zoneIds[0] ? zones.get(issue.zoneIds[0]) : undefined;
	const name = zone ? zoneName(zone) : "A zone";
	const title = name[0]!.toUpperCase() + name.slice(1);
	switch (issue.code) {
		case "invalid_structure":
			return `${possessive(title)} shape cannot be saved: an edge must end where it starts and have at least three different points. Undo the last change or move its points apart.`;
		case "too_complex":
			return zone
				? `${title} has more than ${thousands(2000)} points. Remove points until it has ${thousands(2000)} or fewer.`
				: `This draft is larger than DECA Mark accepts: at most ${thousands(250)} zones and ${thousands(20_000)} points in all. Remove zones or points.`;
		case "empty_label":
			return `${title} needs a name.`;
		case "long_label":
			return `${possessive(title)} name is longer than 200 characters. Shorten it.`;
		case "invalid_code":
			return `${possessive(title)} code must start with a letter or digit and use only letters, digits, dots, dashes and underscores, up to 100 characters.`;
		case "duplicate_code":
			return `Two zones use code ${zone?.zone_code ?? ""}. Give one a different code.`;
		case "duplicate_zone_id":
		case "invalid_zone_id":
			return `${title} cannot be told apart from another zone. Remove it and draw it again.`;
		case "long_change_note":
			return "The change note is longer than 2,000 characters. Shorten it.";
	}
}

function hintText(hint: ZoneHint, zone: DraftZone): string {
	const name = zoneName(zone);
	const title = name[0]!.toUpperCase() + name.slice(1);
	const point = hint.address.index + 1;
	switch (hint.code) {
		case "self_intersection":
			return `${possessive(title)} edge crosses itself near point ${point}. Move a point so the edge no longer crosses.`;
		case "hole_outside": {
			const ring = ringName(zone, hint.address);
			const hole = ring[0]!.toUpperCase() + ring.slice(1);
			return `${hole} of ${name} reaches outside its outer edge near point ${point}. Move the hole’s points inside the outer edge.`;
		}
		case "outside_site":
			return `Part of ${name} is outside the site boundary near point ${point}. Move it inside, or trace the site edge.`;
	}
}

/**
 * Every problem in the draft, blocking ones first, numbered from 1. `site` is the site boundary's polygons,
 * for the points-outside hint.
 */
export function editorProblems(
	zones: readonly DraftZone[],
	site: readonly PolygonRings[],
	changeNote = ""
): EditorProblem[] {
	const byId = new Map(zones.map(zone => [zone.zone_id, zone]));
	const problems: Omit<EditorProblem, "number">[] = [];
	for (const issue of structureIssues(zones, changeNote))
		problems.push({
			kind: "blocking",
			code: issue.code,
			zoneId: issue.zoneIds[0] ?? null,
			// Structural issues locate the zone; showing it fits the whole zone in view.
			address: null,
			text: structureText(issue, byId)
		});
	const broken = new Set(problems.flatMap(problem => (problem.code === "invalid_structure" ? [problem.zoneId] : [])));
	for (const zone of zones) {
		if (broken.has(zone.zone_id)) continue;
		for (const hint of zoneHints(zone, site))
			problems.push({
				kind: "hint",
				code: hint.code,
				zoneId: zone.zone_id,
				address: hint.address,
				text: hintText(hint, zone)
			});
	}
	return problems.map((problem, index) => ({ ...problem, number: index + 1 }));
}

/** The reason saving is held, in a few words for the save status line, or null when nothing blocks it. */
export function blockingReason(problems: readonly EditorProblem[]): string | null {
	const first = problems.find(problem => problem.kind === "blocking");
	return first ? first.text : null;
}
