import { strToU8 } from "fflate";
import type { FormDefinition } from "../../forms/definition";
import { parseServedDefinition } from "../../forms/definition";
import { type BoundManifest, boundFeatureSchema } from "./bound-manifest";
import type { FormVersion, HostedSite, PackageLayers } from "./schemas";

export class BoundPackageError extends Error {}

export async function verifyBoundZones(
  manifest: BoundManifest,
  layers: PackageLayers,
  sha256: (bytes: Uint8Array) => Promise<string>,
): Promise<void> {
  if (layers.zones.features.length !== manifest.zones.length)
    throw new BoundPackageError("Zone counts do not match.");
  const identities = new Set<string>();
  const codes = new Set<string>();
  let positions = 0;
  for (const zone of manifest.zones) {
    if (identities.has(zone.zone_id) || codes.has(zone.zone_code))
      throw new BoundPackageError("Duplicate zone identity.");
    identities.add(zone.zone_id);
    codes.add(zone.zone_code);
    const matches = layers.zones.features.filter(
      (entry) => entry.properties?.["zone_id"] === zone.zone_id,
    );
    const parsed = boundFeatureSchema.safeParse(matches.length === 1 ? matches[0] : null);
    if (!parsed.success)
      throw new BoundPackageError(`Zone ${zone.zone_code} has no valid full boundary.`);
    const { geometry, properties } = parsed.data;
    if (
      properties.zone_code !== zone.zone_code ||
      properties.name !== zone.label ||
      properties.geometry_sha256 !== zone.geometry_sha256 ||
      properties.display_anchor[0] !== zone.display_anchor[0] ||
      properties.display_anchor[1] !== zone.display_anchor[1]
    )
      throw new BoundPackageError("Zone manifest and layer differ.");
    const zonePositions = geometry.coordinates.reduce(
      (total, polygon) => total + polygon.reduce((count, ring) => count + ring.length, 0),
      0,
    );
    positions += zonePositions;
    if (zonePositions > 2000 || positions > 20000)
      throw new BoundPackageError("Zone geometry exceeds supported complexity.");
    const allPositions = geometry.coordinates.flat(2);
    const bounds = [
      Math.min(...allPositions.map(([x]) => x)),
      Math.min(...allPositions.map(([, y]) => y)),
      Math.max(...allPositions.map(([x]) => x)),
      Math.max(...allPositions.map(([, y]) => y)),
    ];
    if (bounds.some((value, index) => value !== zone.bbox[index]))
      throw new BoundPackageError("Zone bounding box differs from its full geometry.");
    // Geometry contains only numbers/arrays and these two ASCII keys: this is its JCS byte order.
    const canonical = JSON.stringify({ coordinates: geometry.coordinates, type: geometry.type });
    if ((await sha256(strToU8(canonical))) !== zone.geometry_sha256)
      throw new BoundPackageError("Zone geometry checksum differs.");
  }
}
type RequestedPackage = Pick<HostedSite, "site_id" | "code"> & {
  readonly package: Pick<
    NonNullable<HostedSite["package"]>,
    "package_id" | "package_version" | "forms" | "zone_count"
  > | null;
};
export function verifyBoundIdentity(manifest: BoundManifest, site: RequestedPackage): void {
  const requested = site.package;
  if (
    !requested ||
    manifest.site_id !== site.site_id ||
    manifest.site_code !== site.code ||
    manifest.package_id !== requested.package_id ||
    manifest.package_version !== requested.package_version ||
    manifest.zones.length !== requested.zone_count ||
    manifest.forms.play.form_version !== requested.forms.play.form_version ||
    manifest.forms.play.form_version_id !== requested.forms.play.form_version_id ||
    manifest.forms.inventory?.form_version !== requested.forms.inventory?.form_version ||
    manifest.forms.inventory?.form_version_id !== requested.forms.inventory?.form_version_id
  )
    throw new BoundPackageError("The package identity does not match its requested version.");
}
export function historicalForm(
  version: FormVersion,
  expected: BoundManifest["forms"]["play"],
): FormDefinition {
  if (
    version.code !== expected.form_version ||
    version.version_id !== expected.form_version_id ||
    version.state === "draft"
  )
    throw new BoundPackageError("The exact bound form identity could not be verified.");
  const form = parseServedDefinition(version.schema_version, version.definition);
  if (form.version !== expected.form_version || form.status !== "published")
    throw new BoundPackageError("The bound form definition is not a published snapshot.");
  return form;
}
