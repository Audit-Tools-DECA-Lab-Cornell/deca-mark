import { saveObservation } from "/home/user/deca-mark/mobile/src/storage/observation-store";
import { installPackage } from "/home/user/deca-mark/mobile/src/storage/package-catalog";
import { binding, boundRecord, entry, memoryDatabase, owner } from "/home/user/deca-mark/mobile/src/storage/package-store.fixture";
import { retryAttention } from "/home/user/deca-mark/mobile/src/storage/sync-store";
import { syncScopeSchema } from "/home/user/deca-mark/mobile/src/sync/contracts";
import { createSyncCoordinator } from "/home/user/deca-mark/mobile/src/sync/coordinator";

const scope = syncScopeSchema.parse({
  apiUrl: "https://api.synthetic.invalid",
  issuer: binding.issuer,
  userId: "40000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000002",
});
const receipt = {
  observation_id: boundRecord.id, project_id: binding.projectId, user_id: scope.userId,
  package_id: binding.packageId, zone_id: binding.zoneId, accepted_revision: 1 as const,
  received_at: "2026-10-15T10:00:00.000Z",
};

test("a pending row in backoff stays unsent through wake-style drains until retryAttention", async () => {
  const { db, sqlite } = await memoryDatabase();
  try {
    await installPackage(db, owner, entry);
    await saveObservation(db, boundRecord, owner);
    let clock = 0; let calls = 0; let failing = true;
    const drain = createSyncCoordinator({
      database: db, scope, isCurrent: () => true, getToken: async () => "token", now: () => clock,
      upload: async () => { calls++; return failing ? { kind: "retry", message: "timeout" } : { kind: "accepted", receipt }; },
    });
    // Seven failed attempts in patchy signal, each drained as soon as its delay passed.
    for (let i = 0; i < 7; i++) {
      await drain(new AbortController().signal);
      const row = sqlite.prepare("SELECT attempts, next_attempt_at FROM observations").get() as any;
      console.log("after failure", i + 1, "attempts", row.attempts, "delay_s", (row.next_attempt_at - clock) / 1000);
      if (i < 6) clock = row.next_attempt_at;
    }
    // The 7th failure happened at 'clock'; the observer reaches good Wi-Fi 10 s later.
    // Back on good Wi-Fi: the server would accept now. Wake-style drains every 5 s for 60 s.
    failing = false;
    const base = clock + 10000; const before = calls;
    for (let t = 0; t <= 240000; t += 5000) { clock = base + t; await drain(new AbortController().signal); }
    console.log("wake drains every 5 s for 240 s after reconnect: upload calls", calls - before,
      "state", (sqlite.prepare("SELECT sync_state FROM observations").get() as any).sync_state);
    await retryAttention(db, owner);
    await drain(new AbortController().signal);
    console.log("after retryAttention + drain: upload calls", calls - before,
      "state", (sqlite.prepare("SELECT sync_state FROM observations").get() as any).sync_state);
  } finally { sqlite.close(); }
});
