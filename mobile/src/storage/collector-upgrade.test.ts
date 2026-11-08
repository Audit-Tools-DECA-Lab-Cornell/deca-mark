import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { identityKey } from "../domain/package-binding";
import { serializeBoundObservation, uploadBodyMatches } from "../sync/wire-body";
import { initializeDatabase, packageFileResetPending, SCHEMA_VERSION } from "./database-migrations";
import { readDraft } from "./draft-store";
import { MASTER_USER_VERSION, masterSchemaV6 } from "./master-v6.fixture";
import { listObservations } from "./observation-store";
import { installPackage, listCatalog } from "./package-catalog";
import { adapter, binding, boundDraft, boundRecord, entry, owner } from "./package-store.fixture";
import { listParkedDrafts } from "./parked-drafts";
import { acknowledge, pendingObservations } from "./sync-store";

/** What a device in the field holds: origin/master's schema at user_version 6, filled by master's writers. */
const key = identityKey(entry.identity);
const ids = {
  pending: boundRecord.id,
  attention: "60000000-0000-4000-8000-000000000002",
  synced: "60000000-0000-4000-8000-000000000003",
  practice: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
};
const masterPayload = (id: string) =>
  JSON.stringify({
    ...boundRecord,
    id,
    storageStatus: "local-only",
    uploadBody: serializeBoundObservation({ ...boundRecord, id }),
  });
const receipt = {
  observation_id: ids.synced,
  project_id: binding.projectId,
  user_id: "40000000-0000-4000-8000-000000000001",
  package_id: binding.packageId,
  zone_id: binding.zoneId,
  accepted_revision: 1,
  received_at: "2026-10-15T10:00:00.000Z",
};
const failure = JSON.stringify({ message: "The server could not read this record.", code: "x" });
const practicePayload = JSON.stringify({
  id: ids.practice,
  siteId: "sample-garden",
  formVersion: "shell-v1",
  coordinates: [-76.485, 42.448],
  observer: "JL",
  people: 2,
  notes: "",
  createdAt: "2026-09-17T10:00:00.000Z",
  storageStatus: "local-only",
});
const practiceDraft = JSON.stringify({ id: "practice-draft", answers: { observer: "JL" } });

async function masterDevice() {
  const sqlite = new DatabaseSync(":memory:");
  const db = adapter(sqlite);
  sqlite.exec(`${masterSchemaV6} PRAGMA user_version = ${MASTER_USER_VERSION};`);
  await installPackage(db, owner, entry);
  const insert = sqlite.prepare(
    "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, sync_error, server_receipt, attempts, next_attempt_at, package_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    ids.pending,
    "2026-10-11T10:00:01.000Z",
    masterPayload(ids.pending),
    owner,
    "pending",
    "",
    "",
    2,
    0,
    key,
  );
  insert.run(
    ids.attention,
    "2026-10-11T10:00:02.000Z",
    masterPayload(ids.attention),
    owner,
    "needs-attention",
    failure,
    "",
    5,
    0,
    key,
  );
  insert.run(
    ids.synced,
    "2026-10-11T10:00:03.000Z",
    masterPayload(ids.synced),
    owner,
    "synced",
    "",
    JSON.stringify(receipt),
    1,
    0,
    key,
  );
  insert.run(
    ids.practice,
    "2026-09-17T10:00:00.000Z",
    practicePayload,
    owner,
    "local-only",
    "",
    "",
    0,
    0,
    "",
  );
  sqlite
    .prepare(
      "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES (?, ?, ?, ?, ?)",
    )
    .run(owner, boundDraft.id, boundDraft.updatedAt, JSON.stringify(boundDraft), key);
  sqlite
    .prepare(
      "INSERT INTO parked_observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      owner,
      "70000000-0000-4000-8000-000000000001",
      boundDraft.updatedAt,
      JSON.stringify({ ...boundDraft, id: "70000000-0000-4000-8000-000000000001" }),
      key,
    );
  sqlite
    .prepare(
      "INSERT INTO parked_observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES (?, ?, ?, ?, ?)",
    )
    .run(owner, "practice-parked", boundDraft.updatedAt, practiceDraft, "");
  return { sqlite, db };
}
const rowsOf = (sqlite: DatabaseSync, table: string, order = "id") =>
  sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();

