import type { PackageSubmission } from "./api/types";

/**
 * The browser's half of preparing a map package: reading the GeoJSON files QGIS exports, matching each to
 * its slot by name, and checking what DECA Mark will check, so a manager fixes a problem before the upload
 * instead of after it. The upload itself is `preparePackage` in `lib/api/browser.ts`, signed with the
 * manager's own sign-in; the project and site come from the address, never from a pasted value.
 *
 * Every blocking check here mirrors a refusal in `backend/src/fieldmaps_api/domain/packages.py` or in the
 * GeoJSON models it validates with. None of it replaces DECA Mark's own checks, which still run on upload.
 * Pure (a file is only read through `file.text()`), so it is unit-tested without a browser.
 */

export const LAYER_NAMES = ["ground", "paths", "trees", "zones"] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

export const REQUIRED_LAYERS: readonly LayerName[] = ["ground", "zones"];

/** Display and slot-table order: required layers first, in the order a manager checks them. */
export const SLOT_ORDER: readonly LayerName[] = ["ground", "zones", "paths", "trees"];

export const SLOT_LABELS: Record<LayerName | "project", string> = {
	ground: "Ground",
	zones: "Zones",
	paths: "Paths",
	trees: "Trees",
	project: "QGIS project"
};

/** What a slot's layer draws, in the words of a sentence ("Ground holds polygons"). */
const SHAPE_WORD: Record<LayerName, { many: string; one: string }> = {
	ground: { many: "polygons", one: "a polygon" },
	zones: { many: "polygons", one: "a polygon" },
	paths: { many: "lines", one: "a line" },
	trees: { many: "points", one: "a point" }
};

/**
 * The geometry types each layer may hold. DECA Mark accepts every GeoJSON shape in any layer; these are the
 * ones the map package draws (`lib/sites/archive.ts`), so a layer of anything else would arrive and show
 * nothing. QGIS writes the Multi variants whenever a layer holds one.
 */
export const EXPECTED_GEOMETRY: Record<LayerName, readonly string[]> = {
	ground: ["Polygon", "MultiPolygon"],
	zones: ["Polygon", "MultiPolygon"],
	paths: ["LineString", "MultiLineString", "Polygon", "MultiPolygon"],
	trees: ["Point", "MultiPoint", "Polygon", "MultiPolygon"]
};

/** The most zones, features and bytes DECA Mark takes (`domain/packages.py`, the upload body limit). */
export const MAX_ZONES = 64;
export const MAX_FEATURES_PER_LAYER = 20_000;
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

export class LayerReadError extends Error {}

/** One feature of an exported layer. A geometry of null is kept so the checks can name it. */
export type LayerFeature = {
	readonly type: "Feature";
	readonly geometry: { readonly type: string; readonly coordinates?: unknown } | null;
	readonly properties: Readonly<Record<string, unknown>>;
};

/** A layer as QGIS exports it. `crs` is the legacy member older GeoJSON writers add. */
export type LayerCollection = {
	readonly type: "FeatureCollection";
	readonly features: readonly LayerFeature[];
	readonly crs?: unknown;
};

/** A layer's shape, read once after parsing: how many features, what geometry, and where on earth. */
export type LayerAnalysis = {
	readonly featureCount: number;
	readonly geometryTypes: readonly string[];
	/** Features with no geometry at all. */
	readonly withoutGeometry: number;
	readonly bbox: BBox | null;
};

/** `[west, south, east, north]`, in whatever units the layer's coordinates happen to be in. */
export type BBox = readonly [number, number, number, number];

/** Where a dropped or browsed file ends up: one of the four layer slots, the project file, or unplaced. */
export type SlotTarget = LayerName | "project";

export type LayerSlotState =
	| { readonly kind: "empty" }
	| { readonly kind: "reading"; readonly file: File }
	| { readonly kind: "error"; readonly file: File; readonly message: string }
	| {
			readonly kind: "ready";
			readonly file: File;
			readonly collection: LayerCollection;
			readonly analysis: LayerAnalysis;
	  };

export type ProjectSlotState = { readonly kind: "empty" } | { readonly kind: "ready"; readonly file: File };

