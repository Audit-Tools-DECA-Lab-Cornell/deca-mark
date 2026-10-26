import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "/tmp" },
  Directory: class {},
  File: class {
    exists = false;
  },
}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

import { packageBindingSchema, packageIdentitySchema } from "../domain/package-binding";
import { removeAccountData } from "../storage/account-removal";
import {
  commitObservation,
  completePackageFileReset,
  initializeDatabase,
  listObservations,
} from "../storage/observation-store";
import { catalogEntrySchema, installPackage, removePackage } from "../storage/package-catalog";
import { adapter, boundRecord, context } from "../storage/package-store.fixture";
import { createSyncCoordinator } from "../sync/coordinator";
import { accountWorkspace } from "./session-retention";

const accountA = { id: "50000000-0000-4000-8000-000000000001", email: "a@example.test" };
const accountB = { id: "50000000-0000-4000-8000-000000000002", email: "b@example.test" };
const hosted = { apiUrl: "https://api.example.test", supabaseUrl: "https://auth.example.test" };
const local = { apiUrl: "http://127.0.0.1:8001", supabaseUrl: "http://127.0.0.1:54321" };
const zoneId = "50000000-0000-4000-8000-000000000001";

async function installedRecord() {
  const db = adapter(new DatabaseSync(":memory:"));
  await initializeDatabase(db);
  await completePackageFileReset(db);
  const workspace = accountWorkspace(accountA, hosted);
  if (!workspace.scope) throw new Error("the account has no scope");
  const identity = packageIdentitySchema.parse({
    issuer: workspace.scope.issuer,
    projectId: "10000000-0000-4000-8000-000000000001",
    siteId: "20000000-0000-4000-8000-000000000001",
    packageId: "30000000-0000-4000-8000-000000000001",
    packageVersion: 7,
    packageSha256: "a".repeat(64),
  });
  await installPackage(
    db,
    workspace.key,
    catalogEntrySchema.parse({ identity, contentPath: "x/verified.json", metadata: {} }),
  );
  const binding = packageBindingSchema.parse({
    ...identity,
    zoneId,
    zoneCode: "A",
    zoneLabel: "Old label",
  });
  return { db, workspace, identity, record: { ...boundRecord, binding, context } };
}

it("saves, uploads and marks synced a record under a scope built from the connection", async () => {
  // Given a package installed and a record committed under the account workspace's key.
  const { db, workspace, identity, record } = await installedRecord();
  await commitObservation(db, record, workspace.key);
  expect((await listObservations(db, workspace.key))[0]?.storageStatus).toBe("pending");
  // When the coordinator drains twice.
  let uploads = 0;
  const drain = createSyncCoordinator({
    database: db,
    scope: workspace.scope as NonNullable<typeof workspace.scope>,
    ownerKey: workspace.key,
    getToken: async () => "token",
    isCurrent: () => true,
    now: () => Date.now() + 10_000_000,
    upload: async (row) => {
      uploads += 1;
      return {
        kind: "accepted",
        receipt: {
          observation_id: row.id,
          project_id: identity.projectId,
          package_id: identity.packageId,
          zone_id: zoneId,
          user_id: accountA.id,
          accepted_revision: 1,
          received_at: "2026-10-24T10:00:00.000Z",
        },
      };
    },
  });
  await drain(new AbortController().signal);
  await drain(new AbortController().signal);
  // Then the record uploaded once, is synced, and its package stays held by the record.
  expect(uploads).toBe(1);
  expect((await listObservations(db, workspace.key))[0]?.storageStatus).toBe("synced");
  expect(await removePackage(db, workspace.key, identity, () => true)).toMatchObject({
    removed: false,
    reasons: { sessions: 1, records: 1 },
  });
});

it("shows another backend, another account and a signed-out device none of the records", async () => {
  // Given a committed record under account A on the hosted backend.
  const { db, workspace, record } = await installedRecord();
  await commitObservation(db, record, workspace.key);
  // When other namespaces list.
  // Then none sees it.
  expect(await listObservations(db, accountWorkspace(accountA, local).key)).toEqual([]);
  expect(await listObservations(db, accountWorkspace(accountB, hosted).key)).toEqual([]);
  expect(await listObservations(db, accountWorkspace(null, hosted).key)).toEqual([]);
});

it("finds the rows of an account by issuer and user id when removing it", async () => {
  // Given a committed record under the account workspace key.
  const { db, workspace, record } = await installedRecord();
  await commitObservation(db, record, workspace.key);
  // When the account's data is removed by issuer and user id.
  const removed = await removeAccountData(db, hosted.supabaseUrl, accountA.id);
  // Then the keyed rows are found.
  expect(removed.observations).toBe(1);
  expect(removed.package_authorizations).toBe(1);
});
