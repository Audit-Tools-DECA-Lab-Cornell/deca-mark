import { PlanThumbnail } from "@/components/map/PlanThumbnail";
import type { PlanObservation, ZonePlanStyle } from "@/components/map/SitePlan";
import {
	fromPlan,
	parseSite,
	type PlanFrame,
	type PlanPoint,
	type ProjectedSite,
	projectSite,
	type SiteCollection,
	type SiteFeature
} from "@/lib/plan";

import { Specimen } from "./GalleryParts";
import { SelectableMap } from "./SelectableMap";

type FeatureProperties = SiteFeature["properties"];

/** A plan drawn in plan units on a fixed frame, so the gallery needs nothing from a project. */
const PARK_FRAME: PlanFrame = { origin: [-76.498, 42.444], metresPerUnit: 0.5, width: 720, height: 500 };

function ring(points: readonly PlanPoint[], frame: PlanFrame) {
	const closed = [...points, points[0]!];
	return [closed.map(point => [...fromPlan(point, frame)] as [number, number])];
}

function polygon(properties: FeatureProperties, points: readonly PlanPoint[], frame: PlanFrame): SiteFeature {
	return {
		type: "Feature",
		properties,
		geometry: { type: "Polygon", coordinates: ring(points, frame) }
	};
}

function line(properties: FeatureProperties, points: readonly PlanPoint[], frame: PlanFrame): SiteFeature {
	return {
		type: "Feature",
		properties,
		geometry: {
			type: "LineString",
			coordinates: points.map(point => [...fromPlan(point, frame)] as [number, number])
		}
	};
}

function tree(id: string, at: PlanPoint, radius: number, frame: PlanFrame): SiteFeature {
	return {
		type: "Feature",
		properties: { kind: "tree", id, radius_m: radius },
		geometry: { type: "Point", coordinates: [...fromPlan(at, frame)] as [number, number] }
	};
}

const rect = (x: number, y: number, width: number, height: number): PlanPoint[] => [
	[x, y],
	[x + width, y],
	[x + width, y + height],
	[x, y + height]
];

/** A park with three zones, a path, a shelter, play equipment and a few trees. */
function parkSite(): SiteCollection {
	const frame = PARK_FRAME;
	return parseSite({
		type: "FeatureCollection",
		name: "Example park",
		frame,
		features: [
			polygon({ kind: "site", id: "site", name: "Example park" }, rect(80, 60, 580, 390), frame),
			polygon({ kind: "grass", id: "grass-1" }, rect(80, 60, 580, 390), frame),
			polygon({ kind: "mulch", id: "mulch-1" }, rect(340, 370, 130, 60), frame),
			polygon({ kind: "dirt", id: "dirt-1" }, rect(460, 270, 160, 120), frame),
			line(
				{ kind: "path", id: "path-1", width_m: 6 },
				[
					[80, 250],
					[370, 250],
					[660, 250]
				],
				frame
			),
			polygon({ kind: "structure", id: "structure-1", name: "Shelter" }, rect(380, 290, 60, 50), frame),
			polygon({ kind: "equipment", id: "equipment-1", name: "Play structure" }, rect(350, 380, 100, 40), frame),
			tree("tree-01", [100, 80], 7, frame),
			tree("tree-02", [630, 90], 8.5, frame),
			tree("tree-03", [110, 430], 9, frame),
			tree("tree-04", [640, 430], 7.5, frame),
			tree("tree-05", [350, 270], 8, frame),
			polygon(
				{
					kind: "zone",
					id: "zone-a",
					code: "A",
					name: "North meadow",
					display_anchor: [...fromPlan([330, 165], frame)] as [number, number]
				},
				rect(120, 100, 420, 130),
				frame
			),
			polygon(
				{
					kind: "zone",
					id: "zone-b",
					code: "B",
					name: "Woodland edge",
					display_anchor: [...fromPlan([225, 345], frame)] as [number, number]
				},
				rect(120, 270, 210, 150),
				frame
			),
			polygon(
				{
					kind: "zone",
					id: "zone-c",
					code: "C",
					name: "Sand area",
					display_anchor: [...fromPlan([540, 330], frame)] as [number, number]
				},
				rect(470, 280, 140, 100),
				frame
			)
		]
	});
}

/** A small yard with no stored frame: the plan fits itself to the features. */
function yardSite(): SiteCollection {
	const frame: PlanFrame = { origin: [-76.4912, 42.4401], metresPerUnit: 0.1, width: 720, height: 500 };
	return parseSite({
		type: "FeatureCollection",
		name: "Example yard",
		features: [
			polygon({ kind: "site", id: "site", name: "Example yard" }, rect(160, 120, 400, 260), frame),
			polygon({ kind: "grass", id: "grass-1" }, rect(160, 120, 400, 260), frame),
			polygon({ kind: "zone", id: "zone-a", code: "A", name: "Whole yard" }, rect(180, 140, 360, 220), frame),
			tree("tree-01", [200, 160], 2.5, frame)
		]
	});
}