/** A dropped file the name didn't confidently match, waiting on a manager to pick its slot. */
export type UnassignedFile = {
	readonly id: string;
	readonly file: File;
	/** The slot its name suggested, if any: offered as the default in the picker, not applied silently. */
	readonly guess: SlotTarget | null;
};

/**
 * Guess a file's slot from its name alone: case-insensitive, and "zone"/"path"/"tree" match their plurals
 * for free since the singular is a substring of it. A `.qgz`/`.qgs` is always the project file: QGIS
 * doesn't name those after a layer.
 */
export function matchSlot(filename: string): SlotTarget | null {
	const lower = filename.toLowerCase();
	if (lower.endsWith(".qgz") || lower.endsWith(".qgs")) return "project";
	if (lower.includes("ground")) return "ground";
	if (lower.includes("zone")) return "zones";
	if (lower.includes("path")) return "paths";
	if (lower.includes("tree")) return "trees";
	return null;
}

/* ── Reading a layer ──────────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse one exported layer, failing with the name of the file a manager actually chose. */
export async function readLayer(file: File): Promise<LayerCollection> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await file.text());
	} catch {
		throw new LayerReadError(`${file.name} cannot be read. In QGIS, export the layer as GeoJSON.`);
	}
	return layerFromData(parsed, file.name);
}

/** A parsed GeoJSON document as a layer. Throws `LayerReadError` naming `fileName`. */
export function layerFromData(parsed: unknown, fileName: string): LayerCollection {
	if (!isRecord(parsed) || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features))
		throw new LayerReadError(`${fileName} is not a GeoJSON layer. In QGIS, export the layer as GeoJSON.`);
	const features: LayerFeature[] = parsed.features.map((entry: unknown, index: number) => {
		if (!isRecord(entry) || entry.type !== "Feature")
			throw new LayerReadError(`Item ${index + 1} in ${fileName} is not a feature.`);
		const geometry = isRecord(entry.geometry) && typeof entry.geometry.type === "string" ? entry.geometry : null;
		return {
			type: "Feature",
			geometry: geometry ? { type: geometry.type as string, coordinates: geometry.coordinates } : null,
			properties: isRecord(entry.properties) ? entry.properties : {}
		};
	});
	return { type: "FeatureCollection", features, ...(parsed.crs !== undefined ? { crs: parsed.crs } : {}) };
}

/** Base64 without loading the file twice: the project file is the only binary in a submission. */
export async function readProjectFile(file: File): Promise<{ file_name: string; content: string }> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
	return { file_name: file.name, content: btoa(binary) };
}

/**
 * The layers as the upload takes them. The checks have already refused what DECA Mark would (a feature with
 * no shape, a layer of projected coordinates), so the layers are sent as they were read.
 */
export function submissionLayers(slots: Record<LayerName, LayerSlotState>): PackageSubmission["layers"] {
	const layers: Record<string, LayerCollection> = {};
	for (const name of LAYER_NAMES) {
		const slot = slots[name];
		if (slot.kind === "ready") layers[name] = slot.collection;
	}
	return layers as unknown as PackageSubmission["layers"];
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */

function collectPositions(coordinates: unknown, into: number[][]): void {
	if (!Array.isArray(coordinates)) return;
	if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
		into.push(coordinates as number[]);
		return;
	}
	for (const part of coordinates) collectPositions(part, into);
}

function bboxOf(features: readonly LayerFeature[]): BBox | null {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	for (const feature of features) {
		const positions: number[][] = [];
		collectPositions(feature.geometry?.coordinates, positions);
		for (const [lng, lat] of positions) {
			if (lng === undefined || lat === undefined) continue;
			if (lng < west) west = lng;
			if (lng > east) east = lng;
			if (lat < south) south = lat;
			if (lat > north) north = lat;
		}
	}
	return west === Infinity ? null : [west, south, east, north];
}

