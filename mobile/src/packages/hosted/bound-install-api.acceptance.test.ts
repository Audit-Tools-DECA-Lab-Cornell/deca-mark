import { rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "../../data/api/client";
import { readSelected } from "../../storage/package-catalog";
import { adapter } from "../../storage/package-store.fixture";
import { scopeKey, syncScopeSchema } from "../../sync/contracts";
import { hasStoredPackage, readStoredPackage, setPackageAccessOwner } from "./access";
import { harness, hash } from "./lifecycle.test-helper";
import { PackageOperations } from "./operations";

const input = process.env["MOB28_SINGLE_PATH_FIXTURE"];
it.skipIf(!input)(
  "installs an actual server-published zone-aware format1 archive and restores its exact forms after SQLite restart",
  async () => {
    const fixture = z
      .object({
        bound: z.object({
          scope: syncScopeSchema,
          token: z.string().min(1),
          packageId: z.uuid(),
          formVersionId: z.uuid(),
          siteId: z.uuid(),
        }),
      })
      .parse(JSON.parse(input ?? "null")).bound;
    const { scope, token } = fixture;
    if (!scope.apiUrl.startsWith("http://127.0.0.1:")) throw new Error("Loopback API required");
    const owner = scopeKey(scope);
    const api = createApiClient(scope.apiUrl, async () => token);
    setPackageAccessOwner(owner);
    const h = await harness({
      owner,
      issuer: scope.issuer,

      api,
      authorizedProject: (project) => project === scope.projectId,
      source: (client, project, signal) => ({
        archive: async (id) => {
          const request = await client.archiveRequest(project, id);
          const response = await fetch(request.url, { headers: request.headers, signal });
          if (!response.ok) throw new Error("Archive download failed");
          return new Uint8Array(await response.arrayBuffer());
        },
        sha256: hash,
        formVersion: (code) => client.formVersion(project, code, signal),
      }),
    });
    let database = h.sqlite;
    try {
      const sites = await h.operations.refresh(scope.projectId, []);
      const site = sites?.find((entry) => entry.site_id === fixture.siteId);
      if (!site) throw new Error("Published site missing");
      expect(site.package?.package_id).toBe(fixture.packageId);
      expect(await h.operations.download(scope.projectId, site, () => {})).toBe(true);
      expect(await h.operations.catalog()).toMatchObject([
        { identity: { packageId: fixture.packageId }, status: "verified" },
      ]);
      expect(hasStoredPackage(fixture.packageId)).toBe(true);
      const installed = readStoredPackage(fixture.packageId);
      expect(installed?.manifest.forms.play).toEqual({
        form_version_id: fixture.formVersionId,
        form_version: "janet-test-v1",
      });
      expect(installed?.forms.play["version"]).toBe("janet-test-v1");
      database.close();
      database = new DatabaseSync(join(h.root, "catalog.db"));
      setPackageAccessOwner(null);
      setPackageAccessOwner(owner);
      const restored = new PackageOperations({
        ...h.runtime,
        database: adapter(database),
        source: () => {
          throw new Error("Restart must restore verified files without downloading");
        },
      });
      expect(await restored.catalog()).toMatchObject([
        { identity: { packageId: fixture.packageId }, status: "verified" },
      ]);
      expect(
        (await readSelected(adapter(database), owner, scope.projectId, fixture.siteId))?.identity
          .packageId,
      ).toBe(fixture.packageId);
      expect(hasStoredPackage(fixture.packageId)).toBe(true);
      expect(readStoredPackage(fixture.packageId)).toEqual(installed);
    } finally {
      database.close();
      setPackageAccessOwner(null);
      rmSync(h.root, { recursive: true, force: true });
    }
  },
  30000,
);
