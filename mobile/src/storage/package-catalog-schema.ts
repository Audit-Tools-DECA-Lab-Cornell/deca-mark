import { z } from "zod";
import { packageIdentitySchema } from "../domain/package-binding";

export const catalogEntrySchema = z.strictObject({
  identity: packageIdentitySchema,
  contentPath: z.string().min(1),
  metadata: z.record(z.string(), z.json()),
});
export type CatalogEntry = Readonly<z.infer<typeof catalogEntrySchema>>;

const errorMessages = {
  not_authorized: "This package is not installed for this account.",
  immutable_conflict: "An installed immutable package has different content.",
  invalid_owner: "This package is not installed for this account.",
  cancelled: "The package installation was cancelled.",
} as const;

export class PackageStoreError extends Error {
  constructor(readonly code: keyof typeof errorMessages) {
    super(errorMessages[code]);
    this.name = "PackageStoreError";
  }
}

const ownerSchema = z.tuple([z.url(), z.url(), z.uuid(), z.uuid()]);

export function requirePackageOwner(owner: string, issuer: string): void {
  let value: unknown;
  try {
    value = JSON.parse(owner);
  } catch (error) {
    if (error instanceof SyntaxError) throw new PackageStoreError("invalid_owner");
    throw error;
  }
  const result = ownerSchema.safeParse(value);
  if (!result.success || result.data[1] !== issuer) throw new PackageStoreError("invalid_owner");
}
