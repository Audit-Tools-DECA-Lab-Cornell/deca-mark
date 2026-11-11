import type { PlanFrame, ProjectedSite } from "../../lib/plan";
import { type CollectionLayers, layersPlan } from "../../lib/sites/archive";
import type { Content, SourceLayer } from "./schema";

export function setupPlan(
	name: string,
	layers: readonly SourceLayer[],
	content: Content,
	frame?: PlanFrame
): ProjectedSite | null {
	const references = layers.flatMap(layer =>
		layer.features.flatMap(item => {
			const role = content.assignments.find(
				assignment => assignment.source_id === layer.source_id && assignment.feature_key === item.feature_key
			)?.role;
			if (role === "leave_out" || role === "outline" || role === "zones") return [];
			const feature =
				item.feature.properties?.kind === "site"
					? { ...item.feature, properties: { ...item.feature.properties, kind: "ground" } }
					: item.feature;
			return [{ feature, role }];
		})
	);
	const polygons = references
		.filter(
			({ feature, role }) =>
				role !== "paths" &&
				role !== "trees" &&
				(feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon")
		)
		.map(item => item.feature);
	const lines = references
		.filter(
			({ feature, role }) =>
				role === "paths" ||
				(!role && (feature.geometry?.type === "LineString" || feature.geometry?.type === "MultiLineString"))
		)
		.map(item => item.feature);
	const trees = references
		.filter(
			({ feature, role }) =>
				role === "trees" ||
				(!role && (feature.geometry?.type === "Point" || feature.geometry?.type === "MultiPoint"))
		)
		.map(item => item.feature);
	const data: CollectionLayers = {
		ground: {
			features: [
				...polygons,
				...(content.outline ? [{ geometry: content.outline, properties: { kind: "site" } }] : [])
			]
		},
		paths: { features: lines },
		trees: { features: trees },
		zones: {
			features: content.zones.map(zone => ({
				geometry: zone.geometry,
				properties: { id: zone.zone_id, label: zone.zone_label }
			}))
		}
	};
	// Viewing room is not a site outline: no geometry is invented or saved here.
	return layersPlan(name, data, 60, frame);
}
