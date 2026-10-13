import { z } from "zod";

export const packageIdentitySchema = z.strictObject({
  issuer: z.url(),
  projectId: z.uuid(),
  siteId: z.uuid(),
  packageId: z.uuid(),
  packageVersion: z.number().int().positive(),
  packageSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type PackageIdentity = Readonly<z.infer<typeof packageIdentitySchema>>;

/** A record freezes the exact package and zone used during collection. */
export const packageBindingSchema = packageIdentitySchema.extend({
  zoneId: z.uuid(),
  zoneCode: z.string().min(1),
  zoneLabel: z.string().min(1),
});
export type PackageBinding = Readonly<z.infer<typeof packageBindingSchema>>;

/** Content identity is independent of authorization and the currently selected site version. */
export function identityKey(identity: PackageIdentity): string {
  return JSON.stringify([
    identity.issuer,
    identity.projectId,
    identity.packageId,
    identity.packageSha256,
  ]);
}

export function bindingMatchesContext(
  binding: PackageBinding,
  context: {
    readonly packageId: string;
    readonly packageVersion: string;
    readonly zoneId: string;
    readonly zoneLabel: string;
  },
): boolean {
  return (
    context.packageId === binding.packageId &&
    context.packageVersion === `v${binding.packageVersion}` &&
    context.zoneId === binding.zoneCode &&
    context.zoneLabel === binding.zoneLabel
  );
}
