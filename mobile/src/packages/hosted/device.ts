import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";
import type { ApiClient } from "../../data/api/client";
import { hex } from "./archive";
import type { ImmutablePackageFiles } from "./installation";
import type { PackageSource } from "./prepare";
import { type HostedSite, sitesSchema } from "./schemas";

export { hasStoredPackage, readStoredPackage } from "./access";

const ROOT = "hosted";
function directory(...names: string[]): Directory {
  const dir = new Directory(Paths.document, ROOT, ...names);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}
function contentFile(path: string): File {
  const segments = path.split("/");
  if (segments.some((part) => part === ".." || part === "." || part === ""))
    throw new TypeError("Invalid package content path");
  const name = segments.pop();
  if (!name) throw new TypeError("Missing package content name");
  return new File(directory("verified", ...segments), name);
}
export const devicePackageFiles: ImmutablePackageFiles = {
  read(path) {
    const file = contentFile(path);
    return file.exists ? file.textSync() : null;
  },
  stage(path, text) {
    contentFile(path).write(text);
  },
  publish(staged, destination) {
    contentFile(staged).moveSync(contentFile(destination), { overwrite: false });
  },
  discard(path) {
    const file = contentFile(path);
    if (file.exists) file.delete();
  },
  staged() {
    return directory("verified", "staged")
      .list()
      .filter((entry) => entry instanceof File)
      .map((entry) => `staged/${entry.name}`);
  },
};
export const deviceSha256 = async (bytes: Uint8Array) =>
  hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
function sitesFile(issuer: string, userId: string, projectId: string): File {
  return new File(
    directory("accounts", encodeURIComponent(issuer), userId),
    `sites-${projectId}.json`,
  );
}
function readJson<T>(file: File, schema: z.ZodType<T>): T | null {
  try {
    if (!file.exists) return null;
    const parsed = schema.safeParse(JSON.parse(file.textSync()));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}
export function readSiteList(
  issuer: string,
  userId: string,
  projectId: string,
): HostedSite[] | null {
  return readJson(sitesFile(issuer, userId, projectId), siteCacheSchema)?.sites ?? null;
}
const siteCacheSchema = z.strictObject({ sites: sitesSchema, checkedAt: z.iso.datetime() });
export function readSiteCheckedAt(
  issuer: string,
  userId: string,
  projectId: string,
): string | null {
  return readJson(sitesFile(issuer, userId, projectId), siteCacheSchema)?.checkedAt ?? null;
}
export function writeSiteList(
  issuer: string,
  userId: string,
  projectId: string,
  sites: readonly HostedSite[],
  checkedAt = new Date().toISOString(),
): void {
  const target = sitesFile(issuer, userId, projectId);
  const staged = new File(
    directory("accounts", encodeURIComponent(issuer), userId),
    `sites-${projectId}-${randomUUID()}.tmp`,
  );
  try {
    staged.write(JSON.stringify({ sites, checkedAt }));
    staged.moveSync(target, { overwrite: true });
  } finally {
    if (staged.exists) staged.delete();
  }
}

/**
 * The API, as the preparation pipeline reads it: the archive arrives as a file, then is read once.
 * Cancelling aborts the native transfer, and each attempt writes its own file, so a retry made at once
 * never shares a file with the attempt it replaces.
 */
export function apiPackageSource(
  api: ApiClient,
  projectId: string,
  signal: AbortSignal,
): PackageSource {
  return {
    archive: async (packageId) => {
      const request = await api.archiveRequest(projectId, packageId);
      const target = new File(Paths.cache, `package-${packageId}-${randomUUID()}.zip`);
      try {
        const file = await File.downloadFileAsync(request.url, target, {
          headers: request.headers,
          idempotent: true,
          signal,
        });
        return await file.bytes();
      } finally {
        if (target.exists) target.delete();
      }
    },
    // A copy typed as the digest wants it: an ArrayBuffer-backed view.
    sha256: async (bytes) => hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
    formVersion: (code) => api.formVersion(projectId, code, signal),
  };
}

/** Pre-launch schema resets discard all incompatible package/cache files before mounting collectors. */
export function resetHostedPackages(): void {
  const root = new Directory(Paths.document, ROOT);
  if (root.exists) root.delete();
}
