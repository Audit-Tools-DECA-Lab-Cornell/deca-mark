/**
 * API records in the shapes the API serves (contract "Reads"), for the unit tests. Each builder fills every
 * field with a plausible value; a test passes only the fields it is about.
 */

/** A UUID that reads as its name in a failure: `uuid(3)` is `00000000-0000-4000-8000-000000000003`. */
export function uuid(n) {
	return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const PROJECT = uuid(900);
export const USER = uuid(901);

export function forms(play = "workspace-check-v1", inventory = null) {
	return {
		play: { form_version_id: uuid(800), form_version: play },
		inventory: inventory ? { form_version_id: uuid(801), form_version: inventory } : null
	};
}

/** A package of a site's history. */
export function pkg(overrides = {}) {
	return {
		package_id: uuid(100),
		site_id: uuid(1),
		package_version: 1,
		prepared_at: "2026-10-07T18:05:00Z",
		archive_bytes: 13_500,
		archive_sha256: "x",
		forms: forms(),
		zone_count: 1,
		change_note: "",
		published_by: USER,
		source: "upload",
		state: "ready",
		...overrides
	};
}

/** A zone as a site lists it. */
export function siteZone(overrides = {}) {
	return {
		zone_id: uuid(200),
		zone_code: "A",
		label: "Zone A",
		bbox: [0, 0, 1, 1],
		display_anchor: [0.5, 0.5],
		geometry_sha256: "g",
		...overrides
	};
}

export function site(overrides = {}) {
	const current = overrides.package === undefined ? pkg() : overrides.package;
	return {
		site_id: uuid(1),
		code: "fall-creek",
		name: "Fall Creek",
		description: null,
		created_at: "2026-10-01T12:00:00Z",
		observation_count: 0,
		current_package_id: current ? current.package_id : null,
		package: current,
		zones: current ? [siteZone()] : [],
		extent: current ? { west: 0, south: 0, east: 1, north: 1 } : null,
		centre: current ? [0.5, 0.5] : null,
		zone_editing_available: true,
		...overrides
	};
}

/** An observation with its recorded binding: a point in zone A of version 1, unless told otherwise. */
export function observation(overrides = {}) {
	const spatial = overrides.round_type === "inventory" ? "zone" : "point";
	return {
		observation_id: uuid(500),
		project_id: PROJECT,
		user_id: USER,
		site_id: uuid(1),
		site_code: "fall-creek",
		site_name: "Fall Creek",
		observer: "OB",
		observed_at: "2026-10-07T14:00:00Z",
		received_at: "2026-10-07T14:05:00Z",
		revision: 1,
		answers: {},
		form_version: "workspace-check-v1",
		round_type: "standard",
		first_round: null,
		placement: "hand",
		package_id: uuid(100),
		package_version: 1,
		zone_id: uuid(200),
		zone_code: "A",
		zone_label: "Zone A",
		spatial_support: spatial,
		geometry: spatial === "point" ? { type: "Point", coordinates: [-76.5, 42.4] } : null,
		display_anchor: spatial === "zone" ? { type: "Point", coordinates: [-76.5, 42.4] } : null,
		...overrides
	};
}

/** A summary group: `count` observations of one zone, version and round type. */
export function group(overrides = {}) {
	return {
		site_id: uuid(1),
		package_id: uuid(100),
		package_version: 1,
		zone_id: uuid(200),
		zone_code: "A",
		zone_label: "Zone A",
		round_type: "standard",
		spatial_support: "point",
		count: 1,
		...overrides
	};
}
