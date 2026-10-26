import { DatabaseSync } from "node:sqlite";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SitePackage } from "../packages/site-package";
import { hasDraft, readDraft } from "../storage/draft-store";
import { initializeDatabase, type LocalDatabase } from "../storage/observation-store";
import { adapter, owner } from "../storage/package-store.fixture";
import type { FieldSessionValue } from "./context";
import { FieldSessionProvider, useFieldSession } from "./provider";

/**
 * MOB-41 (audit C08), with the real draft and observation stores: a tap that lands while a save is in
 * flight leaves no ghost draft, a draft write that fails is reported by the session, and an unreadable
 * draft can be discarded so that a map can be opened again.
 */

const mocks = vi.hoisted(() => {
  const state: { key: string; database: LocalDatabase | null; counter: number } = {
    key: "",
    database: null,
    counter: 0,
  };
  return {
    ...state,
    open: vi.fn<(_id: string) => Promise<SitePackage | undefined>>(),
    wake: vi.fn(),
  };
});
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `61000000-0000-4000-8000-${String(++mocks.counter).padStart(12, "0")}`,
}));
vi.mock("../auth/provider", () => ({ useAccount: () => ({ key: mocks.key, ready: true }) }));
vi.mock("../data/api/me-provider", () => ({ useMe: () => ({ profile: null }) }));
vi.mock("../features/auth/profile-store", () => ({ useProfile: () => ({ initials: "QA" }) }));
vi.mock("../sync/provider", () => ({ useSync: () => ({ wake: mocks.wake }) }));
vi.mock("../packages/hosted/provider", () => ({
  useHostedSites: () => ({ sites: {}, installed: [] }),
}));
vi.mock("../packages/open", () => ({ openSitePackage: mocks.open }));

const style: SitePackage["bases"]["day"] = { version: 8, sources: {}, layers: [] };
const square = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
] as SitePackage["zones"][number]["polygon"];
const pkg: SitePackage = {
  id: "draft-honesty-map",
  name: "Synthetic map",
  meta: "Synthetic",
  availability: "on-device",
  formVersion: "shell-v1",
  inventoryFormVersion: "janet-inventory-v1",
  version: "v7",
  siteId: "sample-garden",
  sizeOnDevice: "Synthetic",
  inheritedContext: "",
  centre: [0.5, 0.5],
  bounds: [0, 0, 1, 1],
  bases: { day: style, night: style, aerial: style },
  layers: [],
  zones: [
    {
      zoneId: "practice:A",
      displayAnchor: [0.5, 0.5],
      polygon: square,
      id: "A",
      label: "Original",
      centre: [0.5, 0.5],
      west: 0,
      south: 0,
      east: 1,
      north: 1,
    },
  ],
};

const snapshots: FieldSessionValue[] = [];
let root: ReactTestRenderer | undefined;
let sqlite: DatabaseSync;
function Probe() {
  snapshots.push(useFieldSession());
  return null;
}
function Tree() {
  return (
    <FieldSessionProvider>
      <Probe />
    </FieldSessionProvider>
  );
}
function latest() {
  const value = snapshots.at(-1);
  if (!value) throw new Error("Session did not render");
  return value;
}
function database() {
  if (!mocks.database) throw new Error("Database missing");
  return mocks.database;
}
async function mount() {
  snapshots.length = 0;
  await act(async () => {
    root = create(<Tree />);
  });
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.key = owner;
  mocks.counter = 0;
  mocks.open.mockReset();
  mocks.open.mockResolvedValue(pkg);
  sqlite = new DatabaseSync(":memory:");
  mocks.database = adapter(sqlite);
  await initializeDatabase(mocks.database);
  await mount();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  sqlite.close();
  vi.unstubAllGlobals();
});

async function open() {
  await act(async () => {
    expect(await latest().openPackage(pkg.id)).toMatchObject({ ok: true });
  });
}
async function answerEverything() {
  await act(async () => {
    latest().dispatch({ kind: "write", question: "observer", value: "AA" });
    latest().dispatch({ kind: "write", question: "people", value: "2" });
    latest().dispatch({ kind: "write", question: "notes", value: "Synthetic observation" });
  });
}
/** Lets every queued draft write finish, then lets the session see the results. */
async function settled() {
  await act(async () => {
    await hasDraft(database(), owner);
  });
}
function plantDraftOfAnotherObservation() {
  sqlite
    .prepare(
      "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES (?, ?, ?, ?, ?)",
    )
    .run(owner, "62000000-0000-4000-8000-000000000001", "2026-10-24T10:00:00.000Z", "{}", "");
}

