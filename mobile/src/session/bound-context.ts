import type { RoundContext } from "../domain/observation";
import { type PackageBinding, packageBindingSchema } from "../domain/package-binding";
import type { SiteZone } from "../maps/sample-site";
import type { SitePackage } from "../packages/site-package";

export class SessionBindingError extends Error {
  readonly name = "SessionBindingError";
}

/** Practice stays local; managed collection freezes only verified package/zone identities. */
export function sessionBinding(site: SitePackage, zone: SiteZone): PackageBinding | undefined {
  if (!site.projectId) return undefined;
  if (!site.packageIdentity || !zone.polygon || !zone.displayAnchor || !zone.geometrySha256)
    throw new SessionBindingError(
      "This map has no verified package, zone boundary or display anchor.",
    );
  const parsed = packageBindingSchema.safeParse({
    ...site.packageIdentity,
    zoneId: zone.zoneId,
    zoneCode: zone.id,
    zoneLabel: zone.label,
  });
  if (
    !parsed.success ||
    site.id !== parsed.data.packageId ||
    site.siteId !== parsed.data.siteId ||
    site.projectId !== parsed.data.projectId ||
    site.version !== `v${parsed.data.packageVersion}`
  )
    throw new SessionBindingError("The session does not match its verified map identity.");
  return parsed.data;
}

export function contextForZone(context: RoundContext, zone: SiteZone): RoundContext {
  return { ...context, zoneId: zone.id, zoneLabel: zone.label };
}