/** Project 7's coverage dots, with North meadow hatched as the zone in focus (Project 8). */
const DAY_ZONES: Record<string, ZonePlanStyle> = {
	"zone-a": { dots: [true, true, false], hatched: true, emphasis: "focus" },
	"zone-b": { dots: [true, true, true] },
	"zone-c": { dots: [false, false, false] }
};

/** System 8: the same dots, nothing hatched. */
const NIGHT_ZONES: Record<string, ZonePlanStyle> = {
	"zone-a": { dots: [true, true, false] },
	"zone-b": { dots: [true, true, true] },
	"zone-c": { dots: [false, false, false] }
};

/** Fourteen records in plan units: North meadow 7, Woodland edge 6, Sand area 1. */
const RECORDS: { id: string; at: PlanPoint; label: string }[] = [
	{ id: "OBS-0244", at: [267, 330], label: "Woodland edge, Round 3" },
	{ id: "OBS-0243", at: [213, 314], label: "Woodland edge, Round 3" },
	{ id: "OBS-0242", at: [204, 156], label: "North meadow, Round 1" },
	{ id: "OBS-0241", at: [148, 317], label: "Woodland edge, Round 2" },
	{ id: "OBS-0240", at: [249, 190], label: "North meadow, Round 1" },
	{ id: "OBS-0239", at: [285, 371], label: "Woodland edge, Round 2" },
	{ id: "OBS-0238", at: [329, 176], label: "North meadow, Round 2" },
	{ id: "OBS-0237", at: [551, 323], label: "Sand area, Round 1" },
	{ id: "OBS-0236", at: [383, 195], label: "North meadow, Round 1" },
	{ id: "OBS-0235", at: [420, 126], label: "North meadow, Round 2" },
	{ id: "OBS-0234", at: [461, 171], label: "North meadow, Round 1" },
	{ id: "OBS-0233", at: [170, 390], label: "Woodland edge, Round 1" },
	{ id: "OBS-0232", at: [499, 139], label: "North meadow, Round 2" },
	{ id: "OBS-0231", at: [232, 394], label: "Woodland edge, Round 1" }
];

function observationsFor(site: ProjectedSite): PlanObservation[] {
	return RECORDS.map(({ id, at, label }) => {
		const [lng, lat] = fromPlan(at, site.frame);
		return { id, lng, lat, label: `${id}, ${label}` };
	});
}

/**
 * The map primitives against System 9, Project 7 and System 8: a Day frame that follows the reader's
 * palette, a frame pinned to Night, a yard fitted to its own features, and the site thumbnails. The plans
 * are drawn in this file, so the gallery reads nothing from a project.
 */
export function MapSpecimens() {
	const park = projectSite(parkSite());
	const yard = projectSite(yardSite());
	const observations = observationsFor(park);

	return (
		<>
			<div className="grid gap-x-8 gap-y-10 xl:grid-cols-2">
				<Specimen
					title="Map frame · reader's palette"
					caption="Day by default. Layers switches the palette for every unpinned map on the page; the screen theme never does.">
					<SelectableMap
						site={park}
						mapVersion="v3"
						subtitle="Dots show rounds that met the target"
						zones={DAY_ZONES}
						observations={observations}
						selectedId="OBS-0244"
						picker
					/>
				</Specimen>
				<Specimen
					title="Map frame · pinned to Night"
					caption="The label, buttons and scale chip take Dusk chrome from the palette, even on a Day page.">
					<SelectableMap
						site={park}
						palette="night"
						mapVersion="v3"
						subtitle="Dots show rounds that met the target"
						zones={NIGHT_ZONES}
						observations={observations}
					/>
				</Specimen>
			</div>
			<div className="grid gap-x-8 gap-y-10 xl:grid-cols-2">
				<Specimen
					title="Yard · fitted"
					caption="The collector's QGIS drawings, with no stored frame: the plan fits itself to the features.">
					<SelectableMap site={yard} mapVersion="v1" subtitle="Whole yard · 1 zone" />
				</Specimen>
				<Specimen title="Thumbnails" caption="Still plans for site rows and the palette cards in preferences.">
					<ul className="flex flex-wrap gap-6">
						{[park, yard].map(site => (
							<li key={site.name} className="flex flex-col gap-2">
								<PlanThumbnail site={site} className="w-40" />
								<span className="type-small text-ink-2">{site.name}</span>
							</li>
						))}
						<li className="flex flex-col gap-2">
							<PlanThumbnail site={park} palette="night" className="w-40" />
							<span className="type-small text-ink-2">Example park, Night</span>
						</li>
					</ul>
				</Specimen>
			</div>
		</>
	);
}