export function unionBbox(a: BBox, b: BBox): BBox {
	return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Does `inner` fall entirely inside `outer`? Used for "zones lie inside ground's extent". */
export function bboxContains(outer: BBox, inner: BBox): boolean {
	return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

/** `true` once a coordinate falls outside what longitude/latitude can hold: the export wasn't reprojected. */
export function looksProjected(bbox: BBox): boolean {
	return Math.abs(bbox[0]) > 180 || Math.abs(bbox[2]) > 180 || Math.abs(bbox[1]) > 90 || Math.abs(bbox[3]) > 90;
}

export function analyzeLayer(collection: LayerCollection): LayerAnalysis {
	const types = new Set<string>();
	let withoutGeometry = 0;
	for (const feature of collection.features) {
		if (feature.geometry) types.add(feature.geometry.type);
		else withoutGeometry += 1;
	}
	return {
		featureCount: collection.features.length,
		geometryTypes: [...types],
		withoutGeometry,
		bbox: bboxOf(collection.features)
	};
}

/** The geometry types in a layer that its slot does not draw. */
export function unexpectedGeometry(name: LayerName, analysis: LayerAnalysis): string[] {
	return analysis.geometryTypes.filter(type => !EXPECTED_GEOMETRY[name].includes(type));
}

/** The names GeoJSON writers use for the one coordinate system a package may carry (`domain/geojson.py`). */
const WGS84_NAMES = new Set([
	"urn:ogc:def:crs:ogc:1.3:crs84",
	"urn:ogc:def:crs:ogc::crs84",
	"urn:ogc:def:crs:epsg::4326",
	"epsg:4326",
	"crs84",
	"wgs 84",
	"wgs84"
]);

/** The coordinate system a layer declares when it is not WGS 84, or null when it declares none or WGS 84. */
export function declaredOtherCrs(collection: LayerCollection): string | null {
	const crs = collection.crs;
	if (!isRecord(crs) || !isRecord(crs.properties)) return null;
	const name = crs.properties.name;
	if (typeof name !== "string") return null;
	return WGS84_NAMES.has(name.trim().toLowerCase()) ? null : name.trim();
}

/* ── Property reading, as DECA Mark reads it ──────────────────────────────── */

/** A text property, trimmed and not empty: a number or a blank text is not one (`Feature.text`). */
export function textProperty(properties: Readonly<Record<string, unknown>>, key: string): string | null {
	const value = properties[key];
	if (typeof value !== "string") return null;
	return value.trim() || null;
}

/** "2", "2 and 5", "2, 5 and 7", "1, 2, 3, 4, 5 and 6 more". */
function listNumbers(numbers: readonly number[]): string {
	if (numbers.length <= 5) {
		if (numbers.length <= 1) return numbers.join("");
		return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
	}
	return `${numbers.slice(0, 5).join(", ")} and ${numbers.length - 5} more`;
}

function featuresWord(count: number): string {
	return `${count} ${count === 1 ? "feature" : "features"}`;
}

/** The zone numbers (1-based) that cannot be an id, and why: no property at all, or a number. */
export function zoneIdProblems(zones: LayerCollection): { missing: number[]; numeric: number[] } {
	const missing: number[] = [];
	const numeric: number[] = [];
	zones.features.forEach((feature, index) => {
		if (textProperty(feature.properties, "id") !== null) return;
		if (typeof feature.properties.id === "number") numeric.push(index + 1);
		else missing.push(index + 1);
	});
	return { missing, numeric };
}

/** Ids used by more than one zone. */
export function repeatedZoneIds(zones: LayerCollection): string[] {
	const seen = new Set<string>();
	const repeated = new Set<string>();
	for (const feature of zones.features) {
		const id = textProperty(feature.properties, "id");
		if (id === null) continue;
		if (seen.has(id)) repeated.add(id);
		seen.add(id);
	}
	return [...repeated].sort();
}

/* ── The checklist ────────────────────────────────────────────────────────── */

/** One line of the browser's checklist, in the same words the package's own checks use. */
export type ClientCheck = {
	readonly id: string;
	readonly state: "passed" | "warning" | "blocked";
	readonly label: string;
	readonly detail: string;
};

function readingLayers(slots: Record<LayerName, LayerSlotState>): boolean {
	return LAYER_NAMES.some(name => slots[name].kind === "reading");
}

/**
 * Everything the upload step can check without sending anything: that the required layers are chosen and
 * readable, their shapes and coordinates, that every zone has a distinct text id (what an observation
 * records), that the ground has one site outline, and that the files fit. Each blocking check is one
 * DECA Mark would refuse the package for.
 */
export function runClientChecks(
	slots: Record<LayerName, LayerSlotState>,
	project: ProjectSlotState = { kind: "empty" }
): readonly ClientCheck[] {
	const checks: ClientCheck[] = [];

	for (const name of REQUIRED_LAYERS) {
		const slot = slots[name];
		checks.push({
			id: `present-${name}`,
			state: slot.kind === "ready" ? "passed" : "blocked",
			label: `${SLOT_LABELS[name]} is chosen`,
			detail:
				slot.kind === "ready"
					? slot.file.name
					: slot.kind === "error"
						? slot.message
						: slot.kind === "reading"
							? "Reading the file…"
							: "Required, and not chosen yet."
		});
	}

	for (const name of SLOT_ORDER) {
		const slot = slots[name];
		if (slot.kind === "empty" || slot.kind === "reading") continue;
		if (slot.kind === "error") {
			// A required layer's problem is already on its "is chosen" line.
			if (!REQUIRED_LAYERS.includes(name))
				checks.push({
					id: `read-${name}`,
					state: "blocked",
					label: `${SLOT_LABELS[name]} can be read`,
					detail: slot.message
				});
			continue;
		}

		const { analysis, collection } = slot;
		checks.push({
			id: `read-${name}`,
			state: analysis.featureCount > MAX_FEATURES_PER_LAYER ? "blocked" : "passed",
			label: `${SLOT_LABELS[name]} can be read`,
			detail:
				analysis.featureCount > MAX_FEATURES_PER_LAYER
					? `${featuresWord(analysis.featureCount)}. A package takes up to ${MAX_FEATURES_PER_LAYER.toLocaleString("en-US")} in a layer.`
					: featuresWord(analysis.featureCount)
		});

		const unexpected = unexpectedGeometry(name, analysis);
		const problems = unexpected.length > 0 || analysis.withoutGeometry > 0;
		checks.push({
			id: `geometry-${name}`,
			state: problems ? "blocked" : "passed",
			label: `${SLOT_LABELS[name]} holds ${SHAPE_WORD[name].many}`,
			detail: problems
				? [
						unexpected.length > 0 ? `Found ${unexpected.join(", ")} instead.` : "",
						analysis.withoutGeometry > 0 ? `${featuresWord(analysis.withoutGeometry)} with no shape.` : ""
					]
						.filter(Boolean)
						.join(" ")
				: `Every feature is ${SHAPE_WORD[name].one}.`
		});

		const other = declaredOtherCrs(collection);
		const projected = analysis.bbox !== null && looksProjected(analysis.bbox);
		if (analysis.bbox !== null || other !== null)
			checks.push({
				id: `coordinates-${name}`,
				state: projected || other !== null ? "blocked" : "passed",
				label: `${SLOT_LABELS[name]} uses longitude and latitude`,
				detail:
					other !== null
						? `The file says it uses ${other}. In QGIS, export with CRS EPSG:4326.`
						: projected
							? "The coordinates look like metres. In QGIS, export with CRS EPSG:4326."
							: "Longitude and latitude both fall in range."
			});
	}

	const zones = slots.zones;
	if (zones.kind === "ready") {
		const count = zones.collection.features.length;
		checks.push({
			id: "zones-count",
			state: count < 1 || count > MAX_ZONES ? "blocked" : "passed",
			label: `Zones holds 1 to ${MAX_ZONES} zones`,
			detail:
				count < 1
					? "The layer is empty. Observers choose a zone to collect in."
					: count > MAX_ZONES
						? `${count} zones. A site takes up to ${MAX_ZONES}.`
						: `${count} ${count === 1 ? "zone" : "zones"}.`
		});

		const { missing, numeric } = zoneIdProblems(zones.collection);
		const wrong = missing.length + numeric.length;
		checks.push({
			id: "zone-ids",
			state: wrong > 0 ? "blocked" : "passed",
			label: "Every zone has an id",
			detail:
				wrong === 0
					? count === 0
						? "There are no zones to check."
						: `All ${count} ${count === 1 ? "zone has" : "zones have"} an id.`
					: [
							missing.length > 0
								? `${missing.length === 1 ? "Zone" : "Zones"} ${listNumbers(missing)} ${missing.length === 1 ? "has" : "have"} no id.`
								: "",
							numeric.length > 0
								? `${numeric.length === 1 ? "Zone" : "Zones"} ${listNumbers(numeric)} ${numeric.length === 1 ? "has" : "have"} a number for an id; an id must be text, such as A or Z1.`
								: "",
							"Every observation records its zone's id. In QGIS, give each zone an id field, then export again."
						]
							.filter(Boolean)
							.join(" ")
		});

		const repeated = repeatedZoneIds(zones.collection);
		if (repeated.length > 0)
			checks.push({
				id: "zone-ids-distinct",
				state: "blocked",
				label: "Zone ids are different",
				detail: `More than one zone has the id ${repeated.map(id => `"${id}"`).join(", ")}. Give each zone its own id.`
			});

		// DECA Mark names each zone from its `name` field; a layer from the QGIS templates has `label` instead.
		const unnamed = zones.collection.features.filter(
			feature =>
				textProperty(feature.properties, "name") === null && textProperty(feature.properties, "label") === null
		).length;
		checks.push({
			id: "zone-labels",
			state: unnamed > 0 ? "blocked" : "passed",
			label: "Zones have a name",
			detail:
				unnamed > 0
					? `${unnamed} ${unnamed === 1 ? "zone has" : "zones have"} no name or label field. Observers choose zones by name: in QGIS, give each zone a name, then export again.`
					: "Observers see each zone's name."
		});
	}

	const ground = slots.ground;
	if (ground.kind === "ready") {
		const outlines = ground.collection.features.filter(
			feature => textProperty(feature.properties, "kind") === "site"
		).length;
		checks.push({
			id: "ground-outline",
			state: outlines === 1 ? "passed" : "blocked",
			label: "Ground has one site outline",
			detail:
				outlines === 1
					? "One feature has kind = site."
					: `${outlines === 0 ? "No feature has" : `${outlines} features have`} kind = site. Exactly one feature must outline the site.`
		});
	}

	if (ground.kind === "ready" && zones.kind === "ready") {
		const groundBox = ground.analysis.bbox;
		const zonesBox = zones.analysis.bbox;
		if (groundBox !== null && zonesBox !== null) {
			const inside = bboxContains(groundBox, zonesBox);
			checks.push({
				id: "zones-in-ground",
				state: inside ? "passed" : "warning",
				label: "Zones lie inside the ground",
				detail: inside
					? "The zones fall within the ground's extent."
					: "Part of the zones falls outside the ground's extent."
			});
		}
	}

	const chosen = LAYER_NAMES.flatMap(name => {
		const slot = slots[name];
		return slot.kind === "ready" || slot.kind === "error" ? [slot.file.size] : [];
	});
	const projectBytes = project.kind === "ready" ? project.file.size : 0;
	const total = chosen.reduce((sum, size) => sum + size, 0) + Math.ceil((projectBytes * 4) / 3);
	if (chosen.length > 0 || projectBytes > 0) {
		const projectTooBig = projectBytes > MAX_PROJECT_BYTES;
		const tooBig = total > MAX_UPLOAD_BYTES;
		checks.push({
			id: "size",
			state: projectTooBig || tooBig ? "blocked" : "passed",
			label: "The files fit in one upload",
			detail: projectTooBig
				? `The QGIS project is over ${MAX_PROJECT_BYTES / 1024 / 1024} MB. Leave it out or save a smaller one.`
				: tooBig
					? `The files add up to over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Simplify the layers and export again.`
					: "Within the 24 MB DECA Mark takes at once."
		});
	}

	return checks;
}

/** Whether the upload can go ahead: both required layers are read and no check blocks. */
export function canUpload(slots: Record<LayerName, LayerSlotState>, checks: readonly ClientCheck[]): boolean {
	return (
		REQUIRED_LAYERS.every(name => slots[name].kind === "ready") &&
		!readingLayers(slots) &&
		checks.every(check => check.state !== "blocked")
	);
}
