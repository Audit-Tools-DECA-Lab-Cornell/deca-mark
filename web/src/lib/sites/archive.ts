import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";

import { parseSite, type ProjectedSite, projectSite, type SiteCollection, type SiteFeature } from "../plan";
import { readZoneGeometry, ZONE_LIMITS } from "../zones/geometry";

/**
 * Reading a map package the API prepared, in the contract's one archive format
 * (`docs/plan/zone-boundaries/contract.md`, Archive): a zip holding `manifest.json` (`format: 1`) and
 * `layers/{ground,paths,trees,zones}.json`, turned into the site collection `lib/plan.ts` draws.
 *
 * - Ground: polygons, drawn by `properties.kind` when the plan knows it (site, a surface, equipment,
 *   structure, tree) and as grass otherwise. The original kind is kept as `source_kind`, as is an
 *   equipment drawing's own `type` ("swings").
 * - Paths: lines, or areas when the layer draws paths as polygons. Trees: points become crowns (circles),
 *   polygons stay polygons.
 * - Zones: one per manifest zone, in manifest order, each one feature however many parts and holes it has,
 *   keyed by its `zone_id`. Zone shapes are read strictly: the manifest and the zones layer must agree on
 *   every identity, code, label, anchor and digest, and a shape is taken exactly as written or the package
 *   is refused. Nothing is closed, dropped, rounded or drawn as a box in its place.
 * - Ground MultiPolygons are split into their parts. Other features get the id `<layer>-<n>` (`-<part>` for
 *   later parts).
 */

export class PackageArchiveError extends Error {
	readonly name = "PackageArchiveError";
}

const finite = z.number().finite();
const lngLat = z.tuple([finite, finite]);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);

const manifestZoneSchema = z.object({
	zone_id: uuid,
	zone_code: z.string().min(1),
	label: z.string().min(1),
	bbox: z.tuple([finite, finite, finite, finite]),
	display_anchor: lngLat,
	geometry_sha256: digest
});

const formReference = z.object({ form_version_id: uuid, form_version: z.string().min(1) });

const manifestSchema = z.object({
	format: z.literal(1),
	site_id: uuid,
	site_code: z.string().min(1),
	package_id: uuid,
	package_version: z.number().int().min(1),
	forms: z.object({ play: formReference, inventory: formReference.nullable() }),
	zones: z.array(manifestZoneSchema).min(1).max(ZONE_LIMITS.zones)
});

const featureCollectionSchema = z.object({
	type: z.literal("FeatureCollection"),
	features: z.array(
		z.object({
			type: z.literal("Feature"),
			geometry: z.object({ type: z.string().min(1), coordinates: z.unknown() }).nullable(),
			properties: z.record(z.string(), z.unknown()).nullish()
		})
	)
});

const layersSchema = z.object({
	ground: featureCollectionSchema,
	zones: featureCollectionSchema,
	paths: featureCollectionSchema.optional(),
	trees: featureCollectionSchema.optional()
});

export type PackageManifest = z.infer<typeof manifestSchema>;
export type ManifestZone = z.infer<typeof manifestZoneSchema>;
export type LayerData = z.infer<typeof featureCollectionSchema>;
export type PackageLayers = z.infer<typeof layersSchema>;

const LAYER_NAMES = ["ground", "paths", "trees", "zones"] as const;

function json(entries: Record<string, Uint8Array>, name: string): unknown {
	const entry = entries[name];
	if (!entry) return undefined;
	try {
		return JSON.parse(strFromU8(entry));
	} catch {
		throw new PackageArchiveError(`${name} in the map package could not be read.`);
	}
}

/** The manifest and layers of a package archive. Throws `PackageArchiveError` with a plain reason. */
export function readPackageArchive(bytes: Uint8Array): { manifest: PackageManifest; layers: PackageLayers } {
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(bytes);
	} catch {
		throw new PackageArchiveError("The map package is not a readable archive.");
	}
	const manifest = manifestSchema.safeParse(json(entries, "manifest.json"));
	if (!manifest.success) throw new PackageArchiveError("The map package has no readable manifest.");
	const layers = layersSchema.safeParse(
		Object.fromEntries(
			LAYER_NAMES.flatMap(name => {
				const value = json(entries, `layers/${name}.json`);
				return value === undefined ? [] : [[name, value]];
			})
		)
	);
	if (!layers.success) throw new PackageArchiveError("The map package is missing its ground or zones layer.");
	return { manifest: manifest.data, layers: layers.data };
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];