describe("a device that holds master's schema (user_version 6)", () => {
  it("is upgraded without losing any unsent record, draft or install", async () => {
    const { sqlite, db } = await masterDevice();
    try {
      const before = rowsOf(sqlite, "observations").filter((row) => row["id"] !== ids.practice);
      const drafts = rowsOf(sqlite, "observation_drafts", "owner_scope");
      const catalog = rowsOf(sqlite, "package_contents", "content_key");
      await initializeDatabase(db);
      expect(sqlite.prepare("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
      // Every bound row keeps payload (frozen uploadBody included), state, error, receipt, scope, key.
      expect(rowsOf(sqlite, "observations")).toEqual(before);
      expect(rowsOf(sqlite, "observation_drafts", "owner_scope")).toEqual(drafts);
      expect(rowsOf(sqlite, "package_contents", "content_key")).toEqual(catalog);
      expect(rowsOf(sqlite, "parked_observation_drafts").map((row) => row["id"])).toEqual([
        "70000000-0000-4000-8000-000000000001",
      ]);
      expect(await listCatalog(db, owner, entry.identity.projectId)).toHaveLength(1);
      expect(await packageFileResetPending(db)).toBe(false);
      expect((await readDraft(db, owner))?.id).toBe(boundDraft.id);
      expect(await listParkedDrafts(db, owner)).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it("drops only the retired unbound practice rows and practice drafts", async () => {
    const { sqlite, db } = await masterDevice();
    try {
      await initializeDatabase(db);
      expect(sqlite.prepare("SELECT id FROM observations WHERE id = ?").all(ids.practice)).toEqual(
        [],
      );
      expect(sqlite.prepare("SELECT COUNT(*) n FROM observations").get()).toEqual({ n: 3 });
      expect(
        sqlite.prepare("SELECT id FROM parked_observation_drafts WHERE package_key = ''").all(),
      ).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("still drains the pending bound record byte-identical and acknowledges it afterwards", async () => {
    const { sqlite, db } = await masterDevice();
    try {
      await initializeDatabase(db);
      const queued = await pendingObservations(db, owner, Date.now());
      expect(queued.map((item) => item.record.id)).toEqual([ids.pending]);
      expect(queued[0]?.body).toBe(serializeBoundObservation({ ...boundRecord, id: ids.pending }));
      expect(uploadBodyMatches(queued[0]?.body ?? "", queued[0]?.record ?? boundRecord)).toBe(true);
      expect(
        await acknowledge(db, owner, { ...receipt, observation_id: ids.pending }, ids.pending),
      ).toBe(true);
      const listed = await listObservations(db, owner);
      expect(listed.map((item) => [item.id, item.storageStatus])).toEqual([
        [ids.synced, "synced"],
        [ids.attention, "needs-attention"],
        [ids.pending, "synced"],
      ]);
      expect(await pendingObservations(db, owner, Date.now())).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("creates the pilot table without the retired local-only state", async () => {
    const { sqlite, db } = await masterDevice();
    try {
      await initializeDatabase(db);
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO observations (id, created_at, payload, sync_state) VALUES ('x', 'x', '{}', 'local-only')",
          )
          .run(),
      ).toThrow(/CHECK/);
      sqlite
        .prepare("INSERT INTO observations (id, created_at, payload) VALUES ('d', 'x', '{}')")
        .run();
      expect(sqlite.prepare("SELECT sync_state FROM observations WHERE id = 'd'").get()).toEqual({
        sync_state: "pending",
      });
    } finally {
      sqlite.close();
    }
  });
});

describe("a version this build cannot read", () => {
  it("refuses a future user_version, says why and deletes nothing", async () => {
    const { sqlite, db } = await masterDevice();
    try {
      sqlite.exec("PRAGMA user_version = 99;");
      const before = {
        observations: rowsOf(sqlite, "observations"),
        drafts: rowsOf(sqlite, "observation_drafts", "owner_scope"),
        parked: rowsOf(sqlite, "parked_observation_drafts"),
        tables: sqlite.prepare("SELECT name FROM sqlite_master ORDER BY name").all(),
      };
      await expect(initializeDatabase(db)).rejects.toThrow(
        "This version cannot read the records on this device. Update DECA Mark; nothing was deleted.",
      );
      expect(rowsOf(sqlite, "observations")).toEqual(before.observations);
      expect(rowsOf(sqlite, "observation_drafts", "owner_scope")).toEqual(before.drafts);
      expect(rowsOf(sqlite, "parked_observation_drafts")).toEqual(before.parked);
      expect(sqlite.prepare("SELECT name FROM sqlite_master ORDER BY name").all()).toEqual(
        before.tables,
      );
      expect(sqlite.prepare("PRAGMA user_version").get()).toEqual({ user_version: 99 });
    } finally {
      sqlite.close();
    }
  });
});
