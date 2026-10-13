import { describe, expect, it } from "vitest";
import { isUploadableRecord } from "../forms/registry";
import { initializeDatabase, saveObservation } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import { boundRecord, entry, memoryDatabase, owner } from "../storage/package-store.fixture";
import { retryAttention } from "../storage/sync-store";
import { syncScopeSchema } from "./contracts";
import { createSyncCoordinator } from "./coordinator";

const scope = syncScopeSchema.parse({
  apiUrl: "https://api.synthetic.invalid",
  issuer: "https://synthetic.invalid/auth/v1",
  userId: "40000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000002",
});

describe("Bound upload activation boundary", () => {
  it("holds bound records across restart and explicit retry without invoking transport", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await initializeDatabase(db);
      expect(isUploadableRecord(boundRecord)).toBe(false);
      sqlite.exec("UPDATE observations SET sync_state = 'needs-attention';");
      await retryAttention(db, owner);
      let tokenCalls = 0;
      let uploadCalls = 0;
      const drain = createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => true,
        getToken: async () => {
          tokenCalls += 1;
          return "token";
        },
        upload: async () => {
          uploadCalls += 1;
          return { kind: "retry", message: "Not activated" };
        },
      });
      await drain(new AbortController().signal);
      // Even an erroneously queued row cannot bypass the current eligibility gate.
      sqlite.exec("UPDATE observations SET sync_state = 'pending';");
      await drain(new AbortController().signal);
      expect(tokenCalls).toBe(0);
      expect(uploadCalls).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