function position(value: unknown): Position | null {
	if (!Array.isArray(value) || value.length < 2) return null;
	const [x, y] = value;
	return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** A closed ring of at least four positions (a triangle and its closing point), or null. */
function ring(value: unknown): Ring | null {
	if (!Array.isArray(value)) return null;
	const points = value.map(position).filter((point): point is Position => point !== null);
	if (points.length < 3) return null;
	const [first] = points;
	const last = points[points.length - 1]!;
	const closed = first![0] === last[0] && first![1] === last[1] ? points : [...points, first!];
	return closed.length >= 4 ? closed : null;
}

/** One polygon: its outer ring, then the holes that are rings. Null without an outer ring. */
function polygon(value: unknown): Polygon | null {
	if (!Array.isArray(value)) return null;
	const [outer, ...holes] = value;
	const shell = ring(outer);
	if (!shell) return null;
	return [shell, ...holes.map(ring).filter((hole): hole is Ring => hole !== null)];
}

/** A layer as a package or a QGIS export holds it: features with a geometry and properties. */
export type LayerInput = {
	readonly features: readonly {
		readonly geometry: { readonly type: string; readonly coordinates?: unknown } | null;
		readonly properties?: Readonly<Record<string, unknown>> | null;
	}[];
};

type Geometry = LayerInput["features"][number]["geometry"];

/** A geometry's polygons: a Polygon's own, or each part of a MultiPolygon. */
function polygonParts(geometry: Geometry): Polygon[] {
	if (!geometry) return [];
	if (geometry.type === "Polygon") {
		const found = polygon(geometry.coordinates);
		return found ? [found] : [];
	}
	if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates))
		return geometry.coordinates.map(polygon).filter((part): part is Polygon => part !== null);
	return [];
}

function lineParts(geometry: Geometry): Position[][] {
	if (!geometry) return [];
	const line = (value: unknown) =>
		Array.isArray(value) ? value.map(position).filter((point): point is Position => point !== null) : [];
	const lines =
		geometry.type === "LineString"
			? [line(geometry.coordinates)]
			: geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)
				? geometry.coordinates.map(line)
				: [];
	return lines.filter(points => points.length >= 2);
}

function pointParts(geometry: Geometry): Position[] {
	if (!geometry) return [];
	if (geometry.type === "Point") {
		const point = position(geometry.coordinates);
		return point ? [point] : [];
	}
	if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates))
		return geometry.coordinates.map(position).filter((point): point is Position => point !== null);
	return [];
}

/* ── The site collection ──────────────────────────────────────────────────── */

type Kind = SiteFeature["properties"]["kind"];

/** The kinds a ground feature may be drawn as. */
const GROUND_KINDS = new Set<Kind>([
	"site",
	"grass",
	"mulch",
	"dirt",
	"blacktop",
	"path",
	"structure",
	"equipment",
	"tree"
]);

const positiveNumber = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const nonEmpty = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

function groundKind(properties: Readonly<Record<string, unknown>>): { kind: Kind; sourceKind?: string } {
	const original = nonEmpty(properties.kind);
	const lower = original?.toLowerCase() as Kind | undefined;
	if (lower && GROUND_KINDS.has(lower)) {
		const own =
			nonEmpty(properties.source_kind) ??
			(lower === "equipment" || lower === "structure" ? nonEmpty(properties.type) : undefined);
		return own ? { kind: lower, sourceKind: own } : { kind: lower };
	}
	return original ? { kind: "grass", sourceKind: original } : { kind: "grass" };
}

function partId(base: string, part: number): string {
	return part === 0 ? base : `${base}-${part + 1}`;
}

function polygonFeature(properties: SiteFeature["properties"], coordinates: Polygon): SiteFeature {
	return { type: "Feature", properties, geometry: { type: "Polygon", coordinates } };
}

/** The layers a collection is drawn from; any may be missing while a manager is still choosing files. */
export type CollectionLayers = {
	readonly ground?: LayerInput;
	readonly paths?: LayerInput;
	readonly trees?: LayerInput;
	readonly zones?: LayerInput;
};

/** Ground, paths and trees: everything the plan draws under the zones. */
function backgroundFeatures(layers: CollectionLayers): SiteFeature[] {
	const features: SiteFeature[] = [];

	layers.ground?.features.forEach((feature, index) => {
		const properties = feature.properties ?? {};
		const { kind, sourceKind } = groundKind(properties);
		const label = nonEmpty(properties.name);
		polygonParts(feature.geometry).forEach((part, n) =>
			features.push(
				polygonFeature(
					{
						kind,
						id: partId(`ground-${index + 1}`, n),
						...(label ? { name: label } : {}),
						...(sourceKind ? { source_kind: sourceKind } : {})
					},
					part
				)
			)
		);
	});

	layers.paths?.features.forEach((feature, index) => {
		const properties = feature.properties ?? {};
		const width = positiveNumber(properties.width_m);
		lineParts(feature.geometry).forEach((points, n) =>
			features.push({
				type: "Feature",
				properties: { kind: "path", id: partId(`paths-${index + 1}`, n), ...(width ? { width_m: width } : {}) },
				geometry: { type: "LineString", coordinates: points }
			})
		);
		polygonParts(feature.geometry).forEach((part, n) =>
			features.push(polygonFeature({ kind: "path", id: partId(`paths-${index + 1}`, n) }, part))
		);
	});

	layers.trees?.features.forEach((feature, index) => {
		const properties = feature.properties ?? {};
		const radius = positiveNumber(properties.radius_m);
		pointParts(feature.geometry).forEach((point, n) =>
			features.push({
				type: "Feature",
				properties: {
					kind: "tree",
					id: partId(`trees-${index + 1}`, n),
					...(radius ? { radius_m: radius } : {})
				},
				geometry: { type: "Point", coordinates: point }
			})
		);
		polygonParts(feature.geometry).forEach((part, n) =>
			features.push(polygonFeature({ kind: "tree", id: partId(`trees-${index + 1}`, n) }, part))
		);
	});

	return features;
}

