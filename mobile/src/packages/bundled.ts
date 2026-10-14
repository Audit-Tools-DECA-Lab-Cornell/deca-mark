import {
  fallCreekAerial,
  fallCreekBase,
  fallCreekBounds,
  fallCreekCentre,
  fallCreekEquipment,
  fallCreekTrees,
  fallCreekZone,
  fallCreekZoneGeometry,
} from "../maps/fall-creek";
import { hexWithAlpha, type MapPalette, mapPalettes } from "../maps/palette";
import {
  aerialStyle,
  sampleBounds,
  sampleCenter,
  sampleSiteBase,
  sitePaths,
  siteTrees,
  siteZones,
  zoneGeometry,
} from "../maps/sample-site";
import type {
  LayerPaint,
  PackageLayer,
  PackageProvider,
  PackageSummary,
  SitePackage,
} from "./site-package";

/**
 * The bundled fixture provider. Two packages are on the device because their geometry ships
 * with the app; the other two exist only as rows, so download states can be designed against
 * something honest. Nothing here contacts a network.
 *
 * Plan (day/night) layer paints are derived from `contracts/map-palettes.json` below; the aerial
 * values are kept exactly as they were — a fixture style, not imagery, with its own fixed colours.
 */

/** A dashed, semi-transparent zone fill: the palette's `zone.fill` at `zone.fillOpacity`. */
function zonePaint(palette: MapPalette): LayerPaint {
  return {
    type: "fill",
    color: hexWithAlpha(palette.zone.fill, palette.zone.fillOpacity),
    outline: palette.zone.edge,
    dashed: true,
  };
}

/** A solid tree marker for the hand-drawn sites, where trees are points, not canopy polygons. */
function treeCirclePaint(palette: MapPalette): LayerPaint {
  return { type: "circle", color: palette.tree.fill, radius: 11 };
}

const layers: readonly PackageLayer[] = [
  {
    id: "paths",
    name: "Paths",
    data: sitePaths,
    day: { type: "line", color: mapPalettes.day.path.line, width: 7 },
    night: { type: "line", color: mapPalettes.night.path.line, width: 7 },
    aerial: { type: "line", color: "#4a4437", width: 7 },
  },
  {
    id: "zones",
    name: "Zone polygons",
    data: zoneGeometry,
    day: zonePaint(mapPalettes.day),
    night: zonePaint(mapPalettes.night),
    aerial: { type: "fill", color: "#9184d914", outline: "#968ae0", dashed: true },
  },
  {
    id: "trees",
    name: "Trees",
    data: siteTrees,
    day: treeCirclePaint(mapPalettes.day),
    night: treeCirclePaint(mapPalettes.night),
    aerial: { type: "circle", color: "#313d2b", radius: 11 },
  },
];

const riverside: SitePackage = {
  id: "riverside-play-study",
  name: "Riverside Play Study",
  meta: "North Playground · 3 zones · package v4",
  availability: "on-device",
  formVersion: "janet-test-v1",
  version: "v4",
  siteId: "riverside-north-playground",
  sizeOnDevice: "18.4 MB on device",
  zones: siteZones,
  inventoryFormVersion: "janet-inventory-v1",
  inheritedContext:
    "Climate and the loose parts on hand come from this zone's latest Inventory round.",
  centre: sampleCenter,
  bounds: sampleBounds,
  bases: {
    day: sampleSiteBase(mapPalettes.day),
    night: sampleSiteBase(mapPalettes.night),
    aerial: aerialStyle,
  },
  layers,
};

const practice: SitePackage = {
  id: "sample-garden",
  name: "Sample garden practice",
  meta: "Bundled training map · practice form · uploads to the API",
  availability: "on-device",
  formVersion: "shell-v1",
  version: "v1",
  siteId: "sample-garden",
  sizeOnDevice: "Bundled with the app",
  zones: siteZones.filter((zone) => zone.id === "A"),
  inventoryFormVersion: "janet-inventory-v1",
  inheritedContext: "The practice form stores no round context; only its three fields are saved.",
  centre: sampleCenter,
  bounds: sampleBounds,
  bases: {
    day: sampleSiteBase(mapPalettes.day),
    night: sampleSiteBase(mapPalettes.night),
    aerial: aerialStyle,
  },
  layers,
};

