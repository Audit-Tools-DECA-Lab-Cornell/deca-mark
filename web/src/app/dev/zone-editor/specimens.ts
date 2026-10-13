import { parseSite, type ProjectedSite, projectSite, type SiteFeature } from "@/lib/plan";
import {
	type DraftZone,
	extentOf,
	type PolygonRings,
	readZoneGeometry,
	rectangleRing,
	type ZoneGeometry
} from "@/lib/zones/geometry";

import cases from "../../../../../contracts/zones/geometry.cases.json";

/**
 * Shapes for the zone editor specimen (`/dev/zone-editor`, UI plan 6.6): the contract's authored geometry
 * cases, full-precision variants, the contract's size limits, and the Fall Creek upload layers. All of it
 * lives in memory. Nothing here is a site, a draft or a saved version.
 */

export type SpecimenLayers = {
	ground: { features: { geometry: unknown; properties?: Record<string, unknown> | null }[] };
	zones: { features: { geometry: unknown; properties?: Record<string, unknown> | null }[] };
	trees?: { features: { geometry: unknown; properties?: Record<string, unknown> | null }[] };
};

export type SpecimenSet = {
	id: string;
	name: string;
	/** What the set shows, in a sentence. */
	note: string;
	zones: DraftZone[];
	siteBoundary: PolygonRings[];
	site: ProjectedSite;
};

const geometries = cases.geometries as Record<string, unknown>;

