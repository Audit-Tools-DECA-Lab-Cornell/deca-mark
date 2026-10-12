import type { LngLatBounds, StyleSpecification } from "@maplibre/maplibre-react-native";
import type { FeatureCollection } from "geojson";
import type { Coordinate } from "../domain/observation";
import type { PackageIdentity } from "../domain/package-binding";
import type { FormDefinition } from "../forms/definition";
import type { SiteZone } from "../maps/sample-site";

/**
 * A site as the field map and the session read it: geometry, zones and the form versions the site
 * collects. It comes either with the app (`bundled.ts`) or from a project's hosted package, downloaded
 * and kept on the device (`hosted/`); the field flow treats both alike.
 */

export type PackageAvailability = "on-device" | "not-downloaded" | "archived";

export type LayerPaint =
  | { readonly type: "line"; readonly color: string; readonly width: number }
  | {
      readonly type: "fill";
      readonly color: string;
      readonly outline: string;
      readonly dashed: boolean;
    }
  | { readonly type: "circle"; readonly color: string; readonly radius: number };

/** An overlay the observer can switch off, drawn above the base and below the observations. */
export type PackageLayer = {
  readonly id: string;
  readonly name: string;
  readonly data: FeatureCollection;
  readonly day: LayerPaint;
  readonly night: LayerPaint;
  readonly aerial: LayerPaint;
};

export type PackageSummary = {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly availability: PackageAvailability;
  readonly formVersion: string;
};

export type SitePackage = PackageSummary & {
  readonly packageIdentity?: PackageIdentity;
  readonly version: string;
  readonly siteId: string;
  readonly sizeOnDevice: string;
  readonly zones: readonly SiteZone[];
  /**
   * The form an Inventory round collects on this site, once per zone. Standard and Reliability rounds
   * collect {@link PackageSummary.formVersion}. Every project offers all three rounds.
   */
  readonly inventoryFormVersion: string;
  /** What a round inherits when the observer has not declared a fresh period. */
  readonly inheritedContext: string;
  readonly centre: Coordinate;
  readonly bounds: LngLatBounds;
  readonly bases: {
    readonly day: StyleSpecification;
    readonly night: StyleSpecification;
    readonly aerial: StyleSpecification;
  };
  readonly layers: readonly PackageLayer[];
  /**
   * The project a hosted site belongs to: its records upload there. Bundled sites have none; their
   * practice and instrument records remain local preview data.
   */
  readonly projectId?: string;
  /**
   * The forms a hosted site collects, as its project published them. Bundled sites name versions the
   * app carries instead ({@link PackageSummary.formVersion}, {@link SitePackage.inventoryFormVersion}).
   */
  readonly forms?: {
    readonly play: FormDefinition;
    readonly inventory: FormDefinition | null;
  };
  /** False when the package carries no imagery, so Aerial is not offered. Defaults to true. */
  readonly aerialAvailable?: boolean;
};

/**
 * Where packages come from. Only the bundled fixture provider exists today; a hosted provider
 * implements the same two calls without the field flow changing.
 */
export interface PackageProvider {
  list(): Promise<readonly PackageSummary[]>;
  open(id: string): Promise<SitePackage | undefined>;
}
