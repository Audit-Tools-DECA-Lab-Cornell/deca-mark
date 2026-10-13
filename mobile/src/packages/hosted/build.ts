import type { StyleSpecification } from "@maplibre/maplibre-react-native";
import type { FeatureCollection } from "geojson";
import type { PackageIdentity } from "../../domain/package-binding";
import type { FormDefinition } from "../../forms/definition";
import { hexWithAlpha, type MapPalette, mapPalettes } from "../../maps/palette";
import type { SiteZone } from "../../maps/sample-site";
import type { LayerPaint, PackageLayer, SitePackage } from "../site-package";
import { boundFeatureSchema } from "./bound-manifest";
import { packageCamera } from "./package-camera";
import type { LayerData, StoredPackage } from "./schemas";

/**
 * A downloaded site as the field map draws it. The plan is built from the package's own layers in the
 * shared map palette (`contracts/map-palettes.json`), as the bundled sites are: the ground layer by
 * each feature's `kind` (the site outline, surfaces such as grass or mulch, equipment and structures),
 * then paths, trees and the zones over it. Hosted packages carry no imagery, so Aerial is not offered.
 */

/** Surface kinds the palette colours, drawn in this order so paths sit above the ground under them. */
const SURFACES = ["dirt", "path", "blacktop", "mulch", "grass"] as const;

function plan(name: string, palette: MapPalette, ground: LayerData): StyleSpecification {
  const fill = (id: string, kind: string, paint: { fill: string; edge: string }) => ({
    id,
    type: "fill" as const,
    source: "ground",
    filter: ["==", "kind", kind] as ["==", string, string],
    paint: { "fill-color": paint.fill, "fill-outline-color": paint.edge },
  });
  return {
    version: 8,
    name,
    sources: { ground: { type: "geojson", data: ground as FeatureCollection } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": palette.background } },
      fill("site", "site", palette.site),
      ...SURFACES.map((kind) => fill(`surface-${kind}`, kind, palette.surfaces[kind])),
      fill("equipment", "equipment", palette.equipment),
      fill("structures", "structure", palette.structure),
    ],
  };
}

/** Whether a layer's features are areas, lines or points, from the first one that has a geometry. */
function shape(layer: LayerData): "area" | "line" | "point" {
  const type = layer.features[0]?.geometry.type ?? "";
  if (type.endsWith("Polygon")) return "area";
  if (type.endsWith("LineString")) return "line";
  return "point";
}

function zonePaint(palette: MapPalette): LayerPaint {
  return {
    type: "fill",
    color: hexWithAlpha(palette.zone.fill, palette.zone.fillOpacity),
    outline: palette.zone.edge,
    dashed: true,
  };
}

function treePaint(palette: MapPalette, layer: LayerData): LayerPaint {
  if (shape(layer) === "area") {
    return {
      type: "fill",
      color: hexWithAlpha(palette.tree.fill, palette.tree.opacity),
      outline: palette.tree.edge,
      dashed: false,
    };
  }
  return { type: "circle", color: palette.tree.fill, radius: 9 };
}

function pathPaint(palette: MapPalette, layer: LayerData): LayerPaint {
  return shape(layer) === "area"
    ? { type: "fill", color: palette.path.line, outline: palette.path.line, dashed: false }
    : { type: "line", color: palette.path.line, width: 5 };
}

function overlays(stored: StoredPackage): PackageLayer[] {
  const { paths, trees, zones } = stored.layers;
  const layer = (
    id: string,
    name: string,
    data: LayerData,
    paint: (palette: MapPalette) => LayerPaint,
  ): PackageLayer => ({
    id,
    name,
    data: data as FeatureCollection,
    day: paint(mapPalettes.day),
    night: paint(mapPalettes.night),
    // No imagery: Aerial is never shown for a hosted site, so it repeats the Day paint.
    aerial: paint(mapPalettes.day),
  });
  return [
    ...(paths && paths.features.length > 0
      ? [layer("paths", "Paths", paths, (palette) => pathPaint(palette, paths))]
      : []),
    ...(trees && trees.features.length > 0
      ? [layer("trees", "Trees", trees, (palette) => treePaint(palette, trees))]
      : []),
    layer("zones", "Zone polygons", zones, zonePaint),
  ];
}

function siteZone(zone: StoredPackage["manifest"]["zones"][number], layer: LayerData): SiteZone {
  const feature = layer.features.find((entry) => entry.properties?.["zone_id"] === zone.zone_id);
  const { geometry } = boundFeatureSchema.parse(feature);
  const [polygon, ...moreParts] = geometry.coordinates;
  if (!polygon) throw new Error("The zone has no full boundary.");
  const [west, south, east, north] = zone.bbox;
  return {
    id: zone.zone_code,
    label: zone.label,
    centre: zone.display_anchor,
    zoneId: zone.zone_id,
    displayAnchor: zone.display_anchor,
    geometrySha256: zone.geometry_sha256,
    west,
    south,
    east,
    north,
    polygon,
    ...(moreParts.length ? { moreParts } : {}),
  };
}

function megabytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hostedSitePackage(
  stored: StoredPackage,
  forms: { readonly play: FormDefinition; readonly inventory: FormDefinition | null },
  identity?: PackageIdentity,
): SitePackage {
  const { manifest, layers } = stored;
  const camera = packageCamera(layers);
  const zones = manifest.zones.map((zone) => siteZone(zone, layers.zones));
  const count = `${zones.length} ${zones.length === 1 ? "zone" : "zones"}`;
  return {
    id: stored.packageId,
    ...(identity ? { packageIdentity: identity } : {}),
    name: stored.siteName,
    meta: `${count} · package v${stored.packageVersion}`,
    availability: "on-device",
    formVersion: forms.play.version,
    inventoryFormVersion: forms.inventory?.version ?? "",
    version: `v${stored.packageVersion}`,
    siteId: stored.siteId,
    sizeOnDevice: `${megabytes(stored.archiveBytes)} on device`,
    zones,
    inheritedContext: forms.inventory
      ? "Climate and the loose parts on hand come from this zone's latest Inventory round."
      : "A round inherits only its zone; this project has no inventory form.",
    centre: camera.centre,
    bounds: camera.bounds,
    bases: {
      day: plan(`${stored.siteName} plan (day)`, mapPalettes.day, layers.ground),
      night: plan(`${stored.siteName} plan (night)`, mapPalettes.night, layers.ground),
      aerial: plan(`${stored.siteName} plan (day)`, mapPalettes.day, layers.ground),
    },
    layers: overlays(stored),
    projectId: stored.projectId,
    forms,
    aerialAvailable: false,
  };
}