it("a Review-row tap while the save is in flight leaves no ghost draft, and the next observation is kept", async () => {
  await open();
  await act(async () => {
    latest().place([0.5, 0.5]);
  });
  await answerEverything();

  await act(async () => {
    const saving = latest().save();
    // The observer taps a Review row while "Saving on this device…" shows.
    latest().dispatch({ kind: "jump", index: 0 });
    expect(await saving).toMatchObject({ ok: true });
  });

  expect(await hasDraft(database(), owner)).toBe(false);
  expect(latest().inProgress).toBeNull();
  expect(latest().draftWriteFailed).toBe(false);

  // The next observation writes its own draft; on the unfixed code it hit the ghost and lived in memory.
  await act(async () => {
    latest().place([0.4, 0.4]);
  });
  await settled();
  expect(latest().draftWriteFailed).toBe(false);
  expect(await readDraft(database(), owner)).toMatchObject({ coordinates: [0.4, 0.4] });
  const next = await readDraft(database(), owner);
  expect(next?.id).toBe(latest().inProgress?.id);
  expect(
    sqlite.prepare("SELECT COUNT(*) total FROM observations WHERE owner_scope = ?").get(owner),
  ).toEqual({ total: 1 });
});

it("a point nudged and a zone chosen while the save is in flight write nothing either", async () => {
  await open();
  await act(async () => {
    latest().place([0.5, 0.5]);
  });
  await answerEverything();
  const zone = pkg.zones[0];
  if (!zone) throw new Error("Zone missing");

  await act(async () => {
    const saving = latest().save();
    latest().nudgeTo([0.6, 0.6]);
    latest().chooseZone(zone);
    latest().dispatch({ kind: "write", question: "notes", value: "Edited while saving" });
    expect(await saving).toMatchObject({ ok: true });
  });

  expect(await hasDraft(database(), owner)).toBe(false);
  expect(latest().draftWriteFailed).toBe(false);
});

it("a save that fails lets the observer go on: the draft is kept and later writes work", async () => {
  await open();
  await act(async () => {
    latest().place([0.5, 0.5]);
  });
  await answerEverything();
  // Break the commit: the record's id is already taken.
  const draft = await readDraft(database(), owner);
  sqlite
    .prepare(
      "INSERT INTO observations (owner_scope, id, created_at, payload, sync_state, sync_error) VALUES (?, ?, ?, ?, 'pending', '')",
    )
    .run(owner, draft?.id ?? "", "2026-10-24T10:00:00.000Z", "{}");

  await act(async () => {
    expect(await latest().save()).toMatchObject({ ok: false });
  });
  expect(latest().inProgress).not.toBeNull();

  await act(async () => {
    latest().dispatch({ kind: "write", question: "notes", value: "After the failed save" });
  });
  await settled();
  expect(latest().draftWriteFailed).toBe(false);
  expect(await readDraft(database(), owner)).toMatchObject({
    answers: { notes: "After the failed save" },
  });
});

it("reports a draft write that failed, and clears the report once a write succeeds", async () => {
  await open();
  expect(latest().draftWriteFailed).toBe(false);
  plantDraftOfAnotherObservation();

  await act(async () => {
    latest().place([0.5, 0.5]);
  });
  await settled();
  expect(latest().inProgress).not.toBeNull();
  expect(latest().draftWriteFailed).toBe(true);

  sqlite.prepare("DELETE FROM observation_drafts WHERE owner_scope = ?").run(owner);
  await act(async () => {
    latest().dispatch({ kind: "write", question: "observer", value: "AA" });
  });
  await settled();
  expect(latest().draftWriteFailed).toBe(false);
  expect(await readDraft(database(), owner)).toMatchObject({ answers: { observer: "AA" } });
});

it("does not carry a failed write over to the next observation", async () => {
  await open();
  plantDraftOfAnotherObservation();
  await act(async () => {
    latest().place([0.5, 0.5]);
  });
  await settled();
  expect(latest().draftWriteFailed).toBe(true);

  sqlite.prepare("DELETE FROM observation_drafts WHERE owner_scope = ?").run(owner);
  await act(async () => {
    latest().discard();
  });
  await settled();
  expect(latest().inProgress).toBeNull();
  expect(latest().draftWriteFailed).toBe(false);
});

it("an unreadable draft can be discarded, and then a map opens again", async () => {
  await act(async () => root?.unmount());
  sqlite
    .prepare(
      "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES (?, ?, ?, ?, ?)",
    )
    .run(owner, "62000000-0000-4000-8000-000000000002", "2026-10-24T10:00:00.000Z", "{ not json", "");
  await mount();
  await settled();

  expect(latest().unreadableDraft).toBe(true);
  await act(async () => {
    expect(await latest().openPackage(pkg.id)).toEqual({
      ok: false,
      reason: "Resume or discard the unfinished observation first.",
    });
  });

  await act(async () => {
    await latest().discardRecovered();
  });
  expect(latest().unreadableDraft).toBe(false);
  expect(await hasDraft(database(), owner)).toBe(false);
  await open();
});
