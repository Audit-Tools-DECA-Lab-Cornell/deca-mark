/**
 * What a zone problem DECA Mark found says to a manager (UI plan 6.7): what is wrong, where, and what to do.
 * "Polygon" is never used. `zones` names the zones the problem is about, in the order the issue lists them
 * (their labels, or codes when a zone has no label yet); an issue about no zone in particular reads without.
 */

function list(zones: readonly string[]): string {
	if (zones.length <= 1) return zones[0] ?? "";
	return `${zones.slice(0, -1).join(", ")} and ${zones[zones.length - 1]}`;
}

export function issueText(code: string, zones: readonly string[] = []): string {
	const one = zones[0];
	switch (code) {
		case "self_intersection":
			return `${one ?? "A zone"}'s edge crosses itself. Move a point so the edge no longer crosses.`;
		case "invalid_topology":
			return `${one ? `${one}'s` : "A zone's"} shape is not valid: a hole or part overlaps another. Check its holes and parts.`;
		case "zero_area":
			return `${one ?? "A zone"} has no area. Move its points apart.`;
		case "outside_site":
			return `Part of ${one ?? "a zone"} is outside the site boundary. Move it inside, or trace the site edge.`;
		case "interior_overlap":
			return zones.length >= 2
				? `${list(zones)} overlap. Zones may share an edge but not area. Move the shared edge so they only touch.`
				: `${one ?? "A zone"} overlaps another zone. Zones may share an edge but not area.`;
		case "duplicate_code":
		case "duplicate_zone_id":
			return `Two zones use the same ${code === "duplicate_code" ? "code" : "identity"}${one ? ` (${one})` : ""}. Give one a different ${code === "duplicate_code" ? "code" : "choice"}.`;
		case "identity_conflict":
			return one
				? `${one} cannot keep that identity: it belongs to another site or another code. Choose its zone again, or make it a new zone.`
				: "The zones and the identities chosen for them do not match. Check each zone's choice.";
		case "unsupported_extent":
			return "This site is too large or crosses the date line or a pole. DECA Mark supports sites up to 1° across.";
		case "too_complex":
			return "Too many points: at most 2,000 per zone and 20,000 per site.";
		case "empty_zone_set":
			return "Add at least one zone.";
		case "invalid_structure":
			return `${one ?? "A zone"}'s shape could not be read. Check that each of its rings is closed and has at least three different points.`;
		case "form_not_in_package":
			return "The inventory form cannot change in a zone edit. Keep the form this map uses.";
		case "site_gap":
			return "Part of the site is in no zone. Observers cannot place points there.";
		case "small_zone":
			return `${one ?? "A zone"} is smaller than 1 m². Check that it is meant to be this small.`;
		default:
			return `${one ? `${one}: ` : ""}DECA Mark found a problem it does not describe here. Check the zone and try again.`;
	}
}
