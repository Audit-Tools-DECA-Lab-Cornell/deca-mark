import type { Role, SourceLayer } from "./schema";

type SourceFeature = SourceLayer["features"][number]["feature"];
type Shape = "area" | "line" | "point" | "feature";

/** What a manager would call the geometry: an area, a line or a point. */
export function shapeOf(type: string | undefined): Shape {
	switch (type) {
		case "Polygon":
		case "MultiPolygon":
			return "area";
		case "LineString":
		case "MultiLineString":
			return "line";
		case "Point":
		case "MultiPoint":
			return "point";
		default:
			return "feature";
	}
}

const NAME_KEYS = ["label", "name", "Name", "NAME", "title"] as const;
const NAME_MAX = 60;

/**
 * The name a feature carries in QGIS, when it has one; otherwise its shape and its place in the layer
 * ("Area 3"). The same number is drawn on the map, so a row and a shape can always be matched.
 */
export function featureName(feature: SourceFeature, index: number): string {
	for (const key of NAME_KEYS) {
		const value = feature.properties?.[key];
		if (typeof value === "string" && value.trim()) {
			const text = value.trim();
			return text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1)}…` : text;
		}
	}
	const shape = shapeOf(feature.geometry?.type);
	return `${shape.charAt(0).toUpperCase()}${shape.slice(1)} ${index + 1}`;
}

/** "4 points", "1 area", or "6 features" for a layer that mixes shapes. */
export function layerCount(layer: Pick<SourceLayer, "features">): string {
	const shapes = new Set(layer.features.map(entry => shapeOf(entry.feature.geometry?.type)));
	const shape: Shape = shapes.size === 1 ? ([...shapes][0] ?? "feature") : "feature";
	const count = layer.features.length;
	return `${count} ${shape}${count === 1 ? "" : "s"}`;
}

export const ROLE_LABELS: Record<Role, string> = {
	outline: "Site outline",
	zones: "Observation zone",
	ground: "Ground feature",
	paths: "Path",
	trees: "Tree",
	leave_out: "Leave out"
};

/** The same roles for a whole layer at once. */
export const ROLE_LABELS_PLURAL: Record<Role, string> = {
	outline: "Site outline",
	zones: "Observation zones",
	ground: "Ground features",
	paths: "Paths",
	trees: "Trees",
	leave_out: "Leave out"
};

/** The one role every feature of a layer has, or null when they differ or some are undecided. */
export function sharedRole(
	layer: Pick<SourceLayer, "source_id" | "features">,
	assignments: readonly { source_id: string; feature_key: string; role: Role }[]
): Role | null {
	let shared: Role | null = null;
	for (const entry of layer.features) {
		const role = assignments.find(
			item => item.source_id === layer.source_id && item.feature_key === entry.feature_key
		)?.role;
		if (!role || (shared !== null && role !== shared)) return null;
		shared = role;
	}
	return shared;
}

/** How many of a layer's features still have no use chosen. */
export function undecidedIn(
	layer: Pick<SourceLayer, "source_id" | "features">,
	assignments: readonly { source_id: string; feature_key: string }[]
): number {
	return layer.features.filter(
		entry => !assignments.some(item => item.source_id === layer.source_id && item.feature_key === entry.feature_key)
	).length;
}