/** A stable, well-formed identity for the nth specimen zone. */
export const specimenId = (n: number) => `5ec00000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function shape(alias: string): ZoneGeometry {
	const read = readZoneGeometry(structuredClone(geometries[alias]));
	if (!read.ok) throw new Error(`The ${alias} case is not a readable zone.`);
	return read.geometry;
}

function zone(n: number, code: string, label: string, geometry: ZoneGeometry): DraftZone {
	return { zone_id: specimenId(n), zone_code: code, zone_label: label, geometry };
}

/** The plan for a set: the site boundary (and any extra features) drawn under the zones, fitted to both. */
function planFor(
	name: string,
	siteBoundary: PolygonRings[],
	zones: DraftZone[],
	extra: SiteFeature[] = []
): ProjectedSite {
	const features: SiteFeature[] = [
		...siteBoundary.map(
			(rings, index) =>
				({
					type: "Feature",
					properties: { kind: "site", id: `site-${index + 1}` },
					geometry: { type: "Polygon", coordinates: rings }
				}) as SiteFeature
		),
		...extra,
		...zones.map(
			entry =>
				({
					type: "Feature",
					properties: { kind: "zone", id: entry.zone_id, name: entry.zone_label },
					geometry: entry.geometry
				}) as SiteFeature
		)
	];
	const site = projectSite(parseSite({ type: "FeatureCollection", name, features }));
	// The editor draws the zones itself, from the draft.
	return { ...site, zones: [] };
}

/** A site boundary: the zones' box with a fifth of its size around it. */
function boundaryAround(zones: DraftZone[]): PolygonRings[] {
	const extent = extentOf(zones.map(entry => entry.geometry))!;
	const padX = (extent.east - extent.west) * 0.2 || 0.001;
	const padY = (extent.north - extent.south) * 0.2 || 0.001;
	return [[rectangleRing([extent.west - padX, extent.south - padY], [extent.east + padX, extent.north + padY])]];
}

function fixtureSet(id: string, name: string, note: string, zones: DraftZone[]): SpecimenSet {
	const siteBoundary = boundaryAround(zones);
	return { id, name, note, zones, siteBoundary, site: planFor(name, siteBoundary, zones) };
}

/** A closed ring of `count` positions round a circle: count − 1 different points. */
function circle(count: number, [cx, cy]: [number, number], radius: number): ZoneGeometry {
	const ring: [number, number][] = [];
	for (let i = 0; i < count - 1; i++) {
		const angle = (i / (count - 1)) * Math.PI * 2;
		ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
	}
	ring.push(ring[0]!);
	return { type: "Polygon", coordinates: [ring] };
}

/** Full-precision coordinates: 15–17 significant digits, and one value needing more than 20 decimals. */
const FULL_PRECISION: ZoneGeometry = {
	type: "MultiPolygon",
	coordinates: [
		[
			[
				[1.2345678901234567e-21, 0.0012345678901234567],
				[0.0098765432109876543, 0.0012345678901234567],
				[0.0098765432109876543, 0.0087654321098765432],
				[1.2345678901234567e-21, 0.0087654321098765432],
				[1.2345678901234567e-21, 0.0012345678901234567]
			],
			[
				[0.0031415926535897932, 0.0027182818284590452],
				[0.0031415926535897932, 0.0057721566490153286],
				[0.0066180339887498948, 0.0057721566490153286],
				[0.0066180339887498948, 0.0027182818284590452],
				[0.0031415926535897932, 0.0027182818284590452]
			]
		]
	]
};

export function specimenSets(fallCreek: SpecimenLayers | null): SpecimenSet[] {
	const sets: SpecimenSet[] = [
		fixtureSet("neighbours", "Square and neighbours", "Two zones sharing an edge, and a third across a gap.", [
			zone(1, "SQ", "Square", shape("square")),
			zone(2, "AD", "Adjacent", shape("adjacent")),
			zone(3, "GN", "Gap neighbour", shape("gap_neighbor"))
		]),
		fixtureSet("holed", "Holed square", "A zone with a hole.", [zone(1, "HO", "Holed square", shape("holed"))]),
		fixtureSet("multipart", "Two parts", "One zone in two places.", [
			zone(1, "MP", "Two parts", shape("multipart"))
		]),
		fixtureSet("concave", "Concave", "A bent zone.", [zone(1, "CC", "Concave", shape("concave"))]),
		fixtureSet("reversed", "Reversed", "A ring that winds clockwise.", [
			zone(1, "RV", "Reversed", shape("reversed"))
		]),
		fixtureSet("duplicate", "Repeated point", "A ring with one point twice in a row.", [
			zone(1, "DV", "Repeated point", shape("duplicate_vertex"))
		]),
		fixtureSet("bow-tie", "Bow tie", "An edge that crosses itself.", [zone(1, "BT", "Bow tie", shape("bow_tie"))]),
		fixtureSet("outside-hole", "Hole outside", "A hole beyond its outer edge.", [
			zone(1, "OH", "Hole outside", shape("outside_hole"))
		]),
		fixtureSet("collinear", "Collinear", "Three points on a line: no area.", [
			zone(1, "CL", "Collinear", shape("collinear"))
		]),
		fixtureSet("overlap", "Overlapping parts", "Two parts of one zone that overlap.", [
			zone(1, "OV", "Overlapping parts", shape("multipart_overlap"))
		]),
		fixtureSet("shared-edge", "Parts sharing an edge", "Two parts of one zone that touch along an edge.", [
			zone(1, "SE", "Parts sharing an edge", shape("multipart_shared_edge"))
		]),
		fixtureSet("precision", "Full precision", "Up to 17 significant digits, and a value below 10⁻²⁰.", [
			zone(1, "FP", "Full precision", FULL_PRECISION)
		]),
		fixtureSet("limit-zone", "2,000 points", "One zone at the limit of 2,000 positions.", [
			zone(1, "LZ", "Two thousand points", circle(2000, [0.005, 0.005], 0.004))
		]),
		fixtureSet(
			"limit-site",
			"250 zones · 20,000 points",
			"A site at the limits: 250 zones of 80 positions each.",
			Array.from({ length: 250 }, (_, n) => {
				const column = n % 25;
				const row = Math.floor(n / 25);
				return zone(
					n + 1,
					`G${n + 1}`,
					`Zone ${n + 1}`,
					circle(80, [column * 0.0004 + 0.0002, row * 0.0004 + 0.0002], 0.00018)
				);
			})
		)
	];
	if (fallCreek) {
		const site = fallCreek.ground.features.find(feature => feature.properties?.kind === "site");
		const siteRead = site && readZoneGeometry(site.geometry);
		const zones = fallCreek.zones.features.flatMap((feature, index) => {
			const read = readZoneGeometry(feature.geometry);
			const code = String(feature.properties?.id ?? `Z${index + 1}`);
			return read.ok ? [zone(index + 1, code, String(feature.properties?.label ?? code), read.geometry)] : [];
		});
		if (siteRead?.ok && zones.length > 0) {
			const siteBoundary =
				siteRead.geometry.type === "Polygon"
					? [siteRead.geometry.coordinates]
					: [...siteRead.geometry.coordinates];
			const trees: SiteFeature[] = (fallCreek.trees?.features ?? []).flatMap((feature, index) =>
				(feature.geometry as { type?: string } | null)?.type === "Point"
					? [
							{
								type: "Feature",
								properties: { kind: "tree", id: `tree-${index + 1}` },
								geometry: feature.geometry
							} as SiteFeature
						]
					: []
			);
			sets.push({
				id: "fall-creek",
				name: "Fall Creek layers",
				note: "The Fall Creek upload layers: the site boundary, its trees and Zone A, at full precision.",
				zones,
				siteBoundary,
				site: planFor("Fall Creek", siteBoundary, zones, trees)
			});
		}
	}
	return sets;
}
