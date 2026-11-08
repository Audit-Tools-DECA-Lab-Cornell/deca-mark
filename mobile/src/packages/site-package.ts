import type { LngLatBounds, StyleSpecification } from "@maplibre/maplibre-react-native";
import type { FeatureCollection } from "geojson";
import type { Coordinate } from "../domain/observation";
import type { PackageIdentity } from "../domain/package-binding";
import type { FormDefinition } from "../forms/definition";
import type { SiteZone } from "../maps/sample-site";

/**
 * A site as the field map and the session read it: geometry, zones and the forms the site collects.
 * It comes from a project's hosted package, downloaded, verified and kept on the device (`hosted/`).
 * Training's Practice garden is one of these like any other.
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
  /** The verified package this site was installed from; every record is bound to it. */
  readonly packageIdentity: PackageIdentity;
  readonly version: string;
  readonly siteId: string;
  readonly sizeOnDevice: string;
  readonly zones: readonly SiteZone[];
  /**
   * The form an Inventory round collects on this site, once per zone; empty when the project has none.
   * Standard and Reliability rounds collect {@link PackageSummary.formVersion}.
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
  /** The project the site belongs to: its records upload there. */
  readonly projectId: string;
  /** The forms the site collects, as its project published them and the package carried them. */
  readonly forms: {
    readonly play: FormDefinition;
    readonly inventory: FormDefinition | null;
  };
  /** False when the package carries no imagery, so Aerial is not offered. Defaults to true. */
  readonly aerialAvailable?: boolean;
};
