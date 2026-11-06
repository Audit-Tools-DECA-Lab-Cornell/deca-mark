import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveObservation } from "../../storage/observation-store";
import { installPackage } from "../../storage/package-catalog";
import { boundRecord, entry, memoryDatabase, owner } from "../../storage/package-store.fixture";
import { capturedLabel, type Queue, useQueueForMode } from "./queue";

vi.mock("expo-router", async () => (await import("../../ui/native.fixture")).router);
vi.mock("react-native", async () => (await import("../../ui/native.fixture")).reactNative);

const world = vi.hoisted(() => ({ database: null as unknown, owner: "", wakes: 0, retries: 0 }));
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => world.database }));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({ key: world.owner, ready: true }),
}));
vi.mock("../../sync/provider", () => ({
  useSync: () => ({
    revision: 0,
    wake: () => {
      world.wakes += 1;
    },
    retry: async () => {
      world.retries += 1;
    },
  }),
}));
vi.mock("../../session/provider", () => ({ shortLabel: (id: string) => id.slice(-4) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** MOB-37: the queue counts bound rows only as unsent, and keeps practice rows apart from them. */

const practiceShell = {
  id: "60000000-0000-4000-8000-0000000000a1",
  coordinates: [-76.485, 42.448],
  createdAt: "2026-10-11T11:00:00.000Z",
  storageStatus: "local-only",
  siteId: "sample-garden",
  formVersion: "shell-v1",
  observer: "QA",
  people: 3,
  notes: "",
};
/** Made on a Practice-garden zone: an instrument form, but no package binding. */
const practiceInventory = {
  id: "60000000-0000-4000-8000-0000000000a2",
  projectId: boundRecord.projectId,
  siteId: boundRecord.siteId,
  formVersion: "janet-inventory-v1",
  observer: "QA",
  coordinates: [-76.485, 42.448],
  answers: {},
  context: { ...boundRecord.context, roundType: "inventory" },
  placement: { source: "zone", gpsAccuracyMetres: null },
  createdAt: "2026-10-11T12:00:00.000Z",
  storageStatus: "local-only",
} as const;

let view: ReactTestRenderer | undefined;
let queue: Queue;
let mode: "device" | "preview" = "device";
function Probe() {
  queue = useQueueForMode(mode);
  return null;
}
afterEach(async () => {
  await act(async () => view?.unmount());
  view = undefined;
  mode = "device";
  world.wakes = 0;
  world.retries = 0;
});

async function open(seed: (sqlite: { exec: (sql: string) => void }) => void) {
  const { db, sqlite } = await memoryDatabase();
  await installPackage(db, owner, entry);
  await saveObservation(db, boundRecord, owner);
  await saveObservation(db, practiceShell as never, owner);
  await saveObservation(db, practiceInventory as never, owner);
  seed(sqlite);
  world.database = db;
  world.owner = owner;
  await act(async () => {
    view = create(<Probe />);
  });
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
  return sqlite;
}

describe("The queue with one bound row in backoff and two practice rows (MOB-37)", () => {
  it("counts 1 unsent and 2 practice, and nothing as held", async () => {
    const sqlite = await open((db) =>
      db.exec(
        `UPDATE observations SET attempts = 7, next_attempt_at = ${Date.now() + 300000} WHERE id = '${boundRecord.id}'`,
      ),
    );
    try {
      expect(queue.loading).toBe(false);
      expect(queue.unsent).toBe(1);
      expect(queue.practice).toBe(2);
      expect(queue.counts).toEqual({
        onDevice: 1,
        uploading: 0,
        uploaded: 0,
        attention: 0,
        held: 0,
      });
    } finally {
      sqlite.close();
    }
  });

  it("decides practice by the missing binding, so the unbound inventory row is practice too", async () => {
    const sqlite = await open(() => {});
    try {
      const byId = new Map(queue.records.map((record) => [record.id, record]));
      expect(byId.get(practiceShell.id)?.summary).toBe("Practice record");
      expect(byId.get(practiceInventory.id)?.summary).toBe("Practice record");
      expect(byId.get(boundRecord.id)?.summary).toBe("Behaviour mapping");
      for (const id of [practiceShell.id, practiceInventory.id])
        expect(byId.get(id)?.state).not.toBe("held");
    } finally {
      sqlite.close();
    }
  });

  it("words the practice record the way Saved does (lane A's file is only read, not edited)", async () => {
    const sqlite = await open(() => {});
    try {
      const line = queue.records.find((record) => record.id === practiceShell.id)?.storage;
      expect(line).toBe("Practice record: stays on this device and is never uploaded");
      const saved = readFileSync(new URL("../collect/SavedStep.tsx", import.meta.url), "utf8");
      expect(saved).toContain(line ?? "never");
      expect(saved).not.toContain("is not published to the server yet");
    } finally {
      sqlite.close();
    }
  });

  it("does not count a practice row as unsent once the bound row is uploaded", async () => {
    const sqlite = await open((db) =>
      db.exec(`UPDATE observations SET sync_state = 'synced' WHERE id = '${boundRecord.id}'`),
    );
    try {
      expect(queue.unsent).toBe(0);
      expect(queue.practice).toBe(2);
      expect(queue.counts.uploaded).toBe(1);
    } finally {
      sqlite.close();
    }
  });
});

describe("When a record was captured (MOB-38)", () => {
  const now = new Date(2026, 9, 28, 15, 0);

  it("says Today for this day and the date for an earlier one, in local time", () => {
    expect(capturedLabel(new Date(2026, 9, 28, 11, 25), now)).toBe("Today 11:25");
    expect(capturedLabel(new Date(2026, 9, 2, 9, 5), now)).toBe("Oct 02 · 09:05");
    expect(capturedLabel(new Date(2026, 9, 27, 23, 59), now)).toBe("Oct 27 · 23:59");
  });

  it("adds the year only for a record from another year", () => {
    expect(capturedLabel(new Date(2026, 0, 3, 8, 0), now)).toBe("Jan 03 · 08:00");
    expect(capturedLabel(new Date(2025, 9, 2, 11, 32), now)).toBe("Oct 02 2025 · 11:32");
    expect(capturedLabel(new Date(2025, 9, 28, 15, 0), now)).toBe("Oct 28 2025 · 15:00");
  });

  it("does not print NaN for a time that cannot be read", () => {
    expect(capturedLabel(new Date("not a date"), now)).toBe("Time not recorded");
  });

  it("is on every record the device lists", async () => {
    const sqlite = await open(() => {});
    try {
      expect(queue.records.length).toBeGreaterThan(0);
      for (const record of queue.records)
        expect(record.captured).toMatch(
          /^(Today \d\d:\d\d|[A-Z][a-z]{2} \d\d( \d{4})? · \d\d:\d\d)$/,
        );
    } finally {
      sqlite.close();
    }
  });
});

describe("Pulling the list to refresh wakes the uploader (MOB-38)", () => {
  it("calls the sync provider's wake() on a device", async () => {
    const sqlite = await open(() => {});
    try {
      queue.uploadNow();
      expect(world.wakes).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it("sends nothing in preview, which shows sample records", async () => {
    mode = "preview";
    const sqlite = await open(() => {});
    try {
      queue.uploadNow();
      expect(world.wakes).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});

describe("Retrying uploads goes through the queue, which sends nothing in preview (MOB-38)", () => {
  it("calls the sync provider's retry() on a device", async () => {
    const sqlite = await open(() => {});
    try {
      await queue.retryUploads();
      expect(world.retries).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it("does not touch the device's real records in preview", async () => {
    mode = "preview";
    const sqlite = await open(() => {});
    try {
      await queue.retryUploads();
      expect(world.retries).toBe(0);
    } finally {
      sqlite.close();
    }
  });
});
