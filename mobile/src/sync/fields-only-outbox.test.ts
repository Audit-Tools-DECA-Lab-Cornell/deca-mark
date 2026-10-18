import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { z } from "zod";
import { instrumentObservationSchema } from "../domain/observation";
import { packageBindingSchema } from "../domain/package-binding";
import { initializeDatabase, saveObservation } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import { adapter, identity } from "../storage/package-store.fixture";
import { acknowledge, pendingObservations } from "../storage/sync-store";
import { createBoundUpload } from "./bound-upload";
import { scopeKey, syncScopeSchema } from "./contracts";

it("retains a historical fields-only outbox body across SQLite restart and exact receipt retry", async () => {
  const supplied = process.env["FIELDS_ONLY_API_FIXTURE"];
  const fixture = z
    .object({
      scope: syncScopeSchema,
      token: z.string(),
      siteId: z.uuid(),
      packageId: z.uuid(),
      zoneId: z.uuid(),
      observationId: z.uuid(),
      packageSha256: z.string().length(64),
      formVersion: z.string(),
    })
    .parse(
      supplied
        ? JSON.parse(supplied)
        : {
            scope: {
              apiUrl: "http://127.0.0.1:1",
              issuer: identity.issuer,
              projectId: identity.projectId,
              userId: "40000000-0000-4000-8000-000000000001",
            },
            token: "unused-synthetic-token",
            siteId: identity.siteId,
            packageId: identity.packageId,
            zoneId: "50000000-0000-4000-8000-000000000001",
            observationId: "60000000-0000-4000-8000-000000000001",
            packageSha256: identity.packageSha256,
            formVersion: "historic-v1",
          },
    );
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture.scope.apiUrl))
    throw new Error("Disposable loopback API required");
  const owner = scopeKey(fixture.scope);
  const packageIdentity = {
    issuer: fixture.scope.issuer,
    projectId: fixture.scope.projectId,
    siteId: fixture.siteId,
    packageId: fixture.packageId,
    packageVersion: 1,
    packageSha256: fixture.packageSha256,
  };
  const binding = packageBindingSchema.parse({
    ...packageIdentity,
    zoneId: fixture.zoneId,
    zoneCode: "A",
    zoneLabel: "Lawn",
  });
  const record = instrumentObservationSchema.parse({
    id: fixture.observationId,
    projectId: fixture.scope.projectId,
    siteId: fixture.siteId,
    formVersion: fixture.formVersion,
    binding,
    observer: "QA",
    answers: { people: 0, notes: "" },
    coordinates: [-76.485, 42.448],
    createdAt: "2026-09-17T12:00:00.000Z",
    storageStatus: "local-only",
    context: {
      packageId: fixture.packageId,
      packageVersion: "v1",
      zoneId: "A",
      zoneLabel: "Lawn",
      roundType: "standard",
      freshPeriod: true,
      inheritedFrom: "",
    },
    placement: { source: "hand", gpsAccuracyMetres: null },
  });
  const root = mkdtempSync(join(tmpdir(), "fields-only-outbox-"));
  let sqlite = new DatabaseSync(join(root, "queue.db"));
  try {
    let db = adapter(sqlite);
    await initializeDatabase(db);
    // Model an already retained catalog. This deliberately does not claim that today's
    // canonical-only package installer can newly install a fields-only instrument.
    await installPackage(db, owner, {
      identity: packageIdentity,
      contentPath: "retained/verified.json",
      metadata: {
        forms: {
          play: {
            fields: [
              { code: "people", type: "integer", minimum: 0, maximum: 999, required: true },
              { code: "notes", type: "text", required: false, maxLength: 1000 },
            ],
            status: "practice-only",
          },
        },
      },
    });
    await saveObservation(db, record, owner);
    const saved = sqlite.prepare("SELECT payload FROM observations").get();
    const first = (await pendingObservations(db, owner, Date.now()))[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("Historical record missing from outbox");
    expect(JSON.parse(first.body)).toEqual({
      site_id: fixture.siteId,
      package_id: fixture.packageId,
      zone_id: fixture.zoneId,
      form_version: fixture.formVersion,
      observer: "QA",
      observed_at: "2026-09-17T12:00:00.000Z",
      answers: { people: 0, notes: "" },
      round_type: "standard",
      placement: "hand",
      first_round: true,
      coordinates: [-76.485, 42.448],
    });
    sqlite.close();
    sqlite = new DatabaseSync(join(root, "queue.db"));
    db = adapter(sqlite);
    expect(sqlite.prepare("SELECT payload FROM observations").get()).toEqual(saved);
    const restored = (await pendingObservations(db, owner, Date.now()))[0];
    expect(restored?.body).toBe(first.body);
    if (!restored) throw new Error("Historical record lost on restart");
    // The ordinary unit run verifies persistence. The disposable Python acceptance
    // supplies the signed loopback API and exercises the actual production transport.
    if (supplied) {
      const upload = createBoundUpload(fixture.scope.apiUrl, fixture.scope);
      const send = () =>
        upload(restored.record, fixture.token, new AbortController().signal, restored.body);
      const accepted = await send();
      expect(accepted.kind).toBe("accepted");
      expect(await send()).toEqual(accepted); // accepted response lost before local acknowledgement
      if (accepted.kind !== "accepted") throw new Error("Historical upload not accepted");
      await acknowledge(db, owner, accepted.receipt, record.id);
      expect(await pendingObservations(db, owner, Date.now())).toHaveLength(0);
      expect(sqlite.prepare("SELECT payload FROM observations").get()).toEqual(saved);
    }
  } finally {
    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  }
});
