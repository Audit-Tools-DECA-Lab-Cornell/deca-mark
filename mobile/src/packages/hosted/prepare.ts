import { type FormDefinition, parseFormDefinition } from "../../forms/definition";
import { PackageArchiveError, readArchive } from "./archive";
import { packageCamera } from "./package-camera";
import type { FormVersion, HostedSite, StoredPackage } from "./schemas";
import { historicalForm, verifyBoundIdentity, verifyBoundZones } from "./verify-bound";
export type PreparePart = 0 | 1 | 2 | 3;
export type PackageSource = {
  readonly archive: (packageId: string) => Promise<Uint8Array>;
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
  readonly formVersion: (code: string) => Promise<FormVersion>;
};
export class PrepareError extends Error {}
export async function preparePackage(
  projectId: string,
  site: HostedSite,
  source: PackageSource,
  onPart: (part: PreparePart) => void = () => {},
  now: () => Date = () => new Date(),
): Promise<StoredPackage> {
  const requested = site.package;
  if (!requested) throw new PrepareError(`${site.name} has no map package yet.`);
  if (requested.state !== "ready")
    throw new PrepareError("The package is not ready for collection.");
  onPart(0);
  const bytes = await source.archive(requested.package_id);
  if (
    bytes.byteLength !== requested.archive_bytes ||
    (await source.sha256(bytes)) !== requested.archive_sha256
  )
    throw new PrepareError(
      "The download did not match the package the server prepared. Try again.",
    );
  let contents: ReturnType<typeof readArchive>;
  try {
    contents = readArchive(bytes);
  } catch (error) {
    throw new PrepareError(
      error instanceof PackageArchiveError ? error.message : "The package could not be read.",
    );
  }
  onPart(1);
  verifyBoundIdentity(contents.manifest, site);
  packageCamera(contents.layers);
  await verifyBoundZones(contents.manifest, contents.layers, source.sha256);
  onPart(2);
  const playBinding = contents.manifest.forms.play;
  const play = await source.formVersion(playBinding.form_version);
  historicalForm(play, playBinding);
  const inventoryBinding = contents.manifest.forms.inventory;
  const inventory = inventoryBinding
    ? await source.formVersion(inventoryBinding.form_version)
    : null;
  if (inventory && inventoryBinding) historicalForm(inventory, inventoryBinding);
  onPart(3);
  return {
    projectId,
    siteId: site.site_id,
    siteCode: site.code,
    siteName: site.name,
    packageId: requested.package_id,
    packageVersion: requested.package_version,
    archiveBytes: bytes.byteLength,
    archiveSha256: requested.archive_sha256,
    savedAt: now().toISOString(),
    manifest: contents.manifest,
    layers: contents.layers,
    forms: { play: play.definition, inventory: inventory?.definition ?? null },
  };
}
export function storedForms(stored: StoredPackage): {
  readonly play: FormDefinition;
  readonly inventory: FormDefinition | null;
} {
  return {
    play: parseFormDefinition(stored.forms.play),
    inventory: stored.forms.inventory ? parseFormDefinition(stored.forms.inventory) : null,
  };
}
