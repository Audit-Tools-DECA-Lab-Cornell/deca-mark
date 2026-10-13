import { DatabaseSync } from "node:sqlite";
import { instrumentObservationSchema } from "../domain/observation";
import { packageBindingSchema, packageIdentitySchema } from "../domain/package-binding";
import { observationDraftSchema } from "./draft-store";
import { initializeDatabase, type LocalDatabase } from "./observation-store";
import { catalogEntrySchema } from "./package-catalog";
import { durableSessionSchema } from "./session-store";

export const identity = packageIdentitySchema.parse({
  issuer: "https://synthetic.invalid/auth/v1",
  projectId: "10000000-0000-4000-8000-000000000001",
  siteId: "20000000-0000-4000-8000-000000000001",
  packageId: "30000000-0000-4000-8000-000000000001",
  packageVersion: 7,
  packageSha256: "a".repeat(64),
});
export const owner = JSON.stringify([
  "https://api.synthetic.invalid",
  identity.issuer,
  "40000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
]);
export const otherOwner = JSON.stringify([
  "https://api.synthetic.invalid",
  identity.issuer,
  "40000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000002",
]);
export const entry = catalogEntrySchema.parse({
  identity,
  contentPath: "issuer/project/package/digest/verified.json",
  metadata: { synthetic: true },
});
export const binding = packageBindingSchema.parse({
  ...identity,
  zoneId: "50000000-0000-4000-8000-000000000001",
  zoneCode: "A",
  zoneLabel: "Old label",
});
export const context = {
  packageId: identity.packageId,
  packageVersion: "v7",
  zoneId: "A",
  zoneLabel: "Old label",
  roundType: "standard",
  freshPeriod: false,
  inheritedFrom: "",
} as const;
export const boundRecord = instrumentObservationSchema.parse({
  id: "60000000-0000-4000-8000-000000000001",
  projectId: identity.projectId,
  siteId: identity.siteId,
  formVersion: "synthetic-form-v1",
  observer: "QA",
  coordinates: [-76.485, 42.448],
  answers: { number: 0, text: "Synthetic café" },
  context,
  placement: { source: "hand", gpsAccuracyMetres: null },
  createdAt: "2026-10-11T10:00:00.000Z",
  storageStatus: "local-only",
  binding,
});
export const boundDraft = observationDraftSchema.parse({
  id: boundRecord.id,
  owner,
  packageId: identity.packageId,
  siteId: boundRecord.siteId,
  formVersion: boundRecord.formVersion,
  context,
  binding,
  coordinates: null,
  placement: null,
  answers: { number: 0 },
  questionIndex: 1,
  startedAt: boundRecord.createdAt,
  updatedAt: boundRecord.createdAt,
});
export const session = durableSessionSchema.parse({
  identity,
  zoneCode: "A",
  zoneId: binding.zoneId,
  roundType: "standard",
  freshPeriod: false,
  playFormVersion: boundRecord.formVersion,
  inventoryFormVersion: null,
  context,
});

export function adapter(sqlite: DatabaseSync): LocalDatabase {
  return {
    async execAsync(sql) {
      sqlite.exec(sql);
    },
    async runAsync(sql, ...parameters) {
      return sqlite.prepare(sql).run(...parameters);
    },
    async getAllAsync(sql, ...parameters) {
      return sqlite.prepare(sql).all(...parameters);
    },
  };
}

export async function memoryDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const db = adapter(sqlite);
  await initializeDatabase(db);
  return { sqlite, db };
}