const sameNumber = (a: unknown, b: number) => typeof a === "number" && Object.is(a, b);

/**
 * A package's zones, strictly: one feature per manifest zone, in manifest order, with the manifest and the
 * zones layer agreeing on identity, code, label, anchor and digest, and each shape the canonical
 * MultiPolygon exactly as written. Anything else refuses the package rather than drawing a guess.
 */
function packageZones(manifest: PackageManifest, layer: LayerData): SiteFeature[] {
	const mismatch = () => new PackageArchiveError("The map package's zones do not match its manifest.");
	if (layer.features.length !== manifest.zones.length) throw mismatch();
	const byId = new Map<string, LayerData["features"][number]>();
	for (const feature of layer.features) {
		const id = feature.properties?.zone_id;
		if (typeof id !== "string" || byId.has(id)) throw mismatch();
		byId.set(id, feature);
	}
	return manifest.zones.map(zone => {
		const feature = byId.get(zone.zone_id);
		const properties = feature?.properties;
		const anchor = properties?.display_anchor;
		if (
			!feature ||
			properties?.zone_code !== zone.zone_code ||
			properties.name !== zone.label ||
			properties.geometry_sha256 !== zone.geometry_sha256 ||
			!Array.isArray(anchor) ||
			anchor.length !== 2 ||
			!sameNumber(anchor[0], zone.display_anchor[0]) ||
			!sameNumber(anchor[1], zone.display_anchor[1])
		)
			throw mismatch();
		const read = readZoneGeometry(feature.geometry);
		if (!read.ok || read.geometry.type !== "MultiPolygon")
			throw new PackageArchiveError(`The shape of zone ${zone.zone_code} in the map package cannot be read.`);
		return {
			type: "Feature",
			properties: {
				kind: "zone",
				id: zone.zone_id,
				zone_id: zone.zone_id,
				code: zone.zone_code,
				name: zone.label,
				display_anchor: zone.display_anchor,
				geometry_sha256: zone.geometry_sha256
			},
			geometry: read.geometry
		} as SiteFeature;
	});
}

/**
 * The collection `parseSite` and `projectSite` accept, from a package's manifest and layers. Ground first,
 * then paths, trees and zones, the order the plan draws them in. Throws `PackageArchiveError` when the zones
 * do not agree with the manifest.
 */
export function packageSiteCollection(name: string, manifest: PackageManifest, layers: PackageLayers): SiteCollection {
	return parseSite({
		type: "FeatureCollection",
		name,
		features: [...backgroundFeatures(layers), ...packageZones(manifest, layers.zones)]
	});
}

/** A package archive straight to its projected plan. Throws `PackageArchiveError` when it cannot be read. */
export function packagePlan(name: string, bytes: Uint8Array): ProjectedSite {
	const { manifest, layers } = readPackageArchive(bytes);
	return projectSite(packageSiteCollection(name, manifest, layers));
}

/**
 * The zones of a zones layer chosen for upload, before anything is sent: each feature with an `id`, named by
 * its `label` (else the id), its shape taken exactly as written. A feature without an id, or whose shape is
 * not a readable area, is not drawn; the upload checks name it. Nothing is repaired or drawn as a box.
 */
function sourceZones(layer: LayerInput | undefined): SiteFeature[] {
	return (layer?.features ?? []).flatMap(feature => {
		const id = nonEmpty(feature.properties?.id);
		const read = readZoneGeometry(feature.geometry);
		if (!id || !read.ok) return [];
		return [
			{
				type: "Feature",
				properties: { kind: "zone", id, code: id, name: nonEmpty(feature.properties?.label) ?? id },
				geometry: read.geometry
			} as SiteFeature
		];
	});
}

/**
 * The plan a package prepared from these layers would draw, before anything is sent: the upload step's
 * preview. Null when there is nothing to draw yet.
 */
export function layersPlan(name: string, layers: CollectionLayers): ProjectedSite | null {
	const features = [...backgroundFeatures(layers), ...sourceZones(layers.zones)];
	if (features.length === 0) return null;
	return projectSite(parseSite({ type: "FeatureCollection", name, features }));
}