/** Fall Creek's equipment is a filled footprint, not a point: the palette's `equipment` fill/edge. */
function equipmentPaint(palette: MapPalette): LayerPaint {
  return {
    type: "fill",
    color: palette.equipment.fill,
    outline: palette.equipment.edge,
    dashed: false,
  };
}

/** Fall Creek's trees are canopy polygons: `tree.fill` at `tree.opacity`, with a `tree.edge` outline. */
function treeCanopyPaint(palette: MapPalette): LayerPaint {
  return {
    type: "fill",
    color: hexWithAlpha(palette.tree.fill, palette.tree.opacity),
    outline: palette.tree.edge,
    dashed: false,
  };
}

const fallCreekLayers: readonly PackageLayer[] = [
  {
    id: "equipment",
    name: "Play equipment",
    data: fallCreekEquipment,
    day: equipmentPaint(mapPalettes.day),
    night: equipmentPaint(mapPalettes.night),
    aerial: { type: "fill", color: "#ffffff0a", outline: "#e4e7f5b3", dashed: false },
  },
  {
    id: "trees",
    name: "Trees",
    data: fallCreekTrees,
    day: treeCanopyPaint(mapPalettes.day),
    night: treeCanopyPaint(mapPalettes.night),
    aerial: { type: "fill", color: "#00000000", outline: "#c4dcb4b3", dashed: false },
  },
  {
    id: "zones",
    name: "Zone polygons",
    data: fallCreekZoneGeometry,
    day: zonePaint(mapPalettes.day),
    night: zonePaint(mapPalettes.night),
    aerial: { type: "fill", color: "#9184d914", outline: "#968ae0", dashed: true },
  },
];

/**
 * The real playground from QGIS. It collects the practice form under the practice site id, the
 * only pair the API accepts today, so its records upload and appear in QGIS.
 */
const fallCreek: SitePackage = {
  id: "fall-creek-playground",
  name: "Fall Creek Elementary playground",
  meta: "Drone survey · QGIS drawings · practice form · uploads to the API",
  availability: "on-device",
  formVersion: "shell-v1",
  version: "v1",
  siteId: "sample-garden",
  sizeOnDevice: "Bundled with the app",
  zones: [fallCreekZone],
  inventoryFormVersion: "janet-inventory-v1",
  inheritedContext:
    "Records upload as practice records (sample-garden) until the API accepts this site.",
  centre: fallCreekCentre,
  bounds: fallCreekBounds,
  bases: {
    day: fallCreekBase(mapPalettes.day),
    night: fallCreekBase(mapPalettes.night),
    aerial: fallCreekAerial,
  },
  layers: fallCreekLayers,
};

const undownloaded: readonly PackageSummary[] = [
  {
    id: "cedar-park-baseline",
    name: "Cedar Park Baseline",
    meta: "2 zones · 42 MB · wi-fi needed",
    availability: "not-downloaded",
    formVersion: "janet-test-v1",
  },
  {
    id: "harbour-green-pilot",
    name: "Harbour Green Pilot",
    meta: "Closed 4 Sept · read only",
    availability: "archived",
    formVersion: "janet-test-v1",
  },
];

const packages: readonly SitePackage[] = [fallCreek, riverside, practice];

/** A package that ships inside the app, read without waiting: it is already on the device. */
export function bundledPackage(id: string): SitePackage | undefined {
  return packages.find((entry) => entry.id === id);
}

export const bundledPackages: PackageProvider = {
  async list() {
    return [...packages.map(summary), ...undownloaded];
  },
  async open(id) {
    return packages.find((entry) => entry.id === id);
  },
};

function summary(entry: SitePackage): PackageSummary {
  return {
    id: entry.id,
    name: entry.name,
    meta: entry.meta,
    availability: entry.availability,
    formVersion: entry.formVersion,
  };
}

export function availabilityChip(availability: PackageSummary["availability"]) {
  switch (availability) {
    case "on-device":
      return { label: "On device", tone: "accent" } as const;
    case "not-downloaded":
      return { label: "Not downloaded", tone: "muted" } as const;
    case "archived":
      return { label: "Archived", tone: "muted" } as const;
  }
}
