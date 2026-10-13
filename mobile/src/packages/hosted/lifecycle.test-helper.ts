import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createApiClient } from "../../data/api/client";
import { initializeDatabase } from "../../storage/observation-store";
import { adapter } from "../../storage/package-store.fixture";
import { boundFixture, boundManifest, ids } from "./bound-fixture";
import type { ImmutablePackageFiles } from "./installation";
import { PackageOperations, type PackageRuntime } from "./operations";

export const issuer = "https://auth.example.test/auth/v1";
export const owner = JSON.stringify(["https://api.example.test", issuer, ids.form, ids.project]);
export const otherOwner = JSON.stringify([
  "https://api.example.test",
  issuer,
  ids.zone,
  ids.project,
]);
export const nextId = "30000000-0000-4000-8000-000000000088";
export const hash = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function nextFixture() {
  const f = boundFixture({ ...boundManifest, package_id: nextId, package_version: 8 });
  return {
    ...f,
    site: {
      ...f.site,
      current_package_id: nextId,
      package: { ...f.site.package, package_id: nextId, package_version: 8 },
    },
  };
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Promise was not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function harness(overrides: Partial<PackageRuntime> = {}) {
  const root = mkdtempSync(join(tmpdir(), "mob28-lifecycle-"));
  const sqlite = new DatabaseSync(join(root, "catalog.db"));
  const database = adapter(sqlite);
  await initializeDatabase(database);
  const files: ImmutablePackageFiles = {
    read(path) {
      return existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
    },
    stage(path, text) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    publish(staged, destination) {
      mkdirSync(dirname(join(root, destination)), { recursive: true });
      renameSync(join(root, staged), join(root, destination));
    },
    discard(path) {
      rmSync(join(root, path), { force: true });
    },
    staged() {
      return existsSync(join(root, "staged"))
        ? readdirSync(join(root, "staged")).map((name) => `staged/${name}`)
        : [];
    },
  };
  let attempt = 0;
  const runtime: PackageRuntime = {
    database,
    files,
    owner,
    issuer,
    hash,
    api: createApiClient("https://api.example.test", async () => "synthetic-token"),
    source: () => boundFixture().source,
    current: () => true,
    authorizedProject: (project) => project === ids.project,
    attempt: () => `attempt-${++attempt}`,
    ...overrides,
  };
  return {
    root,
    sqlite,
    database,
    files,
    runtime,
    operations: new PackageOperations(runtime),
    close() {
      sqlite.close();
      rmSync(root, { recursive: true });
    },
  };
}
