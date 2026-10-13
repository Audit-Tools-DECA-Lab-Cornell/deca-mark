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
import { describe, expect, it } from "vitest";
import { initializeDatabase, type LocalDatabase } from "../../storage/observation-store";
import { readSelected } from "../../storage/package-catalog";
import { boundFixture, ids } from "./bound-fixture";
import {
  type ImmutablePackageFiles,
  installVerifiedPackage,
  packageIdentity,
  readInstalledPackage,
  reconcileStaging,
} from "./installation";
import { preparePackage } from "./prepare";

const issuer = "https://auth.example.test/auth/v1";
const owner = JSON.stringify(["https://api.example.test", issuer, ids.form, ids.project]);
const other = JSON.stringify(["https://api.example.test", issuer, ids.zone, ids.project]);
const hash = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function adapter(database: DatabaseSync): LocalDatabase {
  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async runAsync(sql, ...parameters) {
      return database.prepare(sql).run(...parameters);
    },
    async getAllAsync(sql, ...parameters) {
      return database.prepare(sql).all(...parameters);
    },
  };
}
function files(root: string): ImmutablePackageFiles {
  return {
    read(path) {
      return existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null;
    },
    stage(path, text) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    publish(staged, target) {
      mkdirSync(dirname(join(root, target)), { recursive: true });
      renameSync(join(root, staged), join(root, target));
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
}
async function fixture() {
  const f = boundFixture();
  return preparePackage(ids.project, f.site, f.source);
}

describe("SQLite and immutable filesystem installation", () => {
  it("reopens a verified installation after database and file restart without granting another account access", async () => {
    const root = mkdtempSync(join(tmpdir(), "mob28-install-"));
    let db = new DatabaseSync(join(root, "catalog.db"));
    try {
      await initializeDatabase(adapter(db));
      const stored = await fixture();
      await installVerifiedPackage(
        adapter(db),
        owner,
        issuer,
        stored,
        files(root),
        hash,
        "attempt",
        () => true,
      );
      db.close();
      db = new DatabaseSync(join(root, "catalog.db"));
      await initializeDatabase(adapter(db));
      const entry = await readSelected(adapter(db), owner, ids.project, ids.site);
      expect(entry?.identity.packageVersion).toBe(7);
      expect(
        await readInstalledPackage(
          adapter(db),
          owner,
          packageIdentity(issuer, stored),
          files(root),
          hash,
        ),
      ).toEqual(stored);
      expect(
        await readInstalledPackage(
          adapter(db),
          other,
          packageIdentity(issuer, stored),
          files(root),
          hash,
        ),
      ).toBeNull();
    } finally {
      db.close();
      rmSync(root, { recursive: true });
    }
  });
  it("keeps the previous selection when filesystem publication fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "mob28-failure-"));
    const db = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(db));
      const stored = await fixture();
      const disk = files(root);
      await installVerifiedPackage(
        adapter(db),
        owner,
        issuer,
        stored,
        disk,
        hash,
        "old",
        () => true,
      );
      const next = {
        ...stored,
        packageId: ids.form,
        packageVersion: 8,
        manifest: { ...stored.manifest, package_id: ids.form, package_version: 8 },
      };
      await expect(
        installVerifiedPackage(
          adapter(db),
          owner,
          issuer,
          next,
          {
            ...disk,
            publish() {
              throw new Error("disk quota");
            },
          },
          hash,
          "new",
          () => true,
        ),
      ).rejects.toThrow("disk quota");
      expect(
        (await readSelected(adapter(db), owner, ids.project, ids.site))?.identity.packageVersion,
      ).toBe(7);
      expect(disk.staged()).toEqual([]);
    } finally {
      db.close();
      rmSync(root, { recursive: true });
    }
  });
  it("reconciles staged orphans without removing published referenced content", async () => {
    const root = mkdtempSync(join(tmpdir(), "mob28-orphan-"));
    try {
      const disk = files(root);
      disk.stage("staged/interrupted.json", "partial");
      disk.stage("published.json", "retained");
      reconcileStaging(disk);
      expect(disk.staged()).toEqual([]);
      expect(disk.read("published.json")).toBe("retained");
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
