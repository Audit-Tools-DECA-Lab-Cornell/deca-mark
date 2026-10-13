import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { readAvailableCurrent, setAvailableCurrent } from "./available-current";
import { readDraft, saveDraft } from "./draft-store";
import {
  completePackageFileReset,
  initializeDatabase,
  listObservations,
  packageFileResetPending,
  saveObservation,
} from "./observation-store";
import { installPackage, readSelected, removePackage } from "./package-catalog";
import {
  adapter,
  boundDraft,
  boundRecord,
  entry,
  identity,
  owner,
  session,
} from "./package-store.fixture";
import { readSession, saveSession } from "./session-store";

describe("Current collection schema restart", () => {
  it("retains frozen records, upload state and every package reference on same-schema restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "decamark-current-schema-"));
    const path = join(directory, "current.db");
    let sqlite = new DatabaseSync(path);
    try {
      let db = adapter(sqlite);
      await initializeDatabase(db);
      await completePackageFileReset(db);
      await installPackage(db, owner, entry);
      await saveSession(db, owner, session);
      await saveDraft(db, owner, boundDraft);
      await saveObservation(db, boundRecord, owner);
      const available = { packageId: identity.packageId, packageVersion: 8 };
      await setAvailableCurrent(db, owner, identity.projectId, identity.siteId, available);
      sqlite.exec(
        "UPDATE observations SET sync_state = 'needs-attention', sync_error = 'Keep failure', server_receipt = 'Keep receipt', attempts = 4, next_attempt_at = 99",
      );
      const raw = sqlite.prepare("SELECT * FROM observations").all();
      sqlite.close();
      sqlite = new DatabaseSync(path);
      db = adapter(sqlite);
      await initializeDatabase(db);
      expect(sqlite.prepare("SELECT * FROM observations").all()).toEqual(raw);
      expect(await listObservations(db, owner)).toEqual([
        { ...boundRecord, storageStatus: "needs-attention", syncError: "Keep failure" },
      ]);
      expect(await readDraft(db, owner)).toEqual(boundDraft);
      expect(await readSession(db, owner)).toEqual(session);
      expect(await readSelected(db, owner, identity.projectId, identity.siteId)).toEqual(entry);
      expect(await readAvailableCurrent(db, owner, identity.projectId, identity.siteId)).toEqual(
        available,
      );
      expect(await removePackage(db, owner, identity)).toMatchObject({
        removed: false,
        reasons: { sessions: 1, drafts: 1, records: 1 },
      });
      expect(await packageFileResetPending(db)).toBe(false);
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("keeps required package-file cleanup pending after a crash and does not repeat completed cleanup", async () => {
    const directory = mkdtempSync(join(tmpdir(), "decamark-reset-marker-"));
    const path = join(directory, "marker.db");
    let sqlite = new DatabaseSync(path);
    try {
      await initializeDatabase(adapter(sqlite));
      expect(await packageFileResetPending(adapter(sqlite))).toBe(true);
      sqlite.close();
      sqlite = new DatabaseSync(path);
      const db = adapter(sqlite);
      await initializeDatabase(db);
      expect(await packageFileResetPending(db)).toBe(true);
      await completePackageFileReset(db);
      await initializeDatabase(db);
      expect(await packageFileResetPending(db)).toBe(false);
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("retains the durable cleanup marker if clearing it fails", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const db = adapter(sqlite);
    try {
      await initializeDatabase(db);
      sqlite.exec(
        "CREATE TRIGGER fail_marker_clear BEFORE DELETE ON local_metadata BEGIN SELECT RAISE(ABORT, 'interrupted'); END;",
      );
      await expect(completePackageFileReset(db)).rejects.toThrow("interrupted");
      expect(await packageFileResetPending(db)).toBe(true);
    } finally {
      sqlite.close();
    }
  });
});
