import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "../data/api/client";
import { instrumentObservationSchema } from "../domain/observation";
import { packageBindingSchema } from "../domain/package-binding";
import { readStoredPackage, setPackageAccessOwner } from "../packages/hosted/access";
import { harness, hash } from "../packages/hosted/lifecycle.test-helper";
import { PackageOperations } from "../packages/hosted/operations";
import { saveObservation } from "../storage/observation-store";
import { readSelected } from "../storage/package-catalog";
import { adapter } from "../storage/package-store.fixture";
import { pendingObservations, retryAttention } from "../storage/sync-store";
import { createBoundUpload } from "./bound-upload";
import { scopeKey, syncScopeSchema } from "./contracts";
import { createSyncCoordinator } from "./coordinator";
import { serializeBoundObservation } from "./wire-body";

const input = process.env["MOB29_BOUND_API_FIXTURE"];
it.skipIf(!input)(
  "uploads exact saved v1 point and whole-zone Inventory after SQLite restart and v2 publication through the actual API",
  async () => {
    const fixture = z
      .object({
        scope: syncScopeSchema,
        token: z.string(),
        managerToken: z.string(),
        siteId: z.uuid(),
        packageId: z.uuid(),
        zoneId: z.uuid(),
        formVersion: z.string(),
        inventoryFormVersion: z.string(),
        pointId: z.uuid(),
        inventoryId: z.uuid(),
      })
      .parse(JSON.parse(input ?? "null"));
    const { scope, token } = fixture;
    if (!scope.apiUrl.startsWith("http://127.0.0.1:"))
      throw new Error("Disposable loopback API required");
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
          if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        },
        sha256: hash,
        formVersion: (code) => client.formVersion(project, code, signal),
      }),
    });
    let sqlite = h.sqlite;
    try {
      // Given: save offline using the actual retained installed map and its form/zone identity.
      const sites = await h.operations.refresh(scope.projectId, []);
      const site = sites?.find((candidate) => candidate.site_id === fixture.siteId);
      if (!site) throw new Error("Published site missing");
      expect(await h.operations.download(scope.projectId, site, () => {})).toBe(true);
      const installed = readStoredPackage(fixture.packageId);
      const selected = await readSelected(h.database, owner, scope.projectId, fixture.siteId);
      if (!installed || !selected) throw new Error("Installed map missing");
      const zone = installed.manifest.zones.find(
        (candidate) => candidate.zone_id === fixture.zoneId,
      );
      if (!zone) throw new Error("Bound zone missing");
      const binding = packageBindingSchema.parse({
        ...selected.identity,
        zoneId: zone.zone_id,
        zoneCode: zone.zone_code,
        zoneLabel: zone.label,
      });
      const context = {
        packageId: binding.packageId,
        packageVersion: `v${binding.packageVersion}`,
        zoneId: zone.zone_code,
        zoneLabel: zone.label,
        roundType: "standard",
        freshPeriod: true,
        inheritedFrom: "",
      };
      const point = instrumentObservationSchema.parse({
        id: fixture.pointId,
        binding,
        projectId: scope.projectId,
        siteId: fixture.siteId,
        formVersion: fixture.formVersion,
        observer: "QA",
        answers: { observer: "QA", people: 2, notes: "Synthetic MOB-29 offline point" },
        coordinates: zone.display_anchor,
        createdAt: "2026-10-15T15:00:00.000Z",
        storageStatus: "local-only",
        context,
        placement: { source: "hand", gpsAccuracyMetres: null },
      });
      const inventory = instrumentObservationSchema.parse({
        id: fixture.inventoryId,
        binding,
        projectId: scope.projectId,
        siteId: fixture.siteId,
        formVersion: fixture.inventoryFormVersion,
        observer: "QA",
        answers: { notes: "Synthetic whole-zone Inventory" },
        coordinates: zone.display_anchor,
        createdAt: "2026-10-15T15:01:00.000Z",
        storageStatus: "local-only",
        context: { ...context, roundType: "inventory" },
        placement: { source: "zone", gpsAccuracyMetres: null },
      });
      await saveObservation(h.database, point, owner);
      await saveObservation(h.database, inventory, owner);
      const saved = sqlite.prepare("SELECT id,payload FROM observations ORDER BY id").all();
      const originalBodies = (await pendingObservations(h.database, owner, Date.now())).map(
        (item) => item.body,
      );
      expect(JSON.parse(originalBodies[1] ?? "{}")).not.toHaveProperty("coordinates");
      // When: manager publishes a successor while the original records are offline.
      const sitePath = `${scope.apiUrl}/v1/projects/${scope.projectId}/sites/${fixture.siteId}`;
      const headers = {
        Authorization: `Bearer ${fixture.managerToken}`,
        "Content-Type": "application/json",
      };
      const draft = await fetch(`${sitePath}/zone-drafts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ request_id: randomUUID(), base_package_id: fixture.packageId }),
      });
      expect(draft.status).toBe(201);
      const draftBody = z.object({ draft_id: z.uuid() }).parse(await draft.json());
      const etag = draft.headers.get("etag");
      if (!etag) throw new Error("Draft ETag missing");
      const published = await fetch(`${sitePath}/zone-drafts/${draftBody.draft_id}/publish`, {
        method: "POST",
        headers: { ...headers, "If-Match": etag },
        body: JSON.stringify({
          request_id: randomUUID(),
          expected_current_package_id: fixture.packageId,
        }),
      });
      expect(published.status).toBe(201);
      const successor = z
        .object({ package: z.object({ package_id: z.uuid(), package_version: z.number() }) })
        .parse(await published.json());
      expect(successor.package.package_id).not.toBe(fixture.packageId);
      sqlite.close();
      sqlite = new DatabaseSync(join(h.root, "catalog.db"));
      const db = adapter(sqlite);
      const restored = new PackageOperations({ ...h.runtime, database: db });
      await restored.catalog();
      expect(sqlite.prepare("SELECT id,payload FROM observations ORDER BY id").all()).toEqual(
        saved,
      );
      // Then: a real accepted-but-lost response retries the exact UUID/body and gets the same receipt.
      const upload = createBoundUpload(scope.apiUrl, scope);
      let loseFirst = true;
      const drain = createSyncCoordinator({
        database: db,
        scope,
        getToken: async () => token,
        isCurrent: () => true,
        upload: async (...args) => {
          const result = await upload(...args);
          if (loseFirst && result.kind === "accepted") {
            loseFirst = false;
            return { kind: "retry", message: "Synthetic lost receipt" };
          }
          return result;
        },
      });
      await drain(new AbortController().signal);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(1);
      await retryAttention(db, owner);
      await drain(new AbortController().signal);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(2);
      expect(sqlite.prepare("SELECT id,payload FROM observations ORDER BY id").all()).toEqual(
        saved,
      );
      const replay = await upload(
        point,
        token,
        new AbortController().signal,
        originalBodies[0] ?? "",
      );
      expect(replay.kind).toBe("accepted");
      if (replay.kind !== "accepted") throw new Error("Expected exact replay receipt");
      const storedReceipt = sqlite
        .prepare("SELECT server_receipt FROM observations WHERE id = ?")
        .get(point.id)?.["server_receipt"];
      expect(JSON.stringify(replay.receipt)).toBe(storedReceipt);
      const changedPoint = {
        ...point,
        answers: { ...point.answers, notes: "Synthetic changed body under same UUID" },
      };
      const conflict = await upload(
        changedPoint,
        token,
        new AbortController().signal,
        serializeBoundObservation(changedPoint),
      );
      expect(conflict).toMatchObject({ kind: "rejected", code: "conflict" });
      for (const record of [point, inventory]) {
        const response = await fetch(
          `${scope.apiUrl}/v1/projects/${scope.projectId}/observations/${record.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(response.status).toBe(200);
        const read = z
          .object({ package_id: z.uuid(), zone_id: z.uuid(), geometry: z.unknown() })
          .parse(await response.json());
        expect(read.package_id).toBe(fixture.packageId);
        expect(read.zone_id).toBe(fixture.zoneId);
        if (record.id === inventory.id) expect(read.geometry).toBeNull();
      }
    } finally {
      sqlite.close();
      h.operations.dispose();
      setPackageAccessOwner(null);
      rmSync(h.root, { recursive: true, force: true });
    }
  },
  90000,
);
