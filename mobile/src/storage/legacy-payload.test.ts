import { describe, expect, it } from "vitest";
import { identityKey } from "../domain/package-binding";
import { serializeBoundObservation, uploadBodyMatches } from "../sync/wire-body";
import { listObservations } from "./observation-store";
import { installPackage } from "./package-catalog";
import { binding, boundRecord, entry, memoryDatabase, owner } from "./package-store.fixture";
import { acknowledge, pendingObservations } from "./sync-store";
import { zoneReferences } from "./zone-references";

/**
 * Builds before MOB-43 stored every record's payload with `storageStatus: "local-only"`, bound hosted
 * records included; the `sync_state` column held the real state. These rows are written exactly as
 * master's `buildObservation` and `encodeUploadPayload` wrote them.
 */
const masterEra = JSON.stringify({
  ...boundRecord,
  storageStatus: "local-only",
  uploadBody: serializeBoundObservation(boundRecord),
});
const receipt = {
  observation_id: boundRecord.id,
  project_id: binding.projectId,
  user_id: "40000000-0000-4000-8000-000000000001",
  package_id: binding.packageId,
  zone_id: binding.zoneId,
  accepted_revision: 1 as const,
  received_at: "2026-10-15T10:00:00.000Z",
};

async function withRow(state: string, payload = masterEra, id: string = boundRecord.id) {
  const { db, sqlite } = await memoryDatabase();
  await installPackage(db, owner, entry);
  sqlite
    .prepare(
      "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, package_key) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, boundRecord.createdAt, payload, owner, state, identityKey(entry.identity));
  return { db, sqlite };
}

describe("records written by a build before MOB-43", () => {
  it("lists a pending bound record as pending, and drains and acknowledges it with its frozen body", async () => {
    const { db, sqlite } = await withRow("pending");
    try {
      expect(await listObservations(db, owner)).toMatchObject([
        { id: boundRecord.id, storageStatus: "pending" },
      ]);
      const [queued] = await pendingObservations(db, owner, Date.now());
      expect(queued?.body).toBe(serializeBoundObservation(boundRecord));
      expect(queued?.record.storageStatus).toBe("pending");
      expect(await acknowledge(db, owner, receipt, boundRecord.id)).toBe(true);
      expect(await listObservations(db, owner)).toMatchObject([{ storageStatus: "synced" }]);
      expect(await pendingObservations(db, owner, Date.now())).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("lists a synced bound record as synced", async () => {
    const { db, sqlite } = await withRow("synced");
    try {
      expect(await listObservations(db, owner)).toMatchObject([
        { id: boundRecord.id, storageStatus: "synced" },
      ]);
      expect(await pendingObservations(db, owner, Date.now())).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("keeps a retired practice row stored but never lists, counts or uploads it", async () => {
    const practice = JSON.stringify({
      id: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
      siteId: "sample-garden",
      formVersion: "shell-v1",
      coordinates: [-76.485, 42.448],
      observer: "JL",
      people: 2,
      notes: "",
      createdAt: "2026-09-17T10:00:00.000Z",
      storageStatus: "local-only",
    });
    const { db, sqlite } = await withRow("pending");
    try {
      sqlite
        .prepare(
          "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, package_key) VALUES (?, ?, ?, ?, 'local-only', ?)",
        )
        .run(
          "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
          "2026-09-17T10:00:00.000Z",
          practice,
          owner,
          "",
        );
      expect((await listObservations(db, owner)).map((record) => record.id)).toEqual([
        boundRecord.id,
      ]);
      expect(
        (await pendingObservations(db, owner, Date.now())).map((item) => item.record.id),
      ).toEqual([boundRecord.id]);
      expect((await zoneReferences(db, owner, entry.identity)).unsent).toBe(1);
      expect(sqlite.prepare("SELECT COUNT(*) AS n FROM observations").get()).toEqual({ n: 2 });
      expect(
        sqlite.prepare("SELECT sync_state FROM observations WHERE sync_state = 'local-only'").all(),
      ).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it("reads a bound record of a form coded shell-v1 as the answers its frozen body carries", async () => {
    // Master's bound-shell branch: people and notes beside the observer, no `answers`.
    const shellId = "83f254b5-8a7b-4b71-9591-a7ff880f4ad8";
    const answers = { observer: "JL", people: 2, notes: "Café — 遊び" };
    const frozen = serializeBoundObservation({
      ...boundRecord,
      id: shellId,
      formVersion: "shell-v1",
      observer: "JL",
      answers,
    });
    const {
      id: _id,
      formVersion: _form,
      observer: _observer,
      answers: _answers,
      ...shared
    } = boundRecord;
    const shellPayload = JSON.stringify({
      ...shared,
      id: shellId,
      formVersion: "shell-v1",
      observer: "JL",
      people: 2,
      notes: "Café — 遊び",
      storageStatus: "local-only",
      uploadBody: frozen,
    });
    const { db, sqlite } = await withRow("pending");
    try {
      sqlite
        .prepare(
          "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, package_key) VALUES (?, ?, ?, ?, 'pending', ?)",
        )
        .run(shellId, "2026-10-11T11:00:00.000Z", shellPayload, owner, identityKey(entry.identity));
      const listed = await listObservations(db, owner);
      expect(listed.map((record) => [record.id, record.storageStatus])).toEqual([
        [shellId, "pending"],
        [boundRecord.id, "pending"],
      ]);
      const queued = await pendingObservations(db, owner, Date.now());
      expect(queued.map((item) => item.body).sort()).toEqual(
        [frozen, serializeBoundObservation(boundRecord)].sort(),
      );
      for (const item of queued) expect(uploadBodyMatches(item.body, item.record)).toBe(true);
      expect(sqlite.prepare("SELECT payload FROM observations WHERE id = ?").get(shellId)).toEqual({
        payload: shellPayload,
      });
      expect(await acknowledge(db, owner, { ...receipt, observation_id: shellId }, shellId)).toBe(
        true,
      );
      expect(await acknowledge(db, owner, receipt, boundRecord.id)).toBe(true);
      expect(await pendingObservations(db, owner, Date.now())).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
